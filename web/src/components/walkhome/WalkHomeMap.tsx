"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibre,
  MapGeoJSONFeature,
  Offset,
  Popup,
} from "maplibre-gl";
import type { Feature, LineString, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WalkHome } from "@/lib/api";
import {
  CATEGORY_LABELS,
  hoursLabel,
  openAt,
  poiKey,
} from "@/components/walkhome/walkHomePresentation";
import { createMap, EMPTY, fc, Glyph, LABELS_START, pinIcon } from "@/lib/createMap";

const COLOR_WALK = "#5c5ca6";
const COLOR_MUTED = "#c3c3e8";
const COLOR_INK = "#1c1b18";
const COLOR_SUN = "#ef9f27";
const COLOR_PAPER = "#ffffff";

const STATION_GLYPH: Glyph = [
  [2, 1, 9, 8],
  [3, 10, 2, 2],
  [8, 10, 2, 2],
  [4, 3, 2, 2, 1],
  [7, 3, 2, 2, 1],
];

const HOME_GLYPH: Glyph = [
  [6, 1, 1, 1],
  [5, 2, 3, 1],
  [4, 3, 5, 1],
  [3, 4, 7, 1],
  [2, 5, 9, 1],
  [3, 6, 7, 6],
  [6, 9, 1, 3, 1],
];

const POI_GLYPHS: Record<string, Glyph> = {
  convenience: [
    [2, 2, 9, 2],
    [3, 5, 7, 6],
    [5, 7, 3, 4, 1],
  ],
  supermarket: [
    [1, 2, 2, 1],
    [3, 3, 8, 4],
    [4, 7, 6, 1],
    [4, 9, 2, 2],
    [8, 9, 2, 2],
  ],
  restaurant_cafe: [
    [5, 1, 1, 2],
    [7, 1, 1, 2],
    [2, 4, 7, 6],
    [9, 5, 2, 1],
    [10, 5, 1, 3],
    [9, 7, 2, 1],
    [1, 11, 10, 1],
  ],
  bar_pub: [
    [2, 2, 9, 1],
    [3, 3, 7, 1],
    [4, 4, 5, 1],
    [5, 5, 3, 1],
    [6, 6, 1, 4],
    [4, 10, 5, 1],
  ],
  police: [
    [4, 1, 5, 2],
    [2, 3, 9, 5],
    [3, 8, 7, 1],
    [4, 9, 5, 1],
    [5, 10, 3, 1],
    [6, 4, 1, 3, 1],
  ],
  pharmacy: [
    [5, 2, 3, 9],
    [2, 5, 9, 3],
  ],
  other: [[4, 4, 5, 5]],
};

const POI_STATUS_COLORS = {
  open: { fill: COLOR_WALK, border: COLOR_INK, glyph: COLOR_PAPER },
  closed: { fill: COLOR_PAPER, border: COLOR_MUTED, glyph: COLOR_MUTED },
  unknown: { fill: COLOR_PAPER, border: COLOR_WALK, glyph: COLOR_WALK },
};
type PoiStatus = keyof typeof POI_STATUS_COLORS;

const POPUP_OFFSET: Offset = {
  center: [0, -9],
  top: [0, 4],
  "top-left": [0, 4],
  "top-right": [0, 4],
  bottom: [0, -20],
  "bottom-left": [0, -20],
  "bottom-right": [0, -20],
  left: [10, -9],
  right: [-10, -9],
};

const lngLat = ([lat, lon]: [number, number]): [number, number] => [lon, lat];

function point(p: [number, number], properties: Record<string, unknown>): Feature<Point> {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates: lngLat(p) } };
}

function popupContent(p: Record<string, string>): HTMLElement {
  const root = document.createElement("div");
  root.className = "font-mono text-[10px] leading-snug";
  const line = (text: string, className: string) => {
    const el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    root.appendChild(el);
  };
  const category = CATEGORY_LABELS[p.category] ?? p.category;
  if (p.name) line(p.name, "text-[11px] text-ink");
  line(`${category} · ${p.hours}`, "text-per-700");
  return root;
}

