"use client";

import { DestinationBar } from "@/components/DestinationBar";
import { SunBlocks } from "@/components/sunlight/SunBlocks";
import { CommuteCell } from "@/lib/api";
import { Destination } from "@/lib/destinations";
import { Listing } from "@/lib/listings";
import { useSunlight } from "@/lib/useSunlight";

/** Listing comparison table. */

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

export function CompareTable({
  listings,
  destinations,
  cells,
  error,
  onOpen,
}: {
  listings: Listing[];
  destinations: Destination[] | null;
  cells: Record<string, CommuteCell[]>;
  error: boolean;
  onOpen: (id: string) => void;
}) {
  const headers = destinations?.length
    ? destinations.map((a) => a.name)
    : ["Commute"];
  // Show addresses when labels are present.
  const labelled = listings.some((l) => l.label);
  const template = `minmax(0,2fr) ${labelled ? "minmax(0,3fr) " : ""}repeat(${headers.length}, 90px) 130px`;

  function commuteCell(listing: Listing, col: number) {
    if (listing.lat == null || !destinations?.length)
      return <span className="text-per-300">—</span>;
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
    <section className="border-2 border-ink bg-paper">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-per-200 px-4 py-3">
        <h2 className="label-mono text-per-700">Compare</h2>
        <DestinationBar />
      </div>

      <div
        className="grid border-b-2 border-per-200"
        style={{ gridTemplateColumns: template }}
      >
        {[
          "Listing",
          ...(labelled ? ["Address"] : []),
          ...headers,
          "Winter sun",
        ].map((h, i) => (
          <div
            key={i}
            className="label-mono truncate px-3 py-2 text-per-500"
            title={h}
          >
            {h}
          </div>
        ))}
      </div>

      {listings.length === 0 ? (
        <p className="px-3 py-10 text-center text-sm text-per-500">
          No listings yet. Add one from the tabs above.
        </p>
      ) : (
        listings.map((listing) => (
          <div
            key={listing.id}
            role="button"
            tabIndex={0}
            className="grid cursor-pointer items-center border-b-2 border-per-100 last:border-b-0 hover:bg-per-50"
            style={{ gridTemplateColumns: template }}
            onClick={() => onOpen(listing.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(listing.id);
              }
            }}
          >
            <div className="truncate px-3 py-2.5 text-sm font-medium">
              {listing.label || listing.address}
            </div>
            {labelled && (
              <div className="truncate px-3 py-2.5 text-sm text-per-500">
                {listing.label ? listing.address : "—"}
              </div>
            )}
            {headers.map((_, col) => (
              <div key={col} className="px-3 py-2.5 font-mono text-sm">
                {commuteCell(listing, col)}
              </div>
            ))}
            <div className="px-3 py-2.5 font-mono text-sm">
              <SunCell listing={listing} />
            </div>
          </div>
        ))
      )}

      {error && (
        <p className="label-mono px-4 py-2 text-per-500">
          Commute service unavailable
        </p>
      )}
    </section>
  );
}
