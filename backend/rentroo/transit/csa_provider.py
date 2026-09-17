"""CSA commute provider backed by Tokyo's transit bundle."""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from rentroo.commute.types import (
    CommuteProviderUnavailable,
    CommuteQuery,
    CommuteResult,
    ItineraryLeg,
    RouteOption,
    TransitItinerary,
)
from rentroo.config import get_city_config
from rentroo.transit.csa import MIN_TRANSFER_SEC, ScanResult, reconstruct, scan
from rentroo.transit.direct_walking import build_direct_walk_option
from rentroo.transit.gtfs import Connection, Feed, Stop, parse_gtfs_time
from rentroo.transit.mini_tokyo import load_mini_tokyo_bundle
from rentroo.transit.transfers import Footpath

# Prefer staying onboard unless a transfer saves this much time.
TRANSFER_PENALTY_SEC = 15 * 60
# Candidate stations; least-walking uses only the nearest.
STATION_CANDIDATES = 3
TRANSIT_BUNDLE = Path("transit/mini_tokyo_weekday.json.gz")


# ---- private journey types ----


@dataclass(frozen=True)
class _StationMatch:
    name: str
    stop_ids: set[str]
    distance_m: int


@dataclass(frozen=True)
class _Journey:
    """A reconstructed door-to-door journey between two chosen stations."""

    legs: tuple[Connection | Footpath, ...]
    origin: _StationMatch
    destination: _StationMatch
    arrival: int  # at the destination platform, seconds since midnight


@dataclass(frozen=True)
class _OriginScans:
    """Reusable origin scans, one per route criterion."""

    fastest: ScanResult  # all origins, no penalty
    least_walking: ScanResult  # nearest origin only, no penalty
    fewest_transfers: ScanResult  # all origins, transfer penalty


@dataclass
class _TransitRuntime:
    """Cached feed and route indexes."""

    feed: Feed
    footpaths: dict[str, list[Footpath]]
    departures: dict[tuple[str, str], list[Connection]]
    trip_connections: dict[str, list[Connection]]


# ---- the provider ----


class GtfsCsaProvider:
    name = "csa"

    async def calculate(self, query: CommuteQuery) -> CommuteResult:
        config = get_city_config()
        runtime = _load_transit_runtime(config.city_dir)
        feed, footpaths = runtime.feed, runtime.footpaths
        origin_candidates = _nearest_stations(feed, query.origin, STATION_CANDIDATES)
        departure = parse_gtfs_time(query.departure)

        scans = _run_origin_scans(feed, footpaths, origin_candidates, departure)
        result = _build_result_for_destination(
            runtime,
            scans,
            origin_candidates,
            query.origin,
            query.destination,
            departure,
        )
        if result is None:
            dest_name = _nearest_stations(feed, query.destination, 1)[0].name
            raise CommuteProviderUnavailable(
                f"No weekday route found from {origin_candidates[0].name} "
                f"to {dest_name} after {query.departure}"
            )
        return result

    async def calculate_batch(
        self,
        origin: tuple[float, float],
        destinations: list[tuple[float, float]],
        departure_time: str = "08:00:00",
    ) -> list[CommuteResult | None]:
        """Route to many destinations using shared origin scans.

        Results align with ``destinations``; unreachable entries are ``None``.
        """
        config = get_city_config()
        runtime = _load_transit_runtime(config.city_dir)
        feed, footpaths = runtime.feed, runtime.footpaths
        origin_candidates = _nearest_stations(feed, origin, STATION_CANDIDATES)
        departure = parse_gtfs_time(departure_time)
        scans = _run_origin_scans(feed, footpaths, origin_candidates, departure)
        return [
            _build_result_for_destination(
                runtime, scans, origin_candidates, origin, dest, departure
            )
            for dest in destinations
        ]


# ---- journey search pipeline (in the order calculate() uses it) ----


