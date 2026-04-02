import React, { useState, useCallback, useRef, useEffect } from 'react';

type Board = number[][];

// Wikipedia classic Sudoku puzzle
const PUZZLE: Board = [
  [5, 3, 0,  0, 7, 0,  0, 0, 0],
  [6, 0, 0,  1, 9, 5,  0, 0, 0],
  [0, 9, 8,  0, 0, 0,  0, 6, 0],

  [8, 0, 0,  0, 6, 0,  0, 0, 3],
  [4, 0, 0,  8, 0, 3,  0, 0, 1],
  [7, 0, 0,  0, 2, 0,  0, 0, 6],

  [0, 6, 0,  0, 0, 0,  2, 8, 0],
  [0, 0, 0,  4, 1, 9,  0, 0, 5],
  [0, 0, 0,  0, 8, 0,  0, 7, 9],
];

const SOLUTION: Board = [
  [5, 3, 4,  6, 7, 8,  9, 1, 2],
  [6, 7, 2,  1, 9, 5,  3, 4, 8],
  [1, 9, 8,  3, 4, 2,  5, 6, 7],

  [8, 5, 9,  7, 6, 1,  4, 2, 3],
  [4, 2, 6,  8, 5, 3,  7, 9, 1],
  [7, 1, 3,  9, 2, 4,  8, 5, 6],

  [9, 6, 1,  5, 3, 7,  2, 8, 4],
  [2, 8, 7,  4, 1, 9,  6, 3, 5],
  [3, 4, 5,  2, 8, 6,  1, 7, 9],
];

const GIVEN: boolean[][] = PUZZLE.map(row => row.map(v => v !== 0));

function hasConflict(board: Board, r: number, c: number, val: number): boolean {
  if (!val) return false;
  for (let i = 0; i < 9; i++) {
    if (i !== c && board[r][i] === val) return true;
    if (i !== r && board[i][c] === val) return true;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      if ((rr !== r || cc !== c) && board[rr][cc] === val) return true;
    }
  }
  return false;
}

const STORAGE_KEY = 'g-master-sudoku-board';

function loadSavedBoard(): Board | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Board;
    if (Array.isArray(parsed) && parsed.length === 9 && parsed[0].length === 9) return parsed;
  } catch {}
  return null;
}

const CELL = 31;

