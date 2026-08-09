"""City-selectable commute provider boundary."""

from typing import Protocol

from rentroo.commute.types import CommuteQuery, CommuteResult
from rentroo.transit.csa_provider import GtfsCsaProvider


class CommuteProvider(Protocol):
    """Calculate one origin-to-destination commute."""

    name: str

    async def calculate(self, query: CommuteQuery) -> CommuteResult: ...


_PROVIDERS: dict[str, CommuteProvider] = {
    GtfsCsaProvider.name: GtfsCsaProvider(),
}


def get_commute_provider(name: str) -> CommuteProvider:
    try:
        return _PROVIDERS[name]
    except KeyError as exc:
        choices = ", ".join(sorted(_PROVIDERS))
        raise ValueError(f"Unknown commute provider {name!r}; expected one of: {choices}") from exc
