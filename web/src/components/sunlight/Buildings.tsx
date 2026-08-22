"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Neighbour } from "@/lib/api";

/** Extruded footprints; the building containing the window is drawn apart. */

const COLOR_BUILDING = "#c3c3e8";
const COLOR_HOME = "#5c5ca6";
const COLOR_EDGE = "#ef9f27";

function containsPoint(ring: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Footprints are (east, north); extrude along +z then tip upright so north → -z.
function extrude(b: Neighbour, ground: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(b.ring.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, b.ground - ground, 0);
  return geo;
}

export function findHome(neighbours: Neighbour[], facing: number): Neighbour | null {
  // Sample just inside the window wall; the window itself sits outside.
  const fr = (facing * Math.PI) / 180;
  const ix = -Math.sin(fr) * 1.5;
  const iy = -Math.cos(fr) * 1.5;
  return neighbours.find((b) => containsPoint(b.ring, ix, iy)) ?? null;
}

export function Buildings({
  neighbours,
  ground,
  facing,
  showHome,
}: {
  neighbours: Neighbour[];
  ground: number;
  facing: number;
  showHome: boolean;
}) {
  const home = useMemo(() => findHome(neighbours, facing), [neighbours, facing]);

  const others = useMemo(() => {
    const parts = neighbours.filter((b) => b !== home).map((b) => extrude(b, ground));
    const merged = parts.length ? mergeGeometries(parts) : null;
    parts.forEach((g) => g.dispose());
    return merged;
  }, [neighbours, home, ground]);

  const homeGeo = useMemo(() => (home ? extrude(home, ground) : null), [home, ground]);
  const homeEdges = useMemo(
    () => (homeGeo ? new THREE.EdgesGeometry(homeGeo, 30) : null),
    [homeGeo],
  );

  useEffect(() => () => others?.dispose(), [others]);
  useEffect(() => () => homeGeo?.dispose(), [homeGeo]);
  useEffect(() => () => homeEdges?.dispose(), [homeEdges]);

  return (
    <group>
      {others && (
        <mesh geometry={others} castShadow receiveShadow>
          <meshLambertMaterial color={COLOR_BUILDING} />
        </mesh>
      )}
      {showHome && homeGeo && (
        <>
          <mesh geometry={homeGeo} castShadow receiveShadow>
            <meshLambertMaterial color={COLOR_HOME} />
          </mesh>
          {homeEdges && (
            <lineSegments geometry={homeEdges}>
              <lineBasicMaterial color={COLOR_EDGE} />
            </lineSegments>
          )}
        </>
      )}
    </group>
  );
}
