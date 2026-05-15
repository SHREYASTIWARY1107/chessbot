import { useState } from 'react';
import ChessGame from './ChessGame';
import './App.css';

export default function App() {
  const [playerColor, setPlayerColor] = useState(null);
  const [gameKey, setGameKey] = useState(0);

  if (!playerColor) {
    return (
      <div className="landing">
        <header className="hero">
          <h1>Play against the bot</h1>
          <p className="subtitle">Choose your color and start a casual game.</p>
        </header>
        <div className="color-picker">
          <button type="button" className="color-btn light" onClick={() => setPlayerColor('w')}>
            <span className="piece">♔</span>
            Play White
          </button>
          <button type="button" className="color-btn dark" onClick={() => setPlayerColor('b')}>
            <span className="piece">♚</span>
            Play Black
          </button>
        </div>
      </div>
    );
  }

  const botColor = playerColor === 'w' ? 'b' : 'w';

  return (
    <div className="game-shell">
      <header className="game-header">
        <h1>Chess Bot</h1>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setPlayerColor(null);
            setGameKey((k) => k + 1);
          }}
        >
          Change color
        </button>
      </header>
      <ChessGame
        key={gameKey}
        playerColor={playerColor}
        botColor={botColor}
        onNewGame={() => setGameKey((k) => k + 1)}
      />
    </div>
  );
}
