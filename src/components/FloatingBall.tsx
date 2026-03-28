import React, { useCallback, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Bot, Loader2, Sparkles, HelpCircle } from 'lucide-react';
import { StateStore } from '../stores/state-store';

interface Props {
  store: StateStore;
  onTogglePanel: () => void;
}

const BALL_SIZE = 44;
const POS_KEY = 'dt-ball-pos';

function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch { /* ignore */ }
  return {
    x: window.innerWidth - BALL_SIZE - 24,
    y: 72,
  };
}

function savePos(x: number, y: number) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x, y })); } catch { /* ignore */ }
}

const FloatingBall: React.FC<Props> = observer(({ store, onTogglePanel }) => {
  const [pos, setPos] = useState<{ x: number; y: number }>(loadPos);
  const posRef = useRef(pos);

  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 });
  const moved = useRef(false);
  const ballRef = useRef<HTMLDivElement>(null);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    moved.current = false;
    dragStart.current = { mx: e.clientX, my: e.clientY, bx: posRef.current.x, by: posRef.current.y };
    ballRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const newPos = {
      x: clamp(dragStart.current.bx + dx, 0, vw - BALL_SIZE),
      y: clamp(dragStart.current.by + dy, 0, vh - BALL_SIZE),
    };
    posRef.current = newPos;
    setPos(newPos);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    savePos(posRef.current.x, posRef.current.y);
    if (!moved.current) {
      onTogglePanel();
    }
  }, [onTogglePanel]);

  const phase = store.enginePhase;

  const BallIcon = () => {
    if (phase === 'thinking') return <Loader2 size={17} className="dt-spin-icon" />;
    if (phase === 'summarizing') return <Sparkles size={17} className="dt-spin-icon" />;
    if (phase === 'clarifying') return <HelpCircle size={17} />;
    return <Bot size={17} />;
  };

  return (
    <div
      ref={ballRef}
      id="dt-floating-ball"
      className={`dt-ball-${phase}`}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="dt-glow-ring" />
      <div className="dt-ball-inner">
        <BallIcon />
      </div>
    </div>
  );
});

export default FloatingBall;
