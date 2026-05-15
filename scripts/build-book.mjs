import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';
import { TRAINING_PLAYER_ID, DEFAULT_TARGET_ELO } from '../config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PGN_DIR = path.join(ROOT, 'data', 'pgns');
const OUT_DIR = path.join(ROOT, 'data', 'generated');

function stripComments(pgn) {
  return pgn.replace(/\{[^}]*\}/g, '').trim();
}

function parseHeaders(pgn) {
  const headers = {};
  const re = /^\[(\w+)\s+"([^"]*)"\]/gm;
  let m;
  while ((m = re.exec(pgn)) !== null) headers[m[1]] = m[2];
  return headers;
}

function gameKey(headers, movesSan) {
  return [headers.White, headers.Black, headers.Date, movesSan.join(',')].join('|');
}

function fenKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

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

function structureSignature(chess, ply) {
  const pieces = chess.board().flat().filter(Boolean).length;
  return {
    material: materialCode(chess),
    pawns: pawnHash(chess),
    phase: getPhase(ply, pieces),
    turn: chess.turn(),
  };
}

function sigKey(sig) {
  return `${sig.material}|${sig.pawns}|${sig.phase}|${sig.turn}`;
}

function inc(map, key, subkey, n = 1) {
  if (!map[key]) map[key] = {};
  map[key][subkey] = (map[key][subkey] || 0) + n;
}

function addWeighted(book, key, move, n = 1) {
  inc(book, key, move, n);
}

function loadGames() {
  const files = fs.readdirSync(PGN_DIR).filter((f) => f.endsWith('.pgn'));
  const seen = new Set();
  const games = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(PGN_DIR, file), 'utf8');
    const cleaned = stripComments(raw);
    const headers = parseHeaders(raw);

    const whiteId = headers.WhitePlayerId;
    const blackId = headers.BlackPlayerId;
    let botColor = null;
    if (whiteId === TRAINING_PLAYER_ID) botColor = 'w';
    else if (blackId === TRAINING_PLAYER_ID) botColor = 'b';
    else continue;

    const chess = new Chess();
    try {
      chess.loadPgn(cleaned, { sloppy: true });
    } catch {
      continue;
    }

    const history = chess.history();
    const key = gameKey(headers, history);
    if (seen.has(key)) continue;
    seen.add(key);

    const botElo =
      botColor === 'w' ? Number(headers.WhiteElo || 0) : Number(headers.BlackElo || 0);

    games.push({ botColor, history, botElo, headers });
  }
  return games;
}

function walkGame(game, artifacts) {
  const chess = new Chess();
  const botMoves = [];
  const botMovesByColor = { w: [], b: [] };

  for (let i = 0; i < game.history.length; i++) {
    const san = game.history[i];
    const mover = chess.turn();
    const ply = chess.moveNumber() * 2 - (mover === 'w' ? 1 : 0);

    if (mover === game.botColor) {
      const fen = fenKey(chess.fen());
      const sig = structureSignature(chess, ply);
      const phase = sig.phase;

      addWeighted(artifacts.exactBook, fen, san);
      botMoves.push(san);
      botMovesByColor[game.botColor].push(san);

      inc(artifacts.phasePriors, `${game.botColor}|${phase}`, san);

      const sk = sigKey(sig);
      if (!artifacts.positionIndex[sk]) artifacts.positionIndex[sk] = [];
      artifacts.positionIndex[sk].push({ fen, move: san });

      const prefix = botMoves.join(',');
      inc(artifacts.openingTree, prefix, san);
    }

    chess.move(san, { sloppy: true });
  }
}

function buildOpeningPrefixes(openingTree) {
  const prefixes = {};
  for (const key of Object.keys(openingTree)) {
    prefixes[key] = openingTree[key];
  }
  return prefixes;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const games = loadGames();
  if (!games.length) {
    console.error('No training games found for player id', TRAINING_PLAYER_ID);
    process.exit(1);
  }

  const artifacts = {
    exactBook: {},
    openingTree: {},
    positionIndex: {},
    phasePriors: {},
  };

  for (const g of games) walkGame(g, artifacts);

  const targetElo = DEFAULT_TARGET_ELO;

  const output = {
    exactBook: artifacts.exactBook,
    openingTree: buildOpeningPrefixes(artifacts.openingTree),
    positionIndex: artifacts.positionIndex,
    phasePriors: artifacts.phasePriors,
    botRating: { targetElo, games: games.length },
  };

  for (const [name, data] of Object.entries(output)) {
    const file =
      name === 'botRating'
        ? 'bot-rating.json'
        : name === 'exactBook'
          ? 'player-book.json'
          : `${name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}.json`;
    const fname =
      name === 'exactBook'
        ? 'player-book.json'
        : name === 'openingTree'
          ? 'opening-tree.json'
          : name === 'positionIndex'
            ? 'position-index.json'
            : name === 'phasePriors'
              ? 'phase-priors.json'
              : 'bot-rating.json';
    fs.writeFileSync(path.join(OUT_DIR, fname), JSON.stringify(data));
  }

  console.log(
    `Built from ${games.length} games: ${Object.keys(artifacts.exactBook).length} positions, Elo ${targetElo}`,
  );
}

main();
