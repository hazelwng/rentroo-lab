from rentroo import cache
from rentroo.cache import cache_get, cache_set, geocode_key


async def test_roundtrip():
    await cache_set("k", {"a": 1}, ttl=60)
    assert await cache_get("k") == {"a": 1}


async def test_miss_returns_none():
    assert await cache_get("nope") is None


async def test_redis_down_degrades_to_miss(monkeypatch):
    class Down:
        async def get(self, key):
            raise ConnectionError("redis down")

        async def set(self, *args, **kwargs):
            raise ConnectionError("redis down")

    monkeypatch.setattr(cache, "_client", Down())
    await cache_set("k", "v")  # must not raise
    assert await cache_get("k") is None


def test_geocode_key_normalizes_query():
    assert geocode_key("  Tokyo Station ") == geocode_key("tokyo station")
    assert geocode_key("a") != geocode_key("b")
