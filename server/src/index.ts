import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorldManager } from './WorldManager.js';
import { GameEngine } from './GameEngine.js';
import type { Player, Position, EmoteType } from 'common';
import { EMOTES, hexDistance } from 'common';

// --- Input guards: socket payloads are untrusted. An unhandled throw in a
// handler would crash the whole server, so validate everything. ---
const NUDGE_VERBS = new Set(['scatter', 'coax', 'part', 'draw']);
const MAX_CHUNKS_PER_REQUEST = 64;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isPos = (p: any): p is Position => !!p && isNum(p.q) && isNum(p.r);

const app = express();
const httpServer = createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const io = new Server(httpServer, { cors: { origin: '*' } });

const world = new WorldManager('wanderleaf-seed');
const engine = new GameEngine(world);

// socket.id -> player
const players: Map<string, Player> = new Map();

const PALETTE = [0x6ba368, 0x5b8fb9, 0xc98a5e, 0xb56576, 0x9b6bcc, 0xd6a34a];

io.on('connection', (socket) => {
  console.log('a wanderer connected', socket.id);

  socket.on('join', (name: unknown, color: unknown) => {
    const id = `player-${socket.id}`;
    const player: Player = {
      id,
      type: 'player',
      name: (typeof name === 'string' && name.trim() ? name : 'Wanderer').slice(0, 20),
      pos: { q: 0, r: 0 },
      color: isNum(color) ? color : PALETTE[Math.floor(Math.random() * PALETTE.length)],
    };

    players.set(socket.id, player);
    world.addEntity(player);

    socket.emit('init', { playerId: id, worldSeed: 'wanderleaf-seed' });
    socket.emit('environmentUpdate', engine.getEnvironment());
    io.emit('entityUpdate', player);
  });

  socket.on('move', (pos: unknown) => {
    const player = players.get(socket.id);
    if (!player || !isPos(pos)) return;
    // Only single-hex steps (no teleporting), and never onto water or rock.
    if (hexDistance(player.pos, pos) > 1) return;
    const blocked = world
      .getEntitiesAt(pos.q, pos.r)
      .some((e) => e.type === 'water' || e.type === 'rock');
    if (blocked) return;

    const oldPos = { ...player.pos };
    player.pos = { q: pos.q, r: pos.r };
    world.moveEntityInMemory(player, oldPos);
    io.emit('entityUpdate', player);
  });

  socket.on('requestChunks', (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    const chunks = coords
      .slice(0, MAX_CHUNKS_PER_REQUEST)
      .filter((c) => c && isNum(c.cq) && isNum(c.cr))
      .map((c) => world.getChunk(c.cq, c.cr));
    socket.emit('chunks', chunks);
  });

  // --- The four nudge verbs ---------------------------------------------
  socket.on('nudge', (payload: unknown) => {
    const player = players.get(socket.id);
    if (!player || !payload || typeof payload !== 'object') return;
    const { verb, q, r } = payload as { verb: unknown; q: unknown; r: unknown };
    if (typeof verb !== 'string' || !NUDGE_VERBS.has(verb) || !isNum(q) || !isNum(r)) return;
    const pos = { q, r };

    if (verb === 'scatter') {
      const sprout = engine.scatter(pos);
      if (sprout) io.emit('entityUpdate', sprout);
    } else if (verb === 'coax') {
      const grown = engine.coax(pos);
      if (grown) io.emit('entityUpdate', grown);
    } else if (verb === 'part') {
      engine.stir(pos, 1);
      io.emit('ripple', { q, r });
    } else if (verb === 'draw') {
      engine.stir(pos, 4);
      io.emit('ripple', { q, r });
    }
  });

  socket.on('emote', (type: EmoteType) => {
    const player = players.get(socket.id);
    if (!player || !EMOTES.includes(type)) return;
    io.emit('player_emote', { playerId: player.id, type });
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      world.removeEntity(player.id, player.pos.q, player.pos.r);
      io.emit('entityRemove', { id: player.id });
    }
  });
});

// --- The world lives on its own -----------------------------------------
setInterval(() => {
  const playerList = Array.from(players.values());
  const { updated, environment } = engine.tick(playerList);

  for (const entity of updated) {
    io.emit('entityUpdate', entity);
  }
  io.emit('environmentUpdate', environment);

  world.cleanupChunks(playerList);
}, 1000);

// Periodic persistence of the remembering world.
setInterval(() => {
  world.saveState();
}, 30000);

app.use(express.static(path.join(__dirname, '../../client/dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Wanderleaf server running on port ${PORT}`);
});
