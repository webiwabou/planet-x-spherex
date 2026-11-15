from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Annotated, Any, Literal

import httpx
import numpy as np
from astropy.time import Time
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from pipeline import parse_sky_coordinates
from spherex_archive import (
    RELEASES,
    SIA_MAX_ROWS,
    ArchiveSearch,
    ArchiveUnavailable,
    Observation,
    SearchRegion,
    get_cutout,
    package_cutouts_mef,
    search_observations,
)
from spherex_fits import CutoutMetadata, extract_cutout_metadata
from spherex_processing import process_series


router = APIRouter(prefix="/api/spherex", tags=["SPHEREx — Member 1 & 2"])
ROOT_DIR = Path(__file__).resolve().parents[1]


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
    release: Annotated[Literal["dr1", "qr3"] | None, Query()] = None,
    detector_id: Annotated[int | None, Query(ge=1, le=6)] = None,
) -> ArchiveSearch:
    releases: tuple[Literal["dr1", "qr3"], ...] = (release,) if release is not None else RELEASES
    try:
        return search_observations(region, limit, releases=releases, detector_id=detector_id)
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
        return extract_cutout_metadata(data, entry, target_coord=(region.ra_deg, region.dec_deg))
    except (OSError, ValueError, KeyError) as exc:
        detail = {"code": "invalid_fits_metadata", "message": "IRSA cutout metadata could not be read."}
        raise HTTPException(502, detail=detail) from exc


class CutoutBundleQuery(BaseModel):
    ra: str
    dec: str
    fov_arcmin: float = Field(default=8, ge=0.5, le=12)
    observation_ids: list[str] = Field(min_length=1, max_length=12)


@router.post(
    "/cutouts/mef",
    response_class=Response,
    responses={200: {"content": {"application/fits": {}}}},
)
def cutouts_mef(query: CutoutBundleQuery) -> Response:
    """Package multiple SPHEREx cutouts into a single Multi-Extension FITS file with CUTOUT_INFO."""
    region = parse_region(query.ra, query.dec, query.fov_arcmin)
    try:
        result = search_observations(region, SIA_MAX_ROWS)
        by_id = {item.observation_id: item for item in result.observations}
        missing = set(query.observation_ids) - by_id.keys()
        if missing:
            status = 409 if result.truncated else 404
            raise HTTPException(status, detail={"code": "observations_missing", "message": ", ".join(sorted(missing))})
        pairs: list[tuple[Observation, bytes]] = []
        for obs_id in dict.fromkeys(query.observation_ids):
            obs = by_id[obs_id]
            data, _ = get_cutout(obs, region)
            pairs.append((obs, data))
        mef_bytes = package_cutouts_mef(pairs, region)
    except ArchiveUnavailable as exc:
        raise archive_error(exc) from exc
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(502, detail={"code": "invalid_fits_metadata", "message": str(exc)}) from exc
    return Response(
        content=mef_bytes,
        media_type="application/fits",
        headers={"Content-Disposition": 'attachment; filename="spherex_cutouts_mef.fits"'},
    )


def _auto_select_candidates(observations_list: list[Observation], detector_id: int, max_count: int = 6) -> list[str]:
    """Select chronological observations for a detector spread across distinct observation epochs."""
    matching = [obs for obs in observations_list if obs.detector_id == detector_id]
    if not matching:
        return []
    groups: list[list[Observation]] = []
    first_mjd: float | None = None
    for obs in matching:
        if first_mjd is None or (obs.archive_start_mjd - first_mjd) > 1.0:
            groups.append([])
            first_mjd = obs.archive_start_mjd
        groups[-1].append(obs)
    selected: list[str] = []
    # Pick up to 2 per epoch group first, then fill up to max_count
    for group in groups:
        for obs in group[:2]:
            if len(selected) < max_count:
                selected.append(obs.observation_id)
    return selected


class FrameQuery(BaseModel):
    ra: str
    dec: str
    fov_arcmin: float = Field(default=8, ge=0.5, le=12)
    observation_ids: list[str] | None = Field(default=None, min_length=1, max_length=12)
    detector_id: int = Field(ge=1, le=6)
    wavelength_um: float = Field(gt=0, le=6)
    bandwidth_um: float = Field(gt=0, le=1)


class QuickLookFrame(BaseModel):
    frame_id: str
    observation_time: str
    observations: list[CutoutMetadata]
    effective_band_um: tuple[float, float]
    covered_pixels: int
    preview: list[int]


