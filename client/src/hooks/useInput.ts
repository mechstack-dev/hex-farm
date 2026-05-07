import { useEffect } from 'react';

export function useInput(onMove: (dq: number, dr: number) => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          onMove(0, -1);
          break;
        case 'ArrowDown':
          onMove(0, 1);
          break;
        case 'ArrowLeft':
          onMove(-1, 0);
          break;
        case 'ArrowRight':
          onMove(1, 0);
          break;
        case 'w':
          onMove(0, -1);
          break;
        case 's':
          onMove(0, 1);
          break;
        case 'a':
          onMove(-1, 0);
          break;
        case 'd':
          onMove(1, 0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMove]);
}
