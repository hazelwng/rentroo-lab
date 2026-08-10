"""
GTFS static feed loader.

Reads a standard GTFS directory (stops/routes/trips/stop_times/calendar) and
decomposes each trip's stop sequence into atomic connections.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Stop:
    stop_id: str
    name: str
    lat: float
    lon: float
    parent_station: str  # blank in the Tokyo Metro feed; transfers.py groups by name instead


@dataclass(frozen=True)
class Connection:
    """One vehicle movement between two adjacent stops on a trip."""

    dep_stop: str
    arr_stop: str
    dep_time: int
    arr_time: int
    trip_id: str
    route_id: str


@dataclass
class Feed:
    stops: dict[str, Stop] = field(default_factory=dict)
    route_names: dict[str, str] = field(default_factory=dict)  # route_id -> 日比谷線 etc.
    route_colors: dict[str, str] = field(default_factory=dict)  # route_id -> '#FF9500'
    trip_routes: dict[str, str] = field(default_factory=dict)  # trip_id -> route_id
    connections: list[Connection] = field(default_factory=list)  # sorted by dep_time
    _connections_desc: list[Connection] | None = field(default=None, init=False, repr=False)

    def stops_by_name(self, name: str) -> list[Stop]:
        """All platforms whose stop_name matches exactly (e.g. 銀座 has 3)."""
        return [s for s in self.stops.values() if s.name == name]

    def connections_by_arrival(self) -> list[Connection]:
        """Connections sorted by descending arr_time, cached for reverse scans."""
        if self._connections_desc is None:
            self._connections_desc = sorted(
                self.connections, key=lambda c: c.arr_time, reverse=True
            )
        return self._connections_desc


def parse_gtfs_time(value: str) -> int:
    """'08:03:00' -> seconds since midnight. GTFS allows hours >= 24 (25:10:00)."""
    h, m, s = value.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def format_gtfs_time(seconds: int) -> str:
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _read_csv(path: Path) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _weekday_service_ids(gtfs_dir: Path) -> set[str]:
    """
    Load from calendar.txt: monday and friday are 1, other days are 0.
    Return the set of service_ids that run from Monday to Friday.
    """
    services = set()
    for row in _read_csv(gtfs_dir / "calendar.txt"):
        if row["monday"] == "1" and row["friday"] == "1":
            services.add(row["service_id"])
    return services


def load_feed(gtfs_dir: str | Path, *, weekday_only: bool = True) -> Feed:
    """Load a GTFS directory into a Feed with a globally time-sorted connection list.

    Returned feed:
    feed.connections = [
        Connection(dep_stop='C19', arr_stop='C18', dep_time=04:38, arr_time=04:41, ...),
        Connection(dep_stop='C18', arr_stop='C19', dep_time=04:54, arr_time=04:57, ...),
        Connection(dep_stop='T14', arr_stop='T15', dep_time=04:58, arr_time=05:00, ...),
    ]
    feed.stops       = {'301': Stop(name='中目黒', lat=35.64, lon=139.69, ...), ...}
    feed.route_names = {'3': '日比谷線', ...}

    """
    gtfs_dir = Path(gtfs_dir)
    required = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "calendar.txt"]
    missing = [name for name in required if not (gtfs_dir / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"GTFS feed at '{gtfs_dir}' is missing {', '.join(missing)}. "
            f"Place the extracted GTFS files in that directory."
        )
    feed = Feed()

    # read stops
    for row in _read_csv(gtfs_dir / "stops.txt"):
        feed.stops[row["stop_id"]] = Stop(
            stop_id=row["stop_id"],
            name=row["stop_name"],
            lat=float(row["stop_lat"]),
            lon=float(row["stop_lon"]),
            parent_station=row.get("parent_station", ""),
        )

    # read routes
    for row in _read_csv(gtfs_dir / "routes.txt"):
        feed.route_names[row["route_id"]] = row["route_long_name"] or row["route_short_name"]
        color = (row.get("route_color") or "").strip()
        if color:
            feed.route_colors[row["route_id"]] = f"#{color.upper()}"

    # read trips
    # return weekday-only services if opt in
    keep_services = _weekday_service_ids(gtfs_dir) if weekday_only else None
    for row in _read_csv(gtfs_dir / "trips.txt"):
        if keep_services is not None and row["service_id"] not in keep_services:
            continue
        feed.trip_routes[row["trip_id"]] = row["route_id"]

    # read stop_times
    by_trip: dict[str, list[tuple[int, int, int, str]]] = {}
    with open(gtfs_dir / "stop_times.txt", newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            # filter out invalid trips and stops
            trip_id = row["trip_id"]
            if trip_id not in feed.trip_routes:
                continue  # filtered service (e.g. weekend)
            if not row["arrival_time"] or not row["departure_time"]:
                continue
            by_trip.setdefault(trip_id, []).append(
                (
                    int(row["stop_sequence"]),
                    parse_gtfs_time(row["arrival_time"]),
                    parse_gtfs_time(row["departure_time"]),
                    row["stop_id"],
                )
            )
    # build connections
    for trip_id, rows in by_trip.items():
        # sort by stop_sequence
        rows.sort()
        route_id = feed.trip_routes[trip_id]
        for (_, _, dep_time, dep_stop), (_, arr_time, _, arr_stop) in zip(
            rows, rows[1:], strict=False
        ):
            feed.connections.append(
                Connection(
                    dep_stop=dep_stop,
                    arr_stop=arr_stop,
                    dep_time=dep_time,
                    arr_time=arr_time,
                    trip_id=trip_id,
                    route_id=route_id,
                )
            )

    feed.connections.sort(key=lambda c: c.dep_time)
    return feed
