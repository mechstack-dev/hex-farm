import type { Fauna, Player, Position } from 'common';
import { getNeighbors, distance } from 'common';
import { WorldManager } from '../WorldManager.js';

// Flying/amphibious creatures aren't stopped by water.
const WATER_OK = new Set(['bird', 'butterfly', 'frog']);

const MIN_WAIT = 3000;
const MAX_WAIT = 8000;

// How close a wanderer has to be for a creature to drift toward them.
const PRESENCE_RADIUS = 6;

function blocked(fauna: Fauna, pos: Position, world: WorldManager): boolean {
  const here = world.getEntitiesAt(pos.q, pos.r);
  return here.some((e) => {
    if (e.type === 'water') return !WATER_OK.has(fauna.species);
    return e.type === 'tree' || e.type === 'rock' || e.type === 'fauna' || e.type === 'player';
  });
}

/**
 * Move a creature one hex. Movement blends three gentle pulls: aimless
 * wandering, flocking toward nearby kin, and drifting toward the nearest
 * wanderer. Nothing is forced — a creature that likes where it is may linger.
 */
export function moveFauna(fauna: Fauna, world: WorldManager, players: Player[]): Fauna {
  const options = getNeighbors(fauna.pos).filter((p) => !blocked(fauna, p, world));
  const waitTime = () => Date.now() + MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);

  if (options.length === 0) {
    return { ...fauna, nextMoveTime: waitTime() };
  }

  // A nearby wanderer becomes a soft attractor (presence-as-ecology).
  const nearest = players
    .filter((p) => distance(p.pos, fauna.pos) <= PRESENCE_RADIUS)
    .sort((a, b) => distance(a.pos, fauna.pos) - distance(b.pos, fauna.pos))[0];

  // Nearby kin pull the creature into loose flocks.
  const kin = world
    .getEntitiesAt(fauna.pos.q, fauna.pos.r)
    .concat(...getNeighbors(fauna.pos).map((n) => world.getEntitiesAt(n.q, n.r)))
    .filter((e) => e.type === 'fauna' && e.species === fauna.species && e.id !== fauna.id);

  let target: Position | null = null;
  if (nearest && Math.random() < 0.6) {
    target = nearest.pos;
  } else if (kin.length > 0 && Math.random() < 0.5) {
    const cx = kin.reduce((s, e) => s + e.pos.q, 0) / kin.length;
    const cr = kin.reduce((s, e) => s + e.pos.r, 0) / kin.length;
    target = { q: cx, r: cr };
  }

  let next: Position;
  if (target) {
    next = options.reduce((best, p) =>
      distance(p, target!) < distance(best, target!) ? p : best,
    );
  } else {
    next = options[Math.floor(Math.random() * options.length)];
  }

  return { ...fauna, pos: next, nextMoveTime: waitTime() };
}
