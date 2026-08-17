"""Load seeded building geometry and project it to local metres."""

from __future__ import annotations

import gzip
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

M_PER_DEG_LAT = 111_320.0


@dataclass(frozen=True)
class Building:
    height: float  # metres above ground
    ground: float  # ground elevation, metres
    ring: tuple[tuple[float, float], ...]  # (x, y) local metres, closed
    # Bounds for cheap culling before exact geometry tests.
    min_x: float
    min_y: float
    max_x: float
    max_y: float


@dataclass
class Buildings:
    """All buildings of one ward (plus a neighbour buffer) in local metres."""

    origin_lat: float
    origin_lon: float
    items: list[Building] = field(default_factory=list)

    def to_local(self, lat: float, lon: float) -> tuple[float, float]:
        """Equirectangular projection around the origin — fine at ward scale."""
        x = (lon - self.origin_lon) * M_PER_DEG_LAT * math.cos(math.radians(self.origin_lat))
        y = (lat - self.origin_lat) * M_PER_DEG_LAT
        return x, y

    def near(self, x: float, y: float, radius: float) -> list[Building]:
        """Buildings whose bounding box comes within `radius` metres of (x, y)."""
        return [
            b
            for b in self.items
            if b.min_x - radius <= x <= b.max_x + radius
            and b.min_y - radius <= y <= b.max_y + radius
        ]


def load_buildings(path: Path) -> Buildings:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        records = json.load(f)
    if not records:
        raise ValueError(f"no buildings in {path}")

    # centroid of first vertices is a good enough projection origin
    origin_lat = sum(r["p"][0][1] for r in records) / len(records)
    origin_lon = sum(r["p"][0][0] for r in records) / len(records)
    result = Buildings(origin_lat=origin_lat, origin_lon=origin_lon)

    for r in records:
        ring = tuple(result.to_local(lat, lon) for lon, lat in r["p"])
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        result.items.append(
            Building(
                height=r["h"],
                ground=r.get("g", 0.0),
                ring=ring,
                min_x=min(xs),
                min_y=min(ys),
                max_x=max(xs),
                max_y=max(ys),
            )
        )
    return result
