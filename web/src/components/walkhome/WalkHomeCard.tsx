"use client";

import { useEffect, useState } from "react";
import { WalkHomeMap } from "@/components/walkhome/WalkHomeMap";
import { fetchWalkHome, WalkHome } from "@/lib/api";
import { Listing } from "@/lib/listings";

export function WalkHomeCard({ listing }: { listing: Listing | null }) {
  const selected =
    listing && listing.lat != null && listing.lon != null ? listing : null;
  const [walkHome, setWalkHome] = useState<WalkHome | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    if (!selected) {
      setWalkHome(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetchWalkHome(selected.lat!, selected.lon!)
      .then((r) => {
        if (cancelled) return;
        setWalkHome(r);
        setStatus("done");
      })
      .catch(() => {
        if (cancelled) return;
        setWalkHome(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.lat, selected?.lon]);

  return (
    <section className="border-2 border-ink bg-paper">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-per-200 px-4 py-3">
        <h2 className="label-mono text-per-700">Walk home</h2>
        {walkHome && (
          <>
            <span
              className="label-mono flex items-center gap-2 text-per-700"
              title="Nearest station, picked automatically"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                <rect x="2" y="1" width="9" height="8" fill="currentColor" />
                <rect x="4" y="3" width="2" height="2" fill="#ffffff" />
                <rect x="7" y="3" width="2" height="2" fill="#ffffff" />
                <rect x="3" y="10" width="2" height="2" fill="currentColor" />
                <rect x="8" y="10" width="2" height="2" fill="currentColor" />
              </svg>
              {walkHome.station.name}
              <span className="text-per-300">→</span>
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                <path d="M6.5 1 L12 6 H10 V12 H3 V6 H1 Z" fill="currentColor" />
                <rect x="5.5" y="8" width="2" height="4" fill="#ffffff" />
              </svg>
              home
            </span>
            <span className="label-mono text-per-500">
              {walkHome.distance_m} m · {walkHome.walk_min} min
            </span>
          </>
        )}
      </div>

      <div className="px-4 py-4">
        {!selected ? (
          <p className="label-mono py-10 text-center text-per-500">
            Add a listing to see the walk home.
          </p>
        ) : status === "loading" ? (
          <p className="label-mono py-10 text-center text-per-500">Computing…</p>
        ) : status === "error" ? (
          <p className="label-mono py-10 text-center text-per-500">
            Walk-home service unavailable
          </p>
        ) : walkHome === null ? (
          <div className="py-10 text-center">
            <p className="label-mono text-per-700">
              No walk-home coverage for this area yet
            </p>
            <p className="label-mono mt-1 text-per-500">
              Needs a station within 2 km and seeded street data (Meguro-ku only
              for now)
            </p>
          </div>
        ) : (
          <>
            <WalkHomeMap
              className="mb-4 h-[320px]"
              walkHome={walkHome}
              home={{
                lat: selected.lat!,
                lon: selected.lon!,
                name: selected.label || selected.address,
              }}
            />

            <div className="label-mono flex flex-wrap gap-x-8 gap-y-2 text-per-700">
              <span>{walkHome.lamps.length} mapped lamps along the route</span>
              <span>
                {walkHome.legs.reduce(
                  (count, leg) => count + leg.night_open_pois.length,
                  0,
                )}{" "}
                mapped places open after 20:00
              </span>
            </div>

            <p className="label-mono mt-3 text-right text-[10px] text-per-300">
              OpenStreetMap coverage is partial · absence of mapped data does not mean absence
            </p>
          </>
        )}
      </div>
    </section>
  );
}
