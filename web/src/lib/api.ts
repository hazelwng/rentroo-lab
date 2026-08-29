/** Typed client for API routes proxied to the backend by Next.js. */

export type Suggestion = {
  display_name: string;
  lat: number;
  lon: number;
  suburb: string | null;
};

export async function suggestPlaces(q: string, limit = 6): Promise<Suggestion[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(`/api/places/suggest?${params}`);
  if (!res.ok) throw new Error(`suggest failed: ${res.status}`);
  return res.json();
}

export type Leg = {
  kind: "walk" | "ride" | "transfer";
  from_name: string;
  to_name: string;
  duration_min: number;
  distance_m: number | null;
  line: string | null;
  line_color: string | null;
  stops: number | null;
  path: [number, number][] | null; // (lat, lon) in travel order
};

export type Itinerary = {
  total_min: number;
  transfers: number;
  walk_total_min: number;
  legs: Leg[];
};

export type RouteOption = {
  tags: string[]; // Ranking criteria assigned by the commute engine.
  best: boolean;
  itinerary: Itinerary;
};

/** One origin×destination cell; null when the pair is unroutable. */
export type CommuteCell = {
  transit_minutes: number | null;
  distance_km: number | null;
  summary: string | null;
  itinerary: Itinerary | null;
  route_options: RouteOption[] | null;
} | null;

export type CommuteMatrix = {
  departure: string;
  destinations: { name: string; lat: number; lon: number }[];
  origins: { id: string | null; results: CommuteCell[] }[];
};

export async function fetchCommute(
  origins: { id: string; lat: number; lon: number }[],
  destinations: { name: string; lat: number; lon: number }[],
  departure = "08:00:00",
): Promise<CommuteMatrix> {
  const res = await fetch("/api/commute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origins, destinations, departure }),
  });
  if (!res.ok) throw new Error(`commute failed: ${res.status}`);
  return res.json();
}

/** Building footprint expressed in metres relative to the requested window. */
export type Neighbour = {
  ring: [number, number][];
  height: number;
  ground: number;
};

export type Sunlight = {
  hours: number;
  segments: [number, number][]; // Lit intervals as minutes past midnight.
  samples: number[]; // Lit fraction at 10-minute intervals from 06:00 to 18:00.
  ground: number;
  window: { lat: number; lon: number };
  neighbours: Neighbour[] | null;
};

/** Fetch winter-solstice sunlight, or null when no seeded building contains the point. */
export async function fetchSunlight(
  lat: number,
  lon: number,
  opts: { floor?: number; facing?: number; withNeighbours?: boolean } = {},
): Promise<Sunlight | null> {
  const res = await fetch("/api/sunlight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat,
      lon,
      floor: opts.floor ?? 2,
      facing: opts.facing ?? 180,
      with_neighbours: opts.withNeighbours ?? false,
    }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sunlight failed: ${res.status}`);
  return res.json();
}

export type WalkHomePoi = {
  name: string | null;
  category: string;
  lat: number;
  lon: number;
  opening_hours: string | null;
};

export type WalkHomeLeg = {
  name: string | null;
  coords: [number, number][];
  distance_m: number;
  night_open_pois: WalkHomePoi[];
  lamp_count: number | null;
  lit_fraction: number | null;
};

export type WalkHome = {
  station: { name: string; lat: number; lon: number };
  distance_m: number;
  walk_min: number;
  route_coords: [number, number][];
  lamps: [number, number][];
  legs: WalkHomeLeg[];
};

/** Fetch the walk-home route, or null when the point has no coverage. */
export async function fetchWalkHome(lat: number, lon: number): Promise<WalkHome | null> {
  const res = await fetch("/api/walk-home", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lon }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`walk-home failed: ${res.status}`);
  return res.json();
}
