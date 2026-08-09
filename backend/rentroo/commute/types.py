"""
Commute query/result types shared by the service facade and every provider.

A leaf module with no project imports, so both service and providers can
depend on it without creating a cycle.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class CommuteQuery:
    origin: tuple[float, float]
    destination: tuple[float, float]
    departure: str = "08:00:00"  # GTFS time-of-day on a weekday


@dataclass
class ItineraryLeg:
    """One segment of a transit journey, in travel order.

    kind='walk'     access/egress on foot; distance_m is set.
    kind='ride'     one vehicle boarding; line/line_color/stops are set.
    kind='transfer' walking between platforms mid-journey (from_name == to_name
                    for same-station transfers).
    """

    kind: str  # "walk" | "ride" | "transfer"
    from_name: str
    to_name: str
    duration_min: int
    distance_m: int | None = None
    line: str | None = None
    line_color: str | None = None
    stops: int | None = None


@dataclass
class TransitItinerary:
    total_min: int
    transfers: int
    walk_total_min: int
    legs: list[ItineraryLeg]


@dataclass
class RouteOption:
    """
    Alternative routes for the same origin ~ destination pair.
    tags: ["fastest", "fewest_transfers", "least_walking"].
    """

    tags: list[str]
    best: bool  # recommended route
    itinerary: TransitItinerary


@dataclass
class CommuteResult:
    """Commute calculation result for a single origin-destination pair."""

    transit_minutes: int | None = None
    distance_km: float | None = None
    source: str = "csa"
    transit_route_summary: str | None = None
    transit_itinerary: TransitItinerary | None = None
    route_options: list[RouteOption] | None = None


class CommuteProviderUnavailable(RuntimeError):
    """The configured provider exists but is not ready to serve requests."""
