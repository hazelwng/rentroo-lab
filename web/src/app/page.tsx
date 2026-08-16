"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AddressField } from "@/components/AddressField";
import { CommuteRoutes, RouteSort } from "@/components/commute/CommuteRoutes";
import { CommuteCell, fetchCommute } from "@/lib/api";
import { useDestinations } from "@/lib/destinations";
import { Listing, loadListings, saveListings } from "@/lib/listings";

/**
 * The listing board: one row per listing, one commute column per destination,
 * all cells computed in one /api/commute batch — comparing many listings at
 * once is the whole point. Winter sun stays a placeholder until the
 * sunlight feature lands.
 */

const BUTTON =
  "label-mono border-2 border-ink bg-paper px-3 py-1.5 " +
  "shadow-[2px_2px_0_var(--color-ink)] hover:bg-per-100 " +
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

export default function Home() {
  // null until hydrated, so the server render never disagrees with localStorage
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [destinations] = useDestinations();
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [routeSort, setRouteSort] = useState<RouteSort>("time");

  useEffect(() => {
    const stored = localStorage.getItem("rentroo.routeSort");
    if (stored === "time" || stored === "transfers" || stored === "walk") setRouteSort(stored);
  }, []);

  function changeSort(sort: RouteSort) {
    setRouteSort(sort);
    localStorage.setItem("rentroo.routeSort", sort);
  }

  // listing id -> one cell per destination, in destination order
  const [cells, setCells] = useState<Record<string, CommuteCell[]>>({});
  const [commuteError, setCommuteError] = useState(false);
  const runRef = useRef(0);

  useEffect(() => setListings(loadListings()), []);

  useEffect(() => {
    if (listings === null || destinations === null) return;
    const origins = listings.filter((l) => l.lat != null && l.lon != null);
    const run = ++runRef.current;
    if (!origins.length || !destinations.length) {
      setCells({});
      setCommuteError(false);
      return;
    }
    fetchCommute(
      origins.map((l) => ({ id: l.id, lat: l.lat!, lon: l.lon! })),
      destinations.map((a) => ({ name: a.name, lat: a.lat, lon: a.lon })),
    )
      .then((matrix) => {
        if (run !== runRef.current) return;
        const next: Record<string, CommuteCell[]> = {};
        for (const origin of matrix.origins) {
          if (origin.id) next[origin.id] = origin.results;
        }
        setCells(next);
        setCommuteError(false);
      })
      .catch(() => {
        if (run !== runRef.current) return;
        setCells({});
        setCommuteError(true);
      });
  }, [listings, destinations]);

  function update(next: Listing[]) {
    setListings(next);
    saveListings(next);
  }

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const address = String(data.get("address") ?? "").trim();
    const label = String(data.get("label") ?? "").trim();
    if (!address) return;
    const lat = data.get("lat");
    const lon = data.get("lon");
    update([
      ...(listings ?? []),
      {
        id: crypto.randomUUID(),
        address,
        ...(label ? { label } : {}),
        ...(lat && lon ? { lat: Number(lat), lon: Number(lon) } : {}),
      },
    ]);
    setAdding(false);
  }

  const commuteHeaders = destinations?.length ? destinations.map((a) => a.name) : ["Commute"];
  const template = `minmax(0,2fr) minmax(0,3fr) repeat(${commuteHeaders.length}, 90px) 100px 40px`;

  function commuteCell(listing: Listing, col: number) {
    if (listing.lat == null) return <span className="text-per-300">—</span>;
    const result = cells[listing.id]?.[col];
    if (result === undefined) return <span className="text-per-300">…</span>;
    if (result === null) return <span className="text-per-300">✕</span>;
    return (
      <span title={result.summary ?? undefined} className="font-semibold">
        {result.transit_minutes}
        <span className="ml-0.5 text-[10px] font-normal text-per-500">min</span>
      </span>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="label-mono text-per-700">Listings</h1>
        <button type="button" className={BUTTON} onClick={() => setAdding(true)}>
          ■ Add listing
        </button>
      </div>

      {adding && (
        <form
          onSubmit={handleAdd}
          className="mb-4 flex flex-wrap items-end gap-3 border-2 border-per-300 bg-paper p-4"
        >
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="label-mono text-per-500">Address</span>
            <AddressField />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-mono text-per-500">
              Label <span className="normal-case text-per-300">(optional)</span>
            </span>
            <input
              name="label"
              placeholder="Work"
              className="border-2 border-per-300 bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
            />
          </label>
          <button type="submit" className={BUTTON}>
            Save
          </button>
          <button type="button" className={BUTTON} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}

      {/* While the add form is open on an empty board, the empty table would
          just repeat the same call to action — hide it. */}
      <div className={adding && !listings?.length ? "hidden" : "border-2 border-ink bg-paper"}>
        <div className="grid border-b-2 border-per-200" style={{ gridTemplateColumns: template }}>
          {["Listing", "Address", ...commuteHeaders, "Winter sun", ""].map((h, i) => (
            <div key={i} className="label-mono truncate px-3 py-2 text-per-500" title={h}>
              {h}
            </div>
          ))}
        </div>

        {listings === null ? null : listings.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-per-500">
              No listings yet.{" "}
              <button
                type="button"
                className="underline decoration-2 underline-offset-2 hover:text-ink"
                onClick={() => setAdding(true)}
              >
                Add one
              </button>{" "}
              to start comparing.
            </p>
          </div>
        ) : (
          listings.map((listing) => (
            <div key={listing.id} className="border-b-2 border-per-100 last:border-b-0">
              <div
                className={`grid cursor-pointer items-center hover:bg-per-50 ${
                  expandedId === listing.id ? "bg-per-100" : ""
                }`}
                style={{ gridTemplateColumns: template }}
                onClick={() => setExpandedId(expandedId === listing.id ? null : listing.id)}
              >
                <div className="truncate px-3 py-2.5 text-sm font-medium">
                  {listing.label || listing.address}
                </div>
                <div className="truncate px-3 py-2.5 text-sm text-per-500">
                  {listing.label ? listing.address : "—"}
                </div>
                {commuteHeaders.map((_, col) => (
                  <div key={col} className="px-3 py-2.5 font-mono text-sm">
                    {destinations?.length ? (
                      commuteCell(listing, col)
                    ) : (
                      <span className="text-per-300">—</span>
                    )}
                  </div>
                ))}
                <div className="px-3 py-2.5 font-mono text-sm text-per-300">—</div>
                <button
                  type="button"
                  aria-label={`Remove ${listing.label || listing.address}`}
                  className="px-3 py-2.5 text-per-300 hover:text-ink"
                  onClick={(e) => {
                    e.stopPropagation();
                    update((listings ?? []).filter((l) => l.id !== listing.id));
                  }}
                >
                  ×
                </button>
              </div>

              {expandedId === listing.id && listing.lat != null && (
                <div className="border-t-2 border-per-100 bg-per-50 px-4 py-3">
                  {!destinations?.length ? (
                    <p className="text-sm text-per-500">Add a destination to see routes.</p>
                  ) : (
                    <>
                      <div className="mb-2 flex items-center justify-end gap-1">
                        {(["time", "transfers", "walk"] as const).map((sort) => (
                          <button
                            key={sort}
                            type="button"
                            className={`label-mono border-2 px-2 py-0.5 ${
                              routeSort === sort
                                ? "border-ink bg-ink text-paper"
                                : "border-per-300 bg-paper text-per-500 hover:border-ink hover:text-ink"
                            }`}
                            onClick={() => changeSort(sort)}
                          >
                            {sort}
                          </button>
                        ))}
                      </div>
                      {destinations.map((destination, col) => {
                      const cell = cells[listing.id]?.[col];
                      return (
                        <div key={destination.id} className="mb-3 last:mb-0">
                          <div className="label-mono mb-1 text-per-700">→ {destination.name}</div>
                          {cell === undefined ? (
                            <p className="text-sm text-per-500">Computing…</p>
                          ) : cell === null ? (
                            <p className="text-sm text-per-500">No route found.</p>
                          ) : (
                            <CommuteRoutes
                              options={cell.route_options ?? []}
                              sort={routeSort}
                              maskColor="var(--color-per-50)"
                            />
                          )}
                        </div>
                      );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {commuteError && (
        <p className="label-mono mt-2 text-per-500">Commute service unavailable</p>
      )}
    </div>
  );
}
