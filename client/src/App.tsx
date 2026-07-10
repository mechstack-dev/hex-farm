import { useEffect, useRef, useState, useCallback } from 'react';
import { HexRenderer } from './renderers/HexRenderer';
import { socket, joinGame, movePlayer, nudge, emote } from './network';
import { useInput } from './hooks/useInput';
import { AudioManager } from './AudioManager';
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
  const nameRef = useRef('');

  const [joined, setJoined] = useState(false);
  const [name, setName] = useState('');
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [playerPos, setPlayerPos] = useState<Position>({ q: 0, r: 0 });
  const [env, setEnv] = useState<EnvironmentState>({ season: 'spring', dayCount: 0, timeOfDay: 0, weatherCells: [] });
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  const lastChunk = useRef<string>('');

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

  // As the wanderer moves on, forget far-away chunks so the client's entity
  // map doesn't grow without bound over a long journey. Dropped chunks are
  // also un-remembered so they reload if the wanderer returns.
  const forgetFar = useCallback((q: number, r: number) => {
    const PRUNE_RADIUS = 3; // a margin beyond the request radius
    const { cq, cr } = getChunkCoords(q, r);
    setEntities((prev) => {
      const next = new Map<string, Entity>();
      for (const [id, e] of prev) {
        const ec = getChunkCoords(e.pos.q, e.pos.r);
        if (Math.abs(ec.cq - cq) <= PRUNE_RADIUS && Math.abs(ec.cr - cr) <= PRUNE_RADIUS) {
          next.set(id, e);
        } else {
          requested.current.delete(chunkToKey(ec.cq, ec.cr));
        }
      }
      return next;
    });
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
        const { cq, cr } = getChunkCoords(entity.pos.q, entity.pos.r);
        const c = chunkToKey(cq, cr);
        if (c !== lastChunk.current) {
          lastChunk.current = c;
          forgetFar(entity.pos.q, entity.pos.r);
        }
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

    // Join only after every listener is attached, so the server's `init`
    // reply can never arrive before we're listening for it.
    joinGame(nameRef.current || 'Wanderer');

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
    AudioManager.getInstance().setWeather(localWeather(env.weatherCells, playerPos));
  }, [entities, playerPos, env]);

  useEffect(() => {
    renderer.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, joined]);

  // --- input ---------------------------------------------------------------
  const onMove = useCallback((dq: number, dr: number) => {
    facing.current = { q: dq, r: dr };
    setPlayerPos((p) => {
      movePlayer(p.q + dq, p.r + dr);
      return p; // server is authoritative; wait for entityUpdate
    });
  }, []);

  const onNudge = useCallback((verb: NudgeVerb) => {
    if (verb === 'scatter' || verb === 'coax') AudioManager.getInstance().pluck();
    setPlayerPos((p) => {
      nudge(verb, p.q + facing.current.q, p.r + facing.current.r);
      return p;
    });
  }, []);

  useInput({ onMove, onNudge });

  if (!joined) {
    const enter = () => { nameRef.current = name; AudioManager.getInstance().start(); setJoined(true); };
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
        <div className="topbar">
          <div className="panel env">
            <span className="season">{env.season}</span>
            <span>· {weather}</span>
            <span>· day {env.dayCount + 1}</span>
            <span>· {hh}:{mm}</span>
          </div>
          <div className="settings">
            <button
              title={muted ? 'Unmute' : 'Mute'}
              onClick={() => setMuted(AudioManager.getInstance().toggleMute())}
            >{muted ? '🔇' : '🔊'}</button>
            <button
              title="Reduce motion"
              className={reducedMotion ? 'on' : ''}
              onClick={() => setReducedMotion((v) => !v)}
            >〰️</button>
          </div>
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
