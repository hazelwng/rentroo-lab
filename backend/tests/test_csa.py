from rentroo.transit.csa import MIN_TRANSFER_SEC, reconstruct, scan
from rentroo.transit.gtfs import Connection, Feed, Stop
from rentroo.transit.transfers import Footpath


def make_feed(connections: list[Connection]) -> Feed:
    feed = Feed()
    feed.connections = sorted(connections, key=lambda c: c.dep_time)
    stop_ids = {c.dep_stop for c in connections} | {c.arr_stop for c in connections}
    for stop_id in stop_ids:
        # Station name = stop_id minus platform suffix ("B1", "B2" -> station "B")
        feed.stops[stop_id] = Stop(stop_id, stop_id[:-1], 35.6, 139.7, "")
    return feed


def conn(dep_stop, arr_stop, dep_time, arr_time, trip="T1", route="R1"):
    return Connection(dep_stop, arr_stop, dep_time, arr_time, trip, route)


def test_scan_direct_ride():
    feed = make_feed([conn("A1", "B1", 100, 200)])
    result = scan(feed, {"A1"}, departure=0)
    assert result.arrival_time("B1") == 200
    assert [type(leg).__name__ for leg in reconstruct(result, "B1")] == ["Connection"]


def test_scan_misses_train_departing_before_ready():
    feed = make_feed([conn("A1", "B1", 100, 200)])
    result = scan(feed, {"A1"}, departure=101)
    assert "B1" not in result


def test_scan_transfer_via_footpath():
    feed = make_feed(
        [
            conn("A1", "B1", 100, 200, trip="T1"),
            conn("B2", "C1", 400, 500, trip="T2", route="R2"),
        ]
    )
    footpaths = {"B1": [Footpath("B1", "B2", walk_time=100)]}
    result = scan(feed, {"A1"}, departure=0, footpaths=footpaths)
    assert result.arrival_time("C1") == 500
    legs = reconstruct(result, "C1")
    assert [type(leg).__name__ for leg in legs] == ["Connection", "Footpath", "Connection"]


def test_scan_enforces_min_transfer_time_between_trips():
    # Arrive B1 at 200. A same-platform trip leaving at 200+59s is not
    # catchable; one leaving at 200+MIN_TRANSFER_SEC is.
    feed = make_feed(
        [
            conn("A1", "B1", 100, 200, trip="T1"),
            conn("B1", "C1", 200 + MIN_TRANSFER_SEC - 1, 300, trip="TOO_SOON", route="R2"),
            conn("B1", "C1", 200 + MIN_TRANSFER_SEC, 350, trip="OK", route="R2"),
        ]
    )
    result = scan(feed, {"A1"}, departure=0)
    assert result.arrival_time("C1") == 350
    assert result["C1"].trip_id == "OK"


def test_scan_prefers_earlier_arrival():
    feed = make_feed(
        [
            conn("A1", "B1", 100, 300, trip="SLOW"),
            conn("A1", "B1", 120, 250, trip="FAST", route="R2"),
        ]
    )
    result = scan(feed, {"A1"}, departure=0)
    assert result.arrival_time("B1") == 250
    assert result["B1"].trip_id == "FAST"


def test_transfer_penalty_discourages_changing_trains():
    # Staying on T1 reaches C1 at 400; hopping to the express T2 at B1 reaches
    # C1 at 330. A penalty larger than the 70s saving suppresses the change.
    feed = make_feed(
        [
            conn("A1", "B1", 100, 200, trip="T1"),
            conn("B1", "C1", 260, 400, trip="T1"),
            conn("B1", "C1", 261, 330, trip="T2", route="R2"),
        ]
    )
    no_penalty = scan(feed, {"A1"}, departure=0)
    assert no_penalty["C1"].trip_id == "T2"

    penalized = scan(feed, {"A1"}, departure=0, transfer_penalty_sec=600)
    assert penalized["C1"].trip_id == "T1"
    assert penalized.arrival_time("C1") == 400


def test_scan_with_per_stop_ready_times():
    # Origin platforms seeded at different ready times (unequal access walks):
    # A1 is ready too late for its train, A2 makes its own.
    feed = make_feed(
        [
            conn("A1", "B1", 100, 200, trip="T1"),
            conn("A2", "B1", 150, 260, trip="T2", route="R2"),
        ]
    )
    result = scan(feed, {"A1": 120, "A2": 140}, departure=100)
    assert result.arrival_time("B1") == 260
    assert result["B1"].trip_id == "T2"
