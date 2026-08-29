"""Shortest walking route on the seeded street graph, split into legs."""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field

from rentroo.walk_home.data import WalkGraph

MIN_LEG_M = 30.0
MAX_LEGS = 8
# A point this far from every mapped street edge is outside seeded coverage.
MAX_SNAP_M = 300.0


@dataclass
class Leg:
    name: str | None
    coords: list[tuple[float, float]]
    distance_m: float
    way_id: int


@dataclass
class WalkRoute:
    distance_m: float
    route_coords: list[tuple[float, float]] = field(default_factory=list)
    legs: list[Leg] = field(default_factory=list)


@dataclass(frozen=True)
class EdgeSnap:
    edge_idx: int
    coord: tuple[float, float]
    distance_to_graph_m: float
    distance_from_start_m: float
    segment_idx: int


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    mean_lat = math.radians((a[0] + b[0]) / 2)
    dy = (a[0] - b[0]) * 111_320.0
    dx = (a[1] - b[1]) * 111_320.0 * math.cos(mean_lat)
    return math.hypot(dx, dy)


def nearest_node(graph: WalkGraph, point: tuple[float, float]) -> int | None:
    best, best_d = None, MAX_SNAP_M
    for idx, node in enumerate(graph.nodes):
        d = _distance_m(point, node)
        if d < best_d:
            best, best_d = idx, d
    return best


def _edge_geometry(graph: WalkGraph, edge_idx: int) -> list[tuple[float, float]]:
    edge = graph.edges[edge_idx]
    geometry = list(edge.geometry) or [
        graph.nodes[edge.start_node],
        graph.nodes[edge.end_node],
    ]
    start = graph.nodes[edge.start_node]
    if _distance_m(geometry[-1], start) < _distance_m(geometry[0], start):
        geometry.reverse()
    return geometry


