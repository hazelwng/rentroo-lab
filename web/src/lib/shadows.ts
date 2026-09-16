import { Neighbour } from "@/lib/api";
import { sunPosition } from "@/lib/sun";

/** Window-relative ground shadows. */

const MAX_SHADOW_M = 320;

type Ring = [number, number][];

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function openRing(ring: Ring): Ring {
  if (ring.length < 2) {
    return ring;
  }

  const firstPoint = ring[0];
  const lastPoint = ring[ring.length - 1];
  const isAlreadyClosed =
    firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1];

  if (isAlreadyClosed) {
    return ring.slice(0, ring.length - 1);
  }

  return ring;
}

function sweptShadowIntersects(
  ring: Ring,
  ox: number,
  oy: number,
  viewport: Bounds,
): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  // The shadow includes the footprint translated by (ox, oy) and the swept
  // side faces between them. Cull only when that whole area misses the view.
  minX = Math.min(minX, minX + ox);
  minY = Math.min(minY, minY + oy);
  maxX = Math.max(maxX, maxX + ox);
  maxY = Math.max(maxY, maxY + oy);

  return !(
    maxX < viewport.minX ||
    minX > viewport.maxX ||
    maxY < viewport.minY ||
    minY > viewport.maxY
  );
}

/** Sweep each footprint away from the sun. */
export function shadowPolygons(
  neighbours: Neighbour[],
  ground: number,
  lat: number,
  lon: number,
  timeMin: number,
  viewport?: Bounds,
): Ring[][] {
  const { altitude, azimuth } = sunPosition(lat, lon, timeMin);
  if (altitude <= 0.5) return [];

  const theta = ((azimuth + 180) * Math.PI) / 180; // away from the sun
  const ex = Math.sin(theta);
  const ny = Math.cos(theta);
  const perM = 1 / Math.tan((altitude * Math.PI) / 180);

  const out: Ring[][] = [];
  for (const b of neighbours) {
    const effH = b.height + (b.ground - ground);
    if (effH <= 0) continue;
    const len = Math.min(effH * perM, MAX_SHADOW_M);
    const ox = ex * len;
    const oy = ny * len;
    const ring = openRing(b.ring);
    if (!ring.length || (viewport && !sweptShadowIntersects(ring, ox, oy, viewport))) {
      continue;
    }
    const parts: Ring[] = [ring.map(([x, y]) => [x + ox, y + oy])];
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      parts.push([
        [ax, ay],
        [bx, by],
        [bx + ox, by + oy],
        [ax + ox, ay + oy],
      ]);
    }
    out.push(parts);
  }
  return out;
}
