from rentroo import geocoding

IN_TOKYO = (35.68, 139.77)
OUTSIDE_TOKYO = (34.69, 135.50)  # Osaka


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


def gsi_place(title, lat, lon):
    return {"geometry": {"coordinates": [lon, lat]}, "properties": {"title": title}}


def photon_feature(name, lat, lon, **props):
    return {"geometry": {"coordinates": [lon, lat]}, "properties": {"name": name, **props}}


def fake_http(monkeypatch, gsi=None, photon=None):
    """Stub request_with_retry with canned per-provider payloads."""
    calls = []

    async def _request(method, url, **kwargs):
        calls.append(url)
        if "gsi.go.jp" in url:
            return FakeResponse(gsi) if gsi is not None else None
        return FakeResponse(photon) if photon is not None else None

    monkeypatch.setattr(geocoding, "request_with_retry", _request)
    return calls


async def test_suggest_gsi_first_photon_tops_up(tokyo_config, monkeypatch):
    fake_http(
        monkeypatch,
        gsi=[gsi_place("東京駅", *IN_TOKYO), gsi_place("大阪駅", *OUTSIDE_TOKYO)],
        photon={
            "features": [
                photon_feature("東京駅", *IN_TOKYO),  # duplicate of the GSI hit
                photon_feature("Tokyo Tower", 35.6586, 139.7454),
            ]
        },
    )
    names = [r["display_name"] for r in await geocoding.suggest_places("東京")]
    assert names[0] == "東京駅"  # GSI results come first
    assert "大阪駅" not in names  # outside bbox, filtered
    assert names.count("東京駅") == 1  # deduped by location
    assert any("Tokyo Tower" in n for n in names)  # Photon topped up


async def test_suggest_photon_only_when_gsi_empty(tokyo_config, monkeypatch):
    fake_http(monkeypatch, gsi=[], photon={"features": [photon_feature("渋谷", *IN_TOKYO)]})
    results = await geocoding.suggest_places("shibuya")
    assert len(results) == 1
    assert results[0]["lat"] == IN_TOKYO[0]


async def test_suggest_is_cached(tokyo_config, monkeypatch):
    calls = fake_http(monkeypatch, gsi=[gsi_place("東京駅", *IN_TOKYO)], photon={"features": []})
    await geocoding.suggest_places("東京")
    first_round = len(calls)
    await geocoding.suggest_places("東京")
    assert len(calls) == first_round  # second call served from cache


async def test_geocode_address_prefers_gsi(tokyo_config, monkeypatch):
    fake_http(
        monkeypatch,
        gsi=[gsi_place("千代田区丸の内1-9", *IN_TOKYO)],
        photon={"features": [photon_feature("wrong", 35.6, 139.7)]},
    )
    result = await geocoding.geocode_address("丸の内1-9")
    assert result["display_name"] == "千代田区丸の内1-9"
    assert result["state"] == "Tokyo"


async def test_geocode_address_falls_back_to_photon(tokyo_config, monkeypatch):
    fake_http(
        monkeypatch,
        gsi=[],  # GSI finds nothing for romaji input
        photon={"features": [photon_feature("Marunouchi", *IN_TOKYO, city="Chiyoda")]},
    )
    result = await geocoding.geocode_address("Marunouchi 1-9")
    assert result["lat"] == IN_TOKYO[0]
    assert "Marunouchi" in result["display_name"]


async def test_geocode_address_not_found(tokyo_config, monkeypatch):
    fake_http(monkeypatch, gsi=[], photon={"features": []})
    assert await geocoding.geocode_address("nowhere") is None


async def test_resolve_destination_passes_coords_through(tokyo_config, monkeypatch):
    calls = fake_http(monkeypatch)
    result = await geocoding.resolve_destination("Work", lat=35.6, lon=139.7)
    assert result == ("Work", (35.6, 139.7))
    assert calls == []  # no network when coords are supplied


async def test_resolve_destination_geocodes_bare_name(tokyo_config, monkeypatch):
    fake_http(monkeypatch, gsi=[gsi_place("東京駅", *IN_TOKYO)])
    result = await geocoding.resolve_destination("東京駅")
    assert result == ("東京駅", IN_TOKYO)
