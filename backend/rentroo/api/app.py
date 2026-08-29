"""FastAPI application: the HTTP surface over the commute, sunlight and geocoding services."""

import os
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from rentroo import logging_config
from rentroo.api import schemas
from rentroo.commute.service import calculate_commute_batch
from rentroo.commute.types import CommuteProviderUnavailable, CommuteResult
from rentroo.config import get_city_config
from rentroo.geocoding import resolve_destination, suggest_places
from rentroo.sunlight.service import sunlight_report
from rentroo.sunlight.shadow import BuildingNotFoundError
from rentroo.walk_home.service import WalkHomeUnavailable
from rentroo.walk_home.service import walk_home as calculate_walk_home


@asynccontextmanager
async def _lifespan(app: FastAPI):
    logging_config.configure()
    yield


def _commute_out(result: CommuteResult | None) -> schemas.CommuteOut | None:
    if result is None:
        return None
    data = asdict(result)
    return schemas.CommuteOut(
        transit_minutes=data["transit_minutes"],
        distance_km=data["distance_km"],
        summary=data["transit_route_summary"],
        itinerary=data["transit_itinerary"],
        route_options=data["route_options"],
    )


def create_app() -> FastAPI:
    app = FastAPI(title="rentroo-lab", version="0.1.0", lifespan=_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/city")
    async def city() -> schemas.CityOut:
        config = get_city_config()
        return schemas.CityOut(
            name=config.name,
            country=config.country,
            center=config.center,
            bbox=config.bbox,
            timezone=config.timezone,
            example_addresses=config.example_addresses,
        )

    @app.get("/api/places/suggest")
    async def suggest(
        q: str = Query(min_length=1, max_length=200),
        limit: int = Query(default=6, ge=1, le=10),
    ) -> list[schemas.SuggestionOut]:
        return await suggest_places(q, limit=limit)

    @app.post("/api/commute")
    async def commute(body: schemas.CommuteIn) -> schemas.CommuteMatrixOut:
        """Commute matrix: every origin (listing) against every anchor.

        Results per origin are aligned with the resolved `destinations` list;
        an unroutable pair comes back as null rather than failing the batch.
        """
        resolved: list[schemas.DestinationOut] = []
        for dest in body.destinations:
            hit = await resolve_destination(dest.name, dest.lat, dest.lon)
            if hit is None:
                raise HTTPException(422, detail=f"Could not resolve destination: {dest.name!r}")
            display_name, (lat, lon) = hit
            resolved.append(schemas.DestinationOut(name=display_name, lat=lat, lon=lon))

        anchor_coords = [(d.lat, d.lon) for d in resolved]
        origins_out: list[schemas.OriginResultsOut] = []
        for origin in body.origins:
            try:
                results = await calculate_commute_batch(
                    (origin.lat, origin.lon), anchor_coords, departure=body.departure
                )
            except CommuteProviderUnavailable as e:
                raise HTTPException(503, detail=str(e)) from e
            origins_out.append(
                schemas.OriginResultsOut(id=origin.id, results=[_commute_out(r) for r in results])
            )

        return schemas.CommuteMatrixOut(
            departure=body.departure, destinations=resolved, origins=origins_out
        )

    @app.post("/api/sunlight")
    async def sunlight(body: schemas.SunlightIn) -> schemas.SunlightOut:
        """Winter-solstice direct sun for one window, plus the footprints around it."""
        try:
            report = sunlight_report(
                body.lat, body.lon, body.floor, body.facing, with_neighbours=body.with_neighbours
            )
        except BuildingNotFoundError as e:
            raise HTTPException(404, detail=str(e)) from e
        return schemas.SunlightOut(
            hours=report.result.hours,
            segments=report.result.segments,
            samples=report.result.samples,
            ground=report.ground,
            window=schemas.WindowOut(lat=report.window[0], lon=report.window[1]),
            neighbours=(
                None
                if report.neighbours is None
                else [schemas.NeighbourOut(**asdict(n)) for n in report.neighbours]
            ),
        )

    @app.post("/api/walk-home")
    async def walk_home(body: schemas.WalkHomeIn) -> schemas.WalkHomeOut:
        """Route and mapped night context from the nearest station to a listing."""
        try:
            result = calculate_walk_home(body.lat, body.lon)
        except (WalkHomeUnavailable, FileNotFoundError) as e:
            raise HTTPException(404, detail=str(e)) from e
        return schemas.WalkHomeOut(
            station=schemas.WalkHomeStationOut(
                name=result.station.name, lat=result.station.lat, lon=result.station.lon
            ),
            distance_m=result.distance_m,
            walk_min=result.walk_min,
            route_coords=[(round(la, 6), round(lo, 6)) for la, lo in result.route_coords],
            lamps=[(round(la, 6), round(lo, 6)) for la, lo in result.lamps],
            legs=[
                schemas.WalkHomeLegOut(
                    name=leg.name,
                    coords=[(round(la, 6), round(lo, 6)) for la, lo in leg.coords],
                    distance_m=leg.distance_m,
                    night_open_pois=[
                        schemas.WalkHomePoiOut(
                            name=poi.name,
                            category=poi.category,
                            lat=poi.lat,
                            lon=poi.lon,
                            opening_hours=poi.opening_hours,
                        )
                        for poi in leg.night_open_pois
                    ],
                    lamp_count=leg.lamp_count,
                    lit_fraction=leg.lit_fraction,
                )
                for leg in result.legs
            ],
        )

    return app


app = create_app()
