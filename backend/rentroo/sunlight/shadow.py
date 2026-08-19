"""Estimate direct sun by ray-casting from a window to the sun.

Buildings are vertical prisms. Each time sample checks the window's bottom,
centre, and top, allowing partial sunlight when a roof crosses the window.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from rentroo.sunlight.buildings import Building, Buildings
from rentroo.sunlight.sun import WINTER_SOLSTICE, SolarDay, sun_position

FLOOR_HEIGHT = 3.0  # metres per storey
WINDOW_SILL = 1.0  # window centre above the floor
WINDOW_HALF = 0.6  # half the window's height; centre ± this is sampled
SEARCH_RADIUS = 600.0  # maximum obstacle search distance, metres
START_MIN = 6 * 60  # 06:00
END_MIN = 18 * 60  # 18:00
STEP_MIN = 10
LIT_THRESHOLD = 2 / 3  # a sample counts as "lit" for segments at ≥ this fraction


class BuildingNotFoundError(ValueError):
    """The listing coordinate does not identify a PLATEAU building."""


@dataclass(frozen=True)
class SunlightResult:
    hours: float  # direct-sun hours, partial samples weighted
    segments: list[tuple[int, int]]  # (start, end) minutes past midnight, lit stretches
    samples: list[float]  # 0..1 lit fraction per STEP_MIN from START_MIN to END_MIN


def winter_sunlight(
    buildings: Buildings,
    lat: float,
    lon: float,
    floor: int,
    facing: float,
    day: SolarDay = WINTER_SOLSTICE,
) -> SunlightResult:
    """
    Direct-sun profile for a window on `floor` (1 = ground) facing `facing`
    degrees clockwise from north, on the given day.
    """
    x, y = buildings.to_local(lat, lon)
    own = _containing(buildings, x, y)
    if own is None:
        raise BuildingNotFoundError(
            f"no PLATEAU building contains listing coordinate ({lat:.6f}, {lon:.6f})"
        )
    x, y = _facade_point(own, x, y, facing)
    ground = own.ground

    z_centre = ground + (floor - 1) * FLOOR_HEIGHT + WINDOW_SILL
    window = [z_centre - WINDOW_HALF, z_centre, z_centre + WINDOW_HALF]

    # Precompute each building's maximum possible blocking altitude.
    candidates = [
        (b, _max_block_angle(b, x, y, window[0]))
        for b in buildings.near(x, y, SEARCH_RADIUS)
        if b.ground + b.height > window[0]
    ]

    samples: list[float] = []
    for minutes in range(START_MIN, END_MIN + 1, STEP_MIN):
        alt, az = sun_position(lat, lon, minutes, day)
        if alt <= 0 or math.cos(math.radians(az - facing)) <= 0:
            samples.append(0.0)  # night or behind the wall
            continue
        tall_enough = [b for b, limit in candidates if limit > alt]
        lit = sum(not is_blocked(x, y, z, alt, az, tall_enough) for z in window)
        samples.append(lit / len(window))

    return SunlightResult(
        hours=round(sum(samples) * STEP_MIN / 60, 2),
        segments=_segments(samples),
        samples=samples,
    )


def is_blocked(
    x: float, y: float, z: float, altitude: float, azimuth: float, buildings: list[Building]
) -> bool:
    """Is a ray from (x, y, z) toward the sun stopped by any of `buildings`?"""
    dx = math.sin(math.radians(azimuth))
    dy = math.cos(math.radians(azimuth))
    slope = math.tan(math.radians(altitude))
    for b in buildings:
        top = b.ground + b.height
        if top <= z or not _ray_hits_box(x, y, dx, dy, b):
            continue
        d = _ray_distance_to_ring(x, y, dx, dy, b.ring)
        if d is not None and z + d * slope < top:
            return True
    return False


# Geometry


def _max_block_angle(b: Building, x: float, y: float, z: float) -> float:
    """Altitude (degrees) below which b's roof could shade a point at (x, y, z)."""
    dx = max(b.min_x - x, 0.0, x - b.max_x)
    dy = max(b.min_y - y, 0.0, y - b.max_y)
    return math.degrees(math.atan2(b.ground + b.height - z, math.hypot(dx, dy)))


def _ray_hits_box(x: float, y: float, dx: float, dy: float, b: Building) -> bool:
    """Slab test: does the ray from (x, y) along (dx, dy) touch b's bounding box?"""
    t_min, t_max = 0.0, math.inf
    for o, d, lo, hi in ((x, dx, b.min_x, b.max_x), (y, dy, b.min_y, b.max_y)):
        if abs(d) < 1e-12:
            if o < lo or o > hi:
                return False
            continue
        t1, t2 = (lo - o) / d, (hi - o) / d
        t_min = max(t_min, min(t1, t2))
        t_max = min(t_max, max(t1, t2))
        if t_min > t_max:
            return False
    return True


def _ray_distance_to_ring(
    x: float, y: float, dx: float, dy: float, ring: tuple[tuple[float, float], ...]
) -> float | None:
    """Distance along the ray to the nearest edge crossing, or None if it misses."""
    best = None
    for (ax, ay), (bx, by) in zip(ring, ring[1:], strict=False):
        ex, ey = bx - ax, by - ay
        denom = dx * ey - dy * ex
        if abs(denom) < 1e-12:
            continue
        # Solve origin + t·dir = edge_start + u·edge.
        t = ((ax - x) * ey - (ay - y) * ex) / denom
        u = ((ax - x) * dy - (ay - y) * dx) / denom
        if t > 1e-9 and 0.0 <= u <= 1.0 and (best is None or t < best):
            best = t
    return best


def _contains(ring: tuple[tuple[float, float], ...], x: float, y: float) -> bool:
    """Even-odd point-in-polygon."""
    inside = False
    for (ax, ay), (bx, by) in zip(ring, ring[1:], strict=False):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def _containing(buildings: Buildings, x: float, y: float) -> Building | None:
    for b in buildings.near(x, y, 0.0):
        if _contains(b.ring, x, y):
            return b
    return None


def _facade_point(b: Building, x: float, y: float, facing: float) -> tuple[float, float]:
    """Move an interior point to the facade facing `facing`."""
    dx = math.sin(math.radians(facing))
    dy = math.cos(math.radians(facing))
    d = _ray_distance_to_ring(x, y, dx, dy, b.ring)
    if d is None:
        return x, y
    # Start just outside the wall.
    d += 0.01
    return x + d * dx, y + d * dy


def _segments(samples: list[float]) -> list[tuple[int, int]]:
    """Return lit runs as half-open minute ranges."""
    out: list[tuple[int, int]] = []
    start = None
    for i, s in enumerate(samples + [0.0]):
        lit = s >= LIT_THRESHOLD
        if lit and start is None:
            start = START_MIN + i * STEP_MIN
        elif not lit and start is not None:
            out.append((start, START_MIN + i * STEP_MIN))
            start = None
    return out
