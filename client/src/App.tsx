import { useState, useEffect, useRef } from 'react'
import { HexRenderer } from './renderers/HexRenderer'
import { CookingMenu } from './components/CookingMenu'
import { Hotbar } from './components/Hotbar'
import { Journal } from './components/Journal'
import type { Entity, Position, EnvironmentState } from 'common'
import { getChunkCoords, BEST_FOODS, ITEM_PRICES } from 'common'
import { socket, movePlayer } from './network'
import { useInput } from './hooks/useInput'
import { AudioManager } from './AudioManager'
import './App.css'

function App() {
  const pixiContainer = useRef<HTMLDivElement>(null);
  const renderer = useRef<HexRenderer | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#0000ff');
  const [playerPos, setPlayerPos] = useState<Position>({ q: 0, r: 0 });
  const [playerInventory, setPlayerInventory] = useState<Record<string, number>>({});
  const [playerCoins, setPlayerCoins] = useState<number>(0);
  const [playerStamina, setPlayerStamina] = useState<number>(100);
  const [playerMaxStamina, setPlayerMaxStamina] = useState<number>(100);
  const [playerSkills, setPlayerSkills] = useState<Record<string, {level: number, xp: number}>>({});
  const [playerBuffs, setPlayerBuffs] = useState<{type: string, amount: number, expiresAt: number}[]>([]);
  const [playerPerks, setPlayerPerks] = useState<string[]>([]);
  const [playerAchievements, setPlayerAchievements] = useState<string[]>([]);
  const [playerRelationships, setPlayerRelationships] = useState<Record<string, number>>({});
  const [playerActiveQuest, setPlayerActiveQuest] = useState<any>(null);
  const [showCookingMenu, setShowCookingMenu] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [environment, setEnvironment] = useState<EnvironmentState>({ season: 'spring', weather: 'sunny', dayCount: 0, timeOfDay: 0 });
  const [notifications, setNotifications] = useState<{id: number, message: string, type: string}[]>([]);
  const [chatMessages, setChatMessages] = useState<{id: number, sender: string, message: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatFocused, setIsChatFocused] = useState(false);
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
        setPlayerSkills(p.skills || {});
        setPlayerBuffs(p.buffs || []);
        setPlayerPerks(p.perks || []);
        setPlayerAchievements(p.achievements || []);
        setPlayerRelationships(p.relationships || {});
        setPlayerActiveQuest(p.activeQuest || null);
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
      AudioManager.getInstance().play(type === 'error' ? 'error' : 'notification');
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    });

    socket.on('show_cooking_menu', () => {
      setShowCookingMenu(true);
    });

    socket.on('chat', (msg: {sender: string, message: string, timestamp: number}) => {
      setChatMessages(prev => [...prev, { id: msg.timestamp, sender: msg.sender, message: msg.message }].slice(-50));
      AudioManager.getInstance().play('chat');
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
    if (isChatFocused) return;
    const nextPos = { q: playerPos.q + dq, r: playerPos.r + dr };
    movePlayer(nextPos.q, nextPos.r);
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isChatFocused) {
          if (e.code === 'Escape') {
              setIsChatFocused(false);
              (document.activeElement as HTMLElement)?.blur();
          }
          return;
      }

      if (e.code === 'Enter') {
          setIsChatFocused(true);
          return;
      }

      const { shiftKey, altKey, ctrlKey } = e;

      switch (e.code) {
        case 'Digit1':
          if (altKey) socket.emit('cook', 'salad');
          else if (shiftKey) socket.emit('buy_seed', 'turnip');
          else if (ctrlKey) socket.emit('buy_tool', 'hoe');
          else socket.emit('plant', 'turnip');
          break;
        case 'Digit2':
          if (altKey) socket.emit('cook', 'apple-pie');
          else if (shiftKey) socket.emit('buy_seed', 'carrot');
          else if (ctrlKey) socket.emit('buy_tool', 'watering-can');
          else socket.emit('plant', 'carrot');
          break;
        case 'Digit3':
          if (altKey) socket.emit('cook', 'pumpkin-soup');
          else if (shiftKey) socket.emit('buy_seed', 'pumpkin');
          else if (ctrlKey) socket.emit('buy_tool', 'axe');
          else socket.emit('plant', 'pumpkin');
          break;
        case 'Digit4':
          if (altKey) socket.emit('cook', 'corn-chowder');
          else if (shiftKey) socket.emit('buy_seed', 'corn');
          else if (ctrlKey) socket.emit('buy_tool', 'pickaxe');
          else socket.emit('plant', 'corn');
          break;
        case 'Digit5':
          if (altKey) socket.emit('cook', 'grilled-fish');
          else if (shiftKey) socket.emit('buy_seed', 'wheat');
          else if (ctrlKey) socket.emit('buy_tool', 'scythe');
          else socket.emit('plant', 'wheat');
          break;
        case 'Digit6':
          if (altKey) socket.emit('cook', 'mushroom-soup');
          else if (shiftKey) socket.emit('buy_seed', 'winter-radish');
          else if (ctrlKey) socket.emit('buy_tool', 'fishing-rod');
          else socket.emit('plant', 'winter-radish');
          break;
        case 'Digit7':
          if (altKey) socket.emit('cook', 'berry-tart');
          else if (shiftKey) socket.emit('buy_seed', 'kale');
          else socket.emit('plant', 'kale');
          break;
        case 'Digit8':
          if (altKey) socket.emit('cook', 'miners-stew');
          else if (shiftKey) socket.emit('buy_seed', 'sunflower');
          else socket.emit('plant', 'sunflower');
          break;
        case 'Digit9':
          if (altKey) socket.emit('cook', 'veggie-platter');
          else if (shiftKey) socket.emit('buy_seed', 'apple-tree');
          else socket.emit('plant', 'apple-tree');
          break;
        case 'Digit0':
          if (altKey) socket.emit('cook', 'coal-grilled-fish');
          else if (shiftKey) socket.emit('buy_seed', 'orange-tree');
          else socket.emit('plant', 'orange-tree');
          break;
        case 'Minus':
          if (altKey) socket.emit('cook', 'fruit-salad');
          else if (shiftKey) socket.emit('buy_seed', 'peach-tree');
          else socket.emit('plant', 'peach-tree');
          break;
        case 'Equal':
          if (altKey) socket.emit('cook', 'mushroom-risotto');
          else if (shiftKey) socket.emit('buy_seed', 'cherry-tree');
          else socket.emit('plant', 'cherry-tree');
          break;
        case 'BracketLeft':
          if (altKey) socket.emit('cook', 'corn-bread');
          break;
        case 'BracketRight':
          if (altKey) socket.emit('cook', 'fish-stew');
          break;
        case 'KeyS':
          if (altKey) socket.emit('cook', 'fruity-sorbet');
          break;
        case 'KeyD':
          if (altKey) socket.emit('cook', 'hearty-stew');
          break;
        case 'KeyZ':
          if (altKey) socket.emit('cook', 'peach-cobbler');
          else socket.emit('use_dynamite');
          break;
        case 'KeyX':
          if (altKey) socket.emit('cook', 'cherry-pie');
          else if (shiftKey) socket.emit('sell_junk');
          else socket.emit('clear_obstacle');
          break;
        case 'KeyC':
          if (altKey) socket.emit('cook', 'fruit-medley');
          else {
            const toEat = BEST_FOODS.find(f => playerInventory[f] > 0);
            if (toEat) socket.emit('consume', toEat);
            else socket.emit('consume', 'apple');
          }
          break;
        case 'KeyF':
          if (altKey) socket.emit('cook', 'seafood-platter');
          else {
            socket.emit('build_fence');
            AudioManager.getInstance().play('build');
          }
          break;
        case 'KeyG':
          if (altKey) socket.emit('cook', 'honey-glazed-carrots');
          else {
            socket.emit('fertilize');
            AudioManager.getInstance().play('fertilize');
          }
          break;
        case 'KeyH':
          if (altKey) socket.emit('cook', 'goat-cheese-salad');
          else {
            socket.emit('harvest');
            AudioManager.getInstance().play('harvest');
          }
          break;
        case 'KeyJ':
          if (altKey) socket.emit('cook', 'duck-egg-mayo');
          else if (shiftKey) {
            socket.emit('fish');
            AudioManager.getInstance().play('fish');
          } else {
            setShowJournal(prev => !prev);
          }
          break;
        case 'KeyK':
          if (altKey) {
            if (shiftKey) socket.emit('cook', 'berry-smoothie');
            else socket.emit('build_sprinkler', 'gold');
          } else if (shiftKey) socket.emit('build_sprinkler', 'iron');
          else socket.emit('build_sprinkler', 'basic');
          break;
        case 'KeyL':
          if (altKey) socket.emit('cook', 'pumpkin-pie');
          else socket.emit('build_building', 'shed');
          break;
        case 'KeyP':
          if (altKey) socket.emit('cook', 'apple-cider');
          else {
            socket.emit('plow');
            AudioManager.getInstance().play('plow');
          }
          break;
        case 'KeyU':
          if (altKey) socket.emit('cook', 'orange-juice');
          else socket.emit('build_building', 'well');
          break;
        case 'KeyI':
          socket.emit('water');
          break;
        case 'KeyE':
          if (altKey) socket.emit('build_building', 'lamp');
          else socket.emit('interact');
          break;
        case 'KeyV':
          if (altKey) socket.emit('build_building', 'preserves-jar');
          else socket.emit('build_building', 'chest');
          break;
        case 'KeyR':
          if (altKey) socket.emit('build_building', 'fountain');
          else socket.emit('build_path');
          break;
        case 'KeyB':
          if (altKey) socket.emit('build_building', 'greenhouse');
          else if (shiftKey) socket.emit('build_building', 'birdhouse');
          else socket.emit('build_scarecrow');
          break;
        case 'KeyN':
          if (altKey) socket.emit('build_building', 'weather-station');
          else socket.emit('build_building', 'beehive');
          break;
        case 'KeyO':
          socket.emit('build_building', 'cooking-pot');
          break;
        case 'KeyM':
          if (altKey) socket.emit('build_building', 'large-barn');
          else socket.emit('build_building', 'barn');
          break;
        case 'KeyQ':
          if (altKey) socket.emit('build_building', 'recycling-machine');
          else if (shiftKey) socket.emit('build_building', 'compost-bin');
          else socket.emit('build_building', 'shipping-bin');
          break;
        case 'KeyT':
          if (altKey) socket.emit('build_building', 'stall');
          else socket.emit('build_building', 'seed-maker');
          break;
        case 'KeyY':
          socket.emit('teleport_home');
          break;
      }

    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChatFocused, playerInventory]);

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
        else if (['turnip', 'carrot', 'pumpkin', 'corn', 'wheat', 'sunflower', 'kale', 'apple', 'orange', 'peach', 'cherry', 'berry', 'mushroom', 'fish', 'golden-hexfish', 'salad', 'mushroom-soup', 'berry-tart', 'apple-pie', 'pumpkin-soup', 'corn-chowder', 'grilled-fish', 'miners-stew', 'veggie-platter', 'coal-grilled-fish', 'fruit-salad', 'mushroom-risotto', 'corn-bread', 'fish-stew', 'fruity-sorbet', 'hearty-stew', 'seafood-platter', 'honey-glazed-carrots', 'goat-cheese-salad', 'duck-egg-mayo', 'berry-smoothie', 'pumpkin-pie', 'apple-cider', 'orange-juice', 'peach-cobbler', 'cherry-pie', 'fruit-medley', 'apple-jam', 'orange-jam', 'berry-jam', 'peach-jam', 'cherry-jam'].includes(item)) categories.crops.items.push([item, count]);
        else if (['wood', 'stone', 'junk', 'iron-ore', 'gold-ore', 'coal', 'compost-fertilizer', 'ancient-coin', 'geode', 'diamond'].includes(item)) categories.resources.items.push([item, count]);
        else if (['milk', 'wool', 'egg', 'truffle', 'honey', 'wildflower-honey', 'sunflower-honey', 'goat-milk', 'duck-egg'].includes(item)) categories.products.items.push([item, count]);
        else categories.tools.items.push([item, count]);
    });

    return Object.values(categories).filter(c => c.items.length > 0);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      const colorNum = parseInt(playerColor.replace('#', ''), 16);
      socket.emit('join', playerName.trim(), colorNum);
      setIsJoined(true);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socket.emit('chat', chatInput.trim());
      setChatInput('');
    }
    setIsChatFocused(false);
    (document.activeElement as HTMLElement)?.blur();
  };

  return (
    <div className="App">
      {showCookingMenu && <CookingMenu inventory={playerInventory} onClose={() => setShowCookingMenu(false)} />}
      {showJournal && (
        <Journal
          skills={playerSkills}
          relationships={playerRelationships}
          achievements={playerAchievements}
          onClose={() => setShowJournal(false)}
        />
      )}
      <Hotbar inventory={playerInventory} />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label>Choose Color:</label>
              <input
                type="color"
                value={playerColor}
                onChange={(e) => setPlayerColor(e.target.value)}
                style={{ padding: '0', borderRadius: '5px', border: 'none', width: '40px', height: '40px', cursor: 'pointer' }}
              />
            </div>
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

      <div className="ui-overlay" style={{ position: 'absolute', top: 10, left: 10, pointerEvents: 'none', color: 'white', textShadow: '1px 1px 2px black', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 20px)' }}>
        <h1>Harvest Hex MMO</h1>
        <div className="environment-info" style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', marginBottom: '10px' }}>
          <p>Season: <span style={{ textTransform: 'capitalize' }}>{environment.season}</span></p>
          <p>Weather: <span style={{ textTransform: 'capitalize' }}>{environment.weather}</span></p>
          <p>Day: {environment.dayCount + 1}</p>
          <p>Time: {Math.floor(environment.timeOfDay * 24).toString().padStart(2, '0')}:{Math.floor((environment.timeOfDay * 24 * 60) % 60).toString().padStart(2, '0')}</p>
        </div>
        {playerActiveQuest && (
          <div className="quest-info" style={{ background: 'rgba(0,128,0,0.6)', padding: '10px', borderRadius: '5px', marginBottom: '10px', border: '1px solid #00ff00', width: '200px' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '14px' }}>Active Quest</h3>
            <p style={{ margin: 0, fontSize: '12px' }}>{playerActiveQuest.count} <span style={{ textTransform: 'capitalize' }}>{playerActiveQuest.species}</span></p>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold' }}>Progress: {playerActiveQuest.collected}/{playerActiveQuest.count}</p>
          </div>
        )}
        <p>Position: {playerPos.q}, {playerPos.r} | <b>Coins: {playerCoins}</b></p>
        <div className="stamina-container" style={{ width: '200px', height: '20px', background: 'rgba(0,0,0,0.5)', borderRadius: '10px', overflow: 'hidden', border: '1px solid white', margin: '10px 0', position: 'relative' }}>
            <div className={`stamina-bar ${playerStamina < playerMaxStamina * 0.2 ? 'stamina-low' : ''}`} style={{ width: `${(playerStamina / playerMaxStamina) * 100}%`, height: '100%', background: playerStamina < playerMaxStamina * 0.2 ? '#ff4444' : '#44ff44', transition: 'width 0.3s' }} />
            <span style={{ position: 'absolute', width: '200px', textAlign: 'center', fontSize: '12px', lineHeight: '20px', color: 'white', fontWeight: 'bold' }}>Stamina: {Math.floor(playerStamina)}/{playerMaxStamina}</span>
        </div>
        {playerBuffs.length > 0 && (
          <div className="buffs" style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
            {playerBuffs.map(b => {
              const secondsLeft = Math.max(0, Math.floor((b.expiresAt - Date.now()) / 1000));
              const minutes = Math.floor(secondsLeft / 60);
              const seconds = secondsLeft % 60;
              return (
                <div key={b.type} style={{ background: 'rgba(0, 255, 255, 0.4)', padding: '2px 5px', borderRadius: '3px', fontSize: '10px', border: '1px solid cyan' }}>
                  {b.type.replace('_', ' ')} ({minutes}:{seconds.toString().padStart(2, '0')})
                </div>
              );
            })}
          </div>
        )}
        {playerPerks.length > 0 && (
          <div className="perks" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
            {playerPerks.map(perk => {
              const perkNames: Record<string, string> = {
                  'perk-merchant': "Merchant's Guild",
                  'perk-blacksmith': "Smith's Apprentice",
                  'perk-fisherman': "Expert Angler",
                  'perk-miner': "Deep Delver"
              };
              return (
                <div key={perk} style={{ background: 'rgba(255, 215, 0, 0.4)', padding: '2px 5px', borderRadius: '3px', fontSize: '10px', border: '1px solid gold', color: 'gold' }}>
                    {perkNames[perk] || perk}
                </div>
              );
            })}
          </div>
        )}
        <div className="skills" style={{ background: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '5px', marginBottom: '10px', fontSize: '12px' }}>
          {Object.entries(playerSkills).map(([skill, data]) => (
            <div key={skill} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ textTransform: 'capitalize' }}>{skill}:</span>
              <span>Lv. {data.level} ({Math.floor(data.xp)} XP)</span>
            </div>
          ))}
        </div>
        {playerAchievements.length > 0 && (
          <div className="achievements" style={{ background: 'rgba(255,215,0,0.2)', padding: '5px', borderRadius: '5px', marginBottom: '10px', fontSize: '11px', border: '1px solid gold' }}>
            <h4 style={{ margin: '0 0 5px 0' }}>Achievements</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {playerAchievements.map(ach => (
                <div key={ach} style={{ background: 'gold', color: 'black', padding: '1px 4px', borderRadius: '2px', fontWeight: 'bold' }}>
                  {ach.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </div>
              ))}
            </div>
          </div>
        )}
        {Object.keys(playerRelationships).length > 0 && (
          <div className="relationships" style={{ background: 'rgba(255,105,180,0.2)', padding: '5px', borderRadius: '5px', marginBottom: '10px', fontSize: '11px', border: '1px solid hotpink' }}>
            <h4 style={{ margin: '0 0 5px 0' }}>Relationships</h4>
            {Object.entries(playerRelationships).map(([npc, points]) => {
              const hearts = Math.floor(points / 100);
              return (
                <div key={npc} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ textTransform: 'capitalize' }}>{npc}:</span>
                  <span>{'❤️'.repeat(hearts)}{'🖤'.repeat(10-hearts)}</span>
                </div>
              );
            })}
          </div>
        )}
        {getMerchantDirection() && (
          <p style={{ color: '#FF00FF', fontWeight: 'bold' }}>
            Merchant: {getMerchantDirection()?.dist} hexes away {getMerchantDirection()?.arrow}
          </p>
        )}

        <div className="controls-toggle" style={{ pointerEvents: 'auto', marginBottom: '10px' }}>
          <button onClick={() => setShowControls(!showControls)} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: '1px solid white', borderRadius: '3px', cursor: 'pointer', padding: '2px 8px', fontSize: '12px' }}>
            {showControls ? 'Hide Controls' : 'Show Controls'}
          </button>
        </div>

        {showControls && (
          <div className="controls-list" style={{ fontSize: '13px' }}>
            <p style={{ margin: '2px 0' }}>Use WASD or Arrow Keys to move</p>
            <p style={{ margin: '2px 0' }}>Press <b>1-9, 0, -, =</b> to Plant: 1:Turnip, 2:Carrot, 3:Pumpkin, 4:Corn, 5:Wheat, 6:Radish, 7:Kale, 8:Sunflower, 9:Apple, 0:Orange, -:Peach, =:Cherry</p>
            <p style={{ margin: '2px 0' }}><b>Shift + (1-9, 0, -, =)</b> to Buy Seeds. <b>Ctrl + (1-6)</b> to Buy Tools (Hoe, Can, Axe, Pickaxe, Scythe, Rod)</p>
            <p style={{ margin: '2px 0' }}>Press <b>P</b>: Plow, <b>R</b>: Path (Alt+R: Fountain), <b>I</b>: Water, <b>G</b>: Fertilize, <b>F</b>: Fence, <b>Alt+E</b>: Lamp</p>
            <p style={{ margin: '2px 0' }}>Press <b>K</b>: Sprinkler (Shift:Iron, Alt:Gold), <b>B</b>: Scarecrow (Alt:Greenhouse), <b>L</b>: Shed, <b>V</b>: Chest (Alt:Jar), <b>U</b>: Well, <b>N</b>: Beehive (Alt:Station), <b>O</b>: Pot, <b>M</b>: Barn (Alt:Large), <b>Q</b>: Shipping (Shift:Compost, Alt:Recycle), <b>T</b>: Seed Maker (Alt:Stall)</p>
            <p style={{ margin: '2px 0' }}>Press <b>E</b>: Interact / Harvest, <b>H</b>: Harvest Area, <b>Shift+J</b>: Fish, <b>X</b>: Clear, <b>C</b>: Eat Food, <b>Y</b>: Home, <b>Z</b>: Dynamite</p>
            <p style={{ margin: '2px 0' }}>Type <b>/gift [npc] [item]</b> to give a gift | Find Ancient Shrines for blessings!</p>
            <p style={{ margin: '2px 0' }}>Cooking (Alt + 1-0, -, =, [, ], S, D, F, G, H, J, K, L, P, U): 29 recipes available. See Cooking Menu for details.</p>
            <p style={{ margin: '2px 0' }}>Press <b>Shift+X</b> to Sell Resources near Merchant | <b>/color [hex]</b> to change your color.</p>
          </div>
        )}


        <div className="inventory" style={{ marginTop: '20px', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', maxWidth: '300px' }}>
          <h3>Inventory</h3>
          {Object.entries(playerInventory).length === 0 ? <p>Empty</p> : categorizedInventory().map(cat => (
            <div key={cat.name} style={{ marginBottom: '10px' }}>
              <h4 style={{ margin: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.3)' }}>{cat.name}</h4>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {cat.items.map(([item, count]) => {
                  const price = ITEM_PRICES[item];
                  return (
                    <li key={item} style={{ textTransform: 'capitalize' }}>
                      {item.replace('-seed', '').replace('-kit', '')}: {count}
                      {price !== undefined && <span style={{ fontSize: '10px', color: '#ffd700', marginLeft: '5px' }}>({price}c)</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="chat-container" style={{ marginTop: 'auto', pointerEvents: 'auto', width: '300px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <p style={{ fontSize: '10px', margin: 0, color: '#aaa' }}>Type <b>/give [name] [item] [amount]</b> to trade</p>
            <div className="chat-log" style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', height: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
                {chatMessages.slice().reverse().map(m => {
                    const isNPCRequest = m.message.includes('[REQUEST]');
                    return (
                        <div key={m.id} style={{
                            fontSize: '14px',
                            marginBottom: '2px',
                            background: isNPCRequest ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                            borderLeft: isNPCRequest ? '3px solid gold' : 'none',
                            paddingLeft: isNPCRequest ? '5px' : '0'
                        }}>
                            <b style={{ color: isNPCRequest ? 'gold' : '#00ff00' }}>{m.sender}:</b> {m.message}
                        </div>
                    );
                })}
            </div>
            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '5px' }}>
                <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onFocus={() => setIsChatFocused(true)}
                    onBlur={() => setTimeout(() => setIsChatFocused(false), 100)}
                    placeholder="Press Enter to chat..."
                    style={{ flex: 1, padding: '5px', borderRadius: '3px', border: '1px solid white', background: 'rgba(0,0,0,0.7)', color: 'white' }}
                />
            </form>
        </div>
      </div>
    </div>
  )
}

export default App
