"""
CityConfig — per-city settings loaded from cities/<slug>/config.yaml.

All city-specific data (bbox, timezone, geocoder choice, data paths)
flows through this module.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

_CITIES_DIR = Path(__file__).resolve().parent.parent.parent / "cities"


@dataclass
class CityConfig:
    name: str
    slug: str
    country: str
    center: tuple[float, float]  # (lat, lon)
    bbox: tuple[float, float, float, float]  # (south, west, north, east)
    timezone: str
    commute_provider: str = "csa"
    geocoder: str = "photon"
    state: str = ""
    example_addresses: list[str] = field(default_factory=list)

    # Internal
    city_dir: Path = field(default=Path("."), repr=False)

    @classmethod
    def load(cls, city_slug: str, base_dir: Path | None = None) -> CityConfig:
        if base_dir is None:
            base_dir = _CITIES_DIR
        city_dir = base_dir / city_slug
        config_path = city_dir / "config.yaml"

        if not config_path.exists():
            raise FileNotFoundError(f"No city config at {config_path}")

        with open(config_path) as f:
            raw = yaml.safe_load(f)

        return cls(
            name=raw["name"],
            slug=city_slug,
            country=raw["country"],
            center=tuple(raw["center"]),
            bbox=tuple(raw["bbox"]),
            timezone=raw["timezone"],
            commute_provider=raw.get("commute_provider", "csa"),
            geocoder=raw.get("geocoder", "photon"),
            state=raw.get("state", ""),
            example_addresses=raw.get("example_addresses", []),
            city_dir=city_dir,
        )


# --- Singleton ---

_current: CityConfig | None = None


def get_city_config() -> CityConfig:
    """Get the current city config singleton (RENTROO_CITY, default tokyo)."""
    global _current
    if _current is None:
        _current = CityConfig.load(os.environ.get("RENTROO_CITY", "tokyo"))
    return _current


def set_city_config(config: CityConfig) -> None:
    """Override the city config (for testing)."""
    global _current
    _current = config


def reset_city_config() -> None:
    """Reset the singleton so the next call re-resolves."""
    global _current
    _current = None
