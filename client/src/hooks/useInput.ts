import { useEffect } from 'react';
import type { NudgeVerb } from 'common';

interface InputHandlers {
  onMove: (dq: number, dr: number) => void;
  onNudge: (verb: NudgeVerb) => void;
}

/**
 * The entire control scheme: wander with WASD/arrows, and four gentle,
 * non-destructive nudges. Nothing here can harm the world.
 */
export function useInput({ onMove, onNudge }: InputHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't steal keys while typing in an input.
      if (e.target instanceof HTMLInputElement) return;
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
        case 'Space':
          e.preventDefault();
          onNudge('scatter');
          break;
        case 'KeyE':
          onNudge('coax');
          break;
        case 'KeyQ':
          onNudge('part');
          break;
        case 'KeyF':
          onNudge('draw');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMove, onNudge]);
}
