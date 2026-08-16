"use client";

import type { Leg } from "@/lib/api";

/**
 * Self-labeling journey strip: one row = one door-to-door route.
 *
 * Rows rendered with the same `scale` share a time axis (longest journey =
 * full width) so strip lengths compare across rows. Walks render as dotted
 * segments with a walk glyph and minutes; rides as square-cornered blocks in
 * the line's official color with per-leg minutes inside; back-to-back rides
 * get a transfer node square.
 */

export function legsSum(legs: Leg[]): number {
  return legs.reduce((min, leg) => min + leg.duration_min, 0);
}

/** Dark text on light line colors (e.g. 日比谷線 silver), white on the rest. */
export function textOn(hex?: string | null): { color: string; needsBorder: boolean } {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return { color: "#FFFFFF", needsBorder: false };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 160
    ? { color: "#1C1B18", needsBorder: true }
    : { color: "#FFFFFF", needsBorder: false };
}

function WalkGlyph({ className }: { className?: string }) {
  return (
    <svg width="8" height="11" viewBox="0 0 16 22" fill="none" className={className}>
      <circle cx="9" cy="3.2" r="2.1" fill="currentColor" />
      <path
        d="M9 6 L6 12 M9 6 L12.5 9.5 L15 8.5 M6 12 L4 11 M9 8.5 L9 13 L6.5 20 M9 13 L11.5 19.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function HomeGlyph() {
  // solid pixel house; the doorway is punched out in the page background
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className="text-per-500"
      fill="currentColor"
    >
      <rect x="5" y="1" width="2" height="1" />
      <rect x="4" y="2" width="4" height="1" />
      <rect x="3" y="3" width="6" height="1" />
      <rect x="2" y="4" width="8" height="1" />
      <rect x="3" y="5" width="6" height="6" />
      <rect x="5" y="8" width="2" height="3" fill="var(--color-paper)" />
    </svg>
  );
}

function BuildingGlyph() {
  // solid pixel office tower with punched-out windows
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className="text-per-500"
      fill="currentColor"
    >
      <rect x="3" y="1" width="6" height="10" />
      <rect x="4" y="2.5" width="1" height="1" fill="var(--color-paper)" />
      <rect x="7" y="2.5" width="1" height="1" fill="var(--color-paper)" />
      <rect x="4" y="4.5" width="1" height="1" fill="var(--color-paper)" />
      <rect x="7" y="4.5" width="1" height="1" fill="var(--color-paper)" />
      <rect x="4" y="6.5" width="1" height="1" fill="var(--color-paper)" />
      <rect x="7" y="6.5" width="1" height="1" fill="var(--color-paper)" />
      <rect x="5.5" y="9" width="1" height="2" fill="var(--color-paper)" />
    </svg>
  );
}

export function JourneyStrip({
  legs,
  scale,
  maskColor = "var(--color-paper)",
  stationLabels = false,
}: {
  legs: Leg[];
  scale: number;
  /** Background behind the strip — walk-minute labels mask the dotted line with it. */
  maskColor?: string;
  /** Label each ride block with its "board → alight" stations. */
  stationLabels?: boolean;
}) {
  const total = legsSum(legs);
  const cells: React.ReactNode[] = [];

  legs.forEach((leg, i) => {
    if (leg.kind === "ride") {
      // Trip change without a platform walk: mark it with a node square
      if (i > 0 && legs[i - 1].kind === "ride") {
        cells.push(
          <div
            key={`node-${i}`}
            className={`z-[3] -mx-1.5 box-border h-3 w-3 flex-none border-2 border-paper bg-ink ${
              stationLabels ? "mt-[5px]" : ""
            }`}
          />,
        );
      }
      const { color, needsBorder } = textOn(leg.line_color);
      const title = `${leg.line} · ${leg.from_name} → ${leg.to_name} · ${leg.duration_min} min`;
      // flex-basis auto: the label is the width floor, so short rides never
      // clip; leftover row space is still shared out by duration.
      const block = (
        <div
          key={stationLabels ? undefined : i}
          title={stationLabels ? undefined : title}
          className="flex h-[22px] min-w-0 items-center justify-center overflow-hidden whitespace-nowrap px-1.5 font-mono text-[11px] font-semibold"
          style={{
            flex: stationLabels ? undefined : `${leg.duration_min} 0 auto`,
            background: leg.line_color || "#737373",
            color,
            boxShadow: needsBorder ? "inset 0 0 0 1px rgba(0,0,0,.18)" : undefined,
          }}
        >
          {leg.line} {leg.duration_min}
        </div>
      );
      if (stationLabels) {
        const label = `${leg.from_name} → ${leg.to_name}`;
        // The label is absolutely positioned so only the block's own no-wrap
        // text sets the cell's minimum width: "丸ノ内線 5" never clips, while
        // a long station label truncates to whatever width the leg earned.
        cells.push(
          <div
            key={i}
            title={title}
            className="relative flex flex-col pb-[15px]"
            style={{ flex: `${leg.duration_min} 1 0px` }}
          >
            {block}
            <div className="absolute inset-x-0 top-[26px] truncate text-center text-[9.5px] font-medium leading-none text-neutral-500">
              {label}
            </div>
          </div>,
        );
      } else {
        cells.push(block);
      }
    } else {
      // walk or platform transfer: dotted line with a walk glyph + minutes
      cells.push(
        <div
          key={i}
          title={
            leg.kind === "transfer"
              ? `Transfer at ${leg.from_name} · ${leg.duration_min} min walk`
              : `Walk ${leg.duration_min} min`
          }
          className={`relative flex min-w-[30px] items-center justify-center ${
            stationLabels ? "h-[22px]" : "h-4"
          }`}
          style={{ flex: `${leg.duration_min} 1 0px` }}
        >
          <div className="absolute inset-x-0 top-1/2 border-t-[1.5px] border-dotted border-neutral-400" />
          <div
            className="relative z-[1] inline-flex items-center gap-0.5 px-0.5 font-mono text-[9px] font-semibold text-neutral-500"
            style={{ background: maskColor }}
          >
            <WalkGlyph className="text-neutral-500" />
            {leg.duration_min}
          </div>
        </div>,
      );
    }
  });

  // The trailing spacer absorbs (scale - total) of the row, so strip lengths
  // stay comparable across rows even though ride blocks have content-width
  // floors. With station labels the ride cells grow a second line, so the row
  // top-aligns everything to a shared 22px track instead of center-aligning.
  const align = stationLabels ? "items-start" : "items-center";
  const glyphBox = stationLabels ? "flex h-[22px] items-center" : "leading-none";

  return (
    <div className={`flex ${align} ${stationLabels ? "" : "h-[32px]"}`}>
      <div className={`mr-1.5 flex-none ${glyphBox}`}>
        <HomeGlyph />
      </div>
      <div className={`flex min-w-0 ${align}`} style={{ flex: `${total} 1 0px` }}>
        {cells}
      </div>
      <div className={`ml-1.5 flex-none ${glyphBox}`}>
        <BuildingGlyph />
      </div>
      <div style={{ flex: `${Math.max(scale - total, 0)} 0 0px` }} />
    </div>
  );
}
