import fakeredis.aioredis
import pytest

from rentroo import cache
from rentroo.config import CityConfig, reset_city_config, set_city_config


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    """Every test gets a fresh in-memory Redis; never touches a real one."""
    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(cache, "_client", client)
    return client


@pytest.fixture
def tokyo_config():
    config = CityConfig(
        name="Tokyo",
        slug="tokyo",
        country="Japan",
        center=(35.68, 139.77),
        bbox=(35.5, 139.3, 35.9, 140.0),
        timezone="Asia/Tokyo",
        geocoder="gsi_photon",
        state="Tokyo",
    )
    set_city_config(config)
    yield config
    reset_city_config()
