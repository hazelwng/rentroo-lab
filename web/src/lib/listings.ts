/** Listing store, V1: localStorage only, no accounts. */

export type Listing = {
  id: string;
  address: string;
  label?: string;
  lat?: number;
  lon?: number;
  floor?: number; // 1 = ground floor
  facing?: number; // degrees clockwise from north; 180 = south
};

const KEY = "rentroo.listings";

// Seed demos once; an explicitly empty list stays empty.
export const DEMO_LISTINGS: Listing[] = [
  {
    id: "demo-meguro-1",
    address: "目黒区目黒一丁目",
    lat: 35.636618,
    lon: 139.709809,
    floor: 2,
    facing: 180,
  },
  {
    id: "demo-kamimeguro-2",
    address: "目黒区上目黒二丁目",
    lat: 35.642577,
    lon: 139.698039,
    floor: 2,
    facing: 180,
  },
  {
    id: "demo-jiyugaoka-3",
    address: "目黒区自由が丘三丁目",
    lat: 35.609785,
    lon: 139.665193,
    floor: 2,
    facing: 0,
  },
];

export function loadListings(): Listing[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) {
      saveListings(DEMO_LISTINGS);
      return DEMO_LISTINGS;
    }
    return JSON.parse(raw) as Listing[];
  } catch {
    return [];
  }
}

export function saveListings(listings: Listing[]): void {
  localStorage.setItem(KEY, JSON.stringify(listings));
}