class QuickLookSeries(BaseModel):
    schema_version: int = 1
    region: SearchRegion
    width: int
    height: int
    wcs_header: dict[str, Any]
    display_limits_mjy_sr: tuple[float, float] | None
    frames: list[QuickLookFrame]


@router.post("/frames", response_model=QuickLookSeries)
def frames(query: FrameQuery) -> QuickLookSeries:
    region = parse_region(query.ra, query.dec, query.fov_arcmin)
    try:
        result = search_observations(region, SIA_MAX_ROWS)
        by_id = {item.observation_id: item for item in result.observations}
        target_ids = (
            list(dict.fromkeys(query.observation_ids))
            if query.observation_ids
            else _auto_select_candidates(result.observations, query.detector_id)
        )
        missing = set(target_ids) - by_id.keys()
        if missing:
            status = 409 if result.truncated else 404
            raise HTTPException(status, detail={"code": "observations_missing", "message": ", ".join(sorted(missing))})
        inputs = []
        for observation_id in target_ids:
            item = by_id[observation_id]
            data, _ = get_cutout(item, region)
            inputs.append((extract_cutout_metadata(data, item, target_coord=(region.ra_deg, region.dec_deg)), data))
    except ArchiveUnavailable as exc:
        raise archive_error(exc) from exc
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(502, detail={"code": "invalid_fits_metadata", "message": str(exc)}) from exc

    try:
        series = process_series(
            region, inputs, detector_id=query.detector_id,
            wavelength_um=query.wavelength_um, bandwidth_um=query.bandwidth_um,
        )
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "unusable_series", "message": str(exc)}) from exc
    height, width = series.grid.array_shape
    output = []
    if series.display_limits is not None:
        low, high = series.display_limits
        for frame in series.frames:
            valid = frame.coverage > 0
            preview = np.full((height, width), -1, dtype=np.int16)
            if low == high:
                preview[valid] = 128
            else:
                preview[valid] = np.rint(np.clip((frame.intensity[valid] - low) / (high - low), 0, 1) * 255)
            first = Time(frame.observations[0].time.mid_utc)
            last = Time(frame.observations[-1].time.mid_utc)
            versions = "|".join(item.observation.access_url for item in frame.observations)
            key = f"v1|{region.model_dump_json()}|{query.detector_id}|{query.wavelength_um}|{query.bandwidth_um}|{versions}"
            output.append(QuickLookFrame(
                frame_id=hashlib.sha256(key.encode()).hexdigest(),
                observation_time=f"{(first + (last - first) / 2).utc.isot}Z",
                observations=frame.observations,
                effective_band_um=frame.effective_band_um,
                covered_pixels=int(valid.sum()),
                preview=preview.ravel().tolist(),
            ))
    return QuickLookSeries(
        region=region, width=width, height=height, wcs_header=dict(series.grid.to_header()),
        display_limits_mjy_sr=series.display_limits, frames=output,
    )


@router.get("/targets")
def spherex_targets() -> dict[str, Any]:
    """Return verified SPHEREx data availability and sample metadata manifest for the 5 NASA targets."""
    manifest_path = ROOT_DIR / "resources/spherex/samples/manifest.json"
    if manifest_path.exists():
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    targets_path = ROOT_DIR / "resources/gaia/targets.json"
    return json.loads(targets_path.read_text(encoding="utf-8"))


@router.get("/samples/{target_id}")
def spherex_sample_target(target_id: str) -> dict[str, Any]:
    """Return pre-verified SPHEREx observations and extracted FITS cutout metadata for a benchmark target."""
    sample_path = ROOT_DIR / "resources/spherex/samples" / f"{target_id}.json"
    if not sample_path.exists():
        raise HTTPException(404, detail={"code": "sample_not_found", "message": f"No saved sample for '{target_id}'."})
    return json.loads(sample_path.read_text(encoding="utf-8"))


@router.get("/demo", include_in_schema=False)
def blink_demo() -> FileResponse:
    return FileResponse(Path(__file__).with_name("spherex_demo.html"), media_type="text/html")


@router.get("/demo/series", include_in_schema=False)
def blink_demo_series() -> FileResponse:
    return FileResponse(Path(__file__).with_name("spherex_demo_snapshot.json"), media_type="application/json")
