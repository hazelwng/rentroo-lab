import type { WalkHomePoi } from "@/lib/api";

const WEEKDAY_OFFSET = 2 * 24 * 60;

export const CATEGORY_LABELS: Record<string, string> = {
  convenience: "convenience",
  supermarket: "supermarket",
  restaurant_cafe: "food",
  bar_pub: "bar",
  police: "police box",
  pharmacy: "pharmacy",
};

export function formatArrival(minute: number): string {
  const clock = minute % (24 * 60);
  const h = String(Math.floor(clock / 60)).padStart(2, "0");
  const m = String(clock % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function openAt(poi: WalkHomePoi, arriveMinute: number): boolean | null {
  if (poi.open_intervals === null) return null;
  const minute = WEEKDAY_OFFSET + arriveMinute;
  return poi.open_intervals.some(([a, b]) => minute >= a && minute < b);
}

export function hoursLabel(poi: WalkHomePoi): string {
  if (poi.open_intervals === null) return "hours unknown";
  const merged: [number, number][] = [];
  for (const [a, b] of [...poi.open_intervals].sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const dayStart = WEEKDAY_OFFSET;
  const dayEnd = WEEKDAY_OFFSET + 24 * 60;
  if (merged.some(([a, b]) => a <= dayStart && b >= dayEnd)) return "24h";
  const today = merged.filter(([a]) => a >= dayStart && a < dayEnd);
  if (today.length === 0) return "closed today";
  return today.map(([a, b]) => `${formatArrival(a)}–${formatArrival(b)}`).join(", ");
}

export const poiKey = (leg: number, index: number) => `${leg}-${index}`;
