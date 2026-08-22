import type { StyleSpecification } from "maplibre-gl";

/** App-themed OpenFreeMap style. */

const PER_50 = "#f7f7ff";
const PER_100 = "#eeeeff";
const PER_200 = "#dcdcf5";
const PER_300 = "#c3c3e8";
const PER_500 = "#5c5ca6";
const PER_700 = "#33336b";
const PAPER = "#ffffff";

const ATTRIBUTION =
  '<a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a> © ' +
  '<a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

export const mapStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    omt: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: ATTRIBUTION,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": PER_50 } },
    {
      id: "park",
      type: "fill",
      source: "omt",
      "source-layer": "park",
      paint: { "fill-color": PER_100 },
    },
    {
      id: "landuse",
      type: "fill",
      source: "omt",
      "source-layer": "landuse",
      filter: ["in", "class", "school", "university", "hospital", "cemetery", "stadium"],
      paint: { "fill-color": PER_100 },
    },
    {
      id: "water",
      type: "fill",
      source: "omt",
      "source-layer": "water",
      paint: { "fill-color": PER_200 },
    },
    {
      id: "waterway",
      type: "line",
      source: "omt",
      "source-layer": "waterway",
      paint: { "line-color": PER_200, "line-width": 2 },
    },
    {
      id: "rail",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["==", "class", "rail"],
      paint: { "line-color": PER_300, "line-width": 2, "line-dasharray": [3, 3] },
    },
    {
      id: "road-casing",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["!in", "class", "rail", "transit", "path", "ferry"],
      layout: { "line-cap": "square", "line-join": "miter" },
      paint: {
        "line-color": PER_300,
        "line-width": [
          "interpolate", ["exponential", 1.6], ["zoom"],
          14, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 6, ["secondary", "tertiary"], 4, 2.5],
          18, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 30, ["secondary", "tertiary"], 20, 12],
        ],
      },
    },
    {
      id: "road",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["!in", "class", "rail", "transit", "path", "ferry"],
      layout: { "line-cap": "square", "line-join": "miter" },
      paint: {
        "line-color": PAPER,
        "line-width": [
          "interpolate", ["exponential", 1.6], ["zoom"],
          14, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 4, ["secondary", "tertiary"], 2.5, 1.5],
          18, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 26, ["secondary", "tertiary"], 16, 9],
        ],
      },
    },
    {
      id: "path",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["==", "class", "path"],
      paint: { "line-color": PAPER, "line-width": 1.5, "line-dasharray": [2, 2] },
    },
    {
      id: "road-name",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-letter-spacing": 0.05,
      },
      paint: { "text-color": PER_500, "text-halo-color": PAPER, "text-halo-width": 1.5 },
    },
    {
      id: "station",
      type: "symbol",
      source: "omt",
      "source-layer": "poi",
      filter: ["all", ["==", "class", "railway"], ["==", "subclass", "station"]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": [0, 0.4],
      },
      paint: { "text-color": PER_700, "text-halo-color": PAPER, "text-halo-width": 1.5 },
    },
    {
      id: "place",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      filter: ["in", "class", "suburb", "quarter", "neighbourhood"],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-letter-spacing": 0.1,
        "text-transform": "uppercase",
      },
      paint: { "text-color": PER_500, "text-halo-color": PER_50, "text-halo-width": 1.5 },
    },
  ],
};