@lru_cache(maxsize=4)
def _load_transit_runtime(city_dir: Path) -> _TransitRuntime:
    bundle_path = city_dir / TRANSIT_BUNDLE
    try:
        feed, footpaths = load_mini_tokyo_bundle(bundle_path)
    except (FileNotFoundError, OSError, ValueError) as exc:
        raise CommuteProviderUnavailable(
            f"Tokyo transit bundle could not be loaded from '{bundle_path}': {exc}"
        ) from exc
    departures, trip_connections = _build_route_indexes(feed)
    return _TransitRuntime(feed, footpaths, departures, trip_connections)


def _nearest_stations(
    feed: Feed, coordinates: tuple[float, float], k: int = 1
) -> list[_StationMatch]:
    """The k nearest distinct stations (grouping same-name platforms), closest first."""
    if not feed.stops:
        raise CommuteProviderUnavailable("The configured transit feed contains no stops")
    best_by_name: dict[str, tuple[float, Stop]] = {}
    for stop in feed.stops.values():
        distance = _distance_m(coordinates, (stop.lat, stop.lon))
        current = best_by_name.get(stop.name)
        if current is None or distance < current[0]:
            best_by_name[stop.name] = (distance, stop)
    ranked = sorted(best_by_name.values(), key=lambda pair: pair[0])[:k]
    return [
        _StationMatch(
            stop.name,
            {platform.stop_id for platform in feed.stops_by_name(stop.name)},
            round(distance),
        )
        for distance, stop in ranked
    ]


def _scan_origins(
    feed: Feed,
    footpaths: dict[str, list[Footpath]],
    origins: list[_StationMatch],
    departure: int,
    transfer_penalty_sec: int = 0,
) -> ScanResult:
    """One CSA pass from every candidate origin platform (each seeded with its
    own access-walk time). Destination-independent: the returned earliest-arrival
    map covers every reachable stop, so one scan answers many destinations."""
    origin_ready = {
        stop_id: departure + _walk_minutes(station.distance_m) * 60
        for station in origins
        for stop_id in station.stop_ids
    }
    return scan(feed, origin_ready, departure, footpaths, transfer_penalty_sec)


def _pick_journey(
    feed: Feed,
    in_conn: ScanResult,
    origins: list[_StationMatch],
    destinations: list[_StationMatch],
) -> _Journey | None:
    """Pick the destination candidate with the earliest door-to-door arrival in a
    completed origin scan and reconstruct its journey. Read-only over `in_conn`,
    so the same scan can be re-picked for any number of destinations."""
    best: tuple[int, _StationMatch, str] | None = None
    for station in destinations:
        walk_sec = _walk_minutes(station.distance_m) * 60
        for stop_id in station.stop_ids:
            if stop_id not in in_conn:
                continue
            door_to_door = _arrival_time(in_conn, stop_id) + walk_sec
            if best is None or door_to_door < best[0]:
                best = (door_to_door, station, stop_id)
    if best is None:
        return None

    _, dest_station, dest_stop = best
    legs = reconstruct(in_conn, dest_stop)
    first_ride = next((leg for leg in legs if isinstance(leg, Connection)), None)
    if first_ride is None:
        return None
    boarded_name = feed.stops[first_ride.dep_stop].name
    origin_station = next((s for s in origins if boarded_name == s.name), origins[0])
    return _Journey(
        legs=tuple(legs),
        origin=origin_station,
        destination=dest_station,
        arrival=_arrival_time(in_conn, dest_stop),
    )


def _find_journey(
    feed: Feed,
    footpaths: dict[str, list[Footpath]],
    origins: list[_StationMatch],
    destinations: list[_StationMatch],
    departure: int,
    transfer_penalty_sec: int = 0,
) -> _Journey | None:
    """Scan from `origins` then pick the best `destinations` candidate. Kept as a
    single-shot convenience; batch callers scan once and `_pick_journey` many."""
    in_conn = _scan_origins(feed, footpaths, origins, departure, transfer_penalty_sec)
    return _pick_journey(feed, in_conn, origins, destinations)


