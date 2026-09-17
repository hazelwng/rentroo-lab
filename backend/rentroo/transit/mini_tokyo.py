"""Load Mini Tokyo 3D static railway data into the transit ``Feed`` model.

Mini Tokyo 3D stores stations, railways, and per-line timetables as JSON rather
than GTFS text files. This module keeps that source-specific parsing separate
from the standard GTFS loader while producing the same ``Feed``/``Connection``
contract consumed by the Connection Scan Algorithm.
"""

from __future__ import annotations

import gzip
import io
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from rentroo.transit.gtfs import Connection, Feed, Stop
from rentroo.transit.transfers import Footpath, build_group_footpaths

DEFAULT_CALENDAR = "Weekday"
SERVICE_DAY_START_HOUR = 3
MINI_TOKYO_SOURCE_URL = "https://github.com/nagix/mini-tokyo-3d"
BUNDLE_FORMAT_VERSION = 1


def parse_mini_tokyo_time(value: str) -> int:
    """Convert an ``HH:MM`` clock time to seconds in Mini Tokyo's service day.

    Mini Tokyo treats 03:00 as the start of a service day. Times from midnight
    through 02:59 therefore belong after 23:59 and are represented as 24:00
    through 26:59 for CSA ordering. Explicit 24:xx values are preserved.
    """

    try:
        hour_text, minute_text = value.split(":")
        hour = int(hour_text)
        minute = int(minute_text)
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid Mini Tokyo time: {value!r}") from exc

    if hour < 0 or minute not in range(60):
        raise ValueError(f"Invalid Mini Tokyo time: {value!r}")
    if hour < SERVICE_DAY_START_HOUR:
        hour += 24
    return hour * 3600 + minute * 60


def load_mini_tokyo_feed(
    data_dir: str | Path,
    *,
    calendar: str | None = DEFAULT_CALENDAR,
) -> Feed:
    """Load Mini Tokyo 3D JSON data into a globally sorted transit feed.

    ``data_dir`` is the upstream repository's ``data`` directory and must
    contain ``stations.json``, ``railways.json``, and ``train-timetables/``.
    By default only weekday timetables are loaded. Pass ``calendar=None`` to
    include every calendar present in the source data.

    Timetable ``pt``/``nt`` links are intentionally not joined here. Each
    timetable remains a distinct trip until through-running behavior is added
    to the routing model explicitly.
    """

    data_dir = Path(data_dir)
    stations_path = data_dir / "stations.json"
    railways_path = data_dir / "railways.json"
    timetables_dir = data_dir / "train-timetables"
    missing = [
        str(path.relative_to(data_dir))
        for path in (stations_path, railways_path, timetables_dir)
        if not path.exists()
    ]
    if missing:
        raise FileNotFoundError(f"Mini Tokyo data at '{data_dir}' is missing {', '.join(missing)}")

    feed = Feed()
    _load_stations(stations_path, feed)
    _load_railways(railways_path, feed)
    _load_timetables(timetables_dir, feed, calendar)
    feed.connections.sort(key=lambda connection: connection.dep_time)
    return feed


def load_mini_tokyo_footpaths(data_dir: str | Path, feed: Feed) -> dict[str, list[Footpath]]:
    """Load Mini Tokyo's explicit interchange groups as directed footpaths.

    Each top-level entry in ``station-groups.json`` describes one station
    complex. Its nested platform/operator groups are flattened so every stop
    in the complex can transfer to every other stop. Walking time uses the
    same distance, detour, and gate buffer model as standard GTFS transfers.
    """

    path = Path(data_dir) / "station-groups.json"
    if not path.exists():
        raise FileNotFoundError(f"Mini Tokyo data is missing '{path.name}'")

    data = _read_json(path)
    if not isinstance(data, list):
        raise ValueError(f"Expected a JSON array in '{path}'")

    station_groups: list[list[str]] = []
    for group_index, group in enumerate(data):
        if not isinstance(group, list):
            raise ValueError(f"Invalid station group {group_index} in '{path}'")
        stop_ids: list[str] = []
        for subgroup in group:
            if not isinstance(subgroup, list) or not all(
                isinstance(stop_id, str) and stop_id for stop_id in subgroup
            ):
                raise ValueError(f"Invalid station group {group_index} in '{path}'")
            stop_ids.extend(subgroup)
        if len(stop_ids) < 2:
            raise ValueError(
                f"Station group {group_index} in '{path}' must contain at least two stops"
            )
        station_groups.append(stop_ids)

    return build_group_footpaths(feed, station_groups)


