"""Walk-home routing, leg assignment, and lighting coverage."""

import pytest

from rentroo.walk_home.data import Station, WalkEdge, WalkGraph, _build_adjacency
from rentroo.walk_home.hours import open_at_or_after
from rentroo.walk_home.legs import assign_to_legs, lit_fraction, point_to_polyline_m
from rentroo.walk_home.routing import Leg, route_between, shortest_path
from rentroo.walk_home.service import nearest_station

LAT = 35.63
LON = 139.70


def grid_graph() -> WalkGraph:
    """Four nodes in a line plus a slow detour: 0-1-2-3 direct, 0-4-3 long."""
    nodes = (
        (LAT, LON),
        (LAT, LON + 0.001),
        (LAT, LON + 0.002),
        (LAT, LON + 0.003),
        (LAT + 0.002, LON + 0.0015),
    )
    edges = (
        WalkEdge(start_node=0, end_node=1, distance_m=90, name="A", way_id=1),
        WalkEdge(start_node=1, end_node=2, distance_m=90, name="A", way_id=1),
        WalkEdge(start_node=2, end_node=3, distance_m=90, name="B", way_id=2),
        WalkEdge(start_node=0, end_node=4, distance_m=300, name="C", way_id=3),
        WalkEdge(start_node=4, end_node=3, distance_m=300, name="C", way_id=3),
    )
    return WalkGraph(nodes=nodes, edges=edges, adjacency=_build_adjacency(len(nodes), edges))


def leg(coords, way_id=1, distance_m=100.0) -> Leg:
    return Leg(name=None, coords=coords, distance_m=distance_m, way_id=way_id)


def test_shortest_path_prefers_direct_route():
    graph = grid_graph()
    assert shortest_path(graph, 0, 3) == [0, 1, 2]


def test_route_between_groups_legs_by_way():
    graph = grid_graph()
    route = route_between(graph, (LAT, LON), (LAT, LON + 0.003))
    assert route is not None
    assert route.distance_m == pytest.approx(270)
    assert [route_leg.name for route_leg in route.legs] == ["A", "B"]
    assert route.route_coords[0] == (LAT, LON)
    assert route.route_coords[-1] == (LAT, LON + 0.003)


def test_route_between_requires_coverage():
    graph = grid_graph()
    assert route_between(graph, (LAT + 1, LON), (LAT, LON)) is None


def test_route_between_snaps_to_middle_of_long_edge():
    nodes = ((LAT, LON), (LAT, LON + 0.01))
    edges = (
        WalkEdge(
            start_node=0,
            end_node=1,
            distance_m=904,
            name="Long road",
            way_id=1,
        ),
    )
    graph = WalkGraph(nodes=nodes, edges=edges, adjacency=_build_adjacency(2, edges))
    midpoint = (LAT, LON + 0.005)

    route = route_between(graph, nodes[0], midpoint)

    assert route is not None
    assert route.distance_m == pytest.approx(452, abs=2)
    assert route.route_coords[-1] == pytest.approx(midpoint)


def test_route_between_preserves_curved_edge_geometry():
    nodes = ((LAT, LON), (LAT, LON + 0.002))
    bend = (LAT + 0.001, LON + 0.001)
    edges = (
        WalkEdge(
            start_node=0,
            end_node=1,
            distance_m=286,
            name="Curved road",
            way_id=1,
            geometry=(nodes[0], bend, nodes[1]),
        ),
    )
    graph = WalkGraph(nodes=nodes, edges=edges, adjacency=_build_adjacency(2, edges))

    route = route_between(graph, nodes[0], nodes[1])

    assert route is not None
    assert bend in route.route_coords
    assert route.distance_m == pytest.approx(286)


def test_route_between_same_location_is_zero_length_route():
    graph = grid_graph()
    same_off_graph_point = (LAT + 0.0001, LON + 0.0001)

    route = route_between(graph, same_off_graph_point, same_off_graph_point)

    assert route is not None
    assert route.distance_m == 0
    assert route.route_coords == [same_off_graph_point, same_off_graph_point]


def test_point_to_polyline():
    coords = [(LAT, LON), (LAT, LON + 0.001)]
    assert point_to_polyline_m((LAT + 0.0005, LON + 0.0005), coords) == pytest.approx(55, abs=2)


def test_nearest_station_within_limit():
    stations = (
        Station(name="close", lat=LAT + 0.001, lon=LON),
        Station(name="far", lat=LAT + 0.1, lon=LON),
    )
    assert nearest_station(stations, LAT, LON).name == "close"
    assert nearest_station((stations[1],), LAT, LON) is None


def test_assign_to_legs_picks_nearest_and_drops_distant():
    legs = [
        leg([(LAT, LON), (LAT, LON + 0.001)]),
        leg([(LAT, LON + 0.001), (LAT, LON + 0.002)], way_id=2),
    ]
    points = [
        (LAT, LON + 0.0002),
        (LAT, LON + 0.0015),
        (LAT + 0.01, LON),
    ]
    assert assign_to_legs(legs, points) == [[0], [1]]


def test_assign_to_legs_boundary_point_goes_to_one_leg_only():
    legs = [
        leg([(LAT, LON), (LAT, LON + 0.001)]),
        leg([(LAT, LON + 0.001), (LAT, LON + 0.002)], way_id=2),
    ]
    groups = assign_to_legs(legs, [(LAT, LON + 0.001)])
    assert sum(len(g) for g in groups) == 1


def test_lit_fraction_full_and_empty():
    coords = [(LAT, LON), (LAT, LON + 0.001)]
    assert lit_fraction(coords, []) == 0.0
    dense = [(LAT, LON + i * 0.0002) for i in range(6)]
    assert lit_fraction(coords, dense) == 1.0


def test_lit_fraction_partial_gap():
    coords = [(LAT, LON), (LAT, LON + 0.002)]
    one_end = [(LAT, LON)]
    fraction = lit_fraction(coords, one_end)
    assert 0.0 < fraction < 0.3


@pytest.mark.parametrize(
    ("intervals", "expected"),
    [
        (((0, 10080),), True),
        (((600, 1320),), True),
        (((540, 1020),), False),
        (((1320, 1680),), True),
        (((1260, 1400),), True),
        (((0, 120),), False),
        ((), False),
        (None, None),
    ],
)
def test_open_at_or_after(intervals, expected):
    assert open_at_or_after(intervals, 20 * 60) is expected
