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
  const [playerCoins, setPlayerCoins] = useState<number>(0);
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [environment, setEnvironment] = useState<EnvironmentState>({ season: 'spring', weather: 'sunny', dayCount: 0, timeOfDay: 0 });
  const [notifications, setNotifications] = useState<{id: number, message: string, type: string}[]>([]);
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
        setPlayerCoins((entity as any).coins || 0);
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

    socket.on('notification', ({ message, type }: { message: string, type: string }) => {
      const id = Date.now();
      setNotifications(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
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
      if (e.key.toLowerCase() === '1') {
        socket.emit('plant', 'turnip');
      } else if (e.key.toLowerCase() === '2') {
        socket.emit('plant', 'carrot');
      } else if (e.key.toLowerCase() === '3') {
        socket.emit('plant', 'pumpkin');
      } else if (e.key.toLowerCase() === 'i') {
        socket.emit('water');
      } else if (e.key.toLowerCase() === 'h') {
        socket.emit('harvest');
      } else if (e.key.toLowerCase() === 'f') {
        socket.emit('build_fence');
      } else if (e.key.toLowerCase() === 'e') {
        socket.emit('interact');
      } else if (e.key.toLowerCase() === 'p') {
        socket.emit('plow');
      } else if (e.key.toLowerCase() === 'r') {
        socket.emit('build_path');
      } else if (e.key.toLowerCase() === 'k') {
        socket.emit('build_sprinkler');
      } else if (e.key.toLowerCase() === '4') {
        socket.emit('buy_seed', 'turnip');
      } else if (e.key.toLowerCase() === '5') {
        socket.emit('buy_seed', 'carrot');
      } else if (e.key.toLowerCase() === '6') {
        socket.emit('buy_seed', 'pumpkin');
      } else if (e.key.toLowerCase() === '7') {
        socket.emit('buy_sprinkler');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (renderer.current) {
      renderer.current.renderWorld(Array.from(entities.values()), playerPos, environment);
    }
  }, [entities, playerPos, environment]);

  const categorizedInventory = () => {
    const categories: Record<string, {name: string, items: [string, number][]}> = {
        seeds: { name: 'Seeds', items: [] },
        crops: { name: 'Crops', items: [] },
        products: { name: 'Animal Products', items: [] },
        tools: { name: 'Tools/Kits', items: [] }
    };

    Object.entries(playerInventory).forEach(([item, count]) => {
        if (item.endsWith('-seed')) categories.seeds.items.push([item, count]);
        else if (['turnip', 'carrot', 'pumpkin'].includes(item)) categories.crops.items.push([item, count]);
        else if (['milk', 'wool', 'egg'].includes(item)) categories.products.items.push([item, count]);
        else categories.tools.items.push([item, count]);
    });

    return Object.values(categories).filter(c => c.items.length > 0);
  };

  return (
    <div className="App">
      <div ref={pixiContainer} className="pixi-container" style={{ width: '100vw', height: '100vh' }} />

      <div className="notifications" style={{ position: 'absolute', top: 20, right: 20, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
        {notifications.map(n => (
          <div key={n.id} className={`notification ${n.type}`} style={{
            background: n.type === 'success' ? 'rgba(40, 167, 69, 0.9)' : (n.type === 'error' ? 'rgba(220, 53, 69, 0.9)' : 'rgba(0, 123, 255, 0.9)'),
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            animation: 'fadeInOut 5s forwards'
          }}>
            {n.message}
          </div>
        ))}
      </div>

      <div className="ui-overlay" style={{ position: 'absolute', top: 10, left: 10, pointerEvents: 'none', color: 'white', textShadow: '1px 1px 2px black' }}>
        <h1>Harvest Hex MMO</h1>
        <div className="environment-info" style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', marginBottom: '10px' }}>
          <p>Season: <span style={{ textTransform: 'capitalize' }}>{environment.season}</span></p>
          <p>Weather: <span style={{ textTransform: 'capitalize' }}>{environment.weather}</span></p>
          <p>Day: {environment.dayCount + 1}</p>
          <p>Time: {Math.floor(environment.timeOfDay * 24).toString().padStart(2, '0')}:{Math.floor((environment.timeOfDay * 24 * 60) % 60).toString().padStart(2, '0')}</p>
        </div>
        <p>Position: {playerPos.q}, {playerPos.r} | <b>Coins: {playerCoins}</b></p>
        <p>Use WASD or Arrow Keys to move</p>
        <p>Press <b>1, 2, 3</b> to Plant, <b>P</b> to Plow, <b>R</b> to Path, <b>I</b> to Water, <b>H</b> to Harvest, <b>F</b> to Fence, <b>K</b> to Sprinkler, <b>E</b> to Interact</p>
        <p>Press <b>4, 5, 6</b> to Buy Seeds, <b>7</b> to Buy Sprinkler (Near Merchant)</p>

        <div className="inventory" style={{ marginTop: '20px', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', maxWidth: '300px' }}>
          <h3>Inventory</h3>
          {Object.entries(playerInventory).length === 0 ? <p>Empty</p> : categorizedInventory().map(cat => (
            <div key={cat.name} style={{ marginBottom: '10px' }}>
              <h4 style={{ margin: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.3)' }}>{cat.name}</h4>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {cat.items.map(([item, count]) => (
                  <li key={item} style={{ textTransform: 'capitalize' }}>{item.replace('-seed', '').replace('-kit', '')}: {count}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
