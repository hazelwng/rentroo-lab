"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Cutaway room; hidden walls still cast shadows. */

const W = 3.6; // room width
const D = 4.0; // room depth
const H = 2.7; // ceiling height
const WALL = 0.15;
// Matches the sampled window: centre 1 m above the floor, ±0.6 m.
const SILL = 0.4;
const WIN_H = 1.2;
const WIN_W = 1.6;

const COLOR_WALL = "#f7f7ff";
const COLOR_FLOOR = "#dcdcf5";
const COLOR_EDGE = "#c3c3e8";

export const ROOM = { W, D, H };

// Invisible shadow-casting material.
function ShadowOnly() {
  return <meshLambertMaterial colorWrite={false} depthWrite={false} shadowSide={THREE.DoubleSide} />;
}

function windowWallGeometry(): THREE.BufferGeometry {
  // Overlap edges to prevent light leaks.
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

// Local frame: window faces -z; room extends towards +z.
export function Room({ floorY, facing }: { floorY: number; facing: number }) {
  const windowWall = useMemo(windowWallGeometry, []);
  const outline = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), []);
  useEffect(
    () => () => {
      windowWall.dispose();
      outline.dispose();
    },
    [windowWall, outline],
  );

  return (
    <group position={[0, floorY, 0]} rotation={[0, -(facing * Math.PI) / 180, 0]}>
      <mesh geometry={windowWall} castShadow receiveShadow>
        <meshLambertMaterial color={COLOR_WALL} shadowSide={THREE.DoubleSide} />
      </mesh>
      {/* Overlapping slabs prevent shadow leaks. */}
      <mesh position={[0, -WALL / 2, D / 2]} receiveShadow>
        <boxGeometry args={[W + 2 * WALL, WALL, D + WALL]} />
        <meshLambertMaterial color={COLOR_FLOOR} shadowSide={THREE.DoubleSide} />
      </mesh>
      {/* Hidden faces still cast shadows. */}
      <mesh position={[0, H + WALL / 2, D / 2]} castShadow receiveShadow>
        <boxGeometry args={[W + 2 * WALL, WALL, D + WALL]} />
        <ShadowOnly />
      </mesh>
      <mesh position={[(W + WALL) / 2, H / 2, D / 2]} castShadow receiveShadow>
        <boxGeometry args={[WALL, H + 2 * WALL, D + WALL]} />
        <ShadowOnly />
      </mesh>
      <mesh position={[0, H / 2, D + WALL / 2]} castShadow receiveShadow>
        <boxGeometry args={[W + 2 * WALL, H + 2 * WALL, WALL]} />
        <ShadowOnly />
      </mesh>
      {/* Visible far wall. */}
      <mesh position={[-(W + WALL) / 2, H / 2, D / 2]} castShadow receiveShadow>
        <boxGeometry args={[WALL, H + 2 * WALL, D + WALL]} />
        <meshLambertMaterial color={COLOR_WALL} shadowSide={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={outline} position={[0, H / 2, D / 2]}>
        <lineBasicMaterial color={COLOR_EDGE} />
      </lineSegments>
    </group>
  );
}
