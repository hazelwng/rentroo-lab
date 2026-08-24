"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { SunBlocks } from "@/components/sunlight/SunBlocks";
import { Timeline } from "@/components/sunlight/Timeline";
import { TopDownCanvas } from "@/components/sunlight/TopDownCanvas";
import { Sunlight } from "@/lib/api";
import { Listing } from "@/lib/listings";
import { useSunlight } from "@/lib/useSunlight";

/** Sunlight for one listing. */

const SunScene = dynamic(
  () => import("@/components/sunlight/SunScene").then((m) => m.SunScene),
  { ssr: false },
);
const TopMap = dynamic(
  () => import("@/components/sunlight/TopMap").then((m) => m.TopMap),
  { ssr: false },
);

type View = "top" | "room";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const DIRS: [string, number][] = [
  ["NW", 315],
  ["N", 0],
  ["NE", 45],
  ["W", 270],
  ["·", -1],
  ["E", 90],
  ["SW", 225],
  ["S", 180],
  ["SE", 135],
];

const dirLabel = (facing: number) =>
  DIRS.find(([, deg]) => deg === facing)?.[0] ?? `${Math.round(facing)}°`;

export function SunCard({
  listing,
  onChange,
}: {
  listing: Listing | null;
  onChange?: (id: string, patch: { floor: number; facing: number }) => void;
}) {
  const selected =
    listing && listing.lat != null && listing.lon != null ? listing : null;
  const [draft, setDraft] = useState({ floor: 2, facing: 180 });
  const [applied, setApplied] = useState(draft);
  const [timeMin, setTimeMin] = useState(10 * 60);
  const [view, setView] = useState<View>("top");
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(hasWebGL()), []);

  useEffect(() => {
    if (!selected) return;
    const base = { floor: selected.floor ?? 2, facing: selected.facing ?? 180 };
    setDraft(base);
    setApplied(base);
    // Reset on listing change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Debounce controls.
  useEffect(() => {
    const t = setTimeout(() => setApplied(draft), 300);
    return () => clearTimeout(t);
  }, [draft]);

  // Persist settled controls.
  const save = useRef(onChange);
  save.current = onChange;
  useEffect(() => {
    if (!selected) return;
    const current = {
      floor: selected.floor ?? 2,
      facing: selected.facing ?? 180,
    };
    if (current.floor === applied.floor && current.facing === applied.facing)
      return;
    save.current?.(selected.id, applied);
    // Listing changes reset first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  const { data, status } = useSunlight(
    selected?.lat,
    selected?.lon,
    applied.floor,
    applied.facing,
  );
  const { data: sceneData, status: sceneStatus } = useSunlight(
    selected?.lat,
    selected?.lon,
    1,
    applied.facing,
    true,
  );
  // Reuse scene while loading.
  const lastScene = useRef<Sunlight | null>(null);
  if (sceneData) lastScene.current = sceneData;
  const scene =
    sceneData ?? (sceneStatus === "loading" ? lastScene.current : null);
  const [mapBusy, setMapBusy] = useState(false);
  const [northDeg, setNorthDeg] = useState(0);
  const loadingMap = view === "top" && (mapBusy || sceneStatus === "loading");

  // Reuse result while loading.
  const lastGood = useRef(new Map<string, Sunlight>());
  useEffect(() => {
    if (selected && data) lastGood.current.set(selected.id, data);
  }, [selected, data]);
  const previous = selected
    ? (lastGood.current.get(selected.id) ?? null)
    : null;
  const shown = data ?? (status === "loading" ? previous : null);
  const stale = shown !== null && data === null && status === "loading";

  return (
    <div className="grid border-2 border-ink bg-paper lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative border-b-2 border-per-200 bg-per-100 lg:border-b-0 lg:border-r-2">
        <div className="absolute left-3 top-3 z-10 flex">
          {(["top", "room"] as const).map((v) => (
            <button
              key={v}
              type="button"
              disabled={v === "room" && webgl === false}
              title={
                v === "room" && webgl === false
                  ? "Room view needs WebGL"
                  : undefined
              }
              onClick={() => setView(v)}
              className={`label-mono border-2 border-ink px-3 py-1 ${
                view === v
                  ? "bg-ink text-paper"
                  : "bg-paper text-per-500 hover:text-ink disabled:cursor-not-allowed disabled:text-per-300"
              } ${v === "room" ? "border-l-0" : ""}`}
            >
              {v === "top" ? "Top view" : "Room"}
            </button>
          ))}
        </div>
        {selected?.lat != null && selected?.lon != null ? (
          <div className={`relative aspect-[9/7] lg:aspect-[16/10] ${stale ? "opacity-60" : ""}`}>
            {webgl === false ? (
              <TopDownCanvas
                neighbours={scene?.neighbours ?? null}
                ground={scene?.ground ?? 0}
                lat={scene?.window.lat ?? selected.lat}
                lon={scene?.window.lon ?? selected.lon}
                facing={applied.facing}
                timeMin={timeMin}
              />
            ) : webgl && scene?.neighbours ? (
              view === "top" ? (
                <TopMap
                  neighbours={scene.neighbours}
                  ground={scene.ground}
                  lat={scene.window.lat}
                  lon={scene.window.lon}
                  facing={applied.facing}
                  timeMin={timeMin}
                  onBusy={setMapBusy}
                />
              ) : (
                <SunScene
                  neighbours={scene.neighbours}
                  ground={scene.ground}
                  lat={scene.window.lat}
                  lon={scene.window.lon}
                  floor={draft.floor}
                  facing={applied.facing}
                  timeMin={timeMin}
                  onNorth={setNorthDeg}
                />
              )
            ) : (
              <div className="label-mono absolute inset-0 flex items-center justify-center text-per-500">
                loading buildings…
              </div>
            )}
            <span className="label-mono absolute right-3 top-3 text-per-700">
              N{" "}
              <span
                className="inline-block"
                style={{
                  transform: `rotate(${view === "top" ? 0 : northDeg}deg)`,
                }}
              >
                ↑
              </span>
            </span>
            {loadingMap && (
              <span className="label-mono absolute bottom-3 right-3 border border-per-300 bg-paper px-2 py-1 text-per-500">
                loading map…
              </span>
            )}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-per-500 lg:h-full">
            Add a listing to see its sunlight.
          </div>
        )}
        {status === "done" && data === null && (
          <p className="label-mono absolute bottom-3 left-3 text-per-500">
            no building data at this point (Meguro only for now)
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 p-4">
        <div className="flex flex-col gap-5">
          <div className="flex gap-6">
            <div>
              <div className="label-mono mb-2 text-per-500">Floor</div>
              <div className="flex items-center border-2 border-per-200">
                <button
                  type="button"
                  className="px-2.5 py-1.5 hover:bg-per-100"
                  aria-label="Floor down"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      floor: Math.max(1, d.floor - 1),
                    }))
                  }
                >
                  ▼
                </button>
                <span className="w-11 text-center font-mono text-sm">
                  {draft.floor}F
                </span>
                <button
                  type="button"
                  className="px-2.5 py-1.5 hover:bg-per-100"
                  aria-label="Floor up"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      floor: Math.min(15, d.floor + 1),
                    }))
                  }
                >
                  ▲
                </button>
              </div>
            </div>
            <div>
              <div className="label-mono mb-2 text-per-500">Facing</div>
              <div className="grid w-fit grid-cols-3 gap-0.5">
                {DIRS.map(([label, deg]) =>
                  deg < 0 ? (
                    <span
                      key="centre"
                      className="flex h-7 w-7 items-center justify-center font-mono text-xs font-bold"
                    >
                      {dirLabel(draft.facing)}
                    </span>
                  ) : (
                    <button
                      key={label}
                      type="button"
                      className={`label-mono h-7 w-7 ${
                        draft.facing === deg
                          ? "border-2 border-ink bg-ink text-paper"
                          : "border border-per-300 bg-per-100 text-per-500 hover:border-ink hover:text-ink"
                      }`}
                      onClick={() => setDraft((d) => ({ ...d, facing: deg }))}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="label-mono mb-2 text-per-500">
              Winter sun — solstice direct light
            </div>
            <div className="flex items-baseline gap-3">
              {shown ? (
                <>
                  <SunBlocks
                    hours={shown.hours}
                    className="text-xl tracking-widest"
                  />
                  <span
                    className={`font-mono text-2xl font-bold ${stale ? "text-per-300" : ""}`}
                  >
                    {shown.hours.toFixed(2)}
                    <span className="text-xs font-normal text-per-500">h</span>
                  </span>
                </>
              ) : (
                <span className="font-mono text-per-300">
                  {status === "loading" ? "…" : "—"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="label-mono mb-2 text-per-500">Timeline</div>
          <Timeline
            segments={shown?.segments ?? null}
            value={timeMin}
            onChange={setTimeMin}
          />
        </div>
      </div>
    </div>
  );
}