def _run_origin_scans(
    feed: Feed,
    footpaths: dict[str, list[Footpath]],
    origin_candidates: list[_StationMatch],
    departure: int,
) -> _OriginScans:
    """The three origin-seeded scans a route table needs, computed once."""
    return _OriginScans(
        fastest=_scan_origins(feed, footpaths, origin_candidates, departure),
        least_walking=_scan_origins(feed, footpaths, origin_candidates[:1], departure),
        fewest_transfers=_scan_origins(
            feed, footpaths, origin_candidates, departure, TRANSFER_PENALTY_SEC
        ),
    )


def _build_result_for_destination(
    runtime: _TransitRuntime,
    scans: _OriginScans,
    origin_candidates: list[_StationMatch],
    origin_coords: tuple[float, float],
    dest_coords: tuple[float, float],
    departure: int,
) -> CommuteResult | None:
    """Build one destination result from shared origin scans."""
    feed = runtime.feed
    dest_candidates = _nearest_stations(feed, dest_coords, STATION_CANDIDATES)
    direct_walk = build_direct_walk_option(origin_coords, dest_coords)

    fastest = _pick_journey(feed, scans.fastest, origin_candidates, dest_candidates)
    if fastest is None:
        # Same-station trips have no train leg to reconstruct.
        if origin_candidates[0].name == dest_candidates[0].name:
            return _direct_walk_result(origin_coords, dest_coords, direct_walk)
        return None

    least_walking = _pick_journey(
        feed, scans.least_walking, origin_candidates[:1], dest_candidates[:1]
    )
    fewest_transfers = _pick_journey(
        feed, scans.fewest_transfers, origin_candidates, dest_candidates
    )
    if fewest_transfers is not None:
        # Remove artificial waits introduced by the transfer penalty.
        fewest_transfers = _retime_journey(runtime, fewest_transfers, departure)

    # Dedupe the candidate journeys into unique routes (same stations + lines).
    unique_itineraries: list[TransitItinerary] = []
    seen: dict[tuple, int] = {}
    for journey in (fastest, fewest_transfers, least_walking):
        if journey is None:
            continue
        signature = _journey_signature(journey)
        if signature in seen:
            continue
        seen[signature] = len(unique_itineraries)
        unique_itineraries.append(
            _build_itinerary(feed, journey, departure, origin_coords, dest_coords)
        )

    # Tag measured winners, not the scan that produced each route.
    # Drop candidates that win no criterion.
    tags_for: list[list[str]] = [[] for _ in unique_itineraries]

    def _winner(metric) -> int:
        return min(
            range(len(unique_itineraries)),
            key=lambda i: metric(unique_itineraries[i]),
        )

    tags_for[_winner(lambda it: it.total_min)].append("fastest")
    tags_for[_winner(lambda it: it.transfers)].append("fewest_transfers")
    tags_for[_winner(lambda it: it.walk_total_min)].append("least_walking")

    options = [
        RouteOption(tags=tags, best="fastest" in tags, itinerary=it)
        for it, tags in zip(unique_itineraries, tags_for, strict=True)
        if tags
    ]
    # Fastest first (it drives the summary and legs below), then by travel time.
    options.sort(key=lambda o: (not o.best, o.itinerary.total_min))

    itinerary = options[0].itinerary
    if direct_walk.itinerary.total_min <= itinerary.total_min:
        return _direct_walk_result(origin_coords, dest_coords, direct_walk)

    rides = [leg for leg in itinerary.legs if leg.kind == "ride"]
    route_names = _ordered_unique(leg.line for leg in rides)
    summary = " → ".join(route_names)
    if itinerary.transfers:
        summary += f" · {itinerary.transfers} transfer{'s' if itinerary.transfers != 1 else ''}"

    return CommuteResult(
        transit_minutes=itinerary.total_min,
        distance_km=round(_distance_m(origin_coords, dest_coords) / 1000, 1),
        source=GtfsCsaProvider.name,
        transit_route_summary=summary,
        transit_itinerary=itinerary,
        route_options=options,
    )


