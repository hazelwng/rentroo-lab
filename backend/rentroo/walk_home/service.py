"""Walk-home route from the nearest station, with per-leg mapped context."""

from __future__ import annotations

import math
from dataclasses import dataclass

from rentroo.walk_home.data import Poi, Station, get_walk_graph, get_walk_home_data
from rentroo.walk_home.legs import assign_to_legs, coords_bbox, lit_fraction
from rentroo.walk_home.routing import Leg, group_display_legs, route_between

MAX_STATION_M = 2000
WALK_MIN_PER_KM = 12.5
LAMP_COVERAGE_MIN = 3


@dataclass(frozen=True)
class WalkHomeLeg:
    name: str | None
    coords: list[tuple[float, float]]
    distance_m: int
    pois: list[Poi]
    lamp_count: int | None
    lit_fraction: float | None


@dataclass(frozen=True)
class WalkHomeResult:
    station: Station
    distance_m: int
    walk_min: int
    route_coords: list[tuple[float, float]]
    lamps: list[tuple[float, float]]
    legs: list[WalkHomeLeg]


class WalkHomeUnavailable(Exception):
    """No station or no seeded coverage at this location."""


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    mean_lat = math.radians((a[0] + b[0]) / 2)
    dy = (a[0] - b[0]) * 111_320.0
    dx = (a[1] - b[1]) * 111_320.0 * math.cos(mean_lat)
    return math.hypot(dx, dy)


def nearest_station(stations: tuple[Station, ...], lat: float, lon: float) -> Station | None:
    best = None
    best_d = float(MAX_STATION_M)
    for station in stations:
        d = _distance_m((lat, lon), (station.lat, station.lon))
        if d < best_d:
            best = station
            best_d = d
    return best


def _rounded_leg_distances(legs: list[Leg]) -> list[int]:
    """Round leg metres while preserving their rounded total distance."""
    distances = [math.floor(leg.distance_m) for leg in legs]
    remainder = round(sum(leg.distance_m for leg in legs)) - sum(distances)
    largest_fractions = sorted(
        range(len(legs)),
        key=lambda index: legs[index].distance_m - distances[index],
        reverse=True,
    )
    for index in largest_fractions[:remainder]:
        distances[index] += 1
    return distances


def walk_home(lat: float, lon: float) -> WalkHomeResult:
    data = get_walk_home_data()
    station = nearest_station(data.stations, lat, lon)
    if station is None:
        raise WalkHomeUnavailable(f"no station within {MAX_STATION_M} m")

    graph = get_walk_graph()
    route = route_between(graph, (station.lat, station.lon), (lat, lon))
    if route is None:
        raise WalkHomeUnavailable("no walk-graph coverage at this location")
    display_legs = group_display_legs(route.legs)

    south, west, north, east = coords_bbox(route.route_coords)
    lamp_candidates = data.lamps_in_bbox(south, west, north, east)
    corridor_pois = data.pois_in_bbox(south, west, north, east)

    lamp_groups = assign_to_legs(display_legs, lamp_candidates)
    poi_groups = assign_to_legs(display_legs, [(poi.lat, poi.lon) for poi in corridor_pois])

    route_lamps = [lamp_candidates[i] for group in lamp_groups for i in group]
    lamps_mapped = len(route_lamps) >= LAMP_COVERAGE_MIN
    leg_distances = _rounded_leg_distances(display_legs)

    legs = [
        WalkHomeLeg(
            name=leg.name,
            coords=leg.coords,
            distance_m=leg_distances[k],
            pois=[corridor_pois[i] for i in poi_groups[k]],
            lamp_count=len(lamp_groups[k]) if lamps_mapped else None,
            lit_fraction=(
                round(lit_fraction(leg.coords, [lamp_candidates[i] for i in lamp_groups[k]]), 2)
                if lamps_mapped
                else None
            ),
        )
        for k, leg in enumerate(display_legs)
    ]

    return WalkHomeResult(
        station=station,
        distance_m=round(route.distance_m),
        walk_min=max(1, round(route.distance_m / 1000 * WALK_MIN_PER_KM)),
        route_coords=route.route_coords,
        lamps=route_lamps,
        legs=legs,
    )
