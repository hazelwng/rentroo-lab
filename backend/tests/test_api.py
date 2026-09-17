"""API tests over the ASGI app. Services are mocked except one real-feed run."""

import httpx
import pytest

from rentroo.api.app import create_app
from rentroo.commute.types import CommuteProviderUnavailable, CommuteResult
from rentroo.config import CityConfig, reset_city_config, set_city_config

NAKAMEGURO = {"lat": 35.6440, "lon": 139.6990}
MEGURO = {"lat": 35.6335, "lon": 139.7155}
OTEMACHI = {"name": "大手町", "lat": 35.6869, "lon": 139.7641}
SHIBUYA = {"name": "渋谷", "lat": 35.6580, "lon": 139.7016}


@pytest.fixture
async def client(tokyo_config):
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_healthz(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_city_reflects_active_config(client, tokyo_config):
    resp = await client.get("/api/city")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Tokyo"
    assert data["center"] == list(tokyo_config.center)
    assert data["timezone"] == "Asia/Tokyo"


async def test_suggest_passes_query_through(client, monkeypatch):
    async def fake_suggest(query, limit=6):
        assert (query, limit) == ("中目黒", 3)
        return [{"display_name": "中目黒駅", "lat": 35.644, "lon": 139.699, "suburb": None}]

    monkeypatch.setattr("rentroo.api.app.suggest_places", fake_suggest)
    resp = await client.get("/api/places/suggest", params={"q": "中目黒", "limit": 3})
    assert resp.status_code == 200
    assert resp.json()[0]["display_name"] == "中目黒駅"


async def test_suggest_requires_query(client):
    assert (await client.get("/api/places/suggest")).status_code == 422


async def test_commute_matrix_shape(client, monkeypatch):
    async def fake_batch(origin, destinations, departure="08:00:00"):
        assert departure == "09:30:00"
        return [
            CommuteResult(transit_minutes=30, distance_km=8.0, transit_route_summary="日比谷線"),
            None,  # unroutable pair
        ]

    monkeypatch.setattr("rentroo.api.app.calculate_commute_batch", fake_batch)
    resp = await client.post(
        "/api/commute",
        json={
            "origins": [{"id": "listing-1", **NAKAMEGURO}],
            "destinations": [OTEMACHI, {"name": "渋谷", "lat": 35.658, "lon": 139.7016}],
            "departure": "09:30:00",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["departure"] == "09:30:00"
    assert [d["name"] for d in data["destinations"]] == ["大手町", "渋谷"]
    origin = data["origins"][0]
    assert origin["id"] == "listing-1"
    assert origin["results"][0]["summary"] == "日比谷線"
    assert origin["results"][1] is None


async def test_commute_unresolvable_destination_is_422(client, monkeypatch):
    async def fake_resolve(name, lat=None, lon=None):
        return None

    monkeypatch.setattr("rentroo.api.app.resolve_destination", fake_resolve)
    resp = await client.post(
        "/api/commute",
        json={"origins": [NAKAMEGURO], "destinations": [{"name": "нигде"}]},
    )
    assert resp.status_code == 422
    assert "нигде" in resp.json()["detail"]


async def test_commute_provider_down_is_503(client, monkeypatch):
    async def fake_batch(origin, destinations, departure="08:00:00"):
        raise CommuteProviderUnavailable("GTFS feed not loaded")

    monkeypatch.setattr("rentroo.api.app.calculate_commute_batch", fake_batch)
    resp = await client.post(
        "/api/commute", json={"origins": [NAKAMEGURO], "destinations": [OTEMACHI]}
    )
    assert resp.status_code == 503


async def test_commute_validation():
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        no_origins = {"origins": [], "destinations": [OTEMACHI]}
        assert (await client.post("/api/commute", json=no_origins)).status_code == 422

        bad_departure = {
            "origins": [NAKAMEGURO],
            "destinations": [OTEMACHI],
            "departure": "8am",
        }
        assert (await client.post("/api/commute", json=bad_departure)).status_code == 422


@pytest.fixture
async def real_client():
    set_city_config(CityConfig.load("tokyo"))
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    reset_city_config()


async def test_commute_end_to_end_real_feed(real_client):
    resp = await real_client.post(
        "/api/commute",
        json={"origins": [{"id": "listing-1", **NAKAMEGURO}], "destinations": [OTEMACHI]},
    )
    assert resp.status_code == 200
    result = resp.json()["origins"][0]["results"][0]
    assert 10 <= result["transit_minutes"] <= 90
    assert result["route_options"]
    kinds = [leg["kind"] for leg in result["itinerary"]["legs"]]
    assert kinds[0] == "walk" and kinds[-1] == "walk"


async def test_commute_api_uses_full_network_bundle_for_jr(real_client):
    resp = await real_client.post(
        "/api/commute",
        json={"origins": [{"id": "meguro", **MEGURO}], "destinations": [SHIBUYA]},
    )

    assert resp.status_code == 200
    result = resp.json()["origins"][0]["results"][0]
    assert result["summary"] == "山手線"
    rides = [leg for leg in result["itinerary"]["legs"] if leg["kind"] == "ride"]
    assert any(leg["line"] == "山手線" for leg in rides)
