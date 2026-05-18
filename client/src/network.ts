import { io, Socket } from 'socket.io-client';
import type { Player } from 'common';

export const socket: Socket = io();

let lastMoveTime = 0;
let localPlayer: Player | null = null;

socket.on('entityUpdate', (entity: any) => {
    if (entity.id === (socket as any).playerId) {
        localPlayer = entity as Player;
    }
});

socket.on('init', ({ playerId }: { playerId: string }) => {
    (socket as any).playerId = playerId;
});

export function joinGame(name: string) {
  socket.emit('join', name);
}

export function movePlayer(q: number, r: number) {
  const now = Date.now();
  const hasSpeed = localPlayer?.buffs?.some((b: any) => b.type === 'speed');
  const cooldown = hasSpeed ? 100 : 200;

  if (now - lastMoveTime < cooldown) return;

  lastMoveTime = now;
  socket.emit('move', { q, r });
}
