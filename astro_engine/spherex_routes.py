from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from pipeline import parse_sky_coordinates
from spherex_archive import (
    SIA_MAX_ROWS,
    ArchiveSearch,
    ArchiveUnavailable,
    SearchRegion,
    get_cutout,
    search_observations,
)
from spherex_fits import CutoutMetadata, extract_cutout_metadata


router = APIRouter(prefix="/api/spherex", tags=["SPHEREx"])


def parse_region(
    ra: str, dec: str, fov_arcmin: Annotated[float, Query(ge=0.5, le=120)] = 8
) -> SearchRegion:
    try:
        ra_deg, dec_deg = parse_sky_coordinates(ra, dec)
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "invalid_coordinates", "message": str(exc)}) from exc
    return SearchRegion(ra_deg=ra_deg, dec_deg=dec_deg, fov_arcmin=fov_arcmin)


def archive_error(error: ArchiveUnavailable) -> HTTPException:
    cause = error.__cause__
    status = 502
    if isinstance(cause, httpx.TimeoutException):
        status = 504
    elif isinstance(cause, httpx.NetworkError) or (
        isinstance(cause, httpx.HTTPStatusError) and cause.response.status_code in {429, 503}
    ):
        status = 503
    return HTTPException(status, detail={"code": "archive_unavailable", "message": str(error)})


@router.get("/observations", response_model=ArchiveSearch)
def observations(
    region: Annotated[SearchRegion, Depends(parse_region)],
    limit: Annotated[int, Query(ge=1, le=SIA_MAX_ROWS)] = 500,
) -> ArchiveSearch:
    try:
        return search_observations(region, limit)
    except ArchiveUnavailable as exc:
        raise archive_error(exc) from exc


def fetch_observation(observation_id: str, region: SearchRegion):
    try:
        result = search_observations(region, SIA_MAX_ROWS)
        entry = next((item for item in result.observations if item.observation_id == observation_id), None)
        if entry is None:
            detail = {"code": "observation_not_found", "message": "Observation was not returned for this region."}
            if result.truncated:
                detail = {"code": "search_truncated", "message": "Reduce the field before resolving this observation."}
                raise HTTPException(409, detail=detail)
            raise HTTPException(404, detail=detail)
        data, cache_hit = get_cutout(entry, region)
    except ArchiveUnavailable as exc:
        raise archive_error(exc) from exc
    return entry, data, cache_hit


@router.get(
    "/observations/{observation_id:path}/cutout",
    response_class=Response,
    responses={200: {"content": {"application/fits": {}}}},
)
def cutout(observation_id: str, region: Annotated[SearchRegion, Depends(parse_region)]) -> Response:
    _, data, cache_hit = fetch_observation(observation_id, region)
    return Response(content=data, media_type="application/fits", headers={"X-Cache-Hit": str(cache_hit).lower()})


@router.get("/observations/{observation_id:path}/metadata", response_model=CutoutMetadata)
def metadata(observation_id: str, region: Annotated[SearchRegion, Depends(parse_region)]) -> CutoutMetadata:
    entry, data, _ = fetch_observation(observation_id, region)
    try:
        return extract_cutout_metadata(data, entry)
    except (OSError, ValueError, KeyError) as exc:
        detail = {"code": "invalid_fits_metadata", "message": "IRSA cutout metadata could not be read."}
        raise HTTPException(502, detail=detail) from exc
