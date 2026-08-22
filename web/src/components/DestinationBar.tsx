"use client";

import { useState } from "react";
import { SuggestInput } from "@/components/SuggestInput";
import { MAX_DESTINATIONS, useDestinations } from "@/lib/destinations";

/** Commute destinations shared by every listing. */
export function DestinationBar() {
  const [destinations, update] = useDestinations();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  if (destinations === null) return null;

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {destinations.map((destination) => (
        <span
          key={destination.id}
          className="label-mono flex items-center gap-1.5 border-2 border-per-300 bg-per-100 py-1 pl-2 pr-1 text-per-700"
        >
          {destination.name}
          <button
            type="button"
            aria-label={`Remove destination ${destination.name}`}
            className="px-1 text-per-500 hover:text-ink"
            onClick={() => update(destinations.filter((a) => a.id !== destination.id))}
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        // Suggestion picks run before blur closes the field.
        <div
          className="w-64"
          onBlur={() => {
            setAdding(false);
            setValue("");
          }}
        >
          <SuggestInput
            autoFocus
            value={value}
            onValueChange={setValue}
            onPick={(s) => {
              update([
                ...destinations,
                { id: crypto.randomUUID(), name: s.display_name, lat: s.lat, lon: s.lon },
              ]);
              setValue("");
              setAdding(false);
            }}
            placeholder="Office / Gym / Daycare..."
          />
        </div>
      ) : (
        destinations.length < MAX_DESTINATIONS && (
          <button
            type="button"
            className="label-mono border-2 border-per-300 bg-paper px-2 py-1 text-per-500 hover:border-ink hover:text-ink"
            onClick={() => setAdding(true)}
          >
            + Destination
          </button>
        )
      )}
    </div>
  );
}
