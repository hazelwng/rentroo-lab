from pathlib import Path

from rentroo.transit.gtfs import format_gtfs_time, load_feed, parse_gtfs_time


def test_parse_gtfs_time_handles_past_midnight():
    assert parse_gtfs_time("08:03:00") == 8 * 3600 + 3 * 60
    assert parse_gtfs_time("24:38:00") == 24 * 3600 + 38 * 60  # 00:38 next day
    assert format_gtfs_time(parse_gtfs_time("25:10:09")) == "25:10:09"


def write_mini_feed(gtfs_dir: Path) -> None:
    """Two stops, one weekday trip and one weekend trip between them."""
    gtfs_dir.mkdir(parents=True)
    (gtfs_dir / "stops.txt").write_text(
        "stop_id,stop_name,stop_lat,stop_lon\nA1,Alpha,35.60,139.70\nB1,Beta,35.61,139.71\n"
    )
    (gtfs_dir / "routes.txt").write_text(
        "route_id,route_short_name,route_long_name,route_color\nR1,,Test Line,FF9500\n"
    )
    (gtfs_dir / "calendar.txt").write_text(
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday\n"
        "WKDY,1,1,1,1,1,0,0\n"
        "WKND,0,0,0,0,0,1,1\n"
    )
    (gtfs_dir / "trips.txt").write_text(
        "route_id,service_id,trip_id\nR1,WKDY,T_WKDY\nR1,WKND,T_WKND\n"
    )
    (gtfs_dir / "stop_times.txt").write_text(
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
        "T_WKDY,08:00:00,08:00:00,A1,1\n"
        "T_WKDY,08:05:00,08:05:00,B1,2\n"
        "T_WKND,09:00:00,09:00:00,A1,1\n"
        "T_WKND,09:05:00,09:05:00,B1,2\n"
    )


def test_load_feed_builds_weekday_connections(tmp_path):
    write_mini_feed(tmp_path / "gtfs")
    feed = load_feed(tmp_path / "gtfs")

    assert len(feed.connections) == 1  # weekend trip filtered out
    conn = feed.connections[0]
    assert (conn.dep_stop, conn.arr_stop) == ("A1", "B1")
    assert conn.dep_time == parse_gtfs_time("08:00:00")
    assert feed.route_names["R1"] == "Test Line"
    assert feed.route_colors["R1"] == "#FF9500"
    assert feed.stops["A1"].name == "Alpha"


def test_load_feed_can_include_weekends(tmp_path):
    write_mini_feed(tmp_path / "gtfs")
    feed = load_feed(tmp_path / "gtfs", weekday_only=False)
    assert len(feed.connections) == 2


def test_load_feed_missing_files_raises(tmp_path):
    try:
        load_feed(tmp_path)
        raise AssertionError("expected FileNotFoundError")
    except FileNotFoundError as e:
        assert "stops.txt" in str(e)
