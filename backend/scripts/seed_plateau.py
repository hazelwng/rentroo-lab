"""Extract shadow-casting geometry from a PLATEAU CityGML zip.

Output records contain height above ground (h), ground elevation (g), and a
closed roof-outline ring (p). Buildings near the ward boundary are retained so
shadows from neighbouring wards are included.
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

NS = {
    "bldg": "http://www.opengis.net/citygml/building/2.0",
    "gml": "http://www.opengis.net/gml",
    "uro": "https://www.geospatial.jp/iur/uro/3.1",
}
BUILDING_TAG = f"{{{NS['bldg']}}}Building"

# measuredHeight is -9999 when the survey has no value (≈5% of Tokyo buildings)
STOREY_HEIGHT_M = 3.0
DEFAULT_HEIGHT_M = 6.0
M_PER_DEG_LAT = 111_320.0
DEFAULT_BUFFER_M = 600.0


def _height(building: ET.Element) -> float:
    h = building.findtext("bldg:measuredHeight", namespaces=NS)
    if h is not None and float(h) > 0:
        return round(float(h), 1)
    storeys = building.findtext("bldg:storeysAboveGround", namespaces=NS)
    if storeys is not None and 0 < int(storeys) < 200:
        return int(storeys) * STOREY_HEIGHT_M
    return DEFAULT_HEIGHT_M


def _ground(building: ET.Element) -> float:
    zs = []
    for pos in building.iterfind("bldg:lod1Solid//gml:posList", namespaces=NS):
        vals = pos.text.split()
        zs.extend(float(v) for v in vals[2::3])
    return round(min(zs), 1) if zs else 0.0


def _ring(building: ET.Element) -> list[list[float]] | None:
    pos = building.find("bldg:lod0RoofEdge//gml:posList", namespaces=NS)
    if pos is None:
        return None
    vals = pos.text.split()
    # PLATEAU posList is "lat lon z" triples (EPSG:6697 axis order)
    ring = [
        [round(float(vals[i + 1]), 6), round(float(vals[i]), 6)] for i in range(0, len(vals), 3)
    ]
    return ring if len(ring) >= 4 else None


def _ward_of(building: ET.Element) -> str | None:
    bid = building.findtext(".//uro:buildingID", namespaces=NS)
    return bid.split("-")[0] if bid else None


def extract(zip_path: Path) -> list[tuple[str | None, dict]]:
    """Yield (ward_code, record) for every building in the zip."""
    out: list[tuple[str | None, dict]] = []
    with zipfile.ZipFile(zip_path) as zf:
        members = [m for m in zf.namelist() if m.endswith(".gml") and "udx/bldg/" in m]
        if not members:
            sys.exit(f"no udx/bldg/*.gml inside {zip_path}")
        for name in members:
            with zf.open(name) as f:
                for _, el in ET.iterparse(f):
                    if el.tag != BUILDING_TAG:
                        continue
                    ring = _ring(el)
                    if ring is not None:
                        out.append((_ward_of(el), {"h": _height(el), "g": _ground(el), "p": ring}))
                    el.clear()
    return out


def _project_ring(
    ring: list[list[float]], origin_lon: float, origin_lat: float
) -> list[tuple[float, float]]:
    """Project a lon/lat ring to local metres around a ward-scale origin."""
    x_scale = M_PER_DEG_LAT * math.cos(math.radians(origin_lat))
    return [((lon - origin_lon) * x_scale, (lat - origin_lat) * M_PER_DEG_LAT) for lon, lat in ring]


def _bounds(ring: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def _bbox_distance_sq(
    a: tuple[float, float, float, float], b: tuple[float, float, float, float]
) -> float:
    dx = max(a[0] - b[2], b[0] - a[2], 0.0)
    dy = max(a[1] - b[3], b[1] - a[3], 0.0)
    return dx * dx + dy * dy


def _segments(ring: list[tuple[float, float]]):
    end = len(ring) - 1 if ring[0] == ring[-1] else len(ring)
    for i in range(end):
        yield ring[i], ring[(i + 1) % end]


def _point_segment_distance_sq(
    p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]
) -> float:
    ab_x, ab_y = b[0] - a[0], b[1] - a[1]
    length_sq = ab_x * ab_x + ab_y * ab_y
    if length_sq == 0:
        return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2
    t = ((p[0] - a[0]) * ab_x + (p[1] - a[1]) * ab_y) / length_sq
    t = min(1.0, max(0.0, t))
    dx = p[0] - (a[0] + t * ab_x)
    dy = p[1] - (a[1] + t * ab_y)
    return dx * dx + dy * dy


def _cross(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _segments_intersect(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
    d: tuple[float, float],
) -> bool:
    ab_c, ab_d = _cross(a, b, c), _cross(a, b, d)
    cd_a, cd_b = _cross(c, d, a), _cross(c, d, b)
    if ((ab_c > 0) != (ab_d > 0)) and ((cd_a > 0) != (cd_b > 0)):
        return True
    return any(
        abs(cross) <= 1e-9
        and min(p[0], q[0]) - 1e-9 <= r[0] <= max(p[0], q[0]) + 1e-9
        and min(p[1], q[1]) - 1e-9 <= r[1] <= max(p[1], q[1]) + 1e-9
        for cross, p, q, r in (
            (ab_c, a, b, c),
            (ab_d, a, b, d),
            (cd_a, c, d, a),
            (cd_b, c, d, b),
        )
    )


def _segment_distance_sq(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
    d: tuple[float, float],
) -> float:
    if _segments_intersect(a, b, c, d):
        return 0.0
    return min(
        _point_segment_distance_sq(a, c, d),
        _point_segment_distance_sq(b, c, d),
        _point_segment_distance_sq(c, a, b),
        _point_segment_distance_sq(d, a, b),
    )


def _contains(ring: list[tuple[float, float]], point: tuple[float, float]) -> bool:
    x, y = point
    inside = False
    for (ax, ay), (bx, by) in _segments(ring):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def _rings_within(
    a: list[tuple[float, float]], b: list[tuple[float, float]], distance_sq: float
) -> bool:
    for a1, a2 in _segments(a):
        for b1, b2 in _segments(b):
            if _segment_distance_sq(a1, a2, b1, b2) <= distance_sq:
                return True
    # A footprint may be fully contained without its boundary being nearby.
    return _contains(a, b[0]) or _contains(b, a[0])


def select(buildings: list[tuple[str | None, dict]], ward: str, buffer_m: float) -> list[dict]:
    """Target-ward buildings plus neighbours within buffer_m of their footprints."""
    inside = [rec for w, rec in buildings if w == ward]
    if not inside:
        sys.exit(f"no buildings with ward code {ward} in this zip")
    if buffer_m <= 0:
        return inside

    origin_lon, origin_lat = inside[0]["p"][0]
    inside_rings = [_project_ring(rec["p"], origin_lon, origin_lat) for rec in inside]
    inside_bounds = [_bounds(ring) for ring in inside_rings]

    # Index target footprints by bounding-box cells. Expanded outside bounds provide
    # a cheap candidate set before the exact polygon-to-polygon distance check.
    grid: dict[tuple[int, int], list[int]] = defaultdict(list)
    for index, bounds in enumerate(inside_bounds):
        min_gx = math.floor(bounds[0] / buffer_m)
        max_gx = math.floor(bounds[2] / buffer_m)
        min_gy = math.floor(bounds[1] / buffer_m)
        max_gy = math.floor(bounds[3] / buffer_m)
        for gx in range(min_gx, max_gx + 1):
            for gy in range(min_gy, max_gy + 1):
                grid[gx, gy].append(index)

    distance_sq = buffer_m * buffer_m

    def near_target(rec: dict) -> bool:
        ring = _project_ring(rec["p"], origin_lon, origin_lat)
        bounds = _bounds(ring)
        min_gx = math.floor((bounds[0] - buffer_m) / buffer_m)
        max_gx = math.floor((bounds[2] + buffer_m) / buffer_m)
        min_gy = math.floor((bounds[1] - buffer_m) / buffer_m)
        max_gy = math.floor((bounds[3] + buffer_m) / buffer_m)
        candidates = {
            index
            for gx in range(min_gx, max_gx + 1)
            for gy in range(min_gy, max_gy + 1)
            for index in grid.get((gx, gy), ())
        }
        return any(
            _bbox_distance_sq(bounds, inside_bounds[index]) <= distance_sq
            and _rings_within(ring, inside_rings[index], distance_sq)
            for index in candidates
        )

    outside = [rec for w, rec in buildings if w != ward and near_target(rec)]
    return inside + outside


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("zip", type=Path, help="PLATEAU CityGML zip for one ward")
    ap.add_argument("--ward", required=True, help="ward code, e.g. 13110 for 目黒区")
    ap.add_argument("--out", required=True, type=Path, help="output .json.gz path")
    ap.add_argument(
        "--buffer",
        type=float,
        default=DEFAULT_BUFFER_M,
        help="metres of neighbouring-ward buildings to keep",
    )
    args = ap.parse_args()

    all_buildings = extract(args.zip)
    kept = select(all_buildings, args.ward, args.buffer)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(args.out, "wt", encoding="utf-8") as f:
        json.dump(kept, f, separators=(",", ":"))

    size_mb = args.out.stat().st_size / 1e6
    print(
        f"{len(all_buildings)} buildings in zip → kept {len(kept)} → {args.out} ({size_mb:.1f} MB)"
    )


if __name__ == "__main__":
    main()
