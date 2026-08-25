"""PLATEAU seed selection uses footprint distance in local metres."""

from scripts.seed_plateau import DEFAULT_BUFFER_M, M_PER_DEG_LAT, select

WARD = "13110"
NEIGHBOUR = "13113"


def _square(lon: float, lat: float, size_m: float = 10.0) -> dict:
    d = size_m / M_PER_DEG_LAT
    return {
        "h": 10.0,
        "g": 0.0,
        "p": [
            [lon, lat],
            [lon + d, lat],
            [lon + d, lat + d],
            [lon, lat + d],
            [lon, lat],
        ],
    }


def test_default_buffer_matches_shadow_search_radius():
    assert DEFAULT_BUFFER_M == 600.0


def test_select_keeps_neighbour_within_footprint_distance():
    inside = _square(139.7, 35.6)
    # At Tokyo's latitude, this longitude delta is about 550 metres.
    nearby = _square(139.7 + 550 / (M_PER_DEG_LAT * 0.813), 35.6)

    assert select([(WARD, inside), (NEIGHBOUR, nearby)], WARD, 600) == [inside, nearby]


def test_select_drops_neighbour_outside_footprint_distance():
    inside = _square(139.7, 35.6)
    far = _square(139.7, 35.6 + 650 / M_PER_DEG_LAT)

    assert select([(WARD, inside), (NEIGHBOUR, far)], WARD, 600) == [inside]


def test_select_uses_entire_outline_not_only_first_vertex():
    inside = _square(139.7, 35.6)
    d = 1_000 / M_PER_DEG_LAT
    neighbour = {
        "h": 10.0,
        "g": 0.0,
        # The first vertex is far away, but the lower edge comes within 100 metres.
        "p": [
            [139.7 + d, 35.6 + d],
            [139.7, 35.6 + d],
            [139.7, 35.6 + 100 / M_PER_DEG_LAT],
            [139.7 + d, 35.6 + 100 / M_PER_DEG_LAT],
            [139.7 + d, 35.6 + d],
        ],
    }

    assert select([(WARD, inside), (NEIGHBOUR, neighbour)], WARD, 600) == [inside, neighbour]
