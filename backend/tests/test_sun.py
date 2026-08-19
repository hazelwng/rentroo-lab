"""Sun position agrees with published solstice numbers for Tokyo."""

import pytest

from rentroo.sunlight.sun import sun_position

# 中目黒, 21 December.
LAT, LON = 35.644, 139.699


def _at(hh: int, mm: int) -> tuple[float, float]:
    return sun_position(LAT, LON, hh * 60 + mm)


def test_solar_noon_is_low_and_due_south():
    alt, az = _at(11, 40)
    assert alt == pytest.approx(30.9, abs=0.3)
    assert az == pytest.approx(180, abs=1)


def test_sunrise_and_sunset_times():
    # sun crosses the horizon between 06:50–07:00 and 16:20–16:30
    assert _at(6, 50)[0] < 0 < _at(7, 0)[0]
    assert _at(16, 20)[0] > 0 > _at(16, 30)[0]


def test_sun_rises_in_the_southeast_sets_in_the_southwest():
    assert 115 < _at(7, 0)[1] < 125
    assert 235 < _at(16, 20)[1] < 245


def test_altitude_is_symmetric_around_solar_noon():
    before, _ = _at(9, 40)
    after, _ = _at(13, 40)
    assert before == pytest.approx(after, abs=0.2)


def test_night_is_below_horizon():
    assert _at(0, 0)[0] < -60