const SudokuGame: React.FC = () => {
  const [board, setBoard] = useState<Board>(() => loadSavedBoard() ?? PUZZLE.map(r => [...r]));
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [won, setWon] = useState<boolean>(() => {
    const saved = loadSavedBoard();
    return saved ? saved.every((row, ri) => row.every((v, ci) => v === SOLUTION[ri][ci])) : false;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 每次棋盘变化时持久化
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  }, [board]);

  const inputNum = useCallback((num: number) => {
    if (!selected) return;
    const [r, c] = selected;
    if (GIVEN[r][c]) return;
    const next = board.map(row => [...row]);
    next[r][c] = num;
    setBoard(next);
    const solved = next.every((row, ri) => row.every((v, ci) => v === SOLUTION[ri][ci]));
    if (solved) setWon(true);
  }, [selected, board]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selected) return;
    const [r, c] = selected;
    if (e.key >= '1' && e.key <= '9') { e.preventDefault(); inputNum(parseInt(e.key)); }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); inputNum(0); }
    if (e.key === 'ArrowUp'    && r > 0) { e.preventDefault(); setSelected([r - 1, c]); }
    if (e.key === 'ArrowDown'  && r < 8) { e.preventDefault(); setSelected([r + 1, c]); }
    if (e.key === 'ArrowLeft'  && c > 0) { e.preventDefault(); setSelected([r, c - 1]); }
    if (e.key === 'ArrowRight' && c < 8) { e.preventDefault(); setSelected([r, c + 1]); }
  }, [selected, inputNum]);

  const handleReset = () => {
    const fresh = PUZZLE.map(r => [...r]);
    setBoard(fresh);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    setSelected(null);
    setWon(false);
    containerRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 12px 12px',
        flex: 1,
        overflowY: 'auto',
        outline: 'none',
        userSelect: 'none',
      }}
    >
      {/* subtitle */}
      <p style={{ fontSize: 11, color: '#8B7355', margin: '0 0 8px', fontStyle: 'italic', textAlign: 'center', opacity: 0.8 }}>
        等待 AI 思考时，来一局数独放松一下 ☕
      </p>

      {/* win banner */}
      {won && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(139,115,85,0.12), rgba(107,139,107,0.12))',
          border: '1px solid rgba(107,139,107,0.35)',
          borderRadius: 8,
          padding: '6px 14px',
          marginBottom: 8,
          textAlign: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#4a7c59' }}>🎉 恭喜完成！</span>
          <button
            onClick={handleReset}
            style={{
              marginLeft: 10, fontSize: 11, color: '#8B7355', background: 'none',
              border: '1px solid rgba(139,115,85,0.4)', borderRadius: 4,
              padding: '1px 7px', cursor: 'pointer',
            }}
          >再来一局</button>
        </div>
      )}

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(9, ${CELL}px)`,
        gridTemplateRows: `repeat(9, ${CELL}px)`,
        border: '2px solid #8B7355',
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(139,115,85,0.15)',
      }}>
        {board.map((row, r) =>
          row.map((val, c) => {
            const isGiven   = GIVEN[r][c];
            const isSel     = selected?.[0] === r && selected?.[1] === c;
            const selVal    = selected ? board[selected[0]][selected[1]] : 0;
            const isSameNum = !isSel && val !== 0 && val === selVal;
            const sameZone  = selected && (
              r === selected[0] || c === selected[1] ||
              (Math.floor(r / 3) === Math.floor(selected[0] / 3) &&
               Math.floor(c / 3) === Math.floor(selected[1] / 3))
            );
            const hasErr = val !== 0 && !isGiven && hasConflict(board, r, c, val);

            // border helpers for 3×3 box separation
            const borderR = (c + 1) % 3 === 0 && c !== 8 ? '2px solid rgba(139,115,85,0.55)' : '1px solid rgba(212,201,184,0.6)';
            const borderB = (r + 1) % 3 === 0 && r !== 8 ? '2px solid rgba(139,115,85,0.55)' : '1px solid rgba(212,201,184,0.6)';

            let bg = '#FAFAF8';
            if (isSel)              bg = 'rgba(139,115,85,0.32)';
            else if (isSameNum)     bg = 'rgba(139,115,85,0.18)';
            else if (sameZone)      bg = 'rgba(139,115,85,0.06)';

            return (
              <div
                key={`${r}-${c}`}
                onClick={() => { setSelected([r, c]); containerRef.current?.focus(); }}
                style={{
                  width: CELL, height: CELL,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isGiven ? 14 : 13,
                  fontWeight: isGiven ? 700 : 500,
                  color: hasErr ? '#e74c3c' : isGiven ? '#1a1a1a' : '#6e5b3e',
                  background: bg,
                  cursor: isGiven ? 'default' : 'pointer',
                  borderRight: borderR,
                  borderBottom: borderB,
                  transition: 'background 0.1s',
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                }}
              >
                {val || ''}
              </div>
            );
          })
        )}
      </div>

      {/* Number pad */}
      <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <div
            key={n}
            onClick={() => inputNum(n)}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600,
              color: '#8B7355',
              background: 'rgba(139,115,85,0.08)',
              borderRadius: 6,
              cursor: 'pointer',
              border: '1px solid rgba(139,115,85,0.2)',
              transition: 'background 0.1s',
            }}
          >
            {n}
          </div>
        ))}
        <div
          onClick={() => inputNum(0)}
          title="清除"
          style={{
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600,
            color: '#bbb',
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 6,
            cursor: 'pointer',
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        >
          ✕
        </div>
      </div>

      <p style={{ fontSize: 10, color: '#ccc', margin: '6px 0 0', letterSpacing: 0.2 }}>
        点击选格 · 键盘输入数字 · 方向键移动
      </p>
    </div>
  );
};

export default SudokuGame;
