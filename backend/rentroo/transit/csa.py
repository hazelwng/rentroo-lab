"""
Connection Scan Algorithm (CSA): earliest-arrival and latest-departure
search over a Feed.
"""

from __future__ import annotations

from dataclasses import dataclass

from rentroo.transit.gtfs import Connection, Feed
from rentroo.transit.transfers import Footpath

INFINITY = float("inf")
MIN_TRANSFER_SEC = 60  # change to another train at the same platform

Leg = Connection | Footpath


@dataclass(frozen=True)
class _JourneyNode:
    """One immutable segment in a feasible journey reconstructed by the scan."""

    legs: tuple[Leg, ...]
    previous: _JourneyNode | None
    arrival_time: int


class ScanResult(dict[str, Leg]):
    """Incoming leg per stop plus labels for safe journey reconstruction.

    This remains a dict subclass so callers can inspect ``result[stop]``,
    iterate it, and count reachable stops exactly as before.
    """

    def __init__(self) -> None:
        super().__init__()
        self._journeys: dict[str, _JourneyNode] = {}

    def record(self, stop_id: str, node: _JourneyNode) -> None:
        self[stop_id] = node.legs[-1]
        self._journeys[stop_id] = node

    def arrival_time(self, stop_id: str) -> int:
        return self._journeys[stop_id].arrival_time

    def journey_to(self, stop_id: str) -> list[Leg]:
        segments: list[tuple[Leg, ...]] = []
        node = self._journeys.get(stop_id)
        while node is not None:
            segments.append(node.legs)
            node = node.previous
        segments.reverse()
        return [leg for segment in segments for leg in segment]


def scan(
    feed: Feed,
    origin_stops: set[str] | dict[str, int],
    departure: int,
    footpaths: dict[str, list[Footpath]] | None = None,
    transfer_penalty_sec: int = 0,
) -> ScanResult:
    """Earliest arrival at every reachable stop, leaving origin_stops at `departure`.

    origin_stops may be a dict of {stop_id: ready_time} when different origin
    platforms become boardable at different times (unequal access walks); a
    plain set means every origin is ready at `departure`.

    transfer_penalty_sec is added to the boarding threshold after every
    mid-journey train change or platform walk, steering the search toward
    journeys with fewer transfers. Reported times stay real (`earliest` and
    every Connection carry timetable times), but a penalized journey may board
    later trains than necessary — re-time its legs if exact waits matter.

    Returns the incoming connection (train leg) or footpath (walk leg) per stop:
    {
        '302': Connection(dep_stop='301', arr_stop='302', dep_time=08:03, arr_time=08:05, ...),
        '309': Connection(dep_stop='308', arr_stop='309', dep_time=08:22, arr_time=08:24, ...),
        '219': Footpath(from_stop='309', to_stop='219', walk_time=267),
        ...
    }
    Arrival time at a stop = result[stop].arr_time (Connection) or arrival at
    from_stop + walk_time (Footpath). Origin stops are absent (already there
    at their ready time). Use reconstruct() to retrieve the feasible route.
    """
    footpaths = footpaths or {}
    if not isinstance(origin_stops, dict):
        origin_stops = {stop: departure for stop in origin_stops}
    # earliest presence at a stop vs. earliest you can board a NEW trip there:
    # stepping off a train costs MIN_TRANSFER_SEC before boarding another one.
    earliest: dict[str, float] = dict(origin_stops)
    ready: dict[str, float] = dict(origin_stops)
    result = ScanResult()
    best_journey: dict[str, _JourneyNode] = {}
    boarded: set[str] = set()  # trips catchable in at least one journey; never removed
    # Keep the journey used to board each trip separate from mutable stop labels:
    # another train can improve a stop without being able to transfer onto this
    # already-departing trip. Connections traversed onboard are accumulated in a
    # list and frozen only when the trip improves a stop, avoiding one node
    # allocation for every scanned connection.
    trip_entry: dict[str, _JourneyNode | None] = {}
    trip_legs: dict[str, list[Connection]] = {}

    for c in feed.connections:
        if c.trip_id not in boarded:
            if c.dep_time < ready.get(c.dep_stop, INFINITY):
                continue  # cannot be at the departure platform in time
            boarded.add(c.trip_id)
            trip_entry[c.trip_id] = best_journey.get(c.dep_stop)
            trip_legs[c.trip_id] = []

        trip_legs[c.trip_id].append(c)

        if c.arr_time < earliest.get(c.arr_stop, INFINITY):
            connection_node = _JourneyNode(
                legs=tuple(trip_legs[c.trip_id]),
                previous=trip_entry[c.trip_id],
                arrival_time=c.arr_time,
            )
            earliest[c.arr_stop] = c.arr_time
            best_journey[c.arr_stop] = connection_node
            result.record(c.arr_stop, connection_node)
            ready[c.arr_stop] = min(
                ready.get(c.arr_stop, INFINITY),
                c.arr_time + MIN_TRANSFER_SEC + transfer_penalty_sec,
            )
            # relax walk edges: also update platforms reachable on foot
            for fp in footpaths.get(c.arr_stop, ()):
                walked = c.arr_time + fp.walk_time
                if walked < earliest.get(fp.to_stop, INFINITY):
                    earliest[fp.to_stop] = walked
                    footpath_node = _JourneyNode(
                        legs=(fp,),
                        previous=connection_node,
                        arrival_time=walked,
                    )
                    best_journey[fp.to_stop] = footpath_node
                    result.record(fp.to_stop, footpath_node)
                    # walk_time already includes the transfer buffer
                    ready[fp.to_stop] = min(
                        ready.get(fp.to_stop, INFINITY), walked + transfer_penalty_sec
                    )
    return result


