"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibre, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle } from "@/lib/mapStyle";

/** Basemap aligned with the top-down scene. */

const M_PER_DEG_LAT = 111_320;

// Copied by copy-maplibre-worker.mjs.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

function frame(map: MapLibre, lat: number, lon: number, halfWidth: number) {
  const el = map.getContainer();
  if (!el.clientWidth || !el.clientHeight) return;
  const aspect = el.clientWidth / el.clientHeight;
  const dLat = halfWidth / aspect / M_PER_DEG_LAT;
  const dLon = halfWidth / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  map.fitBounds(
    [
      [lon - dLon, lat - dLat],
      [lon + dLon, lat + dLat],
    ],
    { padding: 0, linear: true, animate: false },
  );
}

export function MapBase({
  lat,
  lon,
  halfWidth,
}: {
  lat: number;
  lon: number;
  halfWidth: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const view = useRef({ lat, lon, halfWidth });
  view.current = { lat, lon, halfWidth };

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibre({
      container: container.current,
      style: mapStyle,
      center: [lon, lat],
      zoom: 16,
      interactive: false,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    mapRef.current = map;
    const refit = () => {
      const v = view.current;
      frame(map, v.lat, v.lon, v.halfWidth);
    };
    map.on("resize", refit);
    refit();
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) frame(map, lat, lon, halfWidth);
  }, [lat, lon, halfWidth]);

  // Isolate MapLibre's position override.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
