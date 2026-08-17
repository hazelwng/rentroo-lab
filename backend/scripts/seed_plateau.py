"""Extract shadow-casting geometry from a PLATEAU CityGML zip.

Output records contain height above ground (h), ground elevation (g), and a
closed roof-outline ring (p). Buildings near the ward boundary are retained so
shadows from neighbouring wards are included.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import xml.etree.ElementTree as ET
import zipfile
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


def _grid_key(lon: float, lat: float, cell_deg: float) -> tuple[int, int]:
    return (int(lon // cell_deg), int(lat // cell_deg))


def select(buildings: list[tuple[str | None, dict]], ward: str, buffer_m: float) -> list[dict]:
    """Target-ward buildings plus neighbours within buffer_m of any of them."""
    inside = [rec for w, rec in buildings if w == ward]
    if not inside:
        sys.exit(f"no buildings with ward code {ward} in this zip")
    if buffer_m <= 0:
        return inside

    # Keep outside buildings whose first vertex is near a target-building vertex.
    cell_deg = buffer_m / 111_320.0
    grid = {_grid_key(lon, lat, cell_deg) for rec in inside for lon, lat in rec["p"]}

    def near_target(rec: dict) -> bool:
        gx, gy = _grid_key(*rec["p"][0], cell_deg)
        return any((gx + dx, gy + dy) in grid for dx in (-1, 0, 1) for dy in (-1, 0, 1))

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
        "--buffer", type=float, default=300.0, help="metres of neighbouring-ward buildings to keep"
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
