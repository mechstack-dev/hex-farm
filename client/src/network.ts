import { io, Socket } from 'socket.io-client';
import type { NudgeVerb, EmoteType } from 'common';

export const socket: Socket = io();

let lastMoveTime = 0;
const MOVE_COOLDOWN = 180;

socket.on('init', ({ playerId }: { playerId: string }) => {
  (socket as any).playerId = playerId;
});

export function joinGame(name: string) {
  socket.emit('join', name);
}

export function movePlayer(q: number, r: number) {
  const now = Date.now();
  if (now - lastMoveTime < MOVE_COOLDOWN) return;
  lastMoveTime = now;
  socket.emit('move', { q, r });
}

export function nudge(verb: NudgeVerb, q: number, r: number) {
  socket.emit('nudge', { verb, q, r });
}

export function emote(type: EmoteType) {
  socket.emit('emote', type);
}
