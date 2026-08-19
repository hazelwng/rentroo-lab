"""Calculate solar altitude and azimuth with a compact NOAA formula."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class SolarDay:
    """The two per-day inputs the position formula needs."""

    declination: float  # degrees; latitude the sun is overhead at noon
    equation_of_time: float  # minutes; sundial noon minus mean clock noon


# A conservative reference day for south-facing windows.
WINTER_SOLSTICE = SolarDay(declination=-23.44, equation_of_time=2.0)


def sun_position(
    lat: float,
    lon: float,
    minutes: int,
    day: SolarDay = WINTER_SOLSTICE,
    tz_meridian: float = 135.0,
) -> tuple[float, float]:
    """
    Sun altitude and azimuth in degrees at `minutes` past local midnight.

    Altitude is above the horizon (negative = set); azimuth is clockwise
    from north, so 90 = east, 180 = south, 270 = west. `tz_meridian` is the
    longitude the clock is set to (135°E for JST).
    """
    # Convert clock time to solar time.
    solar_minutes = minutes + 4.0 * (lon - tz_meridian) + day.equation_of_time
    # Hour angle is 0° at solar noon and changes 15° per hour.
    hour_angle = math.radians(solar_minutes / 4.0 - 180.0)

    phi = math.radians(lat)
    delta = math.radians(day.declination)

    sin_alt = math.sin(phi) * math.sin(delta) + math.cos(phi) * math.cos(delta) * math.cos(
        hour_angle
    )
    altitude = math.degrees(math.asin(sin_alt))

    azimuth = math.degrees(
        math.atan2(
            math.sin(hour_angle),
            math.cos(hour_angle) * math.sin(phi) - math.tan(delta) * math.cos(phi),
        )
    )
    return altitude, (azimuth + 180.0) % 360.0