def _direct_walk_result(
    origin_coords: tuple[float, float],
    dest_coords: tuple[float, float],
    option: RouteOption,
) -> CommuteResult:
    return CommuteResult(
        transit_minutes=option.itinerary.total_min,
        distance_km=round(_distance_m(origin_coords, dest_coords) / 1000, 1),
        source=GtfsCsaProvider.name,
        transit_route_summary="Walk directly to destination",
        transit_itinerary=option.itinerary,
        route_options=[option],
    )


def _build_route_indexes(
    feed: Feed,
) -> tuple[dict[tuple[str, str], list[Connection]], dict[str, list[Connection]]]:
    """Index departures by route/stop and connections by trip."""
    dep_index: dict[tuple[str, str], list[Connection]] = {}
    trip_conns: dict[str, list[Connection]] = {}
    for connection in feed.connections:  # already globally sorted by dep_time
        dep_index.setdefault((connection.route_id, connection.dep_stop), []).append(connection)
        trip_conns.setdefault(connection.trip_id, []).append(connection)
    return dep_index, trip_conns


def _earliest_ride(
    dep_index: dict[tuple[str, str], list[Connection]],
    trip_conns: dict[str, list[Connection]],
    route_id: str,
    dep_stop: str,
    arr_stop: str,
    ready: int,
) -> list[Connection] | None:
    """Find the earliest matching ride after ``ready``."""
    for candidate in dep_index.get((route_id, dep_stop), ()):
        if candidate.dep_time < ready:
            continue
        conns = trip_conns[candidate.trip_id]
        ride: list[Connection] = []
        for connection in conns[conns.index(candidate) :]:
            ride.append(connection)
            if connection.arr_stop == arr_stop:
                return ride
    return None


def _retime_journey(runtime: _TransitRuntime, journey: _Journey, departure: int) -> _Journey:
    """Replay a route without artificial transfer-penalty waits."""
    dep_index, trip_conns = runtime.departures, runtime.trip_connections
    ready = departure + _walk_minutes(journey.origin.distance_m) * 60
    arrival = ready
    new_legs: list[Connection | Footpath] = []
    for group in _group_journey_legs(list(journey.legs)):
        if isinstance(group, Footpath):
            arrival += group.walk_time
            ready = arrival  # walk_time already includes the transfer buffer
            new_legs.append(group)
        else:
            ride = _earliest_ride(
                dep_index,
                trip_conns,
                group[0].route_id,
                group[0].dep_stop,
                group[-1].arr_stop,
                ready,
            )
            if ride is None:
                return journey
            new_legs.extend(ride)
            arrival = ride[-1].arr_time
            ready = arrival + MIN_TRANSFER_SEC
    return _Journey(
        legs=tuple(new_legs),
        origin=journey.origin,
        destination=journey.destination,
        arrival=arrival,
    )


def _journey_signature(journey: _Journey) -> tuple:
    """Stations and lines only — two journeys riding the same pattern on
    different departures are the same route."""
    parts: list[tuple] = [("origin", journey.origin.name), ("dest", journey.destination.name)]
    for group in _group_journey_legs(list(journey.legs)):
        if isinstance(group, Footpath):
            parts.append(("walk", group.from_stop, group.to_stop))
        else:
            parts.append(("ride", group[0].route_id, group[0].dep_stop, group[-1].arr_stop))
    return tuple(parts)


