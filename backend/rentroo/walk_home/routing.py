"""Shortest walking route on the seeded street graph, split into legs."""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field

from rentroo.walk_home.data import WalkGraph

MIN_LEG_M = 30.0
MAX_LEGS = 8
# A snap this far from any graph node means the point is outside seeded coverage.
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
    to_node = edge.b if edge.a == from_node else edge.a
    return [graph.nodes[from_node], graph.nodes[to_node]], to_node


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
    """Walking route from origin to destination, legs grouped by way runs."""
    start = nearest_node(graph, origin)
    goal = nearest_node(graph, destination)
    if start is None or goal is None or start == goal:
        return None
    edge_indices = shortest_path(graph, start, goal)
    if not edge_indices:
        return None

    legs: list[Leg] = []
    node = start
    for edge_idx in edge_indices:
        edge = graph.edges[edge_idx]
        coords, node = _edge_coords(graph, edge_idx, node)
        if legs and legs[-1].way_id == edge.way_id:
            legs[-1].coords.append(coords[1])
            legs[-1].distance_m += edge.distance_m
        else:
            legs.append(
                Leg(name=edge.name, coords=coords, distance_m=edge.distance_m, way_id=edge.way_id)
            )

    legs = _merge_short_legs(legs)
    route_coords = [legs[0].coords[0]] + [c for leg in legs for c in leg.coords[1:]]
    return WalkRoute(
        distance_m=sum(leg.distance_m for leg in legs),
        route_coords=route_coords,
        legs=legs,
    )
