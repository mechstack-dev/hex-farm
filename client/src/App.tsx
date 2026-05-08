import { useState, useEffect, useRef } from 'react'
import { HexRenderer } from './renderers/HexRenderer'
import type { Entity, Position, EnvironmentState } from 'common'
import { getChunkCoords } from 'common'
import { socket, joinGame, movePlayer } from './network'
import { useInput } from './hooks/useInput'
import './App.css'

function App() {
  const pixiContainer = useRef<HTMLDivElement>(null);
  const renderer = useRef<HexRenderer | null>(null);
  const [playerPos, setPlayerPos] = useState<Position>({ q: 0, r: 0 });
  const [playerInventory, setPlayerInventory] = useState<Record<string, number>>({});
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [environment, setEnvironment] = useState<EnvironmentState>({ season: 'spring', weather: 'sunny', dayCount: 0 });
  const loadedChunks = useRef<Set<string>>(new Set());

  const requestChunksAround = (q: number, r: number) => {
    const { cq, cr } = getChunkCoords(q, r);
    const needed = [];
    for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
            const key = `${cq+dq},${cr+dr}`;
            if (!loadedChunks.current.has(key)) {
                needed.push({ cq: cq + dq, cr: cr + dr });
                loadedChunks.current.add(key);
            }
        }
    }
    if (needed.length > 0) {
        socket.emit('requestChunks', needed);
    }
  };

  useEffect(() => {
    if (pixiContainer.current && !renderer.current) {
      renderer.current = new HexRenderer(pixiContainer.current);
    }

    socket.on('init', () => {
      requestChunksAround(0, 0);
    });

    socket.on('chunks', (chunks: any[]) => {
      setEntities(prev => {
        const next = new Map(prev);
        chunks.forEach((chunk: any) => {
          chunk.entities.forEach((e: Entity) => {
            next.set(e.id, e);
          });
        });
        return next;
      });
    });

    socket.on('entityUpdate', (entity: Entity) => {
      setEntities(prev => {
        const next = new Map(prev);
        next.set(entity.id, entity);
        return next;
      });
      if (entity.id === socket.id) {
        setPlayerPos(entity.pos);
        setPlayerInventory((entity as any).inventory || {});
        requestChunksAround(entity.pos.q, entity.pos.r);
      }
    });

    socket.on('entityRemove', ({ id }: { id: string }) => {
      setEntities(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });

    socket.on('environmentUpdate', (env: EnvironmentState) => {
      setEnvironment(env);
    });

    joinGame('Player' + Math.floor(Math.random() * 1000));

    return () => {
      renderer.current?.destroy();
      renderer.current = null;
      socket.off('init');
      socket.off('chunks');
      socket.off('entityUpdate');
      socket.off('entityRemove');
      socket.off('environmentUpdate');
    };
  }, []);

  useInput((dq, dr) => {
    const nextPos = { q: playerPos.q + dq, r: playerPos.r + dr };
    movePlayer(nextPos.q, nextPos.r);
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p') {
        socket.emit('plant');
      } else if (e.key.toLowerCase() === 'i') {
        socket.emit('water');
      } else if (e.key.toLowerCase() === 'h') {
        socket.emit('harvest');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (renderer.current) {
      renderer.current.renderWorld(Array.from(entities.values()), playerPos, environment.season);
    }
  }, [entities, playerPos, environment.season]);

  return (
    <div className="App">
      <div ref={pixiContainer} className="pixi-container" style={{ width: '100vw', height: '100vh' }} />
      <div className="ui-overlay" style={{ position: 'absolute', top: 10, left: 10, pointerEvents: 'none', color: 'white', textShadow: '1px 1px 2px black' }}>
        <h1>Harvest Hex MMO</h1>
        <div className="environment-info" style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', marginBottom: '10px' }}>
          <p>Season: <span style={{ textTransform: 'capitalize' }}>{environment.season}</span></p>
          <p>Weather: <span style={{ textTransform: 'capitalize' }}>{environment.weather}</span></p>
          <p>Day: {environment.dayCount + 1}</p>
        </div>
        <p>Position: {playerPos.q}, {playerPos.r}</p>
        <p>Use WASD or Arrow Keys to move</p>
        <p>Press <b>P</b> to Plant, <b>I</b> to Water, <b>H</b> to Harvest</p>
        <div className="inventory" style={{ marginTop: '20px', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px' }}>
          <h3>Inventory</h3>
          {Object.entries(playerInventory).length === 0 ? <p>Empty</p> : (
            <ul>
              {Object.entries(playerInventory).map(([item, count]) => (
                <li key={item}>{item}: {count}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
