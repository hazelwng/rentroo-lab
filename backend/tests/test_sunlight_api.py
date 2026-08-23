"""POST /api/sunlight over the real Meguro data."""

import httpx
import pytest

from rentroo.api.app import create_app
from rentroo.config import CityConfig, reset_city_config, set_city_config

NAKAMEGURO = {"lat": 35.644065, "lon": 139.699088}  # a building by the station


@pytest.fixture
async def client():
    set_city_config(CityConfig.load("tokyo"))
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    reset_city_config()


async def test_sunlight_returns_profile_without_neighbours_by_default(client):
    resp = await client.post("/api/sunlight", json={**NAKAMEGURO, "floor": 10, "facing": 180})
    assert resp.status_code == 200
    data = resp.json()
    assert 0 < data["hours"] < 9.5
    assert len(data["samples"]) == 73
    assert all(0 <= s <= 1 for s in data["samples"])
    assert data["neighbours"] is None


async def test_sunlight_neighbours_on_request(client):
    resp = await client.post("/api/sunlight", json={**NAKAMEGURO, "with_neighbours": True})
    data = resp.json()
    assert data["neighbours"], "dense station area must have footprints around it"
    assert data["window"] != NAKAMEGURO
    atlas = max(data["neighbours"], key=lambda n: n["height"])
    assert atlas["height"] > 100  # 中目黒アトラスタワー
    # Rings are window-relative.
    xs = [x for n in data["neighbours"] for x, _ in n["ring"]]
    assert min(xs) < -100 < 100 < max(xs)


async def test_sunlight_defaults_to_second_floor_facing_south(client):
    explicit = await client.post("/api/sunlight", json={**NAKAMEGURO, "floor": 2, "facing": 180})
    defaulted = await client.post("/api/sunlight", json=NAKAMEGURO)
    assert defaulted.json()["hours"] == explicit.json()["hours"]


async def test_sunlight_point_outside_any_building_is_404(client):
    park = {"lat": 35.6193, "lon": 139.6845}  # 碑文谷公園
    resp = await client.post("/api/sunlight", json={**park, "floor": 2, "facing": 180})
    assert resp.status_code == 404
    assert "no PLATEAU building" in resp.json()["detail"]


async def test_sunlight_validation(client):
    for bad in ({"floor": 0}, {"facing": 360}):
        resp = await client.post("/api/sunlight", json={**NAKAMEGURO, **bad})
        assert resp.status_code == 422
