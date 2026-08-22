"use client";

import { useEffect, useReducer } from "react";
import { fetchSunlight, Sunlight } from "@/lib/api";

/** Deduplicates identical sunlight requests for the current page load. */

type Entry = {
  value?: Sunlight | null; // null = 404, no seeded building at the point
  error?: boolean;
  done: boolean;
  promise: Promise<void>;
};

const cache = new Map<string, Entry>();

export type SunlightStatus = "idle" | "loading" | "done" | "error";

export function useSunlight(
  lat: number | null | undefined,
  lon: number | null | undefined,
  floor: number,
  facing: number,
  withNeighbours = false,
): { data: Sunlight | null; status: SunlightStatus } {
  const key =
    lat == null || lon == null ? null : `${lat},${lon},${floor},${facing},${withNeighbours}`;
  const [, force] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    if (key === null || lat == null || lon == null) return;
    let entry = cache.get(key);
    if (!entry) {
      const next: Entry = { done: false, promise: Promise.resolve() };
      next.promise = fetchSunlight(lat, lon, { floor, facing, withNeighbours })
        .then((value) => {
          next.value = value;
          next.done = true;
        })
        .catch(() => {
          next.error = true;
          next.done = true;
        });
      cache.set(key, next);
      entry = next;
    }
    if (entry.done) return;
    let alive = true;
    entry.promise.then(() => {
      if (alive) force();
    });
    return () => {
      alive = false;
    };
  }, [key, lat, lon, floor, facing, withNeighbours]);

  if (key === null) return { data: null, status: "idle" };
  const entry = cache.get(key);
  if (!entry || !entry.done) return { data: null, status: "loading" };
  return { data: entry.value ?? null, status: entry.error ? "error" : "done" };
}
