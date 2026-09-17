import gzip
import json
from pathlib import Path

import pytest

from rentroo.transit.mini_tokyo import (
    load_mini_tokyo_bundle,
    load_mini_tokyo_feed,
    load_mini_tokyo_footpaths,
    parse_mini_tokyo_time,
    write_mini_tokyo_bundle,
)


def _write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def _write_mini_tokyo_data(data_dir: Path) -> None:
    _write_json(
        data_dir / "stations.json",
        [
            {
                "id": "Operator.Line.Alpha",
                "coord": [139.70, 35.60],
                "title": {"ja": "アルファ", "en": "Alpha"},
            },
            {
                "id": "Operator.Line.Beta",
                "coord": [139.71, 35.61],
                "title": {"ja": "ベータ", "en": "Beta"},
            },
            {
                "id": "Operator.Line.Gamma",
                "coord": [139.72, 35.62],
                "title": {"en": "Gamma"},
            },
            {"id": "Outside.Map", "title": {"ja": "範囲外"}},
        ],
    )
    _write_json(
        data_dir / "railways.json",
        [
            {
                "id": "Operator.Line",
                "title": {"ja": "テスト線", "en": "Test Line"},
                "color": "#12abef",
            }
        ],
    )
    _write_json(
        data_dir / "station-groups.json",
        [
            [
                ["Operator.Line.Alpha"],
                ["Operator.Line.Beta", "Operator.Line.Gamma"],
            ]
        ],
    )
    _write_json(
        data_dir / "train-timetables" / "line-a.json",
        [
            {
                "id": "Operator.Line.Later.Weekday",
                "r": "Operator.Line",
                "tt": [
                    {"s": "Operator.Line.Beta", "d": "08:10"},
                    {"s": "Operator.Line.Gamma", "a": "08:15"},
                ],
            },
            {
                "id": "Operator.Line.HolidayTrain.Holiday",
                "r": "Operator.Line",
                "tt": [
                    {"s": "Operator.Line.Alpha", "d": "09:00"},
                    {"s": "Operator.Line.Beta", "a": "09:05"},
                ],
            },
        ],
    )
    _write_json(
        data_dir / "train-timetables" / "line-b.json",
        [
            {
                "id": "Operator.Line.Earlier.Weekday",
                "r": "Operator.Line",
                "tt": [
                    {"s": "Operator.Line.Alpha", "d": "08:00"},
                    # Mini Tokyo commonly omits arrival when it equals departure.
                    {"s": "Operator.Line.Beta", "d": "08:05"},
                    {"s": "Operator.Line.Gamma", "a": "08:09"},
                ],
            }
        ],
    )


def test_parse_mini_tokyo_time_uses_three_am_service_day():
    assert parse_mini_tokyo_time("03:00") == 3 * 3600
    assert parse_mini_tokyo_time("23:59") == 23 * 3600 + 59 * 60
    assert parse_mini_tokyo_time("00:10") == 24 * 3600 + 10 * 60
    assert parse_mini_tokyo_time("01:30") == 25 * 3600 + 30 * 60
    assert parse_mini_tokyo_time("24:00") == 24 * 3600


def test_load_mini_tokyo_feed_builds_sorted_weekday_connections(tmp_path):
    data_dir = tmp_path / "data"
    _write_mini_tokyo_data(data_dir)

    feed = load_mini_tokyo_feed(data_dir)

    assert list(feed.stops) == [
        "Operator.Line.Alpha",
        "Operator.Line.Beta",
        "Operator.Line.Gamma",
    ]
    assert feed.stops["Operator.Line.Alpha"].name == "アルファ"
    assert feed.stops["Operator.Line.Gamma"].name == "Gamma"
    assert (feed.stops["Operator.Line.Alpha"].lat, feed.stops["Operator.Line.Alpha"].lon) == (
        35.60,
        139.70,
    )
    assert feed.route_names == {"Operator.Line": "テスト線"}
    assert feed.route_colors == {"Operator.Line": "#12ABEF"}
    assert len(feed.trip_routes) == 2
    assert [connection.trip_id for connection in feed.connections] == [
        "Operator.Line.Earlier.Weekday",
        "Operator.Line.Earlier.Weekday",
        "Operator.Line.Later.Weekday",
    ]
    assert feed.connections[0].dep_time == parse_mini_tokyo_time("08:00")
    assert feed.connections[0].arr_time == parse_mini_tokyo_time("08:05")


