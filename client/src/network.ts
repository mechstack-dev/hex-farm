import { io, Socket } from 'socket.io-client';

export const socket: Socket = io();

export function joinGame(name: string) {
  socket.emit('join', name);
}

export function movePlayer(q: number, r: number) {
  socket.emit('move', { q, r });
}
