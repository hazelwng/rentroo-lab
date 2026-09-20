import { AttributionControl, Map as MapLibre, setWorkerUrl } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { mapStyle } from "./mapStyle";

/** Shared MapLibre setup. */

// Copied by copy-maplibre-worker.mjs.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export const LABELS_START = "road-name"; // insert our layers below labels

export function fc(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

export const EMPTY = fc([]);

/** A non-interactive map that only moves when we frame it. */
export function createMap(container: HTMLElement, center: [number, number], zoom: number) {
  const map = new MapLibre({
    container,
    style: mapStyle,
    center,
    zoom,
    attributionControl: false,
    fadeDuration: 0,
    scrollZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
    keyboard: false,
  });
  map.touchZoomRotate.disableRotation();
  const attribution = new AttributionControl({ compact: true });
  map.addControl(attribution, "top-right");
  // Prevent compact attribution from covering the corner.
  map.once("load", () =>
    attribution._container.classList.remove("maplibregl-compact-show"),
  );
  return map;
}

/** A square icon for symbol layers: `fill` with a 2px ink border. */
export function squareIcon(size: number, fill: string, border = "#1c1b18"): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = fill;
  ctx.fillRect(2, 2, size - 4, size - 4);
  return ctx.getImageData(0, 0, size, size);
}

/** Glyph rectangles on a 13×13 grid; a fifth value cuts into the fill. */
export type Glyph = ([number, number, number, number] | [number, number, number, number, 1])[];

/** Builds a 15×18 bottom-anchored pixel pin; `unit` scales each grid cell. */
export function pinIcon(
  glyph: Glyph,
  colors: { fill: string; border: string; glyph: string },
  unit: number,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 15 * unit;
  canvas.height = 18 * unit;
  const ctx = canvas.getContext("2d")!;
  const rect = (x: number, y: number, w: number, h: number) =>
    ctx.fillRect(x * unit, y * unit, w * unit, h * unit);
  ctx.fillStyle = colors.border;
  rect(0, 0, 15, 15);
  rect(5, 15, 5, 1);
  rect(6, 16, 3, 1);
  rect(7, 17, 1, 1);
  ctx.fillStyle = colors.fill;
  rect(1, 1, 13, 13);
  for (const [x, y, w, h, cut] of glyph) {
    ctx.fillStyle = cut ? colors.fill : colors.glyph;
    rect(x + 1, y + 1, w, h);
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
