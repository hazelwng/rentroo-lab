"""Attach nearby lamps and POIs to route legs."""

from __future__ import annotations

import math

from rentroo.walk_home.routing import Leg

BUFFER_M = 50.0
LAMP_RADIUS_M = 25.0
SAMPLE_STEP_M = 5.0


def coords_bbox(
    coords: list[tuple[float, float]], buffer_m: float = BUFFER_M
) -> tuple[float, float, float, float]:
    """Return a buffered bounding box as (south, west, north, east)."""
    lat_min = min(lat for lat, _ in coords)
    lat_max = max(lat for lat, _ in coords)
    lon_min = min(lon for _, lon in coords)
    lon_max = max(lon for _, lon in coords)
    mid_lat = (lat_min + lat_max) / 2
    lat_buffer = buffer_m / 111_320
    lon_buffer = buffer_m / (111_320 * max(0.05, math.cos(math.radians(mid_lat))))
    return lat_min - lat_buffer, lon_min - lon_buffer, lat_max + lat_buffer, lon_max + lon_buffer


def _to_xy_m(point: tuple[float, float], origin: tuple[float, float]) -> tuple[float, float]:
    x = (point[1] - origin[1]) * 111_320 * math.cos(math.radians(origin[0]))
    y = (point[0] - origin[0]) * 111_320
    return x, y


def _point_to_segment_m(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    px, py = _to_xy_m(point, start)
    bx, by = _to_xy_m(end, start)
    denom = bx * bx + by * by
    if denom == 0:
        return math.hypot(px, py)
    t = max(0.0, min(1.0, (px * bx + py * by) / denom))
    return math.hypot(px - t * bx, py - t * by)


def point_to_polyline_m(point: tuple[float, float], coords: list[tuple[float, float]]) -> float:
    if not coords:
        return math.inf
    if len(coords) == 1:
        return _point_to_segment_m(point, coords[0], coords[0])
    return min(
        _point_to_segment_m(point, start, end)
        for start, end in zip(coords, coords[1:], strict=False)
    )


def assign_to_legs(
    legs: list[Leg],
    points: list[tuple[float, float]],
    buffer_m: float = BUFFER_M,
) -> list[list[int]]:
    """Group point indices by their nearest leg; points beyond buffer_m are dropped."""
    groups: list[list[int]] = [[] for _ in legs]
    for index, point in enumerate(points):
        nearest_leg = None
        nearest_d = buffer_m
        for leg_index, leg in enumerate(legs):
            d = point_to_polyline_m(point, leg.coords)
            if d <= nearest_d:
                nearest_leg = leg_index
                nearest_d = d
        if nearest_leg is not None:
            groups[nearest_leg].append(index)
    return groups


def _sample_polyline(coords: list[tuple[float, float]], step_m: float) -> list[tuple[float, float]]:
    samples = [coords[0]]
    for start, end in zip(coords, coords[1:], strict=False):
        sx, sy = _to_xy_m(end, start)
        length = math.hypot(sx, sy)
        steps = max(1, math.ceil(length / step_m))
        for i in range(1, steps + 1):
            f = i / steps
            samples.append((start[0] + (end[0] - start[0]) * f, start[1] + (end[1] - start[1]) * f))
    return samples


def lit_fraction(
    leg_coords: list[tuple[float, float]],
    lamps: list[tuple[float, float]],
    lamp_radius_m: float = LAMP_RADIUS_M,
    step_m: float = SAMPLE_STEP_M,
) -> float:
    """Fraction of the leg within lamp_radius_m of any lamp."""
    if len(leg_coords) < 2:
        return 0.0
    if not lamps:
        return 0.0
    samples = _sample_polyline(leg_coords, step_m)
    lit = sum(
        1
        for sample in samples
        if any(math.hypot(*_to_xy_m(lamp, sample)) <= lamp_radius_m for lamp in lamps)
    )
    return lit / len(samples)
