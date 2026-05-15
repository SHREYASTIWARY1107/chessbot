import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';
import { getBotMove } from './bot.mjs';
import { loadArtifacts } from './book.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

try {
  loadArtifacts();
} catch (e) {
  console.error('Training data missing. Run: npm run build:book');
}

app.get('/api/health', (_req, res) => {
  try {
    const { botRating } = loadArtifacts();
    res.json({ ok: true, games: botRating.games, targetElo: botRating.targetElo });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.post('/api/bot-move', async (req, res) => {
  try {
    const { fen, moves = [], botColor } = req.body;
    if (!fen || !botColor || !['w', 'b'].includes(botColor)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const chess = new Chess(fen);
    if (chess.turn() !== botColor) {
      return res.status(400).json({ error: 'Not bot turn' });
    }

    const move = await getBotMove({ fen, moves, botColor });
    if (!move?.san) return res.status(500).json({ error: 'No move' });

    res.json({ san: move.san, uci: move.uci });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Bot error' });
  }
});

const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chessbot listening on ${PORT}`);
});
