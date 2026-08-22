"use client";

import { useEffect, useRef, useState } from "react";
import { SuggestInput } from "@/components/SuggestInput";
import { SunBlocks } from "@/components/sunlight/SunBlocks";
import { Timeline } from "@/components/sunlight/Timeline";
import { TopDownCanvas } from "@/components/sunlight/TopDownCanvas";
import { Sunlight, Suggestion } from "@/lib/api";
import { Listing } from "@/lib/listings";
import { useSunlight } from "@/lib/useSunlight";

/** Interactive sunlight preview; controls do not change saved listings. */

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
      <span className="truncate">
        {listing.label || listing.address}
      </span>
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

  useEffect(() => {
    if (!selected) return;
    const base = { floor: selected.floor ?? 2, facing: selected.facing ?? 180 };
    setDraft(base);
    setApplied(base);
    // Reset controls only when the selected listing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Debounce sunlight requests while adjusting controls.
  useEffect(() => {
    const t = setTimeout(() => setApplied(draft), 300);
    return () => clearTimeout(t);
  }, [draft]);

  const { data, status } = useSunlight(
    selected?.lat,
    selected?.lon,
    applied.floor,
    applied.facing,
    true,
  );

  // Keep each listing's previous result while it recomputes.
  const lastGood = useRef(new Map<string, Sunlight>());
  useEffect(() => {
    if (selected && data) lastGood.current.set(selected.id, data);
  }, [selected, data]);
  const previous = selected ? (lastGood.current.get(selected.id) ?? null) : null;
  const shown = data ?? (status === "loading" ? previous : null);
  const stale = shown !== null && data === null && status === "loading";

  return (
    <div className="grid border-2 border-ink bg-paper lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative border-b-2 border-per-200 bg-per-100 lg:border-b-0 lg:border-r-2">
        <div className="absolute left-3 top-3 z-10 flex">
          <button type="button" className="label-mono border-2 border-ink bg-ink px-3 py-1 text-paper">
            Top view
          </button>
          <button
            type="button"
            disabled
            title="3D room view — coming next"
            className="label-mono cursor-not-allowed border-2 border-l-0 border-ink bg-paper px-3 py-1 text-per-300"
          >
            Room
          </button>
        </div>
        {selected?.lat != null && selected?.lon != null ? (
          <div className={stale ? "opacity-60" : ""}>
            <TopDownCanvas
              neighbours={shown?.neighbours ?? null}
              ground={shown?.ground ?? 0}
              lat={selected.lat}
              lon={selected.lon}
              facing={draft.facing}
              timeMin={timeMin}
            />
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
        <div>
          <div className="label-mono mb-2 text-per-500">Listing</div>
          <div className="flex flex-col gap-1.5">
            {placed.map((l) => (
              <ListingChip
                key={l.id}
                listing={l}
                selected={l.id === selected?.id}
                onSelect={() => onSelect(l.id)}
              />
            ))}
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

        <div className="flex gap-6">
          <div>
            <div className="label-mono mb-2 text-per-500">Floor</div>
            <div className="flex items-center border-2 border-per-200">
              <button
                type="button"
                className="px-2.5 py-1.5 hover:bg-per-100"
                aria-label="Floor down"
                onClick={() => setDraft((d) => ({ ...d, floor: Math.max(1, d.floor - 1) }))}
              >
                ▼
              </button>
              <span className="w-11 text-center font-mono text-sm">{draft.floor}F</span>
              <button
                type="button"
                className="px-2.5 py-1.5 hover:bg-per-100"
                aria-label="Floor up"
                onClick={() => setDraft((d) => ({ ...d, floor: Math.min(15, d.floor + 1) }))}
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
          <div className="label-mono mb-2 text-per-500">Winter sun — solstice direct light</div>
          <div className="flex items-baseline gap-3">
            {shown ? (
              <>
                <SunBlocks hours={shown.hours} className="text-xl tracking-widest" />
                <span className={`font-mono text-2xl font-bold ${stale ? "text-per-300" : ""}`}>
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

        <div>
          <div className="label-mono mb-2 text-per-500">Timeline</div>
          <Timeline segments={shown?.segments ?? null} value={timeMin} onChange={setTimeMin} />
        </div>
      </div>
    </div>
  );
}
