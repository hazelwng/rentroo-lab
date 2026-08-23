"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Neighbour } from "@/lib/api";
import { findHome } from "@/lib/buildingGeometry";

/** Extruded footprints with a highlighted home building. */

const COLOR_BUILDING = "#c3c3e8";
const COLOR_HOME = "#5c5ca6";
const COLOR_EDGE = "#ef9f27";

// Convert (east, north) footprints to Three.js space.
function extrude(b: Neighbour, ground: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(b.ring.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, b.ground - ground, 0);
  return geo;
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