def _project_to_segment(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[tuple[float, float], float, float]:
    """Return the projected coordinate, distance to it, and segment fraction."""
    cos_lat = math.cos(math.radians(start[0]))
    px = (point[1] - start[1]) * 111_320.0 * cos_lat
    py = (point[0] - start[0]) * 111_320.0
    ex = (end[1] - start[1]) * 111_320.0 * cos_lat
    ey = (end[0] - start[0]) * 111_320.0
    denominator = ex * ex + ey * ey
    fraction = 0.0 if denominator == 0 else max(0.0, min(1.0, (px * ex + py * ey) / denominator))
    projected = (
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
    )
    return projected, _distance_m(point, projected), fraction


def snap_to_graph(graph: WalkGraph, point: tuple[float, float]) -> EdgeSnap | None:
    """Project a coordinate onto the nearest street segment."""
    best: EdgeSnap | None = None
    best_distance = MAX_SNAP_M
    for edge_idx, edge in enumerate(graph.edges):
        geometry = _edge_geometry(graph, edge_idx)
        segment_lengths = [
            _distance_m(start, end) for start, end in zip(geometry, geometry[1:], strict=False)
        ]
        geometry_length = sum(segment_lengths)
        distance_before = 0.0
        for segment_idx, (start, end) in enumerate(zip(geometry, geometry[1:], strict=False)):
            projected, distance, fraction = _project_to_segment(point, start, end)
            if distance <= best_distance:
                raw_along = distance_before + segment_lengths[segment_idx] * fraction
                along = (
                    edge.distance_m * raw_along / geometry_length if geometry_length > 0 else 0.0
                )
                best = EdgeSnap(
                    edge_idx=edge_idx,
                    coord=projected,
                    distance_to_graph_m=distance,
                    distance_from_start_m=along,
                    segment_idx=segment_idx,
                )
                best_distance = distance
            distance_before += segment_lengths[segment_idx]
    return best


def shortest_path(graph: WalkGraph, start: int, goal: int) -> list[int] | None:
    """A* over the walk graph; returns edge indices from start to goal."""
    goal_pos = graph.nodes[goal]
    dist: dict[int, float] = {start: 0.0}
    came_from: dict[int, tuple[int, int]] = {}  # node -> (prev_node, edge_idx)
    frontier: list[tuple[float, int]] = [(0.0, start)]

    while frontier:
        _, node = heapq.heappop(frontier)
        if node == goal:
            break
        node_dist = dist[node]
        for edge_idx, other in graph.adjacency.get(node, ()):
            candidate = node_dist + graph.edges[edge_idx].distance_m
            if candidate < dist.get(other, math.inf):
                dist[other] = candidate
                came_from[other] = (node, edge_idx)
                priority = candidate + _distance_m(graph.nodes[other], goal_pos)
                heapq.heappush(frontier, (priority, other))
    else:
        return None

    edges: list[int] = []
    node = goal
    while node != start:
        prev, edge_idx = came_from[node]
        edges.append(edge_idx)
        node = prev
    edges.reverse()
    return edges


def _edge_coords(
    graph: WalkGraph, edge_idx: int, from_node: int
) -> tuple[list[tuple[float, float]], int]:
    edge = graph.edges[edge_idx]
    geometry = _edge_geometry(graph, edge_idx)
    if edge.start_node == from_node:
        return geometry, edge.end_node
    return list(reversed(geometry)), edge.start_node


def _dedupe_coords(coords: list[tuple[float, float]]) -> list[tuple[float, float]]:
    deduped: list[tuple[float, float]] = []
    for coord in coords:
        if not deduped or coord != deduped[-1]:
            deduped.append(coord)
    return deduped


def _snap_to_node_coords(graph: WalkGraph, snap: EdgeSnap, node: int) -> list[tuple[float, float]]:
    edge = graph.edges[snap.edge_idx]
    geometry = _edge_geometry(graph, snap.edge_idx)
    if node == edge.start_node:
        return _dedupe_coords([snap.coord, *reversed(geometry[: snap.segment_idx + 1])])
    if node == edge.end_node:
        return _dedupe_coords([snap.coord, *geometry[snap.segment_idx + 1 :]])
    raise ValueError("snap can only connect to an endpoint of its edge")


def _coords_between_snaps(
    graph: WalkGraph, first: EdgeSnap, second: EdgeSnap
) -> list[tuple[float, float]]:
    if first.edge_idx != second.edge_idx:
        raise ValueError("direct snap coordinates require the same edge")
    if first.distance_from_start_m > second.distance_from_start_m:
        return list(reversed(_coords_between_snaps(graph, second, first)))
    geometry = _edge_geometry(graph, first.edge_idx)
    middle = geometry[first.segment_idx + 1 : second.segment_idx + 1]
    return _dedupe_coords([first.coord, *middle, second.coord])


def _connector(start: tuple[float, float], end: tuple[float, float], way_id: int) -> Leg:
    return Leg(
        name=None,
        coords=[start, end],
        distance_m=_distance_m(start, end),
        way_id=way_id,
    )


def _route_from_pieces(
    pieces: list[Leg],
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> WalkRoute:
    usable = [
        piece
        for piece in pieces
        if len(piece.coords) >= 2
        and (piece.distance_m > 1e-6 or piece.coords[0] != piece.coords[-1])
    ]
    if not usable:
        usable = [_connector(origin, destination, -1)]

    grouped: list[Leg] = []
    for piece in usable:
        if grouped and grouped[-1].way_id == piece.way_id:
            grouped[-1].coords.extend(piece.coords[1:])
            grouped[-1].distance_m += piece.distance_m
            if grouped[-1].name is None:
                grouped[-1].name = piece.name
        else:
            grouped.append(
                Leg(
                    name=piece.name,
                    coords=list(piece.coords),
                    distance_m=piece.distance_m,
                    way_id=piece.way_id,
                )
            )

    legs = _merge_short_legs(grouped)
    route_coords = [legs[0].coords[0]] + [coord for leg in legs for coord in leg.coords[1:]]
    return WalkRoute(
        distance_m=sum(leg.distance_m for leg in legs),
        route_coords=route_coords,
        legs=legs,
    )


def _merge_short_legs(legs: list[Leg]) -> list[Leg]:
    """Merge short fragments and cap the route at MAX_LEGS."""

    def merge_into(target: Leg, source: Leg) -> None:
        target.coords.extend(source.coords[1:])
        target.distance_m += source.distance_m
        if target.name is None:
            target.name = source.name

    merged: list[Leg] = []
    for leg in legs:
        if merged and (leg.distance_m < MIN_LEG_M or merged[-1].distance_m < MIN_LEG_M):
            merge_into(merged[-1], leg)
        else:
            merged.append(leg)

    while len(merged) > MAX_LEGS:
        shortest = min(range(len(merged)), key=lambda i: merged[i].distance_m)
        neighbour = shortest - 1 if shortest > 0 else 1
        first, second = sorted((shortest, neighbour))
        merge_into(merged[first], merged[second])
        merged.pop(second)

    return merged


def route_between(
    graph: WalkGraph,
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> WalkRoute | None:
    """Route between coordinates snapped to street edges, grouped by way runs."""
    if origin == destination:
        return _route_from_pieces([], origin, destination)

    origin_snap = snap_to_graph(graph, origin)
    destination_snap = snap_to_graph(graph, destination)
    if origin_snap is None or destination_snap is None:
        return None

    candidates: list[WalkRoute] = []
    if origin_snap.edge_idx == destination_snap.edge_idx:
        edge = graph.edges[origin_snap.edge_idx]
        candidates.append(
            _route_from_pieces(
                [
                    _connector(origin, origin_snap.coord, -1),
                    Leg(
                        name=edge.name,
                        coords=_coords_between_snaps(graph, origin_snap, destination_snap),
                        distance_m=abs(
                            destination_snap.distance_from_start_m
                            - origin_snap.distance_from_start_m
                        ),
                        way_id=edge.way_id,
                    ),
                    _connector(destination_snap.coord, destination, -2),
                ],
                origin,
                destination,
            )
        )

    origin_edge = graph.edges[origin_snap.edge_idx]
    destination_edge = graph.edges[destination_snap.edge_idx]
    origin_options = (
        (origin_edge.start_node, origin_snap.distance_from_start_m),
        (
            origin_edge.end_node,
            origin_edge.distance_m - origin_snap.distance_from_start_m,
        ),
    )
    destination_options = (
        (destination_edge.start_node, destination_snap.distance_from_start_m),
        (
            destination_edge.end_node,
            destination_edge.distance_m - destination_snap.distance_from_start_m,
        ),
    )

    for start_node, origin_edge_distance in origin_options:
        for goal_node, destination_edge_distance in destination_options:
            edge_indices = shortest_path(graph, start_node, goal_node)
            if edge_indices is None:
                continue
            pieces = [_connector(origin, origin_snap.coord, -1)]
            pieces.append(
                Leg(
                    name=origin_edge.name,
                    coords=_snap_to_node_coords(graph, origin_snap, start_node),
                    distance_m=origin_edge_distance,
                    way_id=origin_edge.way_id,
                )
            )
            node = start_node
            for edge_idx in edge_indices:
                edge = graph.edges[edge_idx]
                coords, node = _edge_coords(graph, edge_idx, node)
                pieces.append(
                    Leg(
                        name=edge.name,
                        coords=coords,
                        distance_m=edge.distance_m,
                        way_id=edge.way_id,
                    )
                )
            pieces.append(
                Leg(
                    name=destination_edge.name,
                    coords=list(reversed(_snap_to_node_coords(graph, destination_snap, goal_node))),
                    distance_m=destination_edge_distance,
                    way_id=destination_edge.way_id,
                )
            )
            pieces.append(_connector(destination_snap.coord, destination, -2))
            candidates.append(_route_from_pieces(pieces, origin, destination))

    return min(candidates, key=lambda route: route.distance_m) if candidates else None
