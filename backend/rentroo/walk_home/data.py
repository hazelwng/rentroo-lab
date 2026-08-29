"""Load seeded street lamps, POIs and the walk graph for the active city."""

from __future__ import annotations

import gzip
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from rentroo.config import get_city_config


@dataclass(frozen=True)
class Station:
    name: str
    lat: float
    lon: float


@dataclass(frozen=True)
class Poi:
    lat: float
    lon: float
    name: str | None
    category: str
    opening_hours: str | None


@dataclass(frozen=True)
class WalkHomeData:
    stations: tuple[Station, ...]
    lamps: tuple[tuple[float, float], ...]
    pois: tuple[Poi, ...]

    def lamps_in_bbox(
        self, south: float, west: float, north: float, east: float
    ) -> list[tuple[float, float]]:
        return [
            (lat, lon) for lat, lon in self.lamps if south <= lat <= north and west <= lon <= east
        ]

    def pois_in_bbox(self, south: float, west: float, north: float, east: float) -> list[Poi]:
        return [poi for poi in self.pois if south <= poi.lat <= north and west <= poi.lon <= east]


@dataclass(frozen=True)
class WalkEdge:
    start_node: int  # index into WalkGraph.nodes
    end_node: int
    distance_m: float
    name: str | None
    way_id: int
    geometry: tuple[tuple[float, float], ...] = ()


@dataclass(frozen=True)
class WalkGraph:
    nodes: tuple[tuple[float, float], ...]
    edges: tuple[WalkEdge, ...]
    adjacency: dict[int, tuple[tuple[int, int], ...]]  # node -> ((edge_idx, other_node), ...)


def _build_adjacency(
    node_count: int, edges: tuple[WalkEdge, ...]
) -> dict[int, tuple[tuple[int, int], ...]]:
    adj: dict[int, list[tuple[int, int]]] = {i: [] for i in range(node_count)}
    for idx, edge in enumerate(edges):
        adj[edge.start_node].append((idx, edge.end_node))
        adj[edge.end_node].append((idx, edge.start_node))
    return {node: tuple(items) for node, items in adj.items()}


@lru_cache(maxsize=4)
def _load_data(data_dir: Path) -> WalkHomeData:
    """Merge all seeded area files."""
    stations: list[Station] = []
    lamps: list[tuple[float, float]] = []
    pois: list[Poi] = []
    for path in sorted(data_dir.glob("*.json.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            raw = json.load(f)
        stations.extend(
            Station(name=s["name"], lat=float(s["lat"]), lon=float(s["lon"]))
            for s in raw.get("stations", [])
        )
        lamps.extend((float(lat), float(lon)) for lat, lon in raw.get("lamps", []))
        pois.extend(
            Poi(
                lat=float(p["lat"]),
                lon=float(p["lon"]),
                name=p.get("name"),
                category=p["category"],
                opening_hours=p.get("opening_hours"),
            )
            for p in raw.get("pois", [])
        )
    if not lamps and not pois:
        raise FileNotFoundError(f"no seeded walk-home data in {data_dir}")
    return WalkHomeData(stations=tuple(stations), lamps=tuple(lamps), pois=tuple(pois))


@lru_cache(maxsize=4)
def _load_graph(graph_dir: Path) -> WalkGraph:
    """Merge graph files and re-index appended nodes."""
    nodes: list[tuple[float, float]] = []
    edges: list[WalkEdge] = []
    for path in sorted(graph_dir.glob("*.json.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            raw = json.load(f)
        offset = len(nodes)
        file_nodes = tuple((float(lat), float(lon)) for lat, lon in raw["nodes"])
        nodes.extend(file_nodes)
        edges.extend(
            WalkEdge(
                start_node=int(e["start_node"] if "start_node" in e else e["a"]) + offset,
                end_node=int(e["end_node"] if "end_node" in e else e["b"]) + offset,
                distance_m=float(e["distance_m"] if "distance_m" in e else e["d"]),
                name=e.get("name", e.get("n")),
                way_id=int(e["osm_way_id"] if "osm_way_id" in e else e["w"]),
                geometry=tuple(
                    (float(lat), float(lon))
                    for lat, lon in e.get(
                        "geometry",
                        (
                            file_nodes[int(e["start_node"] if "start_node" in e else e["a"])],
                            file_nodes[int(e["end_node"] if "end_node" in e else e["b"])],
                        ),
                    )
                ),
            )
            for e in raw["edges"]
        )
    if not edges:
        raise FileNotFoundError(f"no seeded walk graph in {graph_dir}")
    frozen = tuple(edges)
    return WalkGraph(
        nodes=tuple(nodes),
        edges=frozen,
        adjacency=_build_adjacency(len(nodes), frozen),
    )


def get_walk_home_data() -> WalkHomeData:
    return _load_data(get_city_config().city_dir / "walk_home")


def get_walk_graph() -> WalkGraph:
    return _load_graph(get_city_config().city_dir / "walk_graph")
