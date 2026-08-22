"""Building data loads and projects sanely."""

import gzip
import json

import pytest

from rentroo.config import CityConfig
from rentroo.sunlight.buildings import load_buildings

NAKAMEGURO = (35.6440, 139.6990)


@pytest.fixture(scope="module")
def meguro():
    city = CityConfig.load("tokyo")
    return load_buildings(city.city_dir / "buildings" / "meguro.json.gz")


def test_meguro_loads_with_sane_heights(meguro):
    assert len(meguro.items) > 50_000
    heights = [b.height for b in meguro.items]
    assert min(heights) > 0  # -9999 sentinels replaced at seed time
    assert 5 < sorted(heights)[len(heights) // 2] < 15  # median: low-rise Tokyo
    assert max(heights) > 100


def test_local_projection_roundtrips_metres(meguro):
    x, y = meguro.to_local(*NAKAMEGURO)
    # ~1 km north; x unchanged.
    x2, y2 = meguro.to_local(NAKAMEGURO[0] + 0.009, NAKAMEGURO[1])
    assert abs((y2 - y) - 1000) < 5
    assert abs(x2 - x) < 0.01


def test_near_finds_the_station_neighbourhood(meguro):
    x, y = meguro.to_local(*NAKAMEGURO)
    nearby = meguro.near(x, y, 150)
    assert 100 < len(nearby) < 600
    assert all(b.min_x - 150 <= x <= b.max_x + 150 for b in nearby)


def test_loader_rejects_empty_file(tmp_path):
    empty = tmp_path / "empty.json.gz"
    with gzip.open(empty, "wt") as f:
        json.dump([], f)
    with pytest.raises(ValueError):
        load_buildings(empty)


def test_to_latlon_inverts_to_local(meguro):
    x, y = meguro.to_local(*NAKAMEGURO)
    lat, lon = meguro.to_latlon(x, y)
    assert lat == pytest.approx(NAKAMEGURO[0], abs=1e-9)
    assert lon == pytest.approx(NAKAMEGURO[1], abs=1e-9)
