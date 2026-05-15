# Chess Bot

Play chess against a bot trained from anonymized game data. Share the deployed URL for anyone to play.

## Local development

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000

## Training data

Place `.pgn` files in `data/pgns/`. The build script identifies the training player by `WhitePlayerId` / `BlackPlayerId` (see `config.mjs`). Rebuild with `npm run build:book`.

## Deploy

Configured for [Render](https://render.com) as a Node web service:

- **Build:** `npm install && npm run build`
- **Start:** `npm start`

## License

MIT