def test_load_mini_tokyo_feed_can_select_another_calendar(tmp_path):
    data_dir = tmp_path / "data"
    _write_mini_tokyo_data(data_dir)

    feed = load_mini_tokyo_feed(data_dir, calendar="Holiday")

    assert list(feed.trip_routes) == ["Operator.Line.HolidayTrain.Holiday"]
    assert len(feed.connections) == 1


def test_load_mini_tokyo_footpaths_connects_explicit_station_group(tmp_path):
    data_dir = tmp_path / "data"
    _write_mini_tokyo_data(data_dir)
    feed = load_mini_tokyo_feed(data_dir)

    footpaths = load_mini_tokyo_footpaths(data_dir, feed)

    assert set(footpaths) == {
        "Operator.Line.Alpha",
        "Operator.Line.Beta",
        "Operator.Line.Gamma",
    }
    assert sum(len(edges) for edges in footpaths.values()) == 6
    assert {edge.to_stop for edge in footpaths["Operator.Line.Alpha"]} == {
        "Operator.Line.Beta",
        "Operator.Line.Gamma",
    }
    assert all(edge.walk_time >= 120 for edges in footpaths.values() for edge in edges)


def test_load_mini_tokyo_footpaths_rejects_unknown_station(tmp_path):
    data_dir = tmp_path / "data"
    _write_mini_tokyo_data(data_dir)
    feed = load_mini_tokyo_feed(data_dir)
    _write_json(
        data_dir / "station-groups.json",
        [
            [
                ["Operator.Line.Alpha"],
                ["Operator.Line.Missing"],
            ]
        ],
    )

    with pytest.raises(ValueError, match="unknown stops"):
        load_mini_tokyo_footpaths(data_dir, feed)


def test_mini_tokyo_bundle_round_trip_is_deterministic(tmp_path):
    data_dir = tmp_path / "data"
    _write_mini_tokyo_data(data_dir)
    feed = load_mini_tokyo_feed(data_dir)
    footpaths = load_mini_tokyo_footpaths(data_dir, feed)
    first_path = tmp_path / "first.json.gz"
    second_path = tmp_path / "second.json.gz"

    for output_path in (first_path, second_path):
        write_mini_tokyo_bundle(
            output_path,
            feed,
            footpaths,
            calendar="Weekday",
            source_revision="test-revision",
        )

    restored_feed, restored_footpaths = load_mini_tokyo_bundle(first_path)

    assert restored_feed == feed
    assert restored_footpaths == footpaths
    assert first_path.read_bytes() == second_path.read_bytes()


def test_load_mini_tokyo_bundle_rejects_wrong_format_version(tmp_path):
    bundle_path = tmp_path / "invalid.json.gz"

    with gzip.open(bundle_path, mode="wt", encoding="utf-8") as file:
        json.dump({"metadata": {"format_version": 999}}, file)

    with pytest.raises(ValueError, match="Unsupported Mini Tokyo bundle version"):
        load_mini_tokyo_bundle(bundle_path)


def test_load_mini_tokyo_feed_requires_source_files(tmp_path):
    with pytest.raises(FileNotFoundError, match="stations.json"):
        load_mini_tokyo_feed(tmp_path)


def test_load_mini_tokyo_feed_rejects_unknown_station(tmp_path):
    data_dir = tmp_path / "data"
    _write_mini_tokyo_data(data_dir)
    timetable_path = data_dir / "train-timetables" / "line-b.json"
    timetable = json.loads(timetable_path.read_text())
    timetable[0]["tt"][1]["s"] = "Operator.Line.Missing"
    _write_json(timetable_path, timetable)

    with pytest.raises(ValueError, match="unknown or unlocated station"):
        load_mini_tokyo_feed(data_dir)
