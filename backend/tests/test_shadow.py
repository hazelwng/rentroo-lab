"""Shadow calculations against synthetic and PLATEAU buildings."""

import pytest

from rentroo.config import CityConfig
from rentroo.sunlight.buildings import Building, Buildings, load_buildings
from rentroo.sunlight.shadow import (
    BuildingNotFoundError,
    SunlightResult,
    is_blocked,
    winter_sunlight,
)

# The test window is at local (0, 0).
LAT, LON = 35.644, 139.699


def box(cx: float, cy: float, w: float, d: float, h: float, g: float = 0.0) -> Building:
    """Axis-aligned footprint centred at (cx, cy), w wide (x) and d deep (y)."""
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    ring = ((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))
    return Building(h, g, ring, x0, y0, x1, y1)


def scene(*items: Building, include_home: bool = True) -> Buildings:
    home = [box(0, 0, 0.02, 0.02, 1)] if include_home else []
    return Buildings(LAT, LON, home + list(items))


def sun(buildings: Buildings, floor: int = 2, facing: float = 180) -> SunlightResult:
    return winter_sunlight(buildings, LAT, LON, floor, facing)


def test_ray_blocked_when_roof_is_above_the_ray():
    # 30° sun, wall 50 m away: ray is at 1 + 50·tan30° ≈ 29.9 m there
    wall = [box(0, -60, 20, 20, 30)]
    assert is_blocked(0, 0, 1, 30, 180, wall)
    assert not is_blocked(0, 0, 1, 30, 180, [box(0, -60, 20, 20, 29)])


def test_ray_misses_a_building_off_to_the_side():
    assert not is_blocked(0, 0, 1, 30, 90, [box(0, -60, 20, 20, 30)])


def test_open_south_window_gets_the_whole_day():
    r = sun(scene())
    assert r.hours == pytest.approx(9.5, abs=0.2)
    assert r.segments == [(7 * 60, 16 * 60 + 30)]
    assert len(r.samples) == 73  # 06:00..18:00 every 10 min


def test_north_window_gets_nothing():
    r = sun(scene(), facing=0)
    assert r.hours == 0
    assert r.segments == []


def test_wall_to_the_south_leaves_a_midday_window():
    # 30 m wall 50 m south: 2F window (4 m) needs the sun above ~27.5°
    r = sun(scene(box(0, -60, 200, 20, 30)), floor=2)
    assert r.hours == pytest.approx(4.2, abs=0.2)
    assert r.segments == [(9 * 60 + 40, 13 * 60 + 50)]
    assert sun(scene(box(0, -60, 200, 20, 30)), floor=5).hours > 6.5


def test_narrow_tower_only_blocks_around_noon():
    r = sun(scene(box(0, -60, 20, 20, 80)))
    assert len(r.segments) == 2
    morning, afternoon = r.segments
    assert morning[1] <= 11 * 60 and afternoon[0] >= 12 * 60 + 20


def test_roof_line_through_the_window_gives_a_partial_sample():
    # At noon, the roof crosses the window vertically.
    r = sun(scene(box(0, -60, 200, 20, 33.9)))
    noon = r.samples[(11 * 60 + 40 - 6 * 60) // 10]
    assert 0 < noon < 1


def test_rectangular_own_building_does_not_self_shade():
    r = sun(scene(box(0, 0, 20, 20, 10), include_home=False))
    assert r.hours == pytest.approx(9.5, abs=0.2)


def test_u_shaped_own_building_self_shades():
    ring = (
        (-3, -10),
        (17, -10),
        (17, 10),
        (12, 10),
        (12, -5),
        (2, -5),
        (2, 10),
        (-3, 10),
        (-3, -10),
    )
    own = Building(20, 0, ring, -3, -10, 17, 10)

    r = sun(scene(own, include_home=False), facing=90)

    assert r.hours == 0
    assert r.segments == []


def test_lower_building_than_the_window_never_blocks():
    r = sun(scene(box(0, -30, 200, 20, 3)), floor=3)
    assert r.hours == pytest.approx(9.5, abs=0.2)


def test_missing_own_building_stops_the_calculation():
    with pytest.raises(BuildingNotFoundError, match="no PLATEAU building contains"):
        sun(scene(include_home=False))


@pytest.fixture(scope="module")
def meguro():
    city = CityConfig.load("tokyo")
    return load_buildings(city.city_dir / "buildings" / "meguro.json.gz")


def test_real_building_profile_computes(meguro):
    r = winter_sunlight(meguro, 35.644065, 139.699088, floor=2, facing=180)

    assert 0 <= r.hours <= 9.5
    assert len(r.samples) == 73


def test_real_coordinate_outside_a_building_is_rejected(meguro):
    with pytest.raises(BuildingNotFoundError):
        winter_sunlight(meguro, 35.6193, 139.6845, floor=2, facing=180)
