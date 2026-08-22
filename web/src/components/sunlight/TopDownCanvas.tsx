"use client";

import { useEffect, useRef } from "react";
import { Neighbour } from "@/lib/api";
import { sunPosition } from "@/lib/sun";

/** Top-down footprints and shadows, centred on the window. */

const W = 720;
const H = 560;
const SCALE = 2.4; // px per metre; shows ~300 m across
const CX = W / 2;
const CY = H / 2;
const MAX_SHADOW_M = 320;

const px = (x: number) => CX + x * SCALE;
const py = (y: number) => CY - y * SCALE;

function containsPoint(ring: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function tracePolygon(ctx: CanvasRenderingContext2D, ring: [number, number][]) {
  ctx.moveTo(px(ring[0][0]), py(ring[0][1]));
  for (let i = 1; i < ring.length; i++) ctx.lineTo(px(ring[i][0]), py(ring[i][1]));
  ctx.closePath();
}

export function TopDownCanvas({
  neighbours,
  ground,
  lat,
  lon,
  facing,
  timeMin,
}: {
  neighbours: Neighbour[] | null;
  ground: number;
  lat: number;
  lon: number;
  facing: number;
  timeMin: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#e7e8f5";
    ctx.fillRect(0, 0, W, H);

    if (!neighbours) {
      ctx.fillStyle = "#5c5ca6";
      ctx.font = "12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("loading buildings…", CX, CY);
      ctx.textAlign = "left";
      return;
    }

    const { altitude, azimuth } = sunPosition(lat, lon, timeMin);

    if (altitude > 0.5) {
      // Draw shadows first so overlaps blend.
      const theta = ((azimuth + 180) * Math.PI) / 180;
      const ex = Math.sin(theta);
      const ny = Math.cos(theta);
      const perM = 1 / Math.tan((altitude * Math.PI) / 180);

      ctx.fillStyle = "#c9cbdf";
      for (const b of neighbours) {
        const effH = b.height + (b.ground - ground);
        if (effH <= 0) continue;
        const len = Math.min(effH * perM, MAX_SHADOW_M);
        const ox = ex * len * SCALE;
        const oy = -ny * len * SCALE;
        const ring = b.ring;

        // Separate fills avoid winding-rule cancellation.
        ctx.beginPath();
        ctx.moveTo(px(ring[0][0]) + ox, py(ring[0][1]) + oy);
        for (let i = 1; i < ring.length; i++) ctx.lineTo(px(ring[i][0]) + ox, py(ring[i][1]) + oy);
        ctx.closePath();
        ctx.fill();
        for (let i = 0; i < ring.length; i++) {
          const [ax, ay] = ring[i];
          const [bx, by] = ring[(i + 1) % ring.length];
          ctx.beginPath();
          ctx.moveTo(px(ax), py(ay));
          ctx.lineTo(px(bx), py(by));
          ctx.lineTo(px(bx) + ox, py(by) + oy);
          ctx.lineTo(px(ax) + ox, py(ay) + oy);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Sample inside the window wall to find the home footprint.
    const fr = (facing * Math.PI) / 180;
    const ix = -Math.sin(fr) * 1.5;
    const iy = -Math.cos(fr) * 1.5;

    let home: Neighbour | null = null;
    ctx.fillStyle = "#a3a6c9";
    ctx.beginPath();
    for (const b of neighbours) {
      if (!home && containsPoint(b.ring, ix, iy)) {
        home = b;
        continue;
      }
      tracePolygon(ctx, b.ring);
    }
    ctx.fill();

    if (home) {
      ctx.fillStyle = "#5c5ca6";
      ctx.strokeStyle = "#ef9f27";
      ctx.lineWidth = 3;
      ctx.beginPath();
      tracePolygon(ctx, home.ring);
      ctx.fill();
      ctx.stroke();
    }

    // window marker + facing tick
    ctx.strokeStyle = "#ef9f27";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + Math.sin(fr) * 14, CY - Math.cos(fr) * 14);
    ctx.stroke();
    ctx.fillStyle = "#ef9f27";
    ctx.fillRect(CX - 4, CY - 4, 8, 8);

    // sun marker on the rim
    if (altitude > 0.5) {
      const sr = (azimuth * Math.PI) / 180;
      const sx = Math.min(Math.max(CX + Math.sin(sr) * 250, 14), W - 26);
      const sy = Math.min(Math.max(CY - Math.cos(sr) * 250, 14), H - 26);
      ctx.fillRect(sx, sy, 14, 14);
    }

    ctx.fillStyle = "#33336b";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText("N ↑", W - 40, 24);
  }, [neighbours, ground, lat, lon, facing, timeMin]);

  return <canvas ref={ref} width={W} height={H} className="block h-auto w-full" />;
}
