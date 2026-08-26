"use client";

import { useState } from "react";
import { DestinationBar } from "@/components/DestinationBar";
import {
  CommuteRoutes,
  RouteSort,
  sortOptions,
} from "@/components/commute/CommuteRoutes";
import { RouteMap } from "@/components/commute/RouteMap";
import { CommuteCell, RouteOption } from "@/lib/api";
import { Destination } from "@/lib/destinations";
import { Listing } from "@/lib/listings";

/** Commutes for one listing. */

const SORTS: [RouteSort, string][] = [
  ["time", "Fastest"],
  ["transfers", "Fewest transfers"],
  ["walk", "Least walking"],
];
export function CommuteCard({
  listing,
  destinations,
  cells,
  error,
  sort,
  onSort,
}: {
  listing: Listing | null;
  destinations: Destination[] | null;
  cells: CommuteCell[] | undefined; // aligned with destinations; undefined = computing
  error: boolean;
  sort: RouteSort;
  onSort: (sort: RouteSort) => void;
}) {
  // Map selection by listing and destination.
  const [picked, setPicked] = useState<Record<string, RouteOption>>({});
  const origin =
    listing && listing.lat != null && listing.lon != null
      ? {
          lat: listing.lat,
          lon: listing.lon,
          name: listing.label || listing.address,
        }
      : null;

  return (
    <section className="border-2 border-ink bg-paper">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-per-200 px-4 py-3">
        <h2 className="label-mono text-per-700">Commute</h2>
        <DestinationBar />
      </div>

      <div className="px-4 py-4">
        {!listing || !origin ? (
          <p className="label-mono py-10 text-center text-per-500">
            Add a listing to see its commute.
          </p>
        ) : !destinations?.length ? (
          <p className="label-mono py-10 text-center text-per-500">
            Add a place you travel to often to see transit routes and travel
            times from this listing.
          </p>
        ) : error ? (
          <p className="label-mono text-per-500">Commute service unavailable</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-end gap-1">
              <span className="label-mono mr-1 text-per-500">Sort by</span>
              {SORTS.map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  className={`label-mono border-2 px-2 py-0.5 ${
                    sort === s
                      ? "border-ink bg-ink text-paper"
                      : "border-per-300 bg-paper text-per-500 hover:border-ink hover:text-ink"
                  }`}
                  onClick={() => onSort(s)}
                >
                  {label}
                </button>
              ))}
            </div>

            {destinations.map((destination, col) => {
              const cell = cells?.[col];
              const options = cell?.route_options ?? [];
              const key = `${listing.id}:${col}`;
              const pick = picked[key];
              const selected = options.includes(pick)
                ? pick
                : (sortOptions(options, sort)[0] ?? null);
              return (
                <div key={destination.id} className="mb-5 last:mb-0">
                  <div className="label-mono mb-2 text-per-700">
                    → {destination.name}
                  </div>
                  {cell === undefined ? (
                    <p className="label-mono text-per-500">Computing…</p>
                  ) : cell === null ? (
                    <p className="label-mono text-per-500">No route found.</p>
                  ) : (
                    <>
                      <RouteMap
                        className="mb-3 h-[320px]"
                        options={options}
                        selected={selected}
                        origin={origin}
                        destination={destination}
                      />
                      <CommuteRoutes
                        options={options}
                        sort={sort}
                        selected={selected}
                        onSelect={(o) => setPicked((p) => ({ ...p, [key]: o }))}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
