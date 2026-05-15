import { Chess } from 'chess.js';
import {
  loadArtifacts,
  fenKey,
  botMovePrefix,
  weightedPick,
} from './book.mjs';
import { structureSignature, fuzzyVote } from './similarity.mjs';
import { getEloCandidates } from './stockfish.mjs';
import { isTacticallyUnsafe, pickSafestQuietMove } from './safety.mjs';

const MOVE_BUDGET_MS = Number(process.env.BOT_MOVE_BUDGET_MS || 12000);

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
    .filter(({ san }) => !isTacticallyUnsafe(chess, san))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  if (scored.length >= 2 && Math.random() < 0.12) return scored[1].san;
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

async function chooseMoveCore({ fen, moves, botColor }) {
  const artifacts = loadArtifacts();
  const chess = new Chess(fen);
  const legal = chess.moves();
  const legalSet = new Set(legal);
  const key = fenKey(fen);
  const fuzzyVotes = fuzzyVote(chess, artifacts.positionIndex, legalSet);

  let san = null;

  if (artifacts.exactBook[key]) {
    const filtered = Object.fromEntries(
      Object.entries(artifacts.exactBook[key]).filter(([m]) => legalSet.has(m)),
    );
    const pick = weightedPick(filtered);
    if (pick && !isTacticallyUnsafe(chess, pick)) san = pick;
  }

  if (!san) {
    const prefix = botMovePrefix(moves, botColor);
    if (artifacts.openingTree[prefix]) {
      const filtered = Object.fromEntries(
        Object.entries(artifacts.openingTree[prefix]).filter(([m]) => legalSet.has(m)),
      );
      const pick = weightedPick(filtered);
      if (pick && !isTacticallyUnsafe(chess, pick)) san = pick;
    }
  }

  if (!san && Object.keys(fuzzyVotes).length) {
    san = pickFromDistribution(
      fuzzyVotes,
      chess,
      botColor,
      artifacts.phasePriors,
      fuzzyVotes,
    );
  }

  if (!san) {
    const phaseKey = `${botColor}|${structureSignature(chess).phase}`;
    const priors = artifacts.phasePriors[phaseKey] || {};
    const dist = Object.fromEntries(
      legal.filter((m) => (priors[m] || 0) > 0).map((m) => [m, priors[m]]),
    );
    if (Object.keys(dist).length) {
      san = pickFromDistribution(
        dist,
        chess,
        botColor,
        artifacts.phasePriors,
        fuzzyVotes,
      );
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
      if (!legalSet.has(s) || isTacticallyUnsafe(chess, s)) continue;
      scored.push({
        san: s,
        score: styleScore(chess, s, botColor, artifacts.phasePriors, fuzzyVotes) + (c.cp || 0) / 200,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored.length) san = scored[0].san;
  }

  if (!san) {
    san = pickSafestQuietMove(chess);
  }

  const uci = toUci(chess, san);
  return { san, uci: uci || san };
}

export async function getBotMove(params) {
  const budget = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('move_timeout')), MOVE_BUDGET_MS),
  );

  try {
    return await Promise.race([chooseMoveCore(params), budget]);
  } catch {
    const chess = new Chess(params.fen);
    const san = pickSafestQuietMove(chess);
    const uci = toUci(chess, san);
    return { san, uci: uci || san };
  }
}
