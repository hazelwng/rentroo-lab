"use client";

/** Destination stores at localStorage. */

import { useEffect, useState } from "react";

export type Destination = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

export const MAX_DESTINATIONS = 5;

const KEY = "rentroo.destinations";
const EVENT = "rentroo:destinations";

function loadDestinations(): Destination[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Destination[]) : [];
  } catch {
    return [];
  }
}

export function useDestinations(): [Destination[] | null, (next: Destination[]) => void] {
  // null until hydrated, so the server render never disagrees with localStorage
  const [destinations, setDestinations] = useState<Destination[] | null>(null);

  useEffect(() => {
    const sync = () => setDestinations(loadDestinations());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  function update(next: Destination[]) {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  }

  return [destinations, update];
}