def _build_itinerary(
    feed: Feed,
    journey: _Journey,
    departure: int,
    origin_coords: tuple[float, float],
    dest_coords: tuple[float, float],
) -> TransitItinerary:
    origin_walk_min = _walk_minutes(journey.origin.distance_m)
    destination_walk_min = _walk_minutes(journey.destination.distance_m)
    total_minutes = math.ceil((journey.arrival + destination_walk_min * 60 - departure) / 60)
    trip_ids = _ordered_unique(leg.trip_id for leg in journey.legs if isinstance(leg, Connection))
    transfers = max(0, len(trip_ids) - 1)

    first_leg, last_leg = journey.legs[0], journey.legs[-1]
    origin_stop = first_leg.dep_stop if isinstance(first_leg, Connection) else first_leg.from_stop
    dest_stop = last_leg.arr_stop if isinstance(last_leg, Connection) else last_leg.to_stop
    itinerary_legs = [
        ItineraryLeg(
            kind="walk",
            from_name="origin",
            to_name=journey.origin.name,
            duration_min=origin_walk_min,
            distance_m=journey.origin.distance_m,
            path=[origin_coords, _stop_coords(feed, origin_stop)],
        )
    ]
    walk_total_min = origin_walk_min + destination_walk_min
    for group in _group_journey_legs(list(journey.legs)):
        if isinstance(group, Footpath):
            transfer_min = max(1, math.ceil(group.walk_time / 60))
            itinerary_legs.append(
                ItineraryLeg(
                    kind="transfer",
                    from_name=feed.stops[group.from_stop].name,
                    to_name=feed.stops[group.to_stop].name,
                    duration_min=transfer_min,
                    path=[_stop_coords(feed, group.from_stop), _stop_coords(feed, group.to_stop)],
                )
            )
            walk_total_min += transfer_min
        else:
            first, last = group[0], group[-1]
            itinerary_legs.append(
                ItineraryLeg(
                    kind="ride",
                    from_name=feed.stops[first.dep_stop].name,
                    to_name=feed.stops[last.arr_stop].name,
                    duration_min=max(1, math.ceil((last.arr_time - first.dep_time) / 60)),
                    line=feed.route_names[first.route_id],
                    line_color=feed.route_colors.get(first.route_id),
                    stops=len(group),
                    path=[_stop_coords(feed, first.dep_stop)]
                    + [_stop_coords(feed, c.arr_stop) for c in group],
                )
            )
    itinerary_legs.append(
        ItineraryLeg(
            kind="walk",
            from_name=journey.destination.name,
            to_name="destination",
            duration_min=destination_walk_min,
            distance_m=journey.destination.distance_m,
            path=[_stop_coords(feed, dest_stop), dest_coords],
        )
    )
    return TransitItinerary(
        total_min=total_minutes,
        transfers=transfers,
        walk_total_min=walk_total_min,
        legs=itinerary_legs,
    )


# ---- shared small helpers ----


def _stop_coords(feed: Feed, stop_id: str) -> tuple[float, float]:
    stop = feed.stops[stop_id]
    return (stop.lat, stop.lon)


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    mean_lat = math.radians((a[0] + b[0]) / 2)
    dx = math.radians(b[1] - a[1]) * math.cos(mean_lat) * 6_371_000
    dy = math.radians(b[0] - a[0]) * 6_371_000
    return math.hypot(dx, dy)


def _walk_minutes(distance_m: int) -> int:
    return max(1, math.ceil(distance_m / 80))


def _arrival_time(
    in_conn: ScanResult,
    stop_id: str,
) -> int:
    return in_conn.arrival_time(stop_id)


def _ordered_unique(values) -> list[str]:
    return list(dict.fromkeys(values))


def _group_journey_legs(
    legs: list[Connection | Footpath],
) -> list[list[Connection] | Footpath]:
    """Merge consecutive same-trip connections into one ride; keep footpaths.

    A trip change at the same platform produces adjacent groups with no
    footpath between them — that is still a transfer, counted via trip_ids.
    """
    groups: list[list[Connection] | Footpath] = []
    for leg in legs:
        if isinstance(leg, Footpath):
            groups.append(leg)
        elif groups and isinstance(groups[-1], list) and groups[-1][-1].trip_id == leg.trip_id:
            groups[-1].append(leg)
        else:
            groups.append([leg])
    return groups
