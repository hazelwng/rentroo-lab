"""Shared helpers for a door-to-door walking commute option."""

import math

from rentroo.commute.types import ItineraryLeg, RouteOption, TransitItinerary

WALK_M_PER_MIN = 80


def straight_line_distance_m(
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> int:
    mean_lat = math.radians((origin[0] + destination[0]) / 2)
    dx = math.radians(destination[1] - origin[1]) * math.cos(mean_lat) * 6_371_000
    dy = math.radians(destination[0] - origin[0]) * 6_371_000
    return round(math.hypot(dx, dy))


def build_direct_walk_option(
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> RouteOption:
    distance_m = straight_line_distance_m(origin, destination)
    duration_min = max(1, math.ceil(distance_m / WALK_M_PER_MIN))
    itinerary = TransitItinerary(
        total_min=duration_min,
        transfers=0,
        walk_total_min=duration_min,
        legs=[
            ItineraryLeg(
                kind="walk",
                from_name="origin",
                to_name="destination",
                duration_min=duration_min,
                distance_m=distance_m,
            )
        ],
    )
    return RouteOption(
        tags=["fastest", "fewest_transfers", "least_walking"],
        best=True,
        itinerary=itinerary,
    )
