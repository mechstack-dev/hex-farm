import { useEffect, useRef, useState, useCallback } from 'react';
import { HexRenderer } from './renderers/HexRenderer';
import { socket, joinGame, movePlayer, nudge, emote } from './network';
import { useInput } from './hooks/useInput';
import type { Entity, Position, EnvironmentState, NudgeVerb, EmoteType } from 'common';
import { getChunkCoords, chunkToKey, localWeather, EMOTES } from 'common';
import './App.css';

const CHUNK_RADIUS = 2;

const EMOTE_GLYPH: Record<EmoteType, string> = { heart: '❤', smile: '☺', sad: '☹', wow: '❗' };

export default function App() {
  const pixiContainer = useRef<HTMLDivElement>(null);
  const renderer = useRef<HexRenderer | null>(null);
  const requested = useRef<Set<string>>(new Set());
  const facing = useRef<Position>({ q: 0, r: 1 });
  const playerId = useRef<string | null>(null);

  const [joined, setJoined] = useState(false);
  const [name, setName] = useState('');
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [playerPos, setPlayerPos] = useState<Position>({ q: 0, r: 0 });
  const [env, setEnv] = useState<EnvironmentState>({ season: 'spring', dayCount: 0, timeOfDay: 0, weatherCells: [] });

  const requestChunksAround = useCallback((q: number, r: number) => {
    const { cq, cr } = getChunkCoords(q, r);
    const needed: { cq: number; cr: number }[] = [];
    for (let dq = -CHUNK_RADIUS; dq <= CHUNK_RADIUS; dq++) {
      for (let dr = -CHUNK_RADIUS; dr <= CHUNK_RADIUS; dr++) {
        const key = chunkToKey(cq + dq, cr + dr);
        if (!requested.current.has(key)) {
          requested.current.add(key);
          needed.push({ cq: cq + dq, cr: cr + dr });
        }
      }
    }
    if (needed.length) socket.emit('requestChunks', needed);
  }, []);

  // --- socket wiring -------------------------------------------------------
  useEffect(() => {
    if (!joined) return;
    if (pixiContainer.current && !renderer.current) {
      renderer.current = new HexRenderer(pixiContainer.current);
    }

    socket.on('init', ({ playerId: id }: { playerId: string }) => {
      playerId.current = id;
      requestChunksAround(0, 0);
    });

    socket.on('chunks', (chunks: { entities: Entity[] }[]) => {
      setEntities((prev) => {
        const next = new Map(prev);
        chunks.forEach((c) => c.entities.forEach((e) => next.set(e.id, e)));
        return next;
      });
    });

    socket.on('entityUpdate', (entity: Entity) => {
      setEntities((prev) => new Map(prev).set(entity.id, entity));
      if (entity.id === playerId.current) {
        setPlayerPos(entity.pos);
        requestChunksAround(entity.pos.q, entity.pos.r);
      }
    });

    socket.on('entityRemove', ({ id }: { id: string }) => {
      setEntities((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });

    socket.on('environmentUpdate', (e: EnvironmentState) => setEnv(e));

    return () => {
      socket.off('init');
      socket.off('chunks');
      socket.off('entityUpdate');
      socket.off('entityRemove');
      socket.off('environmentUpdate');
    };
  }, [joined, requestChunksAround]);

  // --- render loop ---------------------------------------------------------
  useEffect(() => {
    renderer.current?.renderWorld(Array.from(entities.values()), playerPos, env);
  }, [entities, playerPos, env]);

  // --- input ---------------------------------------------------------------
  const onMove = useCallback((dq: number, dr: number) => {
    facing.current = { q: dq, r: dr };
    setPlayerPos((p) => {
      movePlayer(p.q + dq, p.r + dr);
      return p; // server is authoritative; wait for entityUpdate
    });
  }, []);

  const onNudge = useCallback((verb: NudgeVerb) => {
    setPlayerPos((p) => {
      nudge(verb, p.q + facing.current.q, p.r + facing.current.r);
      return p;
    });
  }, []);

  useInput({ onMove, onNudge });

  if (!joined) {
    const enter = () => { joinGame(name || 'Wanderer'); setJoined(true); };
    return (
      <div className="login">
        <h1>Wanderleaf</h1>
        <p>A quiet world that grows on its own. Wander, and leave gentle marks.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enter()}
          placeholder="Your name"
          maxLength={20}
          autoFocus
        />
        <button onClick={enter}>Wander in</button>
      </div>
    );
  }

  const weather = localWeather(env.weatherCells, playerPos);
  const hh = Math.floor(env.timeOfDay * 24).toString().padStart(2, '0');
  const mm = Math.floor((env.timeOfDay * 24 * 60) % 60).toString().padStart(2, '0');

  return (
    <div className="game">
      <div ref={pixiContainer} className="pixi" />

      <div className="hud">
        <div className="panel env">
          <span className="season">{env.season}</span>
          <span>· {weather}</span>
          <span>· day {env.dayCount + 1}</span>
          <span>· {hh}:{mm}</span>
        </div>

        <div className="panel controls">
          <div><b>WASD</b> wander</div>
          <div><b>Space</b> scatter seeds</div>
          <div><b>E</b> coax growth</div>
          <div><b>Q</b> part the grass</div>
          <div><b>F</b> draw creatures near</div>
        </div>

        <div className="emotes">
          {EMOTES.map((t) => (
            <button key={t} onClick={() => emote(t)} title={t}>{EMOTE_GLYPH[t]}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
