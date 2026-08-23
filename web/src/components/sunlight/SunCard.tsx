"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { SuggestInput } from "@/components/SuggestInput";
import { SunBlocks } from "@/components/sunlight/SunBlocks";
import { Timeline } from "@/components/sunlight/Timeline";
import { TopDownCanvas } from "@/components/sunlight/TopDownCanvas";
import { Sunlight, Suggestion } from "@/lib/api";
import { Listing } from "@/lib/listings";
import { useSunlight } from "@/lib/useSunlight";

/** Sunlight preview with unsaved controls. */

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

function ListingChip({
  listing,
  selected,
  onSelect,
}: {
  listing: Listing;
  selected: boolean;
  onSelect: () => void;
}) {
  const { data, status } = useSunlight(
    listing.lat,
    listing.lon,
    listing.floor ?? 2,
    listing.facing ?? 180,
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
        selected
          ? "border-2 border-ink bg-paper shadow-[3px_3px_0_var(--color-per-500)]"
          : "border-2 border-per-200 bg-per-100 hover:border-per-300"
      }`}
    >
      <span className="truncate">{listing.label || listing.address}</span>
      <span className="font-mono text-xs whitespace-nowrap">
        {status === "loading" ? (
          <span className="text-per-300">…</span>
        ) : data ? (
          <>
            <span className="text-sun">■</span> {data.hours.toFixed(1)}h
          </>
        ) : (
          <span className="text-per-300">—</span>
        )}
      </span>
    </button>
  );
}

export function SunCard({
  listings,
  selectedId,
  onSelect,
  onAdd,
}: {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (s: Suggestion) => void;
}) {
  const placed = listings.filter((l) => l.lat != null && l.lon != null);
  const selected = placed.find((l) => l.id === selectedId) ?? placed[0] ?? null;

  const [draft, setDraft] = useState({ floor: 2, facing: 180 });
  const [applied, setApplied] = useState(draft);
  const [timeMin, setTimeMin] = useState(10 * 60);
  const [addValue, setAddValue] = useState("");
  const [view, setView] = useState<View>("top");
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(hasWebGL()), []);

  useEffect(() => {
    if (!selected) return;
    const base = { floor: selected.floor ?? 2, facing: selected.facing ?? 180 };
    setDraft(base);
    setApplied(base);
    // Reset when switching listings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Debounce control changes.
  useEffect(() => {
    const t = setTimeout(() => setApplied(draft), 300);
    return () => clearTimeout(t);
  }, [draft]);

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
  // Keep the map mounted between listing loads.
  const lastScene = useRef<Sunlight | null>(null);
  if (sceneData) lastScene.current = sceneData;
  const scene =
    sceneData ?? (sceneStatus === "loading" ? lastScene.current : null);
  const [mapBusy, setMapBusy] = useState(false);
  const loadingMap = view === "top" && (mapBusy || sceneStatus === "loading");

  // Show the listing's last result while refreshing.
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
          <div className={`relative aspect-[9/7] ${stale ? "opacity-60" : ""}`}>
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
                />
              )
            ) : (
              <div className="label-mono absolute inset-0 flex items-center justify-center text-per-500">
                loading buildings…
              </div>
            )}
            {view === "top" && (
              <span className="label-mono absolute right-3 top-3 text-per-700">
                N ↑
              </span>
            )}
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
        {/* Listing | knobs side by side; the 320px side panel at lg stacks them again. */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <div className="flex min-w-0 flex-col">
            <div className="label-mono mb-2 text-per-500">Listing</div>
            <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
              {placed.map((l) => (
                <ListingChip
                  key={l.id}
                  listing={l}
                  selected={l.id === selected?.id}
                  onSelect={() => onSelect(l.id)}
                />
              ))}
            </div>
            <div className="mt-1.5">
              <SuggestInput
                value={addValue}
                onValueChange={setAddValue}
                onPick={(s) => {
                  setAddValue("");
                  onAdd(s);
                }}
                placeholder="+ Add by address…"
              />
            </div>
          </div>

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
                      <span className="text-xs font-normal text-per-500">
                        h
                      </span>
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