def write_mini_tokyo_bundle(
    output_path: str | Path,
    feed: Feed,
    footpaths: dict[str, list[Footpath]],
    *,
    calendar: str,
    source_revision: str,
) -> None:
    """Write a deterministic, compact runtime bundle for deployment.

    IDs are stored once and referenced by integer indexes in connections and
    footpaths. The resulting JSON is gzip-compressed with a fixed timestamp so
    identical input produces identical bytes and clean Git diffs.
    """

    stop_ids = sorted(feed.stops)
    route_ids = sorted(feed.route_names)
    trip_ids = sorted(feed.trip_routes)
    stop_indexes = {stop_id: index for index, stop_id in enumerate(stop_ids)}
    route_indexes = {route_id: index for index, route_id in enumerate(route_ids)}
    trip_indexes = {trip_id: index for index, trip_id in enumerate(trip_ids)}

    bundle = {
        "metadata": {
            "format_version": BUNDLE_FORMAT_VERSION,
            "source": MINI_TOKYO_SOURCE_URL,
            "source_revision": source_revision,
            "calendar": calendar,
        },
        "stops": [
            [
                stop.stop_id,
                stop.name,
                stop.lat,
                stop.lon,
                stop.parent_station,
            ]
            for stop_id in stop_ids
            for stop in [feed.stops[stop_id]]
        ],
        "routes": [
            [
                route_id,
                feed.route_names[route_id],
                feed.route_colors.get(route_id),
            ]
            for route_id in route_ids
        ],
        "trips": [[trip_id, route_indexes[feed.trip_routes[trip_id]]] for trip_id in trip_ids],
        "connections": [
            [
                stop_indexes[connection.dep_stop],
                stop_indexes[connection.arr_stop],
                connection.dep_time,
                connection.arr_time,
                trip_indexes[connection.trip_id],
                route_indexes[connection.route_id],
            ]
            for connection in feed.connections
        ],
        "footpaths": [
            [stop_indexes[edge.from_stop], stop_indexes[edge.to_stop], edge.walk_time]
            for from_stop in sorted(footpaths)
            for edge in sorted(
                footpaths[from_stop], key=lambda item: (item.to_stop, item.walk_time)
            )
        ],
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{output_path.name}.",
            suffix=".tmp",
            dir=output_path.parent,
            delete=False,
        ) as raw_file:
            temp_path = Path(raw_file.name)
            with gzip.GzipFile(
                filename="", mode="wb", fileobj=raw_file, mtime=0
            ) as compressed_file:
                with io.TextIOWrapper(compressed_file, encoding="utf-8") as text_file:
                    json.dump(
                        bundle,
                        text_file,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    text_file.write("\n")
        os.replace(temp_path, output_path)
        output_path.chmod(0o644)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def load_mini_tokyo_bundle(
    bundle_path: str | Path,
) -> tuple[Feed, dict[str, list[Footpath]]]:
    """Restore a deployment bundle created by :func:`write_mini_tokyo_bundle`."""

    bundle_path = Path(bundle_path)
    try:
        with gzip.open(bundle_path, mode="rt", encoding="utf-8") as file:
            bundle = json.load(file)
        metadata = bundle["metadata"]
        if metadata["format_version"] != BUNDLE_FORMAT_VERSION:
            raise ValueError(
                f"Unsupported Mini Tokyo bundle version: {metadata['format_version']!r}"
            )

        feed = Feed()
        stop_ids: list[str] = []
        for stop_id, name, lat, lon, parent_station in bundle["stops"]:
            stop_ids.append(stop_id)
            feed.stops[stop_id] = Stop(stop_id, name, float(lat), float(lon), parent_station)

        route_ids: list[str] = []
        for route_id, name, color in bundle["routes"]:
            route_ids.append(route_id)
            feed.route_names[route_id] = name
            if color:
                feed.route_colors[route_id] = color

        trip_ids: list[str] = []
        for trip_id, route_index in bundle["trips"]:
            trip_ids.append(trip_id)
            feed.trip_routes[trip_id] = route_ids[route_index]

        for dep_stop, arr_stop, dep_time, arr_time, trip_index, route_index in bundle[
            "connections"
        ]:
            feed.connections.append(
                Connection(
                    dep_stop=stop_ids[dep_stop],
                    arr_stop=stop_ids[arr_stop],
                    dep_time=dep_time,
                    arr_time=arr_time,
                    trip_id=trip_ids[trip_index],
                    route_id=route_ids[route_index],
                )
            )

        footpaths: dict[str, list[Footpath]] = {}
        for from_stop, to_stop, walk_time in bundle["footpaths"]:
            from_stop_id = stop_ids[from_stop]
            footpaths.setdefault(from_stop_id, []).append(
                Footpath(from_stop_id, stop_ids[to_stop], walk_time)
            )
    except (gzip.BadGzipFile, json.JSONDecodeError, KeyError, TypeError, IndexError) as exc:
        raise ValueError(f"Invalid Mini Tokyo bundle at '{bundle_path}'") from exc

    return feed, footpaths


def _load_stations(path: Path, feed: Feed) -> None:
    for station in _read_json_array(path):
        station_id = _required_string(station, "id", path)
        coord = station.get("coord")
        if coord is None:
            continue
        if not isinstance(coord, list) or len(coord) != 2:
            raise ValueError(f"Invalid coord for station {station_id!r} in '{path}'")
        lon, lat = coord
        try:
            stop = Stop(
                stop_id=station_id,
                name=_localized_title(station, station_id),
                lat=float(lat),
                lon=float(lon),
                parent_station="",
            )
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid coord for station {station_id!r} in '{path}'") from exc
        if station_id in feed.stops:
            raise ValueError(f"Duplicate station id {station_id!r} in '{path}'")
        feed.stops[station_id] = stop


def _load_railways(path: Path, feed: Feed) -> None:
    for railway in _read_json_array(path):
        route_id = _required_string(railway, "id", path)
        if route_id in feed.route_names:
            raise ValueError(f"Duplicate railway id {route_id!r} in '{path}'")
        feed.route_names[route_id] = _localized_title(railway, route_id)
        color = railway.get("color")
        if isinstance(color, str) and color.strip():
            normalized = color.strip().upper()
            feed.route_colors[route_id] = (
                normalized if normalized.startswith("#") else f"#{normalized}"
            )


def _load_timetables(timetables_dir: Path, feed: Feed, calendar: str | None) -> None:
    paths = sorted(timetables_dir.glob("*.json"))
    if not paths:
        raise FileNotFoundError(f"No timetable JSON files found in '{timetables_dir}'")

    for path in paths:
        for timetable in _read_json_array(path):
            timetable_id = _required_string(timetable, "id", path)
            if calendar is not None and not _uses_calendar(timetable_id, calendar):
                continue
            if timetable_id in feed.trip_routes:
                raise ValueError(f"Duplicate timetable id {timetable_id!r}")

            route_id = _required_string(timetable, "r", path)
            if route_id not in feed.route_names:
                raise ValueError(
                    f"Timetable {timetable_id!r} references unknown railway {route_id!r}"
                )
            stops = timetable.get("tt")
            if not isinstance(stops, list) or len(stops) < 2:
                raise ValueError(f"Timetable {timetable_id!r} must contain at least two stops")

            feed.trip_routes[timetable_id] = route_id
            for current, following in zip(stops, stops[1:], strict=False):
                dep_stop = _required_string(current, "s", path)
                arr_stop = _required_string(following, "s", path)
                _validate_stop_reference(feed, timetable_id, dep_stop)
                _validate_stop_reference(feed, timetable_id, arr_stop)

                dep_value = current.get("d") or current.get("a")
                arr_value = following.get("a") or following.get("d")
                if not dep_value or not arr_value:
                    raise ValueError(
                        f"Timetable {timetable_id!r} has a connection with missing times"
                    )
                dep_time = parse_mini_tokyo_time(dep_value)
                arr_time = parse_mini_tokyo_time(arr_value)
                if arr_time < dep_time:
                    raise ValueError(
                        f"Timetable {timetable_id!r} arrives before it departs: "
                        f"{dep_value} -> {arr_value}"
                    )
                feed.connections.append(
                    Connection(
                        dep_stop=dep_stop,
                        arr_stop=arr_stop,
                        dep_time=dep_time,
                        arr_time=arr_time,
                        trip_id=timetable_id,
                        route_id=route_id,
                    )
                )


def _read_json_array(path: Path) -> list[dict[str, Any]]:
    data = _read_json(path)
    if not isinstance(data, list) or not all(isinstance(item, dict) for item in data):
        raise ValueError(f"Expected a JSON array of objects in '{path}'")
    return data


def _read_json(path: Path) -> Any:
    try:
        with path.open(encoding="utf-8") as file:
            data = json.load(file)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in '{path}'") from exc
    return data


def _required_string(item: dict[str, Any], key: str, path: Path) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"Missing {key!r} in '{path}'")
    return value


def _localized_title(item: dict[str, Any], fallback: str) -> str:
    title = item.get("title")
    if isinstance(title, dict):
        for language in ("ja", "en"):
            value = title.get(language)
            if isinstance(value, str) and value:
                return value
    return fallback


def _uses_calendar(timetable_id: str, calendar: str) -> bool:
    return timetable_id.endswith(f".{calendar}") or f".{calendar}." in timetable_id


def _validate_stop_reference(feed: Feed, timetable_id: str, stop_id: str) -> None:
    if stop_id not in feed.stops:
        raise ValueError(
            f"Timetable {timetable_id!r} references unknown or unlocated station {stop_id!r}"
        )
