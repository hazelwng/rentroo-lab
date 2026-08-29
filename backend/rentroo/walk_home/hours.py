"""Conservative opening_hours checks."""

from __future__ import annotations

import re

NIGHT_SAFETY_TIME = "20:00"

_TIME_RANGE_RE = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?")


def _time_to_minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def _range_is_open_at_or_after(start: int, end: int, threshold: int) -> bool:
    if start == 0 and end == 0:
        return True
    if end <= start:
        end += 24 * 60
    return end > threshold


def is_open_at_or_after(opening_hours: str | None, threshold: str = NIGHT_SAFETY_TIME) -> bool:
    """Recognize common OSM hours that extend past the threshold; unknown means False."""
    if not opening_hours:
        return False
    normalized = opening_hours.strip()
    if not normalized or normalized.lower() in {"off", "closed"}:
        return False
    if "24/7" in normalized:
        return True

    threshold_minutes = _time_to_minutes(threshold)
    for match in _TIME_RANGE_RE.finditer(normalized):
        start_hour = int(match.group(1))
        start_minute = int(match.group(2) or "0")
        end_hour = int(match.group(3))
        end_minute = int(match.group(4) or "0")
        if start_hour > 24 or end_hour > 24 or start_minute >= 60 or end_minute >= 60:
            continue
        start = start_hour * 60 + start_minute
        end = end_hour * 60 + end_minute
        if _range_is_open_at_or_after(start, end, threshold_minutes):
            return True
    return False
