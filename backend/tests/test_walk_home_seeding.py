"""Pure transformations used by the walk-home seed command."""

import pytest

from scripts.seed_walk_home import (
    build_graph,
    normalize_hours,
    parse_pois,
    parse_stations,
    poi_category,
)


@pytest.mark.parametrize(
    ("tags", "expected"),
    [
        ({"shop": "convenience"}, "convenience"),
        ({"shop": "supermarket"}, "supermarket"),
        ({"amenity": "cafe"}, "restaurant_cafe"),
        ({"amenity": "pub"}, "bar_pub"),
        ({"amenity": "police"}, "police"),
        ({"amenity": "school"}, None),
    ],
)
def test_poi_category(tags, expected):
    assert poi_category(tags) == expected


def test_parse_pois_accepts_nodes_and_way_centres():
    elements = [
        {
            "type": "node",
            "lat": 35.63,
            "lon": 139.70,
            "tags": {
                "shop": "convenience",
                "name": "Konbini",
                "opening_hours": "24/7",
            },
        },
        {
            "type": "way",
            "center": {"lat": 35.64, "lon": 139.71},
            "tags": {"amenity": "cafe", "name:ja": "カフェ"},
        },
        {"type": "node", "lat": 35.65, "lon": 139.72, "tags": {"amenity": "school"}},
    ]

    assert parse_pois(elements) == [
        {
            "lat": 35.63,
            "lon": 139.70,
            "name": "Konbini",
            "category": "convenience",
            "opening_hours": "24/7",
            "open_intervals": [[0, 10080]],
        },
        {
            "lat": 35.64,
            "lon": 139.71,
            "name": "カフェ",
            "category": "restaurant_cafe",
            "opening_hours": None,
            "open_intervals": None,
        },
    ]


def test_build_graph_splits_ways_at_shared_nodes():
    elements = [
        {
            "type": "way",
            "id": 10,
            "nodes": [1, 2, 3],
            "geometry": [
                {"lat": 35.63, "lon": 139.700},
                {"lat": 35.63, "lon": 139.701},
                {"lat": 35.63, "lon": 139.702},
            ],
            "tags": {"name": "East Road"},
        },
        {
            "type": "way",
            "id": 20,
            "nodes": [4, 2, 5],
            "geometry": [
                {"lat": 35.629, "lon": 139.701},
                {"lat": 35.630, "lon": 139.701},
                {"lat": 35.631, "lon": 139.701},
            ],
            "tags": {"name": "North Road"},
        },
    ]

    graph = build_graph(elements)

    assert len(graph["nodes"]) == 5
    assert len(graph["edges"]) == 4
    assert graph["edges"][0] == {
        "start_node": 0,
        "end_node": 1,
        "distance_m": pytest.approx(90.4, abs=0.2),
        "name": "East Road",
        "osm_way_id": 10,
        "geometry": [
            [35.63, 139.7],
            [35.63, 139.701],
        ],
    }
    assert {edge["osm_way_id"] for edge in graph["edges"]} == {10, 20}

    north_first = next(edge for edge in graph["edges"] if edge["osm_way_id"] == 20)
    assert north_first["geometry"] == [
        [35.629, 139.701],
        [35.63, 139.701],
    ]


def test_parse_stations_handles_nodes_ways_and_unnamed():
    elements = [
        {"type": "node", "lat": 35.632, "lon": 139.7157, "tags": {"name": "目黒"}},
        {
            "type": "way",
            "center": {"lat": 35.607, "lon": 139.669},
            "tags": {"name:ja": "自由が丘"},
        },
        {"type": "node", "lat": 35.61, "lon": 139.67, "tags": {"railway": "station"}},
    ]

    stations = parse_stations(elements)

    assert stations == [
        {"name": "目黒", "lat": 35.632, "lon": 139.7157},
        {"name": "自由が丘", "lat": 35.607, "lon": 139.669},
    ]


@pytest.mark.parametrize(
    ("hours", "expected"),
    [
        ("24/7", [[0, 10080]]),
        (None, None),
        ("", None),
        ("12:00-14:30 sat sun , 17:30-23:00 22 last order", None),
    ],
)
def test_normalize_hours_exact(hours, expected):
    assert normalize_hours(hours) == expected


def test_normalize_hours_daily_range():
    intervals = normalize_hours("Mo-Su 10:00-22:00")
    assert len(intervals) == 7
    assert intervals[0] == [600, 1320]
    assert intervals[6] == [9240, 9960]


def test_normalize_hours_closed_day_has_no_intervals():
    intervals = normalize_hours("11:30-14:00,17:00-23:00; We off")
    wednesday = [iv for iv in intervals if 2880 <= iv[0] < 4320]
    assert wednesday == []
    assert len(intervals) == 12


def test_normalize_hours_overnight_wraps_week_boundary():
    intervals = normalize_hours("18:00-26:00")
    assert [0, 120] in intervals
    assert intervals[-1] == [9720, 10080]
