let engine = null;
let ready = false;
const queue = [];

function initEngine() {
  if (engine) return;
  return import('stockfish')
    .then((mod) => {
      const factory = mod.default || mod;
      engine = typeof factory === 'function' ? factory() : factory;
      engine.onmessage = (line) => {
        const msg = typeof line === 'string' ? line : line?.data || String(line);
        if (msg === 'uciok') ready = true;
        const handlers = queue.splice(0, queue.length);
        for (const h of handlers) h(msg);
      };
      engine.postMessage('uci');
    })
    .catch((e) => {
      console.warn('Stockfish unavailable:', e.message);
      engine = null;
    });
}

function send(cmd) {
  if (engine) engine.postMessage(cmd);
}

function runUci(commands, onLine, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const lines = [];
    const handler = (msg) => {
      onLine?.(msg);
      lines.push(msg);
      if (msg.startsWith('bestmove ')) {
        clearTimeout(timer);
        resolve(lines);
      }
    };
    queue.push(handler);
    for (const c of commands) send(c);
    const timer = setTimeout(() => resolve(lines), timeoutMs);
  });
}

export async function getEloCandidates(fen, targetElo, multipv = 5) {
  await initEngine();
  if (!engine) return [];

  if (!ready) {
    await runUci(['uci'], (m) => {
      if (m === 'uciok') ready = true;
    }, 5000);
  }

  const pending = new Map();
  const lines = await runUci(
    [
      'setoption name UCI_LimitStrength value true',
      `setoption name UCI_Elo value ${Math.min(3190, Math.max(1320, targetElo))}`,
      'isready',
      `position fen ${fen}`,
      'setoption name MultiPV value 5',
      'go depth 10',
    ],
    (msg) => {
      if (msg.startsWith('info') && msg.includes(' pv ')) {
        const mpv = msg.match(/ multipv (\d+)/);
        const pv = msg.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (mpv && pv) pending.set(Number(mpv[1]), { uci: pv[1] });
      }
    },
  );

  const best = lines.find((l) => l.startsWith('bestmove '));
  const bestUci = best?.split(' ')[1];
  const list = [...pending.values()];
  if (bestUci && bestUci !== '(none)' && !list.some((c) => c.uci === bestUci)) {
    list.unshift({ uci: bestUci, cp: 0 });
  }
  return list.slice(0, multipv);
}
