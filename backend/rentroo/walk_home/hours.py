"""Queries over normalized weekly open intervals."""

from __future__ import annotations

DAY_MINUTES = 24 * 60
NIGHT_SAFETY_MINUTES = 20 * 60


def open_at_or_after(
    intervals: tuple[tuple[int, int], ...] | None,
    threshold: int = NIGHT_SAFETY_MINUTES,
) -> bool | None:
    """Whether the place is open at some time of day past the threshold.

    Intervals are [start, end) minute pairs from Monday 00:00. None means the
    hours are unknown, and the answer is None rather than False.
    """
    if intervals is None:
        return None
    for start, end in intervals:
        if end - start >= DAY_MINUTES:
            return True
        day_end = (start // DAY_MINUTES + 1) * DAY_MINUTES
        if max(start, day_end - DAY_MINUTES + threshold) < min(end, day_end):
            return True
        if end > day_end and end - day_end > threshold:
            return True
    return False
