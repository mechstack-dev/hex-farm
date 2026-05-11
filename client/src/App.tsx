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
  const [isJoined, setIsJoined] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerPos, setPlayerPos] = useState<Position>({ q: 0, r: 0 });
  const [playerInventory, setPlayerInventory] = useState<Record<string, number>>({});
  const [playerCoins, setPlayerCoins] = useState<number>(0);
  const [playerStamina, setPlayerStamina] = useState<number>(100);
  const [playerMaxStamina, setPlayerMaxStamina] = useState<number>(100);
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [environment, setEnvironment] = useState<EnvironmentState>({ season: 'spring', weather: 'sunny', dayCount: 0, timeOfDay: 0 });
  const [notifications, setNotifications] = useState<{id: number, message: string, type: string}[]>([]);
  const loadedChunks = useRef<Set<string>>(new Set());
  const myIdRef = useRef<string | null>(null);

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

    socket.on('init', ({ playerId }: { playerId: string }) => {
      myIdRef.current = playerId;
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
      if (myIdRef.current && entity.id === myIdRef.current) {
        const p = entity as any;
        setPlayerPos(p.pos);
        setPlayerInventory(p.inventory || {});
        setPlayerCoins(p.coins || 0);
        setPlayerStamina(p.stamina || 0);
        setPlayerMaxStamina(p.maxStamina || 100);
        requestChunksAround(p.pos.q, p.pos.r);
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
      if (e.code === 'Digit1') {
        if (e.shiftKey) socket.emit('buy_seed', 'turnip');
        else socket.emit('plant', 'turnip');
      } else if (e.code === 'Digit2') {
        if (e.shiftKey) socket.emit('buy_seed', 'carrot');
        else socket.emit('plant', 'carrot');
      } else if (e.code === 'Digit3') {
        if (e.shiftKey) socket.emit('buy_seed', 'pumpkin');
        else socket.emit('plant', 'pumpkin');
      } else if (e.code === 'Digit4') {
        if (e.shiftKey) socket.emit('buy_seed', 'corn');
        else socket.emit('plant', 'corn');
      } else if (e.code === 'Digit5') {
        if (e.shiftKey) socket.emit('buy_seed', 'wheat');
        else socket.emit('plant', 'wheat');
      } else if (e.code === 'Digit6') {
        if (e.shiftKey) socket.emit('buy_seed', 'apple-tree');
        else socket.emit('plant', 'apple-tree');
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
      } else if (e.key.toLowerCase() === 'b') {
        socket.emit('build_scarecrow');
      } else if (e.key.toLowerCase() === 'x') {
        if (e.shiftKey) socket.emit('sell_junk');
        else socket.emit('clear_obstacle');
      } else if (e.code === 'Digit7') {
        if (e.shiftKey) socket.emit('buy_tool', 'fishing-rod');
      } else if (e.code === 'Digit8') {
        if (e.shiftKey) socket.emit('buy_tool', 'copper-hoe');
        else socket.emit('buy_tool', 'hoe');
      } else if (e.code === 'Digit9') {
        if (e.shiftKey) socket.emit('buy_tool', 'copper-watering-can');
        else socket.emit('buy_tool', 'watering-can');
      } else if (e.code === 'Digit0') {
        if (e.shiftKey) socket.emit('buy_tool', 'copper-axe');
        else socket.emit('buy_tool', 'axe');
      } else if (e.code === 'Minus') {
        if (e.shiftKey) socket.emit('buy_tool', 'copper-pickaxe');
        else socket.emit('buy_tool', 'pickaxe');
      } else if (e.key.toLowerCase() === 'j') {
        socket.emit('fish');
      } else if (e.key.toLowerCase() === 'l') {
        socket.emit('build_building', 'shed');
      } else if (e.key.toLowerCase() === 'v') {
        socket.emit('build_building', 'chest');
      } else if (e.key.toLowerCase() === 'u') {
        socket.emit('build_building', 'well');
      } else if (e.key.toLowerCase() === 'g') {
        socket.emit('fertilize');
      } else if (e.key.toLowerCase() === 'c') {
        socket.emit('consume', 'apple');
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

  const getMerchantDirection = () => {
    if (playerPos.q === 0 && playerPos.r === 0) return null;

    // Distance in hexes
    const dist = Math.sqrt(playerPos.q * playerPos.q + playerPos.r * playerPos.r + playerPos.q * playerPos.r);
    if (dist < 5) return null;

    // Convert axial to approx pixel to get angle towards (0,0)
    // x = size * 3/2 * q
    // y = size * sqrt(3) * (r + q/2)
    // Vector towards merchant (0,0) is (-x, -y)
    const px = 1.5 * playerPos.q;
    const py = Math.sqrt(3) * (playerPos.r + playerPos.q / 2);

    const angle = Math.atan2(-py, -px); // Angle from player to (0,0)
    const deg = angle * 180 / Math.PI;

    // Normalize to 0-360
    const normalized = (deg + 360) % 360;

    let arrow = '→';
    if (normalized >= 337.5 || normalized < 22.5) arrow = '→';
    else if (normalized >= 22.5 && normalized < 67.5) arrow = '↘';
    else if (normalized >= 67.5 && normalized < 112.5) arrow = '↓';
    else if (normalized >= 112.5 && normalized < 157.5) arrow = '↙';
    else if (normalized >= 157.5 && normalized < 202.5) arrow = '←';
    else if (normalized >= 202.5 && normalized < 247.5) arrow = '↖';
    else if (normalized >= 247.5 && normalized < 292.5) arrow = '↑';
    else if (normalized >= 292.5 && normalized < 337.5) arrow = '↗';

    return { arrow, dist: Math.round(dist) };
  };

  const categorizedInventory = () => {
    const categories: Record<string, {name: string, items: [string, number][]}> = {
        seeds: { name: 'Seeds', items: [] },
        crops: { name: 'Crops', items: [] },
        resources: { name: 'Resources', items: [] },
        products: { name: 'Animal Products', items: [] },
        tools: { name: 'Tools/Kits', items: [] }
    };

    Object.entries(playerInventory).forEach(([item, count]) => {
        if (item.endsWith('-seed')) categories.seeds.items.push([item, count]);
        else if (['turnip', 'carrot', 'pumpkin', 'corn', 'wheat', 'apple'].includes(item)) categories.crops.items.push([item, count]);
        else if (['wood', 'stone'].includes(item)) categories.resources.items.push([item, count]);
        else if (['milk', 'wool', 'egg', 'truffle'].includes(item)) categories.products.items.push([item, count]);
        else categories.tools.items.push([item, count]);
    });

    return Object.values(categories).filter(c => c.items.length > 0);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      joinGame(playerName.trim());
      setIsJoined(true);
    }
  };

  return (
    <div className="App">
      {!isJoined && (
        <div className="login-overlay" style={{
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.8)', color: 'white', display: 'flex',
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <h1>Harvest Hex MMO</h1>
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              style={{ padding: '10px', borderRadius: '5px', border: 'none' }}
              autoFocus
            />
            <button type="submit" style={{ padding: '10px', borderRadius: '5px', border: 'none', background: '#28a745', color: 'white', cursor: 'pointer' }}>
              Join Game
            </button>
          </form>
        </div>
      )}
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
        <div className="stamina-container" style={{ width: '200px', height: '20px', background: 'rgba(0,0,0,0.5)', borderRadius: '10px', overflow: 'hidden', border: '1px solid white', margin: '10px 0', position: 'relative' }}>
            <div className="stamina-bar" style={{ width: `${(playerStamina / playerMaxStamina) * 100}%`, height: '100%', background: playerStamina < 20 ? '#ff4444' : '#44ff44', transition: 'width 0.3s' }} />
            <span style={{ position: 'absolute', width: '200px', textAlign: 'center', fontSize: '12px', lineHeight: '20px', color: 'white', fontWeight: 'bold' }}>Stamina: {Math.floor(playerStamina)}/{playerMaxStamina}</span>
        </div>
        {getMerchantDirection() && (
          <p style={{ color: '#FF00FF', fontWeight: 'bold' }}>
            Merchant: {getMerchantDirection()?.dist} hexes away {getMerchantDirection()?.arrow}
          </p>
        )}
        <p>Use WASD or Arrow Keys to move</p>
        <p>Press <b>1-6</b> to Plant, <b>Shift + 1-6</b> to Buy Seeds (Turnip, Carrot, Pumpkin, Corn, Wheat, Apple Tree)</p>
        <p>Press <b>P</b> to Plow, <b>R</b> to Path (1S), <b>I</b> to Water, <b>G</b> to Fertilize (1 Junk), <b>F</b> to Fence (2W)</p>
        <p>Press <b>K</b> to Sprinkler (5S), <b>B</b> to Scarecrow (2W), <b>L</b> to Shed (10W, 5S), <b>V</b> to Chest (5W, 2S), <b>U</b> to Well (5W, 10S)</p>
        <p>Press <b>H</b> to Harvest, <b>E</b> to Interact, <b>J</b> to Fish, <b>X</b> to Clear, <b>C</b> to Eat Apple</p>
        <p>Plowing, Watering, Clearing, and Fishing require tools. Wells provide infinite water nearby.</p>
        <p>Press <b>Shift+X</b> to Sell Resources (Wood, Stone, Junk) near Merchant</p>
        <p>Press <b>8, 9, 0, -</b> to Buy Tools (Near Merchant)</p>
        <p>Press <b>Shift + 7, 8, 9, 0, -</b> to Buy Fishing Rod or Copper Tools (Near Merchant)</p>

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
