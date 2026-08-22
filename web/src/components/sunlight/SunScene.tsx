"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Neighbour } from "@/lib/api";
import { sunVector } from "@/lib/sun";
import { Buildings } from "@/components/sunlight/Buildings";
import { Room } from "@/components/sunlight/Room";

/** Shadow-mapped scene around the window: orthographic top view or a view from inside the room. */

export type SceneView = "top" | "room";

const FLOOR_HEIGHT = 3.0; // matches the API
const TOP_HALF_WIDTH = 150; // metres visible either side in top view
const SUN_DISTANCE = 600;
const COLOR_GROUND = "#e7e8f5";
const COLOR_SUN = "#ef9f27";
const COLOR_SUNLIGHT = "#ffdfae"; // warm so lit surfaces read as sun, not just brighter

function CameraRig({ view, facing, floorY }: { view: SceneView; facing: number; floorY: number }) {
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const ortho = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000), []);
  const persp = useMemo(() => new THREE.PerspectiveCamera(75, 1, 0.1, 2000), []);

  useEffect(() => {
    const aspect = size.width / size.height;
    ortho.left = -TOP_HALF_WIDTH;
    ortho.right = TOP_HALF_WIDTH;
    ortho.top = TOP_HALF_WIDTH / aspect;
    ortho.bottom = -TOP_HALF_WIDTH / aspect;
    ortho.position.set(0, 800, 0);
    ortho.up.set(0, 0, -1); // north up
    ortho.lookAt(0, 0, 0);
    ortho.updateProjectionMatrix();

    const f = (facing * Math.PI) / 180;
    const dx = Math.sin(f);
    const dz = -Math.cos(f);
    // Stand at the back of the room looking at the window, so the light patch is in view.
    persp.aspect = aspect;
    persp.position.set(-dx * 3.6, floorY + 1.5, -dz * 3.6);
    persp.lookAt(0, floorY + 0.9, 0);
    persp.updateProjectionMatrix();

    const cam = view === "top" ? ortho : persp;
    (cam as THREE.Camera & { manual?: boolean }).manual = true;
    set({ camera: cam });
  }, [view, facing, floorY, size, set, ortho, persp]);

  return null;
}

function Sun({
  lat,
  lon,
  timeMin,
  view,
}: {
  lat: number;
  lon: number;
  timeMin: number;
  view: SceneView;
}) {
  const light = useRef<THREE.DirectionalLight>(null);
  const [sx, sy, sz] = sunVector(lat, lon, timeMin);
  const up = sy > 0.01;
  // Top view needs the whole block shadowed; the room only needs crisp shadows nearby.
  const range = view === "top" ? 240 : 24;

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -range;
    cam.right = range;
    cam.top = range;
    cam.bottom = -range;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [range]);

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
        // bias is in normalized depth, so it scales with `far`; keep it tiny and lean on normalBias
        shadow-bias={0}
        shadow-normalBias={0.05}
      />
      {view === "top" && up && (
        <mesh position={[sx * 135, 60, sz * 135]}>
          <boxGeometry args={[6, 6, 6]} />
          <meshBasicMaterial color={COLOR_SUN} />
        </mesh>
      )}
    </>
  );
}

export function SunScene({
  view,
  neighbours,
  ground,
  lat,
  lon,
  floor,
  facing,
  timeMin,
}: {
  view: SceneView;
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
      <CameraRig view={view} facing={facing} floorY={floorY} />
      <Sun lat={lat} lon={lon} timeMin={timeMin} view={view} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshLambertMaterial color={COLOR_GROUND} />
      </mesh>
      <Buildings neighbours={neighbours} ground={ground} facing={facing} showHome={view === "top"} />
      {view === "top" && (
        <mesh position={[0, floorY + 1, 0]}>
          <boxGeometry args={[3, 2, 3]} />
          <meshBasicMaterial color={COLOR_SUN} />
        </mesh>
      )}
      {view === "room" && <Room floorY={floorY} facing={facing} />}
    </Canvas>
  );
}
