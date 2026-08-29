"use client";

import { useEffect, useRef, useState } from "react";
import { CompareTable } from "@/components/CompareTable";
import { ListingTabs, PageView } from "@/components/ListingTabs";
import { CommuteCard } from "@/components/commute/CommuteCard";
import { RouteSort } from "@/components/commute/CommuteRoutes";
import { SunCard } from "@/components/sunlight/SunCard";
import { WalkHomeCard } from "@/components/walkhome/WalkHomeCard";
import { CommuteCell, fetchCommute, Suggestion } from "@/lib/api";
import { useDestinations } from "@/lib/destinations";
import { Listing, loadListings, saveListings } from "@/lib/listings";

export default function Home() {
  // Hydrate after mount.
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [view, setView] = useState<PageView>({ kind: "listing", id: null });
  const [destinations] = useDestinations();
  const [routeSort, setRouteSort] = useState<RouteSort>("time");

  useEffect(() => {
    const stored = localStorage.getItem("rentroo.routeSort");
    if (stored === "time" || stored === "transfers" || stored === "walk")
      setRouteSort(stored);
  }, []);

  function changeSort(sort: RouteSort) {
    setRouteSort(sort);
    localStorage.setItem("rentroo.routeSort", sort);
  }

  // Commute cells by listing and destination.
  const [cells, setCells] = useState<Record<string, CommuteCell[]>>({});
  const [commuteError, setCommuteError] = useState(false);
  const runRef = useRef(0);

  useEffect(() => setListings(loadListings()), []);

  // Fall back to the first geocoded listing.
  useEffect(() => {
    if (listings === null || view.kind !== "listing") return;
    if (view.id !== null && listings.some((l) => l.id === view.id)) return;
    const first = listings.find((l) => l.lat != null);
    const nextId = first?.id ?? null;
    if (view.id !== nextId) setView({ kind: "listing", id: nextId });
  }, [listings, view]);

  const commuteOriginsKey =
    listings === null
      ? null
      : JSON.stringify(
          listings
            .filter((l) => l.lat != null && l.lon != null)
            .map((l) => ({ id: l.id, lat: l.lat, lon: l.lon })),
        );

  useEffect(() => {
    if (commuteOriginsKey === null || destinations === null) return;
    const origins = JSON.parse(commuteOriginsKey) as {
      id: string;
      lat: number;
      lon: number;
    }[];
    const run = ++runRef.current;
    if (!origins.length || !destinations.length) {
      setCells({});
      setCommuteError(false);
      return;
    }
    fetchCommute(
      origins,
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
  }, [commuteOriginsKey, destinations]);

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
    setView({ kind: "listing", id: listing.id });
  }

  function patchListing(id: string, patch: { floor: number; facing: number }) {
    update((listings ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  if (listings === null) return null;

  const active =
    view.kind === "listing"
      ? (listings.find((l) => l.id === view.id) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-5">
      <ListingTabs
        listings={listings}
        view={view}
        onView={setView}
        onAdd={addFromSuggestion}
        onRemove={(id) => update(listings.filter((l) => l.id !== id))}
      />

      {view.kind === "compare" ? (
        <CompareTable
          listings={listings}
          destinations={destinations}
          cells={cells}
          error={commuteError}
          onOpen={(id) => setView({ kind: "listing", id })}
        />
      ) : (
        <>
          <SunCard listing={active} onChange={patchListing} />
          <WalkHomeCard listing={active} />
          <CommuteCard
            listing={active}
            destinations={destinations}
            cells={active ? cells[active.id] : undefined}
            error={commuteError}
            sort={routeSort}
            onSort={changeSort}
          />
        </>
      )}
    </div>
  );
}
