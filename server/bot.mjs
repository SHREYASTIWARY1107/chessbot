import { Chess } from 'chess.js';
import {
  loadArtifacts,
  fenKey,
  botMovePrefix,
  weightedPick,
} from './book.mjs';
import { structureSignature, sigKey, fuzzyVote } from './similarity.mjs';
import { getEloCandidates } from './stockfish.mjs';

function isBlunder(chess, san) {
  const trial = new Chess(chess.fen());
  const mv = trial.move(san, { sloppy: true });
  if (!mv) return true;

  const opp = new Chess(trial.fen());
  if (opp.isCheckmate()) return false;

  for (const resp of opp.moves({ verbose: true })) {
    const after = new Chess(trial.fen());
    after.move(resp);
    if (after.isCheckmate()) return true;
    if (mv.piece !== 'k' && resp.captured === mv.piece && mv.piece === 'q') return true;
  }
  return false;
}

function styleScore(chess, san, botColor, phasePriors, fuzzyVotes) {
  const sig = structureSignature(chess);
  const phase = sig.phase;
  const key = `${botColor}|${phase}`;
  const priors = phasePriors[key] || {};
  let score = priors[san] || 0;
  score += (fuzzyVotes[san] || 0) * 5;

  if (san.includes('+')) score += 1;
  if (san.includes('x')) score += 0.5;
  if (san === 'O-O' || san === 'O-O-O') score += 1;

  return score;
}

function pickFromDistribution(dist, chess, botColor, phasePriors, fuzzyVotes) {
  const scored = Object.entries(dist)
    .map(([san]) => ({ san, score: styleScore(chess, san, botColor, phasePriors, fuzzyVotes) }))
    .filter(({ san }) => !isBlunder(chess, san))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  if (scored.length >= 2 && Math.random() < 0.15) return scored[1].san;
  const top = scored.slice(0, 3);
  const weights = top.map((t) => Math.max(0.1, t.score));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i].san;
  }
  return top[0].san;
}

function toUci(chess, san) {
  const c = new Chess(chess.fen());
  const m = c.move(san, { sloppy: true });
  return m ? m.from + m.to + (m.promotion || '') : null;
}

export async function getBotMove({ fen, moves, botColor }) {
  const artifacts = loadArtifacts();
  const chess = new Chess(fen);
  const legal = chess.moves();
  const legalSet = new Set(legal);
  const key = fenKey(fen);
  const fuzzyVotes = fuzzyVote(chess, artifacts.positionIndex, legalSet);

  let san = null;
  let tier = 'elo-style';

  if (artifacts.exactBook[key]) {
    const pick = weightedPick(
      Object.fromEntries(
        Object.entries(artifacts.exactBook[key]).filter(([m]) => legalSet.has(m)),
      ),
    );
    if (pick && !isBlunder(chess, pick)) {
      san = pick;
      tier = 'book';
    }
  }

  if (!san) {
    const prefix = botMovePrefix(moves, botColor);
    if (artifacts.openingTree[prefix]) {
      const pick = weightedPick(
        Object.fromEntries(
          Object.entries(artifacts.openingTree[prefix]).filter(([m]) => legalSet.has(m)),
        ),
      );
      if (pick && !isBlunder(chess, pick)) {
        san = pick;
        tier = 'opening';
      }
    }
  }

  if (!san && Object.keys(fuzzyVotes).length) {
    const pick = pickFromDistribution(
      fuzzyVotes,
      chess,
      botColor,
      artifacts.phasePriors,
      fuzzyVotes,
    );
    if (pick) {
      san = pick;
      tier = 'similar';
    }
  }

  if (!san) {
    const phaseKey = `${botColor}|${structureSignature(chess).phase}`;
    const priors = artifacts.phasePriors[phaseKey] || {};
    const dist = Object.fromEntries(
      legal.filter((m) => (priors[m] || 0) > 0).map((m) => [m, priors[m]]),
    );
    if (Object.keys(dist).length) {
      const pick = pickFromDistribution(
        dist,
        chess,
        botColor,
        artifacts.phasePriors,
        fuzzyVotes,
      );
      if (pick) {
        san = pick;
        tier = 'predicted';
      }
    }
  }

  if (!san) {
    const targetElo = artifacts.botRating.targetElo || 1380;
    const candidates = await getEloCandidates(fen, targetElo, 5);
    const scored = [];

    for (const c of candidates) {
      const from = c.uci.slice(0, 2);
      const to = c.uci.slice(2, 4);
      const promo = c.uci.length > 4 ? c.uci[4] : undefined;
      const trial = new Chess(fen);
      const m = trial.move({ from, to, promotion: promo });
      if (!m) continue;
      const s = m.san;
      if (!legalSet.has(s) || isBlunder(chess, s)) continue;
      scored.push({
        san: s,
        score: styleScore(chess, s, botColor, artifacts.phasePriors, fuzzyVotes) + c.cp / 200,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored.length) {
      san = scored[0].san;
      tier = 'elo-style';
    }
  }

  if (!san) {
    const safe = legal.filter((m) => !isBlunder(chess, m));
    san = (safe.length ? safe : legal)[Math.floor(Math.random() * (safe.length || legal.length))];
    tier = 'fallback';
  }

  const uci = toUci(chess, san);
  if (process.env.NODE_ENV !== 'production') console.debug('bot tier:', tier, san);

  return { san, uci: uci || san };
}