def reconstruct(result: ScanResult, dest_stop: str) -> list[Leg]:
    """
    Return the list of legs (train connections and walks) from origin to dest_stop.
    """
    return result.journey_to(dest_stop)


@dataclass(frozen=True)
class _ReverseJourneyNode:
    """One immutable segment in a feasible journey, chained toward the destination."""

    legs: tuple[Leg, ...]
    onward: _ReverseJourneyNode | None
    departure_time: int


class ReverseScanResult(dict[str, Leg]):
    """Outgoing leg per stop plus labels for safe journey reconstruction.

    Mirror of ScanResult: ``result[stop]`` is the first leg leaving the stop,
    and the recorded journey runs forward in time toward the destination.
    """

    def __init__(self) -> None:
        super().__init__()
        self._journeys: dict[str, _ReverseJourneyNode] = {}

    def record(self, stop_id: str, node: _ReverseJourneyNode) -> None:
        self[stop_id] = node.legs[0]
        self._journeys[stop_id] = node

    def departure_time(self, stop_id: str) -> int:
        return self._journeys[stop_id].departure_time

    def journey_from(self, stop_id: str) -> list[Leg]:
        legs: list[Leg] = []
        node = self._journeys.get(stop_id)
        while node is not None:
            legs.extend(node.legs)
            node = node.onward
        return legs


def scan_reverse(
    feed: Feed,
    destination_stops: set[str] | dict[str, int],
    arrival: int,
    footpaths: dict[str, list[Footpath]] | None = None,
    transfer_penalty_sec: int = 0,
) -> ReverseScanResult:
    """Latest departure from every stop that still reaches destination_stops by `arrival`.

    Mirror of scan(): connections are swept in descending arr_time order and
    labels track the latest feasible presence time per stop.

    destination_stops may be a dict of {stop_id: deadline} when different
    destination platforms have different deadlines (unequal egress walks); a
    plain set means every destination counts if reached by `arrival`.

    transfer_penalty_sec widens the alighting margin required before boarding
    another trip, steering the search toward journeys with fewer transfers
    (see scan() for the caveats on penalized journeys).

    Returns the outgoing connection (train leg) or footpath (walk leg) per
    stop. Destination stops are absent (already there). Departure time from a
    stop = result.departure_time(stop); use reconstruct_reverse() to retrieve
    the feasible route toward the destination.
    """
    footpaths = footpaths or {}
    if not isinstance(destination_stops, dict):
        destination_stops = {stop: arrival for stop in destination_stops}
    # latest presence at a stop vs. latest you can ALIGHT there and continue:
    # stepping off a train costs MIN_TRANSFER_SEC before boarding the next one.
    latest: dict[str, float] = dict(destination_stops)
    exit_by: dict[str, float] = dict(destination_stops)
    result = ReverseScanResult()
    best_journey: dict[str, _ReverseJourneyNode] = {}
    exited: set[str] = set()  # trips with a feasible alighting stop; never removed
    # Mirror of scan()'s trip bookkeeping: the journey continuing from the
    # alighting stop is frozen per trip, while connections traversed onboard
    # accumulate in a list (in scan order, i.e. reverse travel order).
    trip_exit: dict[str, _ReverseJourneyNode | None] = {}
    trip_legs: dict[str, list[Connection]] = {}

    for c in feed.connections_by_arrival():
        if c.trip_id not in exited:
            if c.arr_time > exit_by.get(c.arr_stop, -INFINITY):
                continue  # alighting here leaves no time to continue the journey
            exited.add(c.trip_id)
            trip_exit[c.trip_id] = best_journey.get(c.arr_stop)
            trip_legs[c.trip_id] = []

        trip_legs[c.trip_id].append(c)

        if c.dep_time > latest.get(c.dep_stop, -INFINITY):
            connection_node = _ReverseJourneyNode(
                legs=tuple(reversed(trip_legs[c.trip_id])),
                onward=trip_exit[c.trip_id],
                departure_time=c.dep_time,
            )
            latest[c.dep_stop] = c.dep_time
            best_journey[c.dep_stop] = connection_node
            result.record(c.dep_stop, connection_node)
            exit_by[c.dep_stop] = max(
                exit_by.get(c.dep_stop, -INFINITY),
                c.dep_time - MIN_TRANSFER_SEC - transfer_penalty_sec,
            )
            # relax walk edges: platforms that can still walk here before departure
            for fp in footpaths.get(c.dep_stop, ()):
                walked = c.dep_time - fp.walk_time
                if walked > latest.get(fp.to_stop, -INFINITY):
                    latest[fp.to_stop] = walked
                    footpath_node = _ReverseJourneyNode(
                        # the actual walk runs toward the boarding platform
                        legs=(Footpath(fp.to_stop, fp.from_stop, fp.walk_time),),
                        onward=connection_node,
                        departure_time=walked,
                    )
                    best_journey[fp.to_stop] = footpath_node
                    result.record(fp.to_stop, footpath_node)
                    # walk_time already includes the transfer buffer
                    exit_by[fp.to_stop] = max(
                        exit_by.get(fp.to_stop, -INFINITY), walked - transfer_penalty_sec
                    )
    return result


def reconstruct_reverse(result: ReverseScanResult, origin_stop: str) -> list[Leg]:
    """
    Return the list of legs (train connections and walks) from origin_stop to the destination.
    """
    return result.journey_from(origin_stop)