function addLayers(map: MapLibre) {
  const ends = { fill: COLOR_INK, border: COLOR_INK, glyph: COLOR_PAPER };
  map.addImage("wh-station", pinIcon(STATION_GLYPH, ends, 3), {
    pixelRatio: 2,
  });
  map.addImage("wh-home", pinIcon(HOME_GLYPH, ends, 3), { pixelRatio: 2 });
  for (const [category, glyph] of Object.entries(POI_GLYPHS))
    for (const [status, colors] of Object.entries(POI_STATUS_COLORS))
      map.addImage(`wh-poi-${category}-${status}`, pinIcon(glyph, colors, 2), {
        pixelRatio: 2,
      });
  for (const id of ["route", "lamps", "pois", "ends"])
    map.addSource(id, { type: "geojson", data: EMPTY });

  map.addLayer(
    {
      id: "route",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "square" },
      paint: {
        "line-color": COLOR_WALK,
        "line-width": ["case", ["get", "highlighted"], 7, 4],
        "line-dasharray": [1.5, 1],
      },
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
      "icon-image": ["concat", "wh-poi-", ["get", "glyph"], "-", ["get", "status"]],
      "icon-anchor": "bottom",
      "icon-size": ["case", ["get", "highlighted"], 1.4, 1],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "sort"],
      "text-field": ["case", ["==", ["get", "status"], "open"], ["get", "name"], ""],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-anchor": "left",
      "text-offset": [0.9, -0.8],
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
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
      "text-anchor": "left",
      "text-offset": [1.2, -1.1],
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
  arriveMinute,
  highlightLeg,
  highlightPoi,
  onHoverLeg,
  showAll,
  onShowAllChange,
  home,
  className = "",
}: {
  walkHome: WalkHome;
  arriveMinute: number;
  highlightLeg: number | null;
  highlightPoi: string | null;
  onHoverLeg: (index: number | null) => void;
  showAll: boolean;
  onShowAllChange: (showAll: boolean) => void;
  home: { lat: number; lon: number; name: string };
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const ready = useRef(false);
  const popup = useRef<Popup | null>(null);
  const [visible, setVisible] = useState(false);

  const routeData = useMemo(() => {
    const features: Feature<LineString>[] = walkHome.legs.map((leg, index) => ({
      type: "Feature",
      properties: { highlighted: index === highlightLeg },
      geometry: { type: "LineString", coordinates: leg.coords.map(lngLat) },
    }));
    return fc(features);
  }, [walkHome, highlightLeg]);

  const lampsData = useMemo(
    () => fc(walkHome.lamps.map((p) => point(p, {}))),
    [walkHome],
  );

  const poisData = useMemo(
    () =>
      fc(
        walkHome.legs.flatMap((leg, legIndex) =>
          leg.pois.flatMap((poi, index) => {
            const open = openAt(poi, arriveMinute);
            const status: PoiStatus =
              open === true ? "open" : open === false ? "closed" : "unknown";
            if (status !== "open" && !showAll) return [];
            return point([poi.lat, poi.lon], {
              name: poi.name ?? "",
              category: poi.category,
              glyph: poi.category in POI_GLYPHS ? poi.category : "other",
              status,
              sort: { closed: 0, unknown: 1, open: 2 }[status],
              hours: hoursLabel(poi),
              leg: legIndex,
              highlighted: poiKey(legIndex, index) === highlightPoi,
            });
          }),
        ),
      ),
    [walkHome, arriveMinute, highlightPoi, showAll],
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

  const hiddenCount = useMemo(
    () =>
      walkHome.legs.reduce(
        (count, leg) =>
          count + leg.pois.filter((poi) => openAt(poi, arriveMinute) !== true).length,
        0,
      ),
    [walkHome, arriveMinute],
  );

  const bounds = useMemo(() => {
    const b = new LngLatBounds();
    walkHome.route_coords.forEach((p) => b.extend(lngLat(p)));
    return b;
  }, [walkHome]);

  const latest = useRef({
    routeData,
    lampsData,
    poisData,
    endsData,
    bounds,
    onHoverLeg,
  });
  latest.current = {
    routeData,
    lampsData,
    poisData,
    endsData,
    bounds,
    onHoverLeg,
  };

  function sync(map: MapLibre) {
    const d = latest.current;
    (map.getSource("route") as GeoJSONSource).setData(d.routeData);
    (map.getSource("lamps") as GeoJSONSource).setData(d.lampsData);
    (map.getSource("pois") as GeoJSONSource).setData(d.poisData);
    (map.getSource("ends") as GeoJSONSource).setData(d.endsData);
  }
  function showPopup(map: MapLibre, feature: MapGeoJSONFeature) {
    const [lon, lat] = (feature.geometry as Point).coordinates;
    popup.current ??= new Popup({
      offset: POPUP_OFFSET,
      closeButton: false,
      closeOnClick: false,
      className: "wh-popup",
    });
    popup.current
      .setLngLat([lon, lat])
      .setDOMContent(popupContent(feature.properties))
      .addTo(map);
    latest.current.onHoverLeg(feature.properties.leg);
  }
  function hidePopup() {
    popup.current?.remove();
    latest.current.onHoverLeg(null);
  }
  function bindPoiEvents(map: MapLibre) {
    map.on("mousemove", "pois", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (e.features?.[0]) showPopup(map, e.features[0]);
    });
    map.on("mouseleave", "pois", () => {
      map.getCanvas().style.cursor = "";
      hidePopup();
    });
    map.on("click", (e) => {
      const [feature] = map.queryRenderedFeatures(e.point, {
        layers: ["pois"],
      });
      if (feature) showPopup(map, feature);
      else hidePopup();
    });
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
      addLayers(map);
      bindPoiEvents(map);
      ready.current = true;
      sync(map);
      frame(map);
    });
    return () => {
      ready.current = false;
      popup.current = null;
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
    popup.current?.remove();
  }, [walkHome, arriveMinute, showAll]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current) frame(map);
  }, [bounds]);

  return (
    <div className={`relative border-2 border-ink ${className}`}>
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-pressed={showAll}
          className="label-mono absolute bottom-2 left-2 flex items-center gap-2 border-2 border-ink bg-paper px-2 py-1 text-per-700 hover:bg-per-100"
          onClick={() => onShowAllChange(!showAll)}
        >
          <span
            className={`h-2.5 w-2.5 border-2 border-ink ${showAll ? "bg-ink" : "bg-paper"}`}
          />
          {showAll ? "Open only" : `Show ${hiddenCount} closed or unknown`}
        </button>
      )}
    </div>
  );
}
