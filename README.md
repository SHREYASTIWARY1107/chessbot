# Chess Bot

Play chess against a bot trained from anonymized game data. Share the deployed URL for anyone to play.

## Local development

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000

Play strength targets **~1650** Elo (Stockfish limited mode). When the opponent hangs material the bot wins in one exchange (or for free), it **takes it first** before opening book or style. Override with `BOT_ELO` in env.

## Training data

Place `.pgn` files in `data/pgns/`. The build script matches the training player via `WhitePlayerId` / `BlackPlayerId` in `config.mjs`. Rebuild with `npm run build:book`.

## Deploy

Configured for [Render](https://render.com) as a Node web service:

- **Build:** `npm install && npm run build`
- **Start:** `npm start`

## License

MIT
