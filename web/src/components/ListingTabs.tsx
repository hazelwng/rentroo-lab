"use client";

import { useState } from "react";
import { SuggestInput } from "@/components/SuggestInput";
import { Suggestion } from "@/lib/api";
import { Listing } from "@/lib/listings";
import { useSunlight } from "@/lib/useSunlight";

/** Listing and comparison tabs. */

export type PageView =
  { kind: "listing"; id: string | null } | { kind: "compare" };

const PILL =
  "label-mono flex h-6 shrink-0 items-center gap-1.5 border px-2 leading-none whitespace-nowrap";
const PILL_ON = "border-ink bg-ink text-paper";
const PILL_OFF = "border-per-200 bg-paper text-per-700 hover:border-ink";
const CTA =
  "label-mono flex h-7 shrink-0 items-center gap-1.5 border-2 px-2.5 leading-none whitespace-nowrap";
const CTA_ON = "border-ink bg-ink text-paper";
const CTA_OFF = "border-ink bg-paper text-ink hover:bg-ink hover:text-paper";

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
    <div className="sticky top-0 z-20 -mt-6 mx-[calc(50%-50vw)] border-b-2 border-per-200 bg-paper">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
        <div className="scrollbar-none flex flex-1 items-center gap-2 overflow-x-auto">
          {listings.map((l) => {
            const on = l.id === activeId;
            return (
              <div key={l.id} className={`${PILL} ${on ? PILL_ON : PILL_OFF} pr-0.5`}>
                <button
                  type="button"
                  className="flex items-center gap-2"
                  onClick={() => onView({ kind: "listing", id: l.id })}
                >
                  <span className="max-w-36 truncate">
                    {l.label || l.address}
                  </span>
                  <span className="font-mono text-xs leading-none normal-case tracking-normal">
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

          {listings.length >= 2 && (
            <>
              <div className="h-5 w-px shrink-0 bg-per-300" />
              <button
                type="button"
                className={`${PILL} ${
                  view.kind === "compare"
                    ? PILL_ON
                    : "border-per-300 bg-per-100 text-per-700 hover:border-ink"
                }`}
                onClick={() => onView({ kind: "compare" })}
              >
                ⊞ Compare
              </button>
            </>
          )}
        </div>

        {adding ? (
          // Pick before blur.
          <div
            className="w-52 shrink-0"
            onBlur={() => {
              setAdding(false);
              setValue("");
            }}
          >
            <SuggestInput
              autoFocus
              inputClassName="h-7 py-0 text-xs"
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
            className={`${CTA} ${CTA_OFF}`}
            onClick={() => setAdding(true)}
          >
            + Add
          </button>
        )}
      </div>
    </div>
  );
}
