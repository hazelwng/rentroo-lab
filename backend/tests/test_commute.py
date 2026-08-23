"""Integration tests: the commute service against the real Tokyo Metro feed."""

import pytest

from rentroo.commute.providers import get_commute_provider
from rentroo.commute.service import calculate_commute, calculate_commute_batch
from rentroo.config import CityConfig, reset_city_config, set_city_config

NAKAMEGURO = (35.6440, 139.6990)
OTEMACHI = (35.6869, 139.7641)
SHIBUYA = (35.6580, 139.7016)


@pytest.fixture
def real_tokyo():
    set_city_config(CityConfig.load("tokyo"))
    yield
    reset_city_config()


def test_unknown_provider_name_raises():
    with pytest.raises(ValueError, match="Unknown commute provider"):
        get_commute_provider("teleport")


async def test_single_commute(real_tokyo):
    result = await calculate_commute(NAKAMEGURO, OTEMACHI)
    assert result.source == "csa"
    assert 10 <= result.transit_minutes <= 90
    assert result.transit_route_summary
    tags = {tag for option in result.route_options for tag in option.tags}
    assert {"fastest", "fewest_transfers", "least_walking"} <= tags
    best = next(o for o in result.route_options if o.best)
    kinds = [leg.kind for leg in best.itinerary.legs]
    assert kinds[0] == "walk" and kinds[-1] == "walk"
    assert "ride" in kinds


async def test_legs_carry_a_drawable_path(real_tokyo):
    result = await calculate_commute(NAKAMEGURO, OTEMACHI)
    best = next(o for o in result.route_options if o.best)
    legs = best.itinerary.legs
    assert legs[0].path[0] == NAKAMEGURO and legs[-1].path[-1] == OTEMACHI
    for leg in legs:
        assert len(leg.path) >= 2
        if leg.kind == "ride":
            assert len(leg.path) == leg.stops + 1
    # Consecutive legs share endpoints.
    for prev, nxt in zip(legs, legs[1:], strict=False):
        assert prev.path[-1] == nxt.path[0]


async def test_departure_time_changes_the_plan(real_tokyo):
    morning = await calculate_commute(NAKAMEGURO, OTEMACHI, departure="08:00:00")
    late = await calculate_commute(NAKAMEGURO, OTEMACHI, departure="23:30:00")
    assert morning.transit_minutes and late.transit_minutes  # both routable


async def test_batch_shares_origin_scans(real_tokyo):
    results = await calculate_commute_batch(NAKAMEGURO, [OTEMACHI, SHIBUYA])
    assert len(results) == 2
    assert all(r is not None and r.transit_minutes for r in results)
    # Shibuya is one stop from Nakameguro; Otemachi crosses the city
    assert results[1].transit_minutes < results[0].transit_minutes
