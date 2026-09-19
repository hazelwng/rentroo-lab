"use client";

import { useEffect, useState } from "react";
import { WalkHomeMap } from "@/components/walkhome/WalkHomeMap";
import {
  CATEGORY_LABELS,
  formatArrival,
  hoursLabel,
  openAt,
  poiKey,
} from "@/components/walkhome/walkHomePresentation";
import { fetchWalkHome, WalkHome, WalkHomePoi } from "@/lib/api";
import { Listing } from "@/lib/listings";

const ARRIVE_MIN = 18 * 60;
const ARRIVE_MAX = 26 * 60;
const ARRIVE_STEP = 30;
const ARRIVE_DEFAULT = 20 * 60;

function StationIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <rect x="2" y="1" width="9" height="8" fill="currentColor" />
      <rect x="4" y="3" width="2" height="2" fill="#ffffff" />
      <rect x="7" y="3" width="2" height="2" fill="#ffffff" />
      <rect x="3" y="10" width="2" height="2" fill="currentColor" />
      <rect x="8" y="10" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <path d="M6.5 1 L12 6 H10 V12 H3 V6 H1 Z" fill="currentColor" />
      <rect x="5.5" y="8" width="2" height="4" fill="#ffffff" />
    </svg>
  );
}

function legSummary(pois: WalkHomePoi[], arriveMinute: number): string | null {
  const open = pois.filter((poi) => openAt(poi, arriveMinute) === true);
  if (open.length === 0) return null;
  const byCategory = new Map<string, number>();
  for (const poi of open) {
    const label = CATEGORY_LABELS[poi.category] ?? poi.category;
    byCategory.set(label, (byCategory.get(label) ?? 0) + 1);
  }
  const parts = [...byCategory.entries()].map(([label, n]) => `${n} ${label}`);
  return `${open.length} open · ${parts.join(" · ")}`;
}

