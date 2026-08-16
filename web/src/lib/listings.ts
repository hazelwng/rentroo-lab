/** Listing store, V1: localStorage only, no accounts. */

export type Listing = {
  id: string;
  address: string;
  label?: string;
  lat?: number;
  lon?: number;
};

const KEY = "rentroo.listings";

export function loadListings(): Listing[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Listing[]) : [];
  } catch {
    return [];
  }
}

export function saveListings(listings: Listing[]): void {
  localStorage.setItem(KEY, JSON.stringify(listings));
}
