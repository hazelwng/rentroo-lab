"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSONSource, LngLatBounds, Map as MapLibre } from "maplibre-gl";
import type { Feature, LineString, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Leg, RouteOption } from "@/lib/api";
import { createMap, EMPTY, fc, LABELS_START, squareIcon } from "@/lib/createMap";

/** Selected route with faint alternatives. */

const COLOR_ALT = "#c3c3e8";
const COLOR_WALK = "#5c5ca6";
const COLOR_INK = "#1c1b18";
const COLOR_SUN = "#ef9f27";
const COLOR_PAPER = "#ffffff";
const FALLBACK_LINE = "#5c5ca6";

const lngLat = ([lat, lon]: [number, number]): [number, number] => [lon, lat];

function legFeature(leg: Leg, option: number, selected: boolean): Feature<LineString> | null {
  if (!leg.path || leg.path.length < 2) return null;
  return {
    type: "Feature",
    properties: {
      option,
      selected,
      kind: leg.kind,
      color: leg.line_color ?? FALLBACK_LINE,
      line: leg.line ?? "",
    },
    geometry: { type: "LineString", coordinates: leg.path.map(lngLat) },
  };
}

function point(p: [number, number], properties: Record<string, unknown>): Feature<Point> {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates: lngLat(p) } };
}

function addLayers(map: MapLibre) {
  map.addImage("station", squareIcon(10, COLOR_PAPER), { pixelRatio: 1 });
  map.addImage("origin", squareIcon(16, COLOR_SUN), { pixelRatio: 1 });
  map.addImage("destination", squareIcon(16, COLOR_INK), { pixelRatio: 1 });
  for (const id of ["legs", "stops"]) map.addSource(id, { type: "geojson", data: EMPTY });

  map.addLayer(
    {
      id: "legs-alt",
      type: "line",
      source: "legs",
      filter: ["!", ["get", "selected"]],
      layout: { "line-join": "round", "line-cap": "square" },
      paint: { "line-color": COLOR_ALT, "line-width": 4 },
    },
    LABELS_START,
  );
  map.addLayer(
    {
      id: "legs-walk",
      type: "line",
      source: "legs",
      filter: ["all", ["get", "selected"], ["!=", ["get", "kind"], "ride"]],
      layout: { "line-cap": "square" },
      paint: { "line-color": COLOR_WALK, "line-width": 3, "line-dasharray": [1.5, 1.5] },
    },
    LABELS_START,
  );
  map.addLayer(
    {
      id: "legs-ride",
      type: "line",
      source: "legs",
      filter: ["all", ["get", "selected"], ["==", ["get", "kind"], "ride"]],
      layout: { "line-join": "round", "line-cap": "square" },
      paint: { "line-color": ["get", "color"], "line-width": 6 },
    },
    LABELS_START,
  );
  // Keep markers above basemap labels.
  map.addLayer({
    id: "legs-name",
    type: "symbol",
    source: "legs",
    filter: ["all", ["get", "selected"], ["==", ["get", "kind"], "ride"]],
    layout: {
      "symbol-placement": "line",
      "text-field": ["get", "line"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
      "text-offset": [0, -1.1],
      "text-letter-spacing": 0.05,
    },
    paint: {
      "text-color": ["get", "color"],
      "text-halo-color": COLOR_PAPER,
      "text-halo-width": 1.5,
    },
  });
  map.addLayer({
    id: "stops",
    type: "symbol",
    source: "stops",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "rank"],
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
      "text-anchor": "left",
      "text-offset": [0.9, 0],
      "text-optional": true,
    },
    paint: {
      "text-color": COLOR_INK,
      "text-halo-color": COLOR_PAPER,
      "text-halo-width": 1.5,
    },
  });
}

export function RouteMap({
  options,
  selected,
  origin,
  destination,
  className = "",
}: {
  options: RouteOption[];
  selected: RouteOption | null;
  origin: { lat: number; lon: number; name: string };
  destination: { lat: number; lon: number; name: string };
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const ready = useRef(false);
  // Build maps near the viewport.
  const [visible, setVisible] = useState(false);
  // Memoize by scalar values.
  const { lat: oLat, lon: oLon, name: oName } = origin;
  const { lat: dLat, lon: dLon, name: dName } = destination;

  const legsData = useMemo(() => {
    // Draw the selected route last.
    const ordered = [...options.filter((o) => o !== selected), ...(selected ? [selected] : [])];
    const features = ordered.flatMap((o, i) =>
      o.itinerary.legs
        .map((leg) => legFeature(leg, i, o === selected))
        .filter((f): f is Feature<LineString> => f !== null),
    );
    return fc(features);
  }, [options, selected]);

  const stopsData = useMemo(() => {
    const features: Feature<Point>[] = [
      point([oLat, oLon], { icon: "origin", name: oName, rank: 0 }),
      point([dLat, dLon], { icon: "destination", name: dName, rank: 0 }),
    ];
    for (const leg of selected?.itinerary.legs ?? []) {
      if (leg.kind !== "ride" || !leg.path) continue;
      leg.path.forEach((p, i) => {
        const end = i === 0 || i === leg.path!.length - 1;
        const name = i === 0 ? leg.from_name : i === leg.path!.length - 1 ? leg.to_name : "";
        features.push(point(p, { icon: "station", name, rank: end ? 1 : 2 }));
      });
    }
    return fc(features);
  }, [selected, oLat, oLon, oName, dLat, dLon, dName]);

  const bounds = useMemo(() => {
    const b = new LngLatBounds();
    b.extend([oLon, oLat]);
    b.extend([dLon, dLat]);
    for (const leg of selected?.itinerary.legs ?? []) leg.path?.forEach((p) => b.extend(lngLat(p)));
    return b;
  }, [selected, oLat, oLon, dLat, dLon]);

  const latest = useRef({ legsData, stopsData, bounds });
  latest.current = { legsData, stopsData, bounds };

  function sync(map: MapLibre) {
    const d = latest.current;
    (map.getSource("legs") as GeoJSONSource).setData(d.legsData);
    (map.getSource("stops") as GeoJSONSource).setData(d.stopsData);
  }
  function frame(map: MapLibre) {
    const el = map.getContainer();
    if (!el.clientWidth || !el.clientHeight) return;
    map.fitBounds(latest.current.bounds, {
      padding: { top: 32, right: 110, bottom: 48, left: 48 },
      linear: true,
      animate: false,
    });
  }

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !container.current) return;
    const map = createMap(container.current, [oLon, oLat], 13);
    mapRef.current = map;
    map.on("resize", () => frame(map));
    map.on("load", () => {
      addLayers(map);
      ready.current = true;
      sync(map);
      frame(map);
    });
    return () => {
      ready.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Keep the map instance across prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current) sync(map);
  }, [legsData, stopsData]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current) frame(map);
  }, [bounds]);

  // Contain MapLibre's positioning.
  return (
    <div className={`relative border-2 border-ink ${className}`}>
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
    </div>
  );
}
