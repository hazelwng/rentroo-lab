"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Neighbour } from "@/lib/api";
import { sunVector } from "@/lib/sun";
import { Buildings } from "@/components/sunlight/Buildings";
import { Room } from "@/components/sunlight/Room";

/** Room view with neighbourhood shadows. */

const FLOOR_HEIGHT = 3.0; // API floor height
const SUN_DISTANCE = 600;
const SHADOW_RANGE = 24; // crisp-shadow radius, metres
const COLOR_GROUND = "#e7e8f5";
const COLOR_SUNLIGHT = "#ffdfae";

function CameraRig({ facing, floorY }: { facing: number; floorY: number }) {
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const camera = useMemo(() => new THREE.PerspectiveCamera(75, 1, 0.1, 2000), []);

  useEffect(() => {
    const f = (facing * Math.PI) / 180;
    const dx = Math.sin(f);
    const dz = -Math.cos(f);
    // Keep the window and light patch in view.
    camera.aspect = size.width / size.height;
    camera.position.set(-dx * 3.6, floorY + 1.5, -dz * 3.6);
    camera.lookAt(0, floorY + 0.9, 0);
    camera.updateProjectionMatrix();
    (camera as THREE.Camera & { manual?: boolean }).manual = true;
    set({ camera });
  }, [facing, floorY, size, set, camera]);

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
        // Keep tiny; bias scales with `far`.
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
}: {
  neighbours: Neighbour[];
  ground: number;
  lat: number;
  lon: number;
  floor: number;
  facing: number;
  timeMin: number;
}) {
  const floorY = (floor - 1) * FLOOR_HEIGHT;
  return (
    <Canvas
      shadows
      flat
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <CameraRig facing={facing} floorY={floorY} />
      <Sun lat={lat} lon={lon} timeMin={timeMin} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshLambertMaterial color={COLOR_GROUND} />
      </mesh>
      <Buildings neighbours={neighbours} ground={ground} facing={facing} showHome={false} />
      <Room floorY={floorY} facing={facing} />
    </Canvas>
  );
}
