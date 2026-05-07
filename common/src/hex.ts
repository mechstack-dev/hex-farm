import type { Position } from "./types.js";

export function getNeighbors(pos: Position): Position[] {
  const directions = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
  ];
  return directions.map(d => ({ q: pos.q + d.q, r: pos.r + d.r }));
}

export function distance(a: Position, b: Position): number {
  return (Math.abs(a.q - b.q)
          + Math.abs(a.q + a.r - b.q - b.r)
          + Math.abs(a.r - b.r)) / 2;
}

export function axialToPixel(q: number, r: number, size: number): { x: number, y: number } {
  const x = size * (3/2 * q);
  const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
  return { x, y };
}
