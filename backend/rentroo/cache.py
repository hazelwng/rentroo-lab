"""
Redis-backed caching for geocoding results.
Cache failures are logged and swallowed.
"""

import hashlib
import json
import logging
import os
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

TTL_SUGGEST = 86400  # 1 day — typeahead candidates can go a little stale

_client: aioredis.Redis | None = None


def _redis() -> aioredis.Redis:
    global _client
    if _client is None:
        url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _client = aioredis.from_url(url, decode_responses=True)
    return _client


def _make_key(*parts: str) -> str:
    """Build a namespaced Redis key."""
    return ":".join(str(p) for p in parts)


def _hash_query(query: str) -> str:
    """Short hash for variable-length query strings."""
    return hashlib.md5(query.encode()).hexdigest()[:12]


async def cache_get(key: str) -> Any:
    """Get a cached value. Returns None on miss."""
    try:
        data = await _redis().get(key)
        if data is not None:
            return json.loads(data)
    except Exception as e:
        logger.debug("Cache get failed for %s: %s", key, e)
    return None


async def cache_set(key: str, value: Any, ttl: int = 86400) -> None:
    """Set a cached value with TTL."""
    try:
        await _redis().set(key, json.dumps(value), ex=ttl)
    except Exception as e:
        logger.debug("Cache set failed for %s: %s", key, e)


def geocode_key(query: str) -> str:
    """Key for geocoding results."""
    return _make_key("geo", "geocode", _hash_query(query.lower().strip()))
