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
