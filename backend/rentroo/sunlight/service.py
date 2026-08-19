"""Service layer for sunlight analysis and optional 3D neighbourhood context."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from rentroo.config import get_city_config
from rentroo.sunlight.buildings import Buildings, load_buildings
from rentroo.sunlight.shadow import SunlightResult, locate_window, winter_sunlight

NEIGHBOUR_RADIUS = 300.0  # Radius of building geometry included in visualization responses.


@dataclass(frozen=True)
class Neighbour:
    """A nearby building positioned relative to the requested window."""

    ring: list[tuple[float, float]]  # Horizontal (east, north) offsets in metres.
    height: float  # Metres above the building's ground level.
    ground: float  # Elevation in the same vertical datum as SunlightReport.ground.


@dataclass(frozen=True)
class SunlightReport:
    """Sunlight profile with the scene data requested by the caller."""

    result: SunlightResult
    ground: float  # Ground elevation of the building containing the window, in metres.
    neighbours: list[Neighbour] | None


@lru_cache(maxsize=4)
def _load(buildings_dir: Path) -> Buildings:
    """Load and cache the building dataset for a city directory."""
    files = sorted(buildings_dir.glob("*.json.gz"))
    if not files:
        raise FileNotFoundError(f"no seeded buildings in {buildings_dir}")
    # Datasets currently cover one ward. Combining wards requires a shared projection origin.
    return load_buildings(files[0])


def get_buildings() -> Buildings:
    """Return the cached building dataset configured for the active city."""
    return _load(get_city_config().city_dir / "buildings")


def sunlight_report(
    lat: float, lon: float, floor: int, facing: float, *, with_neighbours: bool = False
) -> SunlightReport:
    """Calculate direct sunlight and optionally include nearby building geometry."""
    buildings = get_buildings()
    x, y, ground = locate_window(buildings, lat, lon, facing)
    result = winter_sunlight(buildings, lat, lon, floor, facing)
    neighbours = _neighbours(buildings, x, y) if with_neighbours else None
    return SunlightReport(result=result, ground=ground, neighbours=neighbours)


def _neighbours(buildings: Buildings, x: float, y: float) -> list[Neighbour]:
    """Translate nearby footprints to window-relative coordinates, rounded to 0.1 m."""
    return [
        Neighbour(
            ring=[(round(px - x, 1), round(py - y, 1)) for px, py in b.ring],
            height=b.height,
            ground=b.ground,
        )
        for b in buildings.near(x, y, NEIGHBOUR_RADIUS)
    ]
