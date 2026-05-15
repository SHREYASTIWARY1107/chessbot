import { useCallback, useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import './ChessGame.css';

export default function ChessGame({ playerColor, botColor, onNewGame }) {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState('');
  const [gameOver, setGameOver] = useState(false);

  const updateStatus = useCallback((c) => {
    if (c.isCheckmate()) {
      setStatus(c.turn() === playerColor ? 'You lost.' : 'You won!');
      setGameOver(true);
    } else if (c.isDraw()) {
      setStatus('Draw.');
      setGameOver(true);
    } else if (c.isCheck()) {
      setStatus('Check.');
    } else {
      setStatus(c.turn() === playerColor ? 'Your turn' : 'Bot is thinking…');
    }
  }, [playerColor]);

  const requestBotMove = useCallback(
    async (currentMoves, currentFen) => {
      setThinking(true);
      setStatus('Bot is thinking…');
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 200));

      try {
        let lastStatus = 0;
        let data = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0)
            await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt - 1)));
          const res = await fetch('/api/bot-move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fen: currentFen,
              moves: currentMoves,
              botColor,
            }),
          });
          lastStatus = res.status;
          if (res.ok) {
            data = await res.json();
            break;
          }
          if (![502, 503, 504].includes(res.status)) break;
        }

        if (!data?.san) throw new Error(lastStatus ? String(lastStatus) : 'Bot failed');

        const c = new Chess(currentFen);
        c.move(data.san, { sloppy: true });
        const nextMoves = [...currentMoves, data.san];
        setMoves(nextMoves);
        setFen(c.fen());
        updateStatus(c);
      } catch {
        setStatus('Bot unavailable. Try again.');
      } finally {
        setThinking(false);
      }
    },
    [botColor, updateStatus],
  );

  useEffect(() => {
    const c = new Chess();
    if (c.turn() === botColor) {
      requestBotMove([], c.fen());
    } else {
      setStatus('Your turn');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = (source, target) => {
    if (thinking || gameOver) return false;
    const c = new Chess(fen);
    if (c.turn() !== playerColor) return false;

    try {
      const m = c.move({ from: source, to: target, promotion: 'q' });
      if (!m) return false;
    } catch {
      return false;
    }

    const san = c.history().slice(-1)[0];
    const nextMoves = [...moves, san];
    setMoves(nextMoves);
    setFen(c.fen());
    updateStatus(c);

    if (!c.isGameOver() && c.turn() === botColor) {
      requestBotMove(nextMoves, c.fen());
    }
    return true;
  };

  const reset = () => {
    const c = new Chess();
    chess.reset();
    setFen(c.fen());
    setMoves([]);
    setGameOver(false);
    setStatus(playerColor === 'w' ? 'Your turn' : 'Bot is thinking…');
    if (botColor === 'w') {
      requestBotMove([], c.fen());
    }
  };

  return (
    <div className="chess-game">
      <div className="board-wrap">
        <Chessboard
          position={fen}
          onPieceDrop={onDrop}
          boardOrientation={playerColor === 'w' ? 'white' : 'black'}
          arePiecesDraggable={!thinking && !gameOver}
          customBoardStyle={{ borderRadius: 8 }}
          customDarkSquareStyle={{ backgroundColor: '#b58863' }}
          customLightSquareStyle={{ backgroundColor: '#e8d4b0' }}
        />
      </div>
      <div className="side-panel">
        <p className="status">{status}</p>
        <ol className="move-list">
          {moves.map((m, i) => (
            <li key={`${i}-${m}`}>
              {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}
              {m}{' '}
            </li>
          ))}
        </ol>
        <button type="button" className="btn-primary" onClick={reset} disabled={thinking}>
          New game
        </button>
      </div>
    </div>
  );
}
