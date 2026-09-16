"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSONSource, Map as MapLibre } from "maplibre-gl";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Neighbour } from "@/lib/api";
import { findHome } from "@/lib/buildingGeometry";
import { createMap, EMPTY, fc, LABELS_START } from "@/lib/createMap";
import { shadowPolygons } from "@/lib/shadows";
import type { Bounds } from "@/lib/shadows";
import { sunPosition } from "@/lib/sun";

/** MapLibre top view with buildings, shadows, and markers. */

const HALF_WIDTH = 150; // metres
const VIEWPORT_PADDING = 5; // keep shadows touching the visible edge
const M_PER_DEG_LAT = 111_320;
const SUN_MARKER_M = 135;

const COLOR_BUILDING = "#c3c3e8";
const COLOR_HOME = "#5c5ca6";
const COLOR_SHADOW = "#33336b";
const COLOR_SUN = "#ef9f27";

type Ring = [number, number][];

function toLonLat(lat: number, lon: number): (p: [number, number]) => [number, number] {
  const mLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return ([x, y]) => [lon + x / mLon, lat + y / M_PER_DEG_LAT];
}

function square(cx: number, cy: number, half: number): Ring {
  return [
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
    [cx - half, cy - half],
  ];
}

const closed = (ring: Ring): Ring => (ring.length ? [...ring, ring[0]] : ring);

function shadowViewport(el: HTMLElement): Bounds | null {
  if (!el.clientWidth || !el.clientHeight) return null;
  const halfHeight = HALF_WIDTH / (el.clientWidth / el.clientHeight);
  return {
    minX: -HALF_WIDTH - VIEWPORT_PADDING,
    minY: -halfHeight - VIEWPORT_PADDING,
    maxX: HALF_WIDTH + VIEWPORT_PADDING,
    maxY: halfHeight + VIEWPORT_PADDING,
  };
}

function sameBounds(a: Bounds | null, b: Bounds): boolean {
  return (
    a?.minX === b.minX &&
    a.minY === b.minY &&
    a.maxX === b.maxX &&
    a.maxY === b.maxY
  );
}

function frame(map: MapLibre, lat: number, lon: number) {
  const el = map.getContainer();
  if (!el.clientWidth || !el.clientHeight) return;
  const aspect = el.clientWidth / el.clientHeight;
  const dLat = HALF_WIDTH / aspect / M_PER_DEG_LAT;
  const dLon = HALF_WIDTH / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  map.fitBounds(
    [
      [lon - dLon, lat - dLat],
      [lon + dLon, lat + dLat],
    ],
    { padding: 0, linear: true, animate: false },
  );
}

function addLayers(map: MapLibre) {
  for (const id of ["shadows", "buildings", "home", "markers"]) {
    map.addSource(id, { type: "geojson", data: EMPTY });
  }
  // Layer opacity keeps overlapping shadow parts uniform.
  map.addLayer(
    {
      id: "shadows",
      type: "fill-extrusion",
      source: "shadows",
      paint: {
        "fill-extrusion-color": COLOR_SHADOW,
        "fill-extrusion-height": 0.05,
        "fill-extrusion-opacity": 0.28,
      },
    },
    LABELS_START,
  );
  // Avoid perspective walls away from centre.
  map.addLayer(
    {
      id: "buildings",
      type: "fill",
      source: "buildings",
      paint: { "fill-color": COLOR_BUILDING },
    },
    LABELS_START,
  );
  map.addLayer(
    {
      id: "home",
      type: "fill",
      source: "home",
      paint: { "fill-color": COLOR_HOME },
    },
    LABELS_START,
  );
  map.addLayer(
    {
      id: "home-outline",
      type: "line",
      source: "home",
      paint: { "line-color": COLOR_SUN, "line-width": 3 },
    },
    LABELS_START,
  );
  map.addLayer(
    {
      id: "markers",
      type: "fill",
      source: "markers",
      paint: { "fill-color": COLOR_SUN },
    },
    LABELS_START,
  );
  map.addLayer(
    {
      id: "marker-lines",
      type: "line",
      source: "markers",
      filter: ["==", "$type", "LineString"],
      paint: { "line-color": COLOR_SUN, "line-width": 2 },
    },
    LABELS_START,
  );
}

