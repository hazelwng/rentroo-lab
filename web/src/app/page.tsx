"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AddressField } from "@/components/AddressField";
import { DestinationBar } from "@/components/DestinationBar";
import { CommuteRoutes, RouteSort, sortOptions } from "@/components/commute/CommuteRoutes";
import { RouteMap } from "@/components/commute/RouteMap";
import { SunBlocks } from "@/components/sunlight/SunBlocks";
import { SunCard } from "@/components/sunlight/SunCard";
import { CommuteCell, fetchCommute, RouteOption, Suggestion } from "@/lib/api";
import { useDestinations } from "@/lib/destinations";
import { Listing, loadListings, saveListings } from "@/lib/listings";
import { useSunlight } from "@/lib/useSunlight";


const BUTTON =
  "label-mono border-2 border-ink bg-paper px-3 py-1.5 " +
  "shadow-[2px_2px_0_var(--color-ink)] hover:bg-per-100 " +
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

const FACING_OPTIONS: [string, number][] = [
  ["N", 0],
  ["NE", 45],
  ["E", 90],
  ["SE", 135],
  ["S", 180],
  ["SW", 225],
  ["W", 270],
  ["NW", 315],
];

function SunCell({ listing }: { listing: Listing }) {
  const { data, status } = useSunlight(
    listing.lat,
    listing.lon,
    listing.floor ?? 2,
    listing.facing ?? 180,
  );
  if (listing.lat == null) return <span className="text-per-300">—</span>;
  if (status === "loading") return <span className="text-per-300">…</span>;
  if (!data) return <span className="text-per-300">—</span>;
  return (
    <span className="whitespace-nowrap">
      <SunBlocks hours={data.hours} className="text-xs" />{" "}
      <span className="font-semibold">{data.hours.toFixed(1)}h</span>
    </span>
  );
}

export default function Home() {
  // Wait for localStorage to avoid a hydration mismatch.
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  // Map route by listing and destination column.
  const [picked, setPicked] = useState<Record<string, RouteOption>>({});
  const [commuteError, setCommuteError] = useState(false);
  const runRef = useRef(0);

  useEffect(() => setListings(loadListings()), []);

  // Select the first geocoded listing by default.
  useEffect(() => {
    if (listings === null) return;
    if (selectedId !== null && listings.some((l) => l.id === selectedId)) return;
    const first = listings.find((l) => l.lat != null);
    setSelectedId(first ? first.id : null);
  }, [listings, selectedId]);

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

  function addFromSuggestion(s: Suggestion) {
    const listing: Listing = {
      id: crypto.randomUUID(),
      address: s.display_name,
      lat: s.lat,
      lon: s.lon,
      floor: 2,
      facing: 180,
    };
    update([...(listings ?? []), listing]);
    setSelectedId(listing.id);
  }

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const address = String(data.get("address") ?? "").trim();
    const label = String(data.get("label") ?? "").trim();
    if (!address) return;
    const floor = Number(data.get("floor"));
    if (!Number.isInteger(floor) || floor < 1 || floor > 60) return;
    const lat = data.get("lat");
    const lon = data.get("lon");
    update([
      ...(listings ?? []),
      {
        id: crypto.randomUUID(),
        address,
        floor,
        facing: Number(data.get("facing") ?? 180),
        ...(label ? { label } : {}),
        ...(lat && lon ? { lat: Number(lat), lon: Number(lon) } : {}),
      },
    ]);
    setAdding(false);
  }

  const commuteHeaders = destinations?.length ? destinations.map((a) => a.name) : ["Commute"];
  const template = `minmax(0,2fr) minmax(0,3fr) repeat(${commuteHeaders.length}, 90px) 130px 40px`;

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
      <section className="flex min-h-[calc(100vh-8.5rem)] flex-col">
        {listings === null ? (
          <div className="flex-1 border-2 border-per-200 bg-per-50" />
        ) : (
          <SunCard
            listings={listings}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addFromSuggestion}
          />
        )}
        <a
          href="#compare"
          className="label-mono mt-auto self-center py-3 text-per-500 hover:text-ink"
        >
          ▾ Commute · Compare
        </a>
      </section>

      <section id="compare" className="scroll-mt-4 pt-2">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="label-mono text-per-700">Listings</h1>
          <button type="button" className={BUTTON} onClick={() => setAdding(true)}>
            ■ Add listing
          </button>
          <DestinationBar />
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
            <label className="flex w-20 flex-col gap-1">
              <span className="label-mono text-per-500">Floor</span>
              <input
                name="floor"
                type="number"
                min={1}
                max={60}
                step={1}
                required
                defaultValue={2}
                className="border-2 border-per-300 bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-mono text-per-500">Facing</span>
              <select
                name="facing"
                defaultValue="180"
                className="border-2 border-per-300 bg-paper px-2 py-2 text-sm outline-none focus:border-ink"
              >
                {FACING_OPTIONS.map(([label, deg]) => (
                  <option key={deg} value={deg}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={BUTTON}>
              Save
            </button>
            <button type="button" className={BUTTON} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        )}

        {/* Avoid a duplicate empty state while adding the first listing. */}
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
                    expandedId === listing.id || selectedId === listing.id ? "bg-per-100" : ""
                  }`}
                  style={{ gridTemplateColumns: template }}
                  onClick={() => {
                    setExpandedId(expandedId === listing.id ? null : listing.id);
                    if (listing.lat != null) setSelectedId(listing.id);
                  }}
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
                  <div className="px-3 py-2.5 font-mono text-sm">
                    <SunCell listing={listing} />
                  </div>
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
                              <div className="label-mono mb-1 text-per-700">
                                → {destination.name}
                              </div>
                              {cell === undefined ? (
                                <p className="text-sm text-per-500">Computing…</p>
                              ) : cell === null ? (
                                <p className="text-sm text-per-500">No route found.</p>
                              ) : (
                                (() => {
                                  const options = cell.route_options ?? [];
                                  const key = `${listing.id}:${col}`;
                                  const pick = picked[key];
                                  const selected = options.includes(pick)
                                    ? pick
                                    : (sortOptions(options, routeSort)[0] ?? null);
                                  return (
                                    <>
                                      <RouteMap
                                        className="mb-3 h-[320px]"
                                        options={options}
                                        selected={selected}
                                        origin={{
                                          lat: listing.lat!,
                                          lon: listing.lon!,
                                          name: listing.label || listing.address,
                                        }}
                                        destination={destination}
                                      />
                                      <CommuteRoutes
                                        options={options}
                                        sort={routeSort}
                                        maskColor="var(--color-per-50)"
                                        selected={selected}
                                        onSelect={(o) => setPicked((p) => ({ ...p, [key]: o }))}
                                      />
                                    </>
                                  );
                                })()
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
      </section>
    </div>
  );
}
