"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Neighbour } from "@/lib/api";

// Convert (east, north) footprints to Three.js space.
function extrude(b: Neighbour, ground: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(b.ring.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, b.ground - ground, 0);
  return geo;
}

/** Invisible neighbour shadow casters. */
export function Buildings({ neighbours, ground }: { neighbours: Neighbour[]; ground: number }) {
  const merged = useMemo(() => {
    const parts = neighbours.map((b) => extrude(b, ground));
    const geo = parts.length ? mergeGeometries(parts) : null;
    parts.forEach((g) => g.dispose());
    return geo;
  }, [neighbours, ground]);
  useEffect(() => () => merged?.dispose(), [merged]);

  if (!merged) return null;
  return (
    <mesh geometry={merged} castShadow>
      <meshLambertMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  );
}
