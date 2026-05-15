# Chess Bot

Play chess against a bot trained from anonymized game data. Share the deployed URL for anyone to play.

## Local development

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000

Play strength targets **~1650** Elo (Stockfish limited mode). Winning captures are only auto-played when a **quick 2-ply material check** (you capture → they try their toughest reply anywhere) still leaves you ahead — so forks and one-move refutations are skipped in favour of normal book/engine choice.

## Training data

Place `.pgn` files in `data/pgns/`. The build script matches the training player via `WhitePlayerId` / `BlackPlayerId` in `config.mjs`. Rebuild with `npm run build:book`.

## Deploy

Configured for [Render](https://render.com) as a Node web service:

- **Build:** `npm install && npm run build`
- **Start:** `npm start`

## License

MIT
