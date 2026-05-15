import { Chess } from 'chess.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Cheap 1-ply filter: rejects moves that hang material (opponent can capture
 * a higher-valued piece with a cheaper one). Also rejects walking into mate in 1.
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

    // Opponent mates us immediately
    if (after.isCheckmate()) return true;

    if (!resp.captured) continue;

    const captureGain = VALUE[resp.captured] ?? 0;
    const attackerLoss = VALUE[resp.piece] ?? 0;
    // Reject trades where we clearly lose raw material from this capture
    if (captureGain > attackerLoss + 0.49) return true;
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
