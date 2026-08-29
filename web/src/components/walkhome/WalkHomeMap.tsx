"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSONSource, LngLatBounds, Map as MapLibre } from "maplibre-gl";
import type { Feature, LineString, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WalkHome } from "@/lib/api";
import { createMap, EMPTY, fc, LABELS_START, squareIcon } from "@/lib/createMap";

const COLOR_WALK = "#5c5ca6";
const COLOR_INK = "#1c1b18";
const COLOR_SUN = "#ef9f27";
const COLOR_PAPER = "#ffffff";

const lngLat = ([lat, lon]: [number, number]): [number, number] => [lon, lat];

function point(p: [number, number], properties: Record<string, unknown>): Feature<Point> {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates: lngLat(p) } };
}

function addLayers(map: MapLibre) {
  map.addImage("wh-station", squareIcon(16, COLOR_PAPER), { pixelRatio: 1 });
  map.addImage("wh-home", squareIcon(16, COLOR_SUN), { pixelRatio: 1 });
  for (const id of ["route", "lamps", "pois", "ends"])
    map.addSource(id, { type: "geojson", data: EMPTY });

  map.addLayer(
    {
      id: "route",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "square" },
      paint: { "line-color": COLOR_WALK, "line-width": 4, "line-dasharray": [1.5, 1] },
    },
    LABELS_START,
  );
  map.addLayer(
    {
      id: "lamps",
      type: "circle",
      source: "lamps",
      paint: {
        "circle-radius": 3,
        "circle-color": COLOR_SUN,
        "circle-stroke-color": COLOR_PAPER,
        "circle-stroke-width": 1,
      },
    },
    LABELS_START,
  );
  map.addLayer({
    id: "pois",
    type: "symbol",
    source: "pois",
    layout: {
      "icon-image": "wh-poi",
      "icon-allow-overlap": true,
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-anchor": "left",
      "text-offset": [0.8, 0],
      "text-optional": true,
    },
    paint: {
      "text-color": COLOR_WALK,
      "text-halo-color": COLOR_PAPER,
      "text-halo-width": 1.2,
    },
  });
  map.addLayer({
    id: "ends",
    type: "symbol",
    source: "ends",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
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

export function WalkHomeMap({
  walkHome,
  home,
  className = "",
}: {
  walkHome: WalkHome;
  home: { lat: number; lon: number; name: string };
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const ready = useRef(false);
  const [visible, setVisible] = useState(false);

  const routeData = useMemo(() => {
    const feature: Feature<LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: walkHome.route_coords.map(lngLat) },
    };
    return fc([feature]);
  }, [walkHome]);

  const lampsData = useMemo(
    () => fc(walkHome.lamps.map((p) => point(p, {}))),
    [walkHome],
  );

  const poisData = useMemo(
    () =>
      fc(
        walkHome.legs.flatMap((leg) =>
          leg.night_open_pois.map((poi) =>
            point([poi.lat, poi.lon], { name: poi.name ?? "" }),
          ),
        ),
      ),
    [walkHome],
  );

  const endsData = useMemo(
    () =>
      fc([
        point([walkHome.station.lat, walkHome.station.lon], {
          icon: "wh-station",
          name: walkHome.station.name,
        }),
        point([home.lat, home.lon], { icon: "wh-home", name: "" }),
      ]),
    [walkHome, home.lat, home.lon],
  );

  const bounds = useMemo(() => {
    const b = new LngLatBounds();
    walkHome.route_coords.forEach((p) => b.extend(lngLat(p)));
    return b;
  }, [walkHome]);

  const latest = useRef({ routeData, lampsData, poisData, endsData, bounds });
  latest.current = { routeData, lampsData, poisData, endsData, bounds };

  function sync(map: MapLibre) {
    const d = latest.current;
    (map.getSource("route") as GeoJSONSource).setData(d.routeData);
    (map.getSource("lamps") as GeoJSONSource).setData(d.lampsData);
    (map.getSource("pois") as GeoJSONSource).setData(d.poisData);
    (map.getSource("ends") as GeoJSONSource).setData(d.endsData);
  }
  function frame(map: MapLibre) {
    const el = map.getContainer();
    if (!el.clientWidth || !el.clientHeight) return;
    map.fitBounds(latest.current.bounds, {
      padding: { top: 40, right: 120, bottom: 40, left: 48 },
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
    const map = createMap(
      container.current,
      [walkHome.station.lon, walkHome.station.lat],
      14,
    );
    mapRef.current = map;
    map.on("resize", () => frame(map));
    map.on("load", () => {
      map.addImage("wh-poi", squareIcon(8, COLOR_WALK), { pixelRatio: 1 });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current) sync(map);
  }, [routeData, lampsData, poisData, endsData]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current) frame(map);
  }, [bounds]);

  return (
    <div className={`relative border-2 border-ink ${className}`}>
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
    </div>
  );
}
