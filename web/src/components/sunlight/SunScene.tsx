"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Neighbour } from "@/lib/api";
import { sunVector } from "@/lib/sun";
import { Buildings } from "@/components/sunlight/Buildings";
import { Room, ROOM } from "@/components/sunlight/Room";

/** Cutaway room with invisible neighbour shadow casters. */

const FLOOR_HEIGHT = 3.0; // API floor height
const SUN_DISTANCE = 600;
const SHADOW_RANGE = 24; // crisp-shadow radius, metres
const COLOR_SUNLIGHT = "#ffdfae";

// Orthographic view from behind, right, and above.
const VIEW_DIR = new THREE.Vector3(0.6, 0.7, 0.75).normalize();
const VIEW_HALF_HEIGHT = 3.4; // metres; fits the 2.7 m room plus the floor in front
const VIEW_DISTANCE = 40;

function CameraRig({
  facing,
  floorY,
  onNorth,
}: {
  facing: number;
  floorY: number;
  onNorth?: (screenDeg: number) => void;
}) {
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const camera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200), []);

  useEffect(() => {
    const aspect = size.width / size.height;
    camera.top = VIEW_HALF_HEIGHT;
    camera.bottom = -VIEW_HALF_HEIGHT;
    camera.left = -VIEW_HALF_HEIGHT * aspect;
    camera.right = VIEW_HALF_HEIGHT * aspect;

    // Rotate the view with the room.
    const dir = VIEW_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -(facing * Math.PI) / 180);
    const target = new THREE.Vector3(0, floorY + ROOM.H / 2 - 0.4, ROOM.D / 2).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -(facing * Math.PI) / 180,
    );
    camera.position.copy(target).addScaledVector(dir, VIEW_DISTANCE);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    (camera as THREE.Camera & { manual?: boolean }).manual = true;
    set({ camera });

    // Project north onto the screen.
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const north = new THREE.Vector3(0, 0, -1);
    const theta = Math.atan2(north.dot(up), north.dot(right)); // ccw from screen-right
    onNorth?.(90 - (theta * 180) / Math.PI);
  }, [facing, floorY, size, set, camera, onNorth]);

  return null;
}

function Sun({ lat, lon, timeMin }: { lat: number; lon: number; timeMin: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const [sx, sy, sz] = sunVector(lat, lon, timeMin);
  const up = sy > 0.01;

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -SHADOW_RANGE;
    cam.right = SHADOW_RANGE;
    cam.top = SHADOW_RANGE;
    cam.bottom = -SHADOW_RANGE;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, []);

  return (
    <>
      <ambientLight intensity={2.4} />
      <directionalLight
        ref={light}
        color={COLOR_SUNLIGHT}
        position={[sx * SUN_DISTANCE, sy * SUN_DISTANCE, sz * SUN_DISTANCE]}
        intensity={up ? 2.0 : 0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={SUN_DISTANCE * 2}
        // Bias scales with `far`.
        shadow-bias={0}
        shadow-normalBias={0.05}
      />
    </>
  );
}

export function SunScene({
  neighbours,
  ground,
  lat,
  lon,
  floor,
  facing,
  timeMin,
  onNorth,
}: {
  neighbours: Neighbour[];
  ground: number;
  lat: number;
  lon: number;
  floor: number;
  facing: number;
  timeMin: number;
  onNorth?: (screenDeg: number) => void; // compass: rotation of an up-arrow that points north
}) {
  const floorY = (floor - 1) * FLOOR_HEIGHT;
  // Drop buildings behind the facade.
  // TODO: Clip the home at the facade, keeping only U-shaped wings.
  const inFront = useMemo(() => {
    const f = (facing * Math.PI) / 180;
    const fx = Math.sin(f);
    const fy = Math.cos(f);
    return neighbours.filter((b) => b.ring.some(([x, y]) => x * fx + y * fy > -1));
  }, [neighbours, facing]);
  return (
    <Canvas
      shadows
      flat
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <CameraRig facing={facing} floorY={floorY} onNorth={onNorth} />
      <Sun lat={lat} lon={lon} timeMin={timeMin} />
      <Buildings neighbours={inFront} ground={ground} />
      <Room floorY={floorY} facing={facing} />
    </Canvas>
  );
}
