"use client";

import { DAY_START, DAY_END, formatTime } from "@/lib/sun";

/** Time slider with direct-sun intervals. */
export function Timeline({
  segments,
  value,
  onChange,
}: {
  segments: [number, number][] | null;
  value: number;
  onChange: (minutes: number) => void;
}) {
  const span = DAY_END - DAY_START;
  const lit = segments?.some(([a, b]) => value >= a && value < b) ?? false;

  return (
    <div>
      <div className="relative h-3.5 border-2 border-per-200 bg-per-100">
        {(segments ?? []).map(([a, b], i) => (
          <div
            key={i}
            className="absolute inset-y-0 bg-sun"
            style={{
              left: `${((a - DAY_START) / span) * 100}%`,
              width: `${((b - a) / span) * 100}%`,
            }}
          />
        ))}
      </div>
      <input
        type="range"
        className="timeline-range"
        min={DAY_START}
        max={DAY_END}
        step={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Time of day"
      />
      <div className="label-mono flex justify-between text-per-500">
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
      </div>
      <div className="mt-1 font-mono text-sm">
        At {formatTime(value)} this window is in{" "}
        {lit ? (
          <span className="font-semibold text-sun">direct sun ☀</span>
        ) : (
          <span className="text-per-500">shade</span>
        )}
      </div>
    </div>
  );
}
