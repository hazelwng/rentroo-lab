"""Seed walk-home stations, lamps, POIs, and a walk graph from OpenStreetMap."""

from __future__ import annotations

import argparse
import datetime
import gzip
import json
import math
import sys
from collections.abc import Mapping
from pathlib import Path

import httpx
from opening_hours import OpeningHours, State

Bbox = tuple[float, float, float, float]

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "rentroo-lab seed script (github.com/hazelwng/rentroo-lab)"

POI_SELECTORS = (
    '["shop"="convenience"]',
    '["shop"="supermarket"]',
    '["amenity"~"^(restaurant|cafe|fast_food)$"]',
    '["amenity"~"^(bar|pub)$"]',
    '["amenity"="police"]',
    '["shop"="chemist"]',
    '["amenity"="pharmacy"]',
)

WALKABLE_HIGHWAYS = (
    "footway|path|pedestrian|living_street|residential|unclassified"
    "|tertiary|secondary|primary|steps"
)


def _bbox_query(bbox: Bbox) -> str:
    return ",".join(str(value) for value in bbox)


def _overpass(query: str) -> dict:
    response = httpx.post(
        OVERPASS_URL,
        data={"data": query},
        timeout=180,
        headers={"User-Agent": USER_AGENT},
    )
    response.raise_for_status()
    return response.json()


def _element_coords(element: dict) -> tuple[float, float] | None:
    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None:
        lat = element.get("center", {}).get("lat")
    if lon is None:
        lon = element.get("center", {}).get("lon")
    if lat is None or lon is None:
        return None
    return round(lat, 7), round(lon, 7)


def fetch_lamps(bbox: Bbox) -> list[list[float]]:
    query_bbox = _bbox_query(bbox)
    data = _overpass(f'[out:json][timeout:120];node["highway"="street_lamp"]({query_bbox});out;')
    return [[element["lat"], element["lon"]] for element in data["elements"]]


def poi_category(tags: Mapping[str, str]) -> str | None:
    shop = tags.get("shop")
    amenity = tags.get("amenity")
    if shop == "convenience":
        return "convenience"
    if shop == "supermarket":
        return "supermarket"
    if amenity in {"restaurant", "cafe", "fast_food"}:
        return "restaurant_cafe"
    if amenity in {"bar", "pub"}:
        return "bar_pub"
    if amenity == "police":
        return "police"
    if shop == "chemist" or amenity == "pharmacy":
        return "pharmacy"
    return None


WEEK_MINUTES = 7 * 24 * 60
REPRESENTATIVE_WEEK_START = datetime.datetime(2026, 6, 1)


