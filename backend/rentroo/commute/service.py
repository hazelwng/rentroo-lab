"""Commute calculation facade: pick the active city's provider and run it."""

from rentroo.commute.providers import get_commute_provider
from rentroo.commute.types import CommuteProviderUnavailable, CommuteQuery, CommuteResult
from rentroo.config import get_city_config


async def calculate_commute(
    origin: tuple[float, float],
    destination: tuple[float, float],
    departure: str = "08:00:00",
) -> CommuteResult:
    """Calculate a commute using the provider selected by the active city."""
    query = CommuteQuery(origin=origin, destination=destination, departure=departure)
    provider = get_commute_provider(get_city_config().commute_provider)
    return await provider.calculate(query)


async def calculate_commute_batch(
    origin: tuple[float, float],
    destinations: list[tuple[float, float]],
    departure: str = "08:00:00",
) -> list[CommuteResult | None]:
    """Calculate commutes from one origin to many destinations.

    Providers with a native batch implementation share origin-side work
    across destinations; otherwise fall back to one calculate() per pair.
    """
    provider = get_commute_provider(get_city_config().commute_provider)
    batch = getattr(provider, "calculate_batch", None)
    if batch is not None:
        return await batch(origin, destinations, departure)

    results: list[CommuteResult | None] = []
    for destination in destinations:
        query = CommuteQuery(origin=origin, destination=destination, departure=departure)
        try:
            results.append(await provider.calculate(query))
        except CommuteProviderUnavailable:
            results.append(None)
    return results
