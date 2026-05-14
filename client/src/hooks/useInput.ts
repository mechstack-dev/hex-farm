import { useEffect } from 'react';

export function useInput(onMove: (dq: number, dr: number) => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          onMove(0, -1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          onMove(0, 1);
          break;
        case 'ArrowLeft':
        case 'KeyA':
          onMove(-1, 0);
          break;
        case 'ArrowRight':
        case 'KeyD':
          onMove(1, 0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMove]);
}
