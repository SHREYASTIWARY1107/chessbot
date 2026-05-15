import { Chess } from 'chess.js';

function getPhase(ply, pieceCount) {
  if (ply <= 16) return 'opening';
  if (pieceCount <= 10) return 'endgame';
  return 'middlegame';
}

function materialCode(chess) {
  const b = chess.board();
  const counts = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const row of b) {
    for (const sq of row) {
      if (sq) counts[sq.type]++;
    }
  }
  return `Q${counts.q}R${counts.r}B${counts.b}N${counts.n}P${counts.p}`;
}

function pawnHash(chess) {
  const b = chess.board();
  let h = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = b[r][f];
      if (sq?.type === 'p') h += `${sq.color}${f}${r}`;
    }
  }
  return h;
}

export function structureSignature(chess) {
  const pieces = chess.board().flat().filter(Boolean).length;
  const ply = chess.moveNumber() * 2 - (chess.turn() === 'w' ? 1 : 0);
  return {
    material: materialCode(chess),
    pawns: pawnHash(chess),
    phase: getPhase(ply, pieces),
    turn: chess.turn(),
  };
}

export function sigKey(sig) {
  return `${sig.material}|${sig.pawns}|${sig.phase}|${sig.turn}`;
}

function hamming(a, b) {
  if (a === b) return 0;
  let d = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++;
  return d + Math.abs(a.length - b.length);
}

export function fuzzyVote(chess, positionIndex, legalSans) {
  const sig = structureSignature(chess);
  const votes = {};
  const keys = Object.keys(positionIndex);

  const scored = keys
    .map((k) => {
      const [mat, paw, phase, turn] = k.split('|');
      let dist = 0;
      if (mat !== sig.material) dist += 3;
      if (phase !== sig.phase) dist += 2;
      if (turn !== sig.turn) dist += 1;
      dist += hamming(paw, sig.pawns) / 4;
      return { k, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);

  for (const { k, dist } of scored) {
    const weight = 1 / (1 + dist);
    for (const { move } of positionIndex[k]) {
      if (!legalSans.has(move)) continue;
      votes[move] = (votes[move] || 0) + weight;
    }
  }

  return votes;
}
