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
    path: list[tuple[float, float]] | None = None  # (lat, lon) in travel order


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
    # Include nearby footprints for 3D view.
    with_neighbours: bool = False


class NeighbourOut(BaseModel):
    """A nearby footprint for rendering: metres east/north of the window."""

    ring: list[tuple[float, float]]
    height: float
    ground: float


class WindowOut(BaseModel):
    lat: float
    lon: float


class SunlightOut(BaseModel):
    hours: float  # winter-solstice direct sun
    segments: list[tuple[int, int]]  # lit minutes past midnight
    samples: list[float]  # 10-minute fractions, 06:00–18:00
    ground: float  # shared elevation datum, metres
    window: WindowOut  # neighbour origin
    neighbours: list[NeighbourOut] | None = None  # optional footprints


class WalkHomeIn(BaseModel):
    lat: float
    lon: float


class WalkHomePoiOut(BaseModel):
    name: str | None
    category: str
    lat: float
    lon: float
    opening_hours: str | None


class WalkHomeStationOut(BaseModel):
    name: str
    lat: float
    lon: float


class WalkHomeLegOut(BaseModel):
    name: str | None
    coords: list[tuple[float, float]]
    distance_m: int
    night_open_pois: list[WalkHomePoiOut]
    lamp_count: int | None
    lit_fraction: float | None


class WalkHomeOut(BaseModel):
    station: WalkHomeStationOut
    distance_m: int
    walk_min: int
    route_coords: list[tuple[float, float]]
    lamps: list[tuple[float, float]]
    legs: list[WalkHomeLegOut]