export function TopMap({
  neighbours,
  ground,
  lat,
  lon,
  facing,
  timeMin,
  onBusy,
}: {
  neighbours: Neighbour[];
  ground: number;
  lat: number; // neighbour origin
  lon: number;
  facing: number;
  timeMin: number;
  onBusy?: (busy: boolean) => void; // tiles loading
}) {
  const container = useRef<HTMLDivElement>(null);
  const busy = useRef(onBusy);
  busy.current = onBusy;
  const mapRef = useRef<MapLibre | null>(null);
  const ready = useRef(false);
  const [viewport, setViewport] = useState<Bounds | null>(null);
  const view = useRef({ lat, lon });
  view.current = { lat, lon };

  const project = useMemo(() => toLonLat(lat, lon), [lat, lon]);

  const home = useMemo(() => findHome(neighbours, facing), [neighbours, facing]);

  const buildingsData = useMemo(() => {
    const feature = (b: Neighbour): Feature<Polygon> => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [closed(b.ring).map(project)] },
    });
    return {
      others: fc(neighbours.filter((b) => b !== home).map(feature)),
      home: fc(home ? [feature(home)] : []),
    };
  }, [neighbours, home, project]);

  const shadowsData = useMemo(() => {
    const polys = shadowPolygons(
      neighbours,
      ground,
      lat,
      lon,
      timeMin,
      viewport ?? undefined,
    );
    const features: Feature<MultiPolygon>[] = polys.map((parts) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: parts.map((r) => [closed(r).map(project)]) },
    }));
    return fc(features);
  }, [neighbours, ground, lat, lon, timeMin, viewport, project]);

  const markersData = useMemo(() => {
    const fr = (facing * Math.PI) / 180;
    const features: Feature[] = [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [square(0, 0, 1.6).map(project)] },
      },
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [project([0, 0]), project([Math.sin(fr) * 6, Math.cos(fr) * 6])],
        },
      },
    ];
    const { altitude, azimuth } = sunPosition(lat, lon, timeMin);
    if (altitude > 0.5) {
      const sr = (azimuth * Math.PI) / 180;
      features.push({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            square(Math.sin(sr) * SUN_MARKER_M, Math.cos(sr) * SUN_MARKER_M, 3).map(project),
          ],
        },
      });
    }
    return fc(features);
  }, [facing, lat, lon, timeMin, project]);

  useEffect(() => {
    if (!container.current) return;
    const map = createMap(container.current, [view.current.lon, view.current.lat], 16);
    mapRef.current = map;
    const refit = () => {
      frame(map, view.current.lat, view.current.lon);
      const next = shadowViewport(map.getContainer());
      if (next) setViewport((current) => (sameBounds(current, next) ? current : next));
    };
    map.on("resize", refit);
    map.on("dataloading", () => busy.current?.(true));
    map.on("idle", () => busy.current?.(false));
    map.on("load", () => {
      addLayers(map);
      ready.current = true;
      refit();
      setAllSources(map);
    });
    return () => {
      ready.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Keep the map instance across prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = useRef({ buildingsData, shadowsData, markersData });
  latest.current = { buildingsData, shadowsData, markersData };
  function setAllSources(map: MapLibre) {
    const d = latest.current;
    (map.getSource("buildings") as GeoJSONSource).setData(d.buildingsData.others);
    (map.getSource("home") as GeoJSONSource).setData(d.buildingsData.home);
    (map.getSource("shadows") as GeoJSONSource).setData(d.shadowsData);
    (map.getSource("markers") as GeoJSONSource).setData(d.markersData);
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    (map.getSource("buildings") as GeoJSONSource).setData(buildingsData.others);
    (map.getSource("home") as GeoJSONSource).setData(buildingsData.home);
  }, [buildingsData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    (map.getSource("shadows") as GeoJSONSource).setData(shadowsData);
  }, [shadowsData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    (map.getSource("markers") as GeoJSONSource).setData(markersData);
  }, [markersData]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current) frame(map, lat, lon);
  }, [lat, lon]);

  // Isolate MapLibre's position override.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
