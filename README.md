# Chess Bot

Play chess against a bot trained from anonymized game data. Share the deployed URL for anyone to play.

## Local development

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000

Play strength targets **~1650** Elo (Stockfish limited mode).

**Move priority:** (1) **Exact positions** from your PGNs (`player-book`), (2) **Opening sequences** (prefix tree of your bot moves), (3) **Vetted captures** only when (1) and (2) have no usable move, then fuzzy / phase / capped Stockfish. So when the game matches your training, the bot prefers your repertoire first; capture heuristics do not skip ahead of that anymore. When captures are considered, they pass a short **2-ply material trap check** before playing.

## Training data

Place `.pgn` files in `data/pgns/`. The build script matches the training player via `WhitePlayerId` / `BlackPlayerId` in `config.mjs`. Rebuild with `npm run build:book`.

## Deploy

Configured for [Render](https://render.com) as a Node web service:

- **Build:** `npm install && npm run build`
- **Start:** `npm start`

## License

MIT