def normalize_hours(opening_hours: str | None) -> list[list[int]] | None:
    """Weekly open intervals as [start, end) minute pairs from Monday 00:00.

    A holiday-free week is sampled, so PH rules and seasonal variations are
    flattened. Returns None when the value is missing or unparseable.
    """
    if not opening_hours or not opening_hours.strip():
        return None
    week_end = REPRESENTATIVE_WEEK_START + datetime.timedelta(days=7)
    try:
        spans = OpeningHours(opening_hours.strip()).intervals(REPRESENTATIVE_WEEK_START, week_end)
        intervals = []
        for span_start, span_end, state, _comment in spans:
            if state != State.OPEN:
                continue
            start = int((span_start - REPRESENTATIVE_WEEK_START).total_seconds() // 60)
            end = int((span_end - REPRESENTATIVE_WEEK_START).total_seconds() // 60)
            intervals.append([max(0, start), min(WEEK_MINUTES, end)])
    except Exception:
        return None
    return [[a, b] for a, b in intervals if b > a]


def parse_pois(elements: list[dict]) -> list[dict]:
    pois = []
    for element in elements:
        tags = element.get("tags", {})
        category = poi_category(tags)
        if category is None:
            continue
        coords = _element_coords(element)
        if coords is None:
            continue
        pois.append(
            {
                "lat": coords[0],
                "lon": coords[1],
                "name": tags.get("name") or tags.get("name:ja"),
                "category": category,
                "opening_hours": tags.get("opening_hours"),
                "open_intervals": normalize_hours(tags.get("opening_hours")),
            }
        )
    return pois


def fetch_pois(bbox: Bbox) -> list[dict]:
    query_bbox = _bbox_query(bbox)
    selectors = "".join(
        f"node{selector}({query_bbox});way{selector}({query_bbox});" for selector in POI_SELECTORS
    )
    data = _overpass(f"[out:json][timeout:120];({selectors});out center;")
    return parse_pois(data["elements"])


def parse_stations(elements: list[dict]) -> list[dict]:
    stations = []
    for element in elements:
        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("name:ja")
        if not name:
            continue
        coords = _element_coords(element)
        if coords is None:
            continue
        stations.append({"name": name, "lat": coords[0], "lon": coords[1]})
    return stations


def fetch_stations(bbox: Bbox) -> list[dict]:
    query_bbox = _bbox_query(bbox)
    selector = '["railway"="station"]'
    data = _overpass(
        f"[out:json][timeout:120];"
        f"(node{selector}({query_bbox});way{selector}({query_bbox}););out center;"
    )
    return parse_stations(data["elements"])


def fetch_walkable_ways(bbox: Bbox) -> list[dict]:
    query_bbox = _bbox_query(bbox)
    data = _overpass(
        f'[out:json][timeout:180];way["highway"~"^({WALKABLE_HIGHWAYS})$"]({query_bbox});out geom;'
    )
    return data["elements"]


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    mean_lat = math.radians((a[0] + b[0]) / 2)
    dy = (a[0] - b[0]) * 111_320.0
    dx = (a[1] - b[1]) * 111_320.0 * math.cos(mean_lat)
    return math.hypot(dx, dy)


def build_graph(elements: list[dict]) -> dict:
    """Collapse walkable OSM ways to intersection-to-intersection edges."""
    usage: dict[int, int] = {}
    ways = []
    for element in elements:
        if element.get("type") != "way" or "geometry" not in element:
            continue
        for node_id in element["nodes"]:
            usage[node_id] = usage.get(node_id, 0) + 1
        ways.append(element)

    node_index: dict[int, int] = {}
    nodes: list[list[float]] = []
    edges: list[dict] = []

    def index_of(node_id: int, lat: float, lon: float) -> int:
        if node_id not in node_index:
            node_index[node_id] = len(nodes)
            nodes.append([round(lat, 7), round(lon, 7)])
        return node_index[node_id]

    for way in ways:
        name = way.get("tags", {}).get("name")
        way_id = way["id"]
        node_ids = way["nodes"]
        geometry = way["geometry"]
        start = 0
        for index in range(1, len(node_ids)):
            is_last = index == len(node_ids) - 1
            if not is_last and usage[node_ids[index]] < 2:
                continue

            coords = [(point["lat"], point["lon"]) for point in geometry[start : index + 1]]
            distance = sum(_distance_m(a, b) for a, b in zip(coords, coords[1:], strict=False))
            if distance > 0:
                edges.append(
                    {
                        "start_node": index_of(node_ids[start], *coords[0]),
                        "end_node": index_of(node_ids[index], *coords[-1]),
                        "distance_m": round(distance, 1),
                        "name": name,
                        "osm_way_id": way_id,
                        "geometry": [[round(lat, 7), round(lon, 7)] for lat, lon in coords],
                    }
                )
            start = index

    return {"nodes": nodes, "edges": edges}


def write_gz(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", nargs=4, type=float, required=True, metavar=("S", "W", "N", "E"))
    parser.add_argument("--out-data", type=Path, required=True)
    parser.add_argument("--out-graph", type=Path, required=True)
    args = parser.parse_args()

    bbox: Bbox = tuple(args.bbox)

    print("fetching street lamps…")
    lamps = fetch_lamps(bbox)
    print(f"  {len(lamps)} lamps")

    print("fetching POIs…")
    pois = fetch_pois(bbox)
    print(f"  {len(pois)} pois")

    print("fetching stations…")
    stations = fetch_stations(bbox)
    print(f"  {len(stations)} stations")

    print("fetching walk graph…")
    graph = build_graph(fetch_walkable_ways(bbox))
    print(f"  {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")

    write_gz(args.out_data, {"stations": stations, "lamps": lamps, "pois": pois})
    write_gz(args.out_graph, graph)
    print(f"wrote {args.out_data} and {args.out_graph}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
