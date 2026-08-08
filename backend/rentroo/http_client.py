"""
Shared HTTP infrastructure for external geo services.

request_with_retry wraps every outbound call (GSI, Photon) with
exponential backoff.
"""

import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "rentroo-lab/0.1 (+https://github.com/hazelwng/rentroo-lab)"

_MAX_RETRIES = 3
_RETRY_BACKOFF = [1, 2, 4]


async def request_with_retry(
    method: str,
    url: str,
    *,
    params: dict | None = None,
    headers: dict | None = None,
    timeout: float = 10,
    label: str = "HTTP",
) -> httpx.Response | None:
    """Make an HTTP request with exponential backoff on transient failures."""
    for attempt in range(_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, url, params=params, headers=headers)
                resp.raise_for_status()
                return resp
        except (httpx.TimeoutException, httpx.ConnectError, OSError) as e:
            wait = _RETRY_BACKOFF[attempt] if attempt < len(_RETRY_BACKOFF) else _RETRY_BACKOFF[-1]
            logger.warning(
                "%s request failed (attempt %d/%d): %s — retrying in %ds",
                label,
                attempt + 1,
                _MAX_RETRIES,
                e,
                wait,
            )
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(wait)
        except httpx.HTTPStatusError as e:
            if 400 <= e.response.status_code < 500:
                logger.error("%s got client error %d, not retrying", label, e.response.status_code)
                return None
            wait = _RETRY_BACKOFF[attempt] if attempt < len(_RETRY_BACKOFF) else _RETRY_BACKOFF[-1]
            logger.warning(
                "%s got %d (attempt %d/%d) — retrying in %ds",
                label,
                e.response.status_code,
                attempt + 1,
                _MAX_RETRIES,
                wait,
            )
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(wait)
        except Exception as e:
            logger.error("%s unexpected error: %s", label, e)
            return None
    logger.error("%s request failed after %d attempts: %s", label, _MAX_RETRIES, url)
    return None
