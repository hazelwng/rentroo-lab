/** Client for the rentroo API. Same-origin only: next.config.ts rewrites
 *  /api/* to the backend. Types mirror backend/rentroo/api/schemas.py. */

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
};

export type Itinerary = {
  total_min: number;
  transfers: number;
  walk_total_min: number;
  legs: Leg[];
};

export type RouteOption = {
  tags: string[]; // "fastest" | "fewest_transfers" | "least_walking"
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
