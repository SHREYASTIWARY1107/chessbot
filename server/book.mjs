import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEN = path.join(__dirname, '..', 'data', 'generated');

let cache = null;

export function loadArtifacts() {
  if (cache) return cache;
  const read = (f) => JSON.parse(fs.readFileSync(path.join(GEN, f), 'utf8'));
  cache = {
    exactBook: read('player-book.json'),
    openingTree: read('opening-tree.json'),
    positionIndex: read('position-index.json'),
    phasePriors: read('phase-priors.json'),
    botRating: read('bot-rating.json'),
  };
  return cache;
}

export function fenKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function botMovePrefix(moves, botColor) {
  const out = [];
  for (let i = 0; i < moves.length; i++) {
    const isWhite = i % 2 === 0;
    if ((botColor === 'w' && isWhite) || (botColor === 'b' && !isWhite)) out.push(moves[i]);
  }
  return out.join(',');
}

export function weightedPick(distribution) {
  const entries = Object.entries(distribution);
  if (!entries.length) return null;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return entries[0][0];
  let r = Math.random() * total;
  for (const [move, w] of entries) {
    r -= w;
    if (r <= 0) return move;
  }
  return entries[entries.length - 1][0];
}
