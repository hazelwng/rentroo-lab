"""Pydantic request/response models for the HTTP API."""

from pydantic import BaseModel, Field

# GTFS time-of-day; hours may exceed 23 for cross-midnight service ("24:38:00")
GTFS_TIME_PATTERN = r"^\d{1,2}:\d{2}:\d{2}$"


class CityOut(BaseModel):
    name: str
    country: str
    center: tuple[float, float]  # (lat, lon)
    bbox: tuple[float, float, float, float]  # (south, west, north, east)
    timezone: str
    example_addresses: list[str]


class SuggestionOut(BaseModel):
    display_name: str
    lat: float
    lon: float
    suburb: str | None = None


class OriginIn(BaseModel):
    """A start point, typically a listing. `id` is echoed back untouched."""

    id: str | None = None
    lat: float
    lon: float


class DestinationIn(BaseModel):
    """A commute anchor. Coordinates (e.g. from a typeahead pick) skip geocoding."""

    name: str = Field(min_length=1)
    lat: float | None = None
    lon: float | None = None


class CommuteIn(BaseModel):
    origins: list[OriginIn] = Field(min_length=1, max_length=100)
    destinations: list[DestinationIn] = Field(min_length=1, max_length=5)
    departure: str = Field(default="08:00:00", pattern=GTFS_TIME_PATTERN)


class LegOut(BaseModel):
    kind: str  # "walk" | "ride" | "transfer"
    from_name: str
    to_name: str
    duration_min: int
    distance_m: int | None = None
    line: str | None = None
    line_color: str | None = None
    stops: int | None = None


class ItineraryOut(BaseModel):
    total_min: int
    transfers: int
    walk_total_min: int
    legs: list[LegOut]


class RouteOptionOut(BaseModel):
    tags: list[str]  # ["fastest", "fewest_transfers", "least_walking"]
    best: bool
    itinerary: ItineraryOut


class CommuteOut(BaseModel):
    transit_minutes: int | None = None
    distance_km: float | None = None
    summary: str | None = None
    itinerary: ItineraryOut | None = None
    route_options: list[RouteOptionOut] | None = None


class DestinationOut(BaseModel):
    """An anchor as resolved: display name plus final coordinates."""

    name: str
    lat: float
    lon: float


class OriginResultsOut(BaseModel):
    id: str | None = None
    results: list[CommuteOut | None]  # aligned with `destinations`; None = unroutable


class CommuteMatrixOut(BaseModel):
    departure: str
    destinations: list[DestinationOut]
    origins: list[OriginResultsOut]


class SunlightIn(BaseModel):
    """A window: where it is, how high, which way it looks."""

    lat: float
    lon: float
    floor: int = Field(default=2, ge=1, le=60)  # 1 = ground floor
    facing: float = Field(default=180, ge=0, lt=360)  # degrees clockwise from north
    # footprints within 300 m for a 3D view; ~1000 rings, so off for list views
    with_neighbours: bool = False


class NeighbourOut(BaseModel):
    """A nearby footprint for rendering: metres east/north of the window."""

    ring: list[tuple[float, float]]
    height: float
    ground: float


class SunlightOut(BaseModel):
    hours: float  # direct-sun hours on the winter solstice
    segments: list[tuple[int, int]]  # lit stretches, minutes past midnight
    samples: list[float]  # 0..1 per 10 min from 06:00 to 18:00
    ground: float  # window's ground level, metres; neighbours' ground is in the same datum
    neighbours: list[NeighbourOut] | None = None  # only when requested
