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

**Move priority:** (1) Exact book, (2) Opening prefix tree, (3) Vetted captures, then fuzzy / phase / Stockfish. **Tactics:** Each candidate assumes the opponent replies once to **minimize your material eval**; that blocks **Qxd5 …Qxd5**-style queen-for-pawn catastrophes without calling every quiet move “illegal” (default max loss **~3 pawns** per reply, override with `BOT_TACTICAL_MAX_DROP`). A final `coerceSafeSan` still re-checks before sending a move. Tier (3) captures also use a stricter 2-ply trap filter.

## Training data

Place `.pgn` files in `data/pgns/`. The build script matches the training player via `WhitePlayerId` / `BlackPlayerId` in `config.mjs`. Rebuild with `npm run build:book`.

## Deploy

Configured for [Render](https://render.com) as a Node web service:

- **Build:** `npm install && npm run build`
- **Start:** `npm start`

## License

MIT
