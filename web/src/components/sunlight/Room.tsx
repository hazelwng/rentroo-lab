"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** A bare room behind the window; walls block light so it only enters through the opening. */

const W = 3.6; // room width
const D = 4.0; // room depth
const H = 2.7; // ceiling height
const WALL = 0.15;
// Opening matches the sampled window: centre 1.0 m above the floor, ±0.6 m.
const SILL = 0.4;
const WIN_H = 1.2;
const WIN_W = 1.6;

const COLOR_WALL = "#f7f7ff";
const COLOR_FLOOR = "#dcdcf5";

function windowWallGeometry(): THREE.BufferGeometry {
  // Overlap the side walls and ceiling so the corners are sealed.
  const hw = W / 2 + WALL;
  const wall = new THREE.Shape();
  wall.moveTo(-hw, -WALL);
  wall.lineTo(hw, -WALL);
  wall.lineTo(hw, H + WALL);
  wall.lineTo(-hw, H + WALL);
  wall.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-WIN_W / 2, SILL);
  hole.lineTo(WIN_W / 2, SILL);
  hole.lineTo(WIN_W / 2, SILL + WIN_H);
  hole.lineTo(-WIN_W / 2, SILL + WIN_H);
  hole.closePath();
  wall.holes.push(hole);
  return new THREE.ExtrudeGeometry(wall, { depth: WALL, bevelEnabled: false });
}

// Local frame: window at the origin facing -z, room extending towards +z.
export function Room({ floorY, facing }: { floorY: number; facing: number }) {
  const windowWall = useMemo(windowWallGeometry, []);
  useEffect(() => () => windowWall.dispose(), [windowWall]);

  return (
    <group position={[0, floorY, 0]} rotation={[0, -(facing * Math.PI) / 180, 0]}>
      <mesh geometry={windowWall} castShadow receiveShadow>
        <meshLambertMaterial color={COLOR_WALL} shadowSide={THREE.DoubleSide} />
      </mesh>
      {/* Solid, overlapping slabs rendered double-sided into the shadow map:
          thin or back-face-only casters leak light along the inside corners. */}
      <mesh position={[0, -WALL / 2, D / 2]} receiveShadow>
        <boxGeometry args={[W + 2 * WALL, WALL, D + WALL]} />
        <meshLambertMaterial color={COLOR_FLOOR} shadowSide={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, H + WALL / 2, D / 2]} castShadow receiveShadow>
        <boxGeometry args={[W + 2 * WALL, WALL, D + WALL]} />
        <meshLambertMaterial color={COLOR_WALL} shadowSide={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-(W + WALL) / 2, H / 2, D / 2]} castShadow receiveShadow>
        <boxGeometry args={[WALL, H + 2 * WALL, D + WALL]} />
        <meshLambertMaterial color={COLOR_WALL} shadowSide={THREE.DoubleSide} />
      </mesh>
      <mesh position={[(W + WALL) / 2, H / 2, D / 2]} castShadow receiveShadow>
        <boxGeometry args={[WALL, H + 2 * WALL, D + WALL]} />
        <meshLambertMaterial color={COLOR_WALL} shadowSide={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, H / 2, D + WALL / 2]} castShadow receiveShadow>
        <boxGeometry args={[W + 2 * WALL, H + 2 * WALL, WALL]} />
        <meshLambertMaterial color={COLOR_WALL} shadowSide={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
