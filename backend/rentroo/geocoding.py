"""
Address geocoding and typeahead suggestions.

Two providers, no Nominatim:
- GSI (国土地理院) — government address search, kanji/kana-native. Japan only.
- Photon (komoot/OSM) — romaji queries and non-Japan cities.
"""

import logging

from rentroo.cache import TTL_SUGGEST, cache_get, cache_set, geocode_key
from rentroo.config import get_city_config
from rentroo.http_client import USER_AGENT, request_with_retry

logger = logging.getLogger(__name__)

GSI_SEARCH_BASE = "https://msearch.gsi.go.jp/address-search/AddressSearch"
PHOTON_BASE = "https://photon.komoot.io"


def _photon_feature_to_suggestion(feature: dict) -> dict:
    lon, lat = feature["geometry"]["coordinates"]
    props = feature.get("properties", {})

    name = props.get("name")
    street = props.get("street")
    address_line = " ".join(str(part) for part in (props.get("housenumber"), street) if part)

    name_parts: list[str] = []
    if name:
        name_parts.append(str(name))
    if address_line:
        if name and street and str(name).casefold() == str(street).casefold():
            name_parts[-1] = address_line
        else:
            name_parts.append(address_line)
    name_parts.extend(
        str(props[key]) for key in ("locality", "district", "city", "postcode") if props.get(key)
    )

    # Photon can repeat the same locality at multiple administrative levels.
    display_parts = list(dict.fromkeys(name_parts))
    return {
        "display_name": ", ".join(display_parts),
        "lat": lat,
        "lon": lon,
        "suburb": props.get("district") or props.get("locality"),
    }


async def _suggest_gsi(query: str, config, limit: int) -> list[dict]:
    """GSI address candidates inside the active city's bbox."""
    resp = await request_with_retry(
        "GET",
        GSI_SEARCH_BASE,
        params={"q": query},
        headers={"User-Agent": USER_AGENT},
        label=f"GSI(suggest:{query[:40]})",
    )
    if resp is None:
        return []
    south, west, north, east = config.bbox
    suggestions = []
    for place in resp.json() or []:
        lon, lat = place["geometry"]["coordinates"]
        if not (south <= lat <= north and west <= lon <= east):
            continue
        title = place.get("properties", {}).get("title")
        if not title:
            continue
        suggestions.append({"display_name": title, "lat": lat, "lon": lon, "suburb": None})
        if len(suggestions) >= limit:
            break
    return suggestions


async def _suggest_photon(query: str, config, limit: int) -> list[dict]:
    """Photon candidates inside the active city's bbox."""
    south, west, north, east = config.bbox
    resp = await request_with_retry(
        "GET",
        f"{PHOTON_BASE}/api",
        params={"q": query, "limit": limit, "bbox": f"{west},{south},{east},{north}"},
        headers={"User-Agent": USER_AGENT},
        label=f"Photon(suggest:{query[:40]})",
    )
    if resp is None:
        return []
    suggestions = [_photon_feature_to_suggestion(f) for f in resp.json().get("features", [])]
    return [s for s in suggestions if s["display_name"]][:limit]


async def suggest_places(query: str, limit: int = 6) -> list[dict]:
    """
    Typeahead: return up to `limit` place/address candidates for a partial query.

    gsi_photon cities ask GSI first (official data, native kanji/kana), then
    fill any remaining slots from Photon (covers romaji queries). Other cities
    use Photon alone. Results are deduped by location and display name, and
    cached for a day.
    """
    config = get_city_config()
    q = query.strip()
    if not q:
        return []

    # Bump when formatting or merge/dedupe changes — results are cached a day.
    key = geocode_key(f"suggest:v3:{config.name}:{limit}:{q}")
    cached = await cache_get(key)
    if cached is not None:
        return cached

    results: list[dict] = []
    if config.geocoder == "gsi_photon":
        results = await _suggest_gsi(q, config, limit)
    if len(results) < limit:
        # Dedupe on name as well as location: OSM often carries one entry per
        # station entrance/platform, all sharing a display name.
        seen = {(round(r["lat"], 4), round(r["lon"], 4)) for r in results}
        seen_names = {r["display_name"] for r in results}
        for r in await _suggest_photon(q, config, limit):
            if (round(r["lat"], 4), round(r["lon"], 4)) in seen:
                continue
            if r["display_name"] in seen_names:
                continue
            seen_names.add(r["display_name"])
            results.append(r)
            if len(results) >= limit:
                break

    await cache_set(key, results, ttl=TTL_SUGGEST)
    return results


async def _geocode_gsi_detailed(address: str, config) -> dict | None:
    """GSI (国土地理院) address search. Japanese-script addresses only."""
    resp = await request_with_retry(
        "GET",
        GSI_SEARCH_BASE,
        params={"q": address},
        headers={"User-Agent": USER_AGENT},
        label=f"GSI({address[:40]})",
    )
    if resp is None:
        return None
    results = resp.json()
    south, west, north, east = config.bbox
    for place in results or []:
        lon, lat = place["geometry"]["coordinates"]
        # GSI searches nationwide; keep only hits inside the active city
        if south <= lat <= north and west <= lon <= east:
            return {
                "lat": lat,
                "lon": lon,
                "display_name": place.get("properties", {}).get("title") or address,
                "suburb": None,
                "state": config.state or None,
                "postcode": None,
            }
    return None


async def _geocode_photon_detailed(address: str, config) -> dict | None:
    """Photon (OSM). Covers romaji Japanese addresses and non-Japan cities."""
    south, west, north, east = config.bbox
    resp = await request_with_retry(
        "GET",
        f"{PHOTON_BASE}/api",
        params={"q": address, "limit": 1, "bbox": f"{west},{south},{east},{north}"},
        headers={"User-Agent": USER_AGENT},
        label=f"Photon({address[:40]})",
    )
    if resp is None:
        return None
    features = resp.json().get("features", [])
    if not features:
        return None
    feature = features[0]
    lon, lat = feature["geometry"]["coordinates"]
    props = feature.get("properties", {})
    name_parts = [
        props.get(key) for key in ("name", "locality", "district", "city") if props.get(key)
    ]
    return {
        "lat": lat,
        "lon": lon,
        "display_name": ", ".join(dict.fromkeys(name_parts)) or address,
        "suburb": props.get("district") or props.get("locality"),
        "state": props.get("state"),
        "postcode": props.get("postcode"),
    }


async def geocode_address(address: str) -> dict | None:
    """
    Geocode an address to structured location data, or None if not found.

    gsi_photon cities try GSI first and fall back to Photon; others go
    straight to Photon.
    """
    config = get_city_config()
    if config.geocoder == "gsi_photon":
        result = await _geocode_gsi_detailed(address, config)
        if result:
            return result
    return await _geocode_photon_detailed(address, config)


async def resolve_destination(
    name: str,
    lat: float | None = None,
    lon: float | None = None,
) -> tuple[str, tuple[float, float]] | None:
    """
    Resolve a commute anchor to (display_name, (lat, lon)).
    """
    if lat is not None and lon is not None:
        return name, (lat, lon)
    detailed = await geocode_address(name)
    if detailed is None:
        return None
    return detailed["display_name"] or name, (detailed["lat"], detailed["lon"])
