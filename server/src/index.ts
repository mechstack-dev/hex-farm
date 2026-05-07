import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { WorldManager } from './WorldManager.js';
import { GameEngine } from './GameEngine.js';
import type { Player, Position } from 'common';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  }
});

const world = new WorldManager("mmo-seed");
const engine = new GameEngine(world);

const players: Map<string, Player> = new Map();

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  socket.on('join', (name: string) => {
    const player: Player = {
      id: socket.id,
      type: 'player',
      name,
      pos: { q: 0, r: 0 }
    };
    players.set(socket.id, player);
    world.addEntity(player);
    socket.emit('init', { playerId: socket.id, worldSeed: "mmo-seed" });
    io.emit('entityUpdate', player);
  });

  socket.on('move', (pos: Position) => {
    const player = players.get(socket.id);
    if (player) {
      player.pos = pos;
      io.emit('entityUpdate', player);
    }
  });

  socket.on('requestChunks', (coords: {cq: number, cr: number}[]) => {
    const chunks = coords.map(c => world.getChunk(c.cq, c.cr));
    socket.emit('chunks', chunks);
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      world.removeEntity(player.id, player.pos.q, player.pos.r);
      players.delete(socket.id);
      io.emit('entityRemove', { id: socket.id, pos: player.pos });
    }
  });
});

// Real game loop
setInterval(() => {
  // Logic for animals and plants would go here
  // For a basic demo, we just print something
}, 1000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
