"""
Synthesize station transfers for feeds without transfers.txt.

Platforms of the same station are separate GTFS stops (銀座 = 3 stop_ids).
Group stops by identical stop_name and generate walk edges between every
pair in a group.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass

from rentroo.transit.gtfs import Feed

# variables to calculate walk time between platforms (stops)
WALK_SPEED_M_PER_MIN = 80  # JP real-estate standard: 徒歩1分 = 80m
DETOUR_FACTOR = 1.5  # straight-line -> corridors/stairs
BUFFER_SEC = 120  # add buffer time for passing gates and platform changes


@dataclass(frozen=True, slots=True)
class Footpath:
    from_stop: str
    to_stop: str
    walk_time: int  # seconds


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the straight-line distance between two stops."""
    mean_lat = math.radians((lat1 + lat2) / 2)
    dx = math.radians(lon2 - lon1) * math.cos(mean_lat) * 6_371_000
    dy = math.radians(lat2 - lat1) * 6_371_000
    return math.hypot(dx, dy)


def build_footpaths(feed: Feed) -> dict[str, list[Footpath]]:
    """Walk edges between same-name platforms, keyed by the departing stop:

    {
        '309': [Footpath(from_stop='309', to_stop='109', walk_time=246),
                Footpath(from_stop='309', to_stop='219', walk_time=219)],
        '109': [Footpath(from_stop='109', to_stop='309', walk_time=246), ...],
        ...
    }
    Stops whose name is unique (nothing to transfer to) are absent.
    """
    by_name: dict[str, list[str]] = {}
    for stop in feed.stops.values():
        by_name.setdefault(stop.name, []).append(stop.stop_id)

    return build_group_footpaths(feed, by_name.values())


def build_group_footpaths(
    feed: Feed, station_groups: Iterable[Iterable[str]]
) -> dict[str, list[Footpath]]:
    """Build directed walking edges between every stop in each station group.

    This is the shared primitive behind same-name GTFS transfers and explicit
    interchange groups supplied by sources such as Mini Tokyo 3D.
    """

    footpaths: dict[str, list[Footpath]] = {}
    for group in station_groups:
        stop_ids = list(dict.fromkeys(group))
        if len(stop_ids) < 2:
            continue
        unknown = [stop_id for stop_id in stop_ids if stop_id not in feed.stops]
        if unknown:
            raise ValueError(f"Station group references unknown stops: {', '.join(unknown)}")
        for a in stop_ids:
            for b in stop_ids:
                if a == b:
                    continue
                sa, sb = feed.stops[a], feed.stops[b]
                distance = _distance_m(sa.lat, sa.lon, sb.lat, sb.lon)
                walk_time = int(distance * DETOUR_FACTOR / WALK_SPEED_M_PER_MIN * 60) + BUFFER_SEC
                footpaths.setdefault(a, []).append(Footpath(a, b, walk_time))
    return footpaths
