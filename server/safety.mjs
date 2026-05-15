import { Chess } from 'chess.js';

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialFor(chess, color) {
  let s = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.color === color) s += VALUE[sq.type] ?? 0;
    }
  }
  return s;
}

/** Our material minus opponent's (from bot's perspective) */
export function materialEval(chess, botColor) {
  return materialFor(chess, botColor) - materialFor(chess, botColor === 'w' ? 'b' : 'w');
}

/**
 * After we play a capture, consider only opponent recaptures on the same square
 * (one full exchange). Returns our material eval delta from root; lower = worse.
 */
export function evalCaptureExchange(chess, botColor, verboseMove) {
  const root = materialEval(chess, botColor);
  const trial = new Chess(chess.fen());
  const mv = trial.move(verboseMove);
  if (!mv?.captured) return -999;

  const afterOurCapture = materialEval(trial, botColor);
  const dest = mv.to;

  const opp = new Chess(trial.fen());
  const recaptures = opp.moves({ verbose: true }).filter((r) => r.to === dest && r.captured);

  if (!recaptures.length) return afterOurCapture - root;

  let worst = afterOurCapture;
  for (const r of recaptures) {
    const t2 = new Chess(trial.fen());
    t2.move(r);
    worst = Math.min(worst, materialEval(t2, botColor));
  }
  return worst - root;
}

export function pickBestWinningCapture(chess, botColor) {
  const scored = [];
  for (const v of chess.moves({ verbose: true })) {
    if (!v.captured) continue;
    if (isTacticallyUnsafe(chess, v.san)) continue;
    const net = evalCaptureExchange(chess, botColor, v);
    if (net > 0.01) scored.push({ san: v.san, net, capVal: VALUE[v.captured] ?? 0 });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.net - a.net || b.capVal - a.capVal);
  return scored[0].san;
}

/**
 * Stricter than casual play: reject moves where opponent gains > ~0 material
 * on any one-tempo capture (and reject mate-in-1).
 */
export function isTacticallyUnsafe(chess, san) {
  const trial = new Chess(chess.fen());
  const mv = trial.move(san, { sloppy: true });
  if (!mv) return true;

  if (trial.isCheckmate()) return false;

  const opp = new Chess(trial.fen());

  for (const resp of opp.moves({ verbose: true })) {
    const after = new Chess(trial.fen());
    after.move(resp);

    if (after.isCheckmate()) return true;

    if (!resp.captured) continue;

    // King recaptures: piece value model breaks (don't treat K as “free”).
    if (resp.piece === 'k') continue;

    const captureGain = VALUE[resp.captured] ?? 0;
    const attackerLoss = VALUE[resp.piece] ?? 0;
    if (captureGain > attackerLoss + 0.05) return true;
  }

  return false;
}

/** Among legal moves, prefer those that minimise worst 1-ply material loss after any capture reply */
export function pickSafestQuietMove(chess) {
  const legal = chess.moves({ verbose: true });

  const scoreMove = (candidate, requireSafe) => {
    const san = candidate.san;
    if (requireSafe && isTacticallyUnsafe(chess, san)) return null;
    const trial = new Chess(chess.fen());
    trial.move(candidate);
    let worst = -Infinity;
    const opp = new Chess(trial.fen());
    for (const resp of opp.moves({ verbose: true })) {
      const after = new Chess(trial.fen());
      after.move(resp);
      if (after.isCheckmate()) {
        worst = 999;
        break;
      }
      if (!resp.captured) continue;
      const swing = (VALUE[resp.captured] ?? 0) - (VALUE[resp.piece] ?? 0);
      worst = Math.max(worst, swing);
    }
    if (worst === -Infinity) worst = 0;
    return { san, worst };
  };

  let best = [];
  let bestScore = Infinity;

  for (const candidate of legal) {
    const r = scoreMove(candidate, true);
    if (!r) continue;
    if (r.worst < bestScore - 1e-6) {
      bestScore = r.worst;
      best = [r.san];
    } else if (Math.abs(r.worst - bestScore) < 1e-6) best.push(r.san);
  }

  if (best.length) return best[Math.floor(Math.random() * best.length)];

  best = [];
  bestScore = Infinity;
  for (const candidate of legal) {
    const r = scoreMove(candidate, false);
    if (!r) continue;
    if (r.worst < bestScore - 1e-6) {
      bestScore = r.worst;
      best = [r.san];
    } else if (Math.abs(r.worst - bestScore) < 1e-6) best.push(r.san);
  }

  if (best.length) return best[Math.floor(Math.random() * best.length)];
  return legal[0]?.san ?? null;
}