function LegRow({
  index,
  leg,
  arriveMinute,
  highlighted,
  onHover,
  onHoverPoi,
  showAll,
}: {
  index: number;
  leg: WalkHome["legs"][number];
  arriveMinute: number;
  highlighted: boolean;
  onHover: (index: number | null) => void;
  onHoverPoi: (key: string | null) => void;
  showAll: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = legSummary(leg.pois, arriveMinute);
  const pois = leg.pois
    .map((poi, i) => ({ poi, key: poiKey(index, i), open: openAt(poi, arriveMinute) }))
    .filter(({ open }) => showAll || open === true);

  return (
    <div
      className={`border-2 ${highlighted ? "border-ink" : "border-per-200"} bg-paper`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        className="flex w-full items-baseline gap-3 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="label-mono text-per-300">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className={`label-mono ${leg.name ? "text-per-700" : "text-per-500"}`}>
          {leg.name ?? "unnamed street"}
        </span>
        <span className="label-mono ml-auto text-per-500">{leg.distance_m} m</span>
        {pois.length > 0 && (
          <span className="label-mono text-per-300">{expanded ? "▲" : "▼"}</span>
        )}
      </button>
      <div className="px-3 pb-2">
        {summary ? (
          <div className="label-mono text-per-700">{summary}</div>
        ) : (
          <div className="label-mono text-per-300">
            No mapped places open at {formatArrival(arriveMinute)}
          </div>
        )}
        {expanded && pois.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 border-t border-per-200 pt-2">
            {pois.map(({ poi, key, open }) => (
              <li
                key={key}
                className="-mx-1 flex items-baseline gap-2 px-1 text-sm hover:bg-per-100"
                onMouseEnter={() => onHoverPoi(key)}
                onMouseLeave={() => onHoverPoi(null)}
              >
                <span
                  className={
                    open === true
                      ? "text-ink"
                      : open === false
                        ? "text-per-300 line-through"
                        : "text-per-500"
                  }
                >
                  {poi.name ?? <span className="text-per-300">unnamed</span>}
                </span>
                <span className="label-mono text-per-300">
                  {CATEGORY_LABELS[poi.category] ?? poi.category}
                </span>
                <span className="label-mono ml-auto text-per-300">
                  {hoursLabel(poi)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function WalkHomeCard({ listing }: { listing: Listing | null }) {
  const selected =
    listing && listing.lat != null && listing.lon != null ? listing : null;
  const [walkHome, setWalkHome] = useState<WalkHome | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [arriveMinute, setArriveMinute] = useState(ARRIVE_DEFAULT);
  const [highlightLeg, setHighlightLeg] = useState<number | null>(null);
  const [highlightPoi, setHighlightPoi] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const stored = Number(localStorage.getItem("rentroo.arriveAt"));
    if (stored >= ARRIVE_MIN && stored <= ARRIVE_MAX && stored % ARRIVE_STEP === 0) {
      setArriveMinute(stored);
    }
  }, []);

  function changeArrival(delta: number) {
    setArriveMinute((minute) => {
      const next = Math.min(ARRIVE_MAX, Math.max(ARRIVE_MIN, minute + delta));
      localStorage.setItem("rentroo.arriveAt", String(next));
      return next;
    });
  }

  useEffect(() => {
    if (!selected) {
      setWalkHome(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetchWalkHome(selected.lat!, selected.lon!)
      .then((r) => {
        if (cancelled) return;
        setWalkHome(r);
        setStatus("done");
      })
      .catch(() => {
        if (cancelled) return;
        setWalkHome(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.lat, selected?.lon]);

  const openCount =
    walkHome?.legs.reduce(
      (count, leg) =>
        count + leg.pois.filter((poi) => openAt(poi, arriveMinute) === true).length,
      0,
    ) ?? 0;

  return (
    <section className="border-2 border-ink bg-paper">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-per-200 px-4 py-3">
        <h2 className="label-mono text-per-700">Walk home</h2>
        {walkHome && (
          <>
            <span
              className="label-mono flex items-center gap-2 text-per-700"
              title="Nearest station, picked automatically"
            >
              <StationIcon />
              {walkHome.station.name}
              <span className="text-per-300">→</span>
              <HomeIcon />
              home
            </span>
            <span className="label-mono text-per-500">
              {walkHome.distance_m} m · {walkHome.walk_min} min ·{" "}
              {walkHome.legs.length} streets
            </span>
            <span className="label-mono ml-auto flex items-center gap-2 text-per-500">
              You arrive at
              <button
                type="button"
                aria-label="Arrive 30 minutes earlier"
                className="border-2 border-ink px-1.5 text-ink hover:bg-ink hover:text-paper disabled:border-per-200 disabled:text-per-300"
                disabled={arriveMinute <= ARRIVE_MIN}
                onClick={() => changeArrival(-ARRIVE_STEP)}
              >
                −
              </button>
              <span className="font-mono text-sm font-bold text-ink">
                {formatArrival(arriveMinute)}
              </span>
              <button
                type="button"
                aria-label="Arrive 30 minutes later"
                className="border-2 border-ink px-1.5 text-ink hover:bg-ink hover:text-paper disabled:border-per-200 disabled:text-per-300"
                disabled={arriveMinute >= ARRIVE_MAX}
                onClick={() => changeArrival(ARRIVE_STEP)}
              >
                +
              </button>
            </span>
          </>
        )}
      </div>

      <div className="px-4 py-4">
        {!selected ? (
          <p className="label-mono py-10 text-center text-per-500">
            Add a listing to see the walk home.
          </p>
        ) : status === "loading" ? (
          <p className="label-mono py-10 text-center text-per-500">Computing…</p>
        ) : status === "error" ? (
          <p className="label-mono py-10 text-center text-per-500">
            Walk-home service unavailable
          </p>
        ) : walkHome === null ? (
          <div className="py-10 text-center">
            <p className="label-mono text-per-700">
              No walk-home coverage for this area yet
            </p>
            <p className="label-mono mt-1 text-per-500">
              Needs a station within 2 km and seeded street data (Meguro-ku only
              for now)
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <WalkHomeMap
                className="h-[380px]"
                walkHome={walkHome}
                arriveMinute={arriveMinute}
                highlightLeg={highlightLeg}
                highlightPoi={highlightPoi}
                onHoverLeg={setHighlightLeg}
                showAll={showAll}
                onShowAllChange={setShowAll}
                home={{
                  lat: selected.lat!,
                  lon: selected.lon!,
                  name: selected.label || selected.address,
                }}
              />
              <div className="flex flex-col gap-3 lg:h-[380px]">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-4xl font-bold">{openCount}</span>
                  <span className="label-mono text-per-700">
                    mapped places open at {formatArrival(arriveMinute)}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                  {walkHome.legs.map((leg, index) => (
                    <LegRow
                      key={index}
                      index={index}
                      leg={leg}
                      arriveMinute={arriveMinute}
                      highlighted={highlightLeg === index}
                      onHover={setHighlightLeg}
                      onHoverPoi={setHighlightPoi}
                      showAll={showAll}
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="label-mono mt-3 text-per-500">
              {walkHome.lamps.length} mapped lamps shown on the map · lamp data
              is patchy, for context only
            </p>
            <p className="label-mono mt-1 text-right text-[10px] text-per-300">
              OpenStreetMap coverage is partial · absence of mapped data does
              not mean absence
            </p>
          </>
        )}
      </div>
    </section>
  );
}
