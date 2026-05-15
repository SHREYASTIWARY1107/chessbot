/**
 * Stockfish via npm — strictly serial: concurrent analysis breaks UCI routing (502s).
 */
let engine = null;
let initPromise = null;
let uciReady = false;
let chain = Promise.resolve();

const ENGINE_TIMEOUT_MS = Number(process.env.STOCKFISH_MS || 4500);

function normalizeMsg(line) {
  return typeof line === 'string' ? line : line?.data || String(line);
}

function createEngine() {
  return import('stockfish').then((mod) => {
    const factory = mod.default || mod;
    const eng = typeof factory === 'function' ? factory() : factory;
    if (!eng || typeof eng.postMessage !== 'function') {
      throw new Error('Stockfish engine has no postMessage');
    }
    return eng;
  });
}

function initEngine() {
  if (initPromise) return initPromise;
  initPromise = createEngine()
    .then((eng) => {
      engine = eng;
    })
    .catch((e) => {
      console.warn('Stockfish unavailable:', e.message);
      engine = null;
      initPromise = null;
      uciReady = false;
      throw e;
    });
  return initPromise;
}

function ensureUci() {
  if (uciReady) return Promise.resolve();
  return initEngine().then(
    () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('uci timeout')), 6000);

        engine.onmessage = (line) => {
          const msg = normalizeMsg(line);
          if (msg === 'uciok') {
            clearTimeout(timer);
            uciReady = true;
            resolve();
          }
        };

        engine.postMessage('uci');
      }),
  );
}

function runOneAnalysis(fen, targetElo, multipv = 5) {
  return new Promise((resolve) => {
    if (!engine) {
      resolve([]);
      return;
    }

    const pending = new Map();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => finish([]), ENGINE_TIMEOUT_MS);

    engine.onmessage = (line) => {
      const msg = normalizeMsg(line);
      if (msg.startsWith('info') && msg.includes(' pv ')) {
        const mpv = msg.match(/ multipv (\d+)/);
        const pv = msg.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (mpv && pv) pending.set(Number(mpv[1]), { uci: pv[1] });
      }
      if (msg.startsWith('bestmove ')) {
        const parts = msg.split(/\s+/);
        const bestUci = parts[1];
        const list = [...pending.values()];
        if (bestUci && bestUci !== '(none)' && !list.some((c) => c.uci === bestUci)) {
          list.unshift({ uci: bestUci, cp: 0 });
        }
        finish(list.slice(0, multipv));
      }
    };

    try {
      const elo = Math.min(3190, Math.max(1320, targetElo));
      engine.postMessage('setoption name UCI_LimitStrength value true');
      engine.postMessage(`setoption name UCI_Elo value ${elo}`);
      engine.postMessage(`setoption name MultiPV value ${multipv}`);
      engine.postMessage('isready');
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage('go depth 9');
    } catch (e) {
      console.warn('Stockfish post failed:', e.message);
      finish([]);
    }
  });
}

export async function getEloCandidates(fen, targetElo, multipv = 5) {
  const run = async () => {
    try {
      await ensureUci();
      if (!engine) return [];
      return runOneAnalysis(fen, targetElo, multipv);
    } catch {
      return [];
    }
  };

  const p = chain.then(run, run);
  chain = p.catch(() => {}).then(() => {});
  return p;
}
