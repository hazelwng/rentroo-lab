"use client";

import type { Itinerary, RouteOption } from "@/lib/api";
import { JourneyStrip, legsSum } from "@/components/commute/JourneyStrip";

/** Sorted route alternatives on a shared time scale. */

export type RouteSort = "time" | "transfers" | "walk";

const SORT_KEY: Record<RouteSort, (i: Itinerary) => number> = {
  time: (i) => i.total_min,
  transfers: (i) => i.transfers,
  walk: (i) => i.walk_total_min,
};

export function sortOptions(options: RouteOption[], sort: RouteSort): RouteOption[] {
  return [...options].sort(
    (a, b) =>
      SORT_KEY[sort](a.itinerary) - SORT_KEY[sort](b.itinerary) ||
      a.itinerary.total_min - b.itinerary.total_min,
  );
}

export function CommuteRoutes({
  options,
  sort = "time",
  maskColor,
  selected,
  onSelect,
}: {
  options: RouteOption[];
  sort?: RouteSort;
  maskColor?: string;
  selected?: RouteOption | null;
  onSelect?: (option: RouteOption) => void;
}) {
  if (!options.length) return null;
  const scale = Math.max(...options.map((o) => legsSum(o.itinerary.legs))) + 2;
  const sorted = sortOptions(options, sort);

  return (
    <div>
      {sorted.map((option, i) => (
        <div
          key={i}
          className={`grid grid-cols-[1fr_130px] items-center gap-4 py-2.5 ${
            onSelect ? "cursor-pointer" : ""
          } ${selected === option ? "" : onSelect ? "opacity-60 hover:opacity-100" : ""}`}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          aria-pressed={onSelect ? selected === option : undefined}
          onClick={() => onSelect?.(option)}
          onKeyDown={(event) => {
            if (onSelect && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onSelect(option);
            }
          }}
        >
          <div className="min-w-0">
            <JourneyStrip
              legs={option.itinerary.legs}
              scale={scale}
              maskColor={maskColor}
              stationLabels
            />
          </div>

          <div className="text-right font-mono">
            <div className="whitespace-nowrap">
              <span className="text-[20px] font-semibold text-ink">
                {option.itinerary.total_min}
              </span>
              <span className="ml-1 text-xs text-neutral-500">min</span>
            </div>
            <div className="mt-0.5 whitespace-nowrap text-[10px] text-neutral-500">
              乗換{option.itinerary.transfers} · 徒歩{option.itinerary.walk_total_min}分
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
