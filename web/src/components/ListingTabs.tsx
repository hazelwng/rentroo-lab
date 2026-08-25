"use client";

import { useState } from "react";
import { SuggestInput } from "@/components/SuggestInput";
import { Suggestion } from "@/lib/api";
import { Listing } from "@/lib/listings";
import { useSunlight } from "@/lib/useSunlight";

/** Listing and comparison tabs. */

export type PageView =
  { kind: "listing"; id: string | null } | { kind: "compare" };

const TAB =
  "label-mono flex h-9 shrink-0 items-center gap-2 border-2 px-3 whitespace-nowrap";
const TAB_ON = "border-ink bg-ink text-paper";
const TAB_OFF = "border-per-200 bg-paper text-per-700 hover:border-ink";

function SunHours({ listing }: { listing: Listing }) {
  const { data, status } = useSunlight(
    listing.lat,
    listing.lon,
    listing.floor ?? 2,
    listing.facing ?? 180,
  );
  if (listing.lat == null) return null;
  if (status === "loading") return <span className="opacity-50">…</span>;
  if (!data) return <span className="opacity-50">—</span>;
  return (
    <span>
      <span className="text-sun">■</span> {data.hours.toFixed(1)}h
    </span>
  );
}

export function ListingTabs({
  listings,
  view,
  onView,
  onAdd,
  onRemove,
}: {
  listings: Listing[];
  view: PageView;
  onView: (view: PageView) => void;
  onAdd: (s: Suggestion) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const activeId = view.kind === "listing" ? view.id : null;

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b-2 border-per-200 bg-paper px-4">
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {listings.map((l) => {
          const on = l.id === activeId;
          return (
            <div key={l.id} className={`${TAB} ${on ? TAB_ON : TAB_OFF} pr-1`}>
              <button
                type="button"
                className="flex items-center gap-2"
                onClick={() => onView({ kind: "listing", id: l.id })}
              >
                <span className="max-w-48 truncate">
                  {l.label || l.address}
                </span>
                <span className="font-mono text-xs normal-case tracking-normal">
                  <SunHours listing={l} />
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${l.label || l.address}`}
                className={`px-1.5 ${on ? "text-per-300 hover:text-paper" : "text-per-300 hover:text-ink"}`}
                onClick={() => onRemove(l.id)}
              >
                ×
              </button>
            </div>
          );
        })}

        {adding ? (
          // Pick before blur.
          <div
            className="w-72 shrink-0"
            onBlur={() => {
              setAdding(false);
              setValue("");
            }}
          >
            <SuggestInput
              autoFocus
              value={value}
              onValueChange={setValue}
              onPick={(s) => {
                onAdd(s);
                setValue("");
                setAdding(false);
              }}
              placeholder="Add by address…"
            />
          </div>
        ) : (
          <button
            type="button"
            className={`${TAB} ${TAB_OFF} text-per-500`}
            onClick={() => setAdding(true)}
          >
            + Add
          </button>
        )}

        <button
          type="button"
          className={`${TAB} ml-auto ${view.kind === "compare" ? TAB_ON : TAB_OFF}`}
          onClick={() => onView({ kind: "compare" })}
        >
          ⊞ Compare
        </button>
      </div>
    </div>
  );
}
