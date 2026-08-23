import type { Neighbour } from "@/lib/api";

function containsPoint(ring: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function findHome(neighbours: Neighbour[], facing: number): Neighbour | null {
  const radians = (facing * Math.PI) / 180;
  const x = -Math.sin(radians) * 1.5;
  const y = -Math.cos(radians) * 1.5;
  return neighbours.find((building) => containsPoint(building.ring, x, y)) ?? null;
}
