from __future__ import annotations

import hashlib
import io
import json
import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal

import httpx
import numpy as np
from astropy.io import fits
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
from spherex_processing import ProcessedSeries, process_series


router = APIRouter(prefix="/api/spherex", tags=["SPHEREx — Member 1 & 2"])
ROOT_DIR = Path(__file__).resolve().parents[1]
TargetId = Literal["barnards_star", "epsilon_indi_b", "wise_0855", "rw_aurigae", "r_draconis"]
SERIES_TTL_SECONDS = 3600


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


def _auto_select_candidates(observations_list: list[Observation], detector_id: int, max_count: int = 18) -> list[str]:
    """Sample both releases and spread candidates across each release's observation times."""
    matching = [obs for obs in observations_list if obs.detector_id == detector_id]
    if len(matching) <= max_count:
        return [item.observation_id for item in matching]
    small, large = sorted(
        ([item for item in matching if item.release == release] for release in RELEASES),
        key=len,
    )
    small_count = min(len(small), max_count // 2)
    large_count = min(len(large), max_count - small_count)
    selected = []
    for group, count in ((small, max_count - large_count), (large, large_count)):
        if count:
            selected.extend(group[index].observation_id for index in np.linspace(0, len(group) - 1, count, dtype=int))
    return selected


class FrameQuery(BaseModel):
    ra: str
    dec: str
    fov_arcmin: float = Field(default=8, ge=0.5, le=12)
    observation_ids: list[str] | None = Field(default=None, min_length=1, max_length=18)
    detector_id: int = Field(ge=1, le=6)
    wavelength_um: float = Field(gt=0, le=6)
    bandwidth_um: float = Field(gt=0, le=1)


@lru_cache(maxsize=1)
def _verified_bands() -> list[tuple[SearchRegion, CutoutMetadata]]:
    assets = ROOT_DIR / "resources/spherex/samples"
    snapshot = Path(__file__).with_name("spherex_demo_snapshot.json")
    verified = []
    if snapshot.exists():
        data = json.loads(snapshot.read_text(encoding="utf-8"))
        region = SearchRegion.model_validate(data["region"])
        verified.extend(
            (region, CutoutMetadata.model_validate(item))
            for frame in data["frames"] for item in frame["observations"]
        )
    for path in sorted(assets.glob("*.json")):
        if path.name == "manifest.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        region = SearchRegion.model_validate(data["search_region"])
        verified.extend(
            (region, CutoutMetadata.model_validate(item["metadata"]))
            for item in data["sample_cutouts"].values()
        )
    return verified


def _automatic_ids(archive: ArchiveSearch, query: FrameQuery) -> list[str]:
    region = archive.region
    present = {item.observation_id for item in archive.observations}
    verified = {}
    for sample_region, metadata in _verified_bands():
        obs = metadata.observation
        if (
            obs.observation_id not in present or obs.detector_id != query.detector_id
            or abs(region.ra_deg - sample_region.ra_deg) > 1e-6
            or abs(region.dec_deg - sample_region.dec_deg) > 1e-6
        ):
            continue
        wave = metadata.target_wavelength_um or metadata.center_wavelength_um
        width = metadata.target_bandwidth_um or metadata.center_bandwidth_um
        if wave is None or width is None:
            continue
        overlap = min(wave + width / 2, query.wavelength_um + query.bandwidth_um / 2) - max(
            wave - width / 2, query.wavelength_um - query.bandwidth_um / 2
        )
        if overlap >= 0.7 * max(width, query.bandwidth_um):
            verified[obs.observation_id] = obs
    remaining = [item for item in archive.observations if item.observation_id not in verified]
    known = list(verified)[:18]
    return known + _auto_select_candidates(remaining, query.detector_id, max_count=18 - len(known))


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
    warnings: list[str] = Field(default_factory=list)
    source: Literal["live", "saved"] = "live"
    archive_observations: list[Observation] = Field(default_factory=list)
    archive_count: int = 0
    archive_truncated: bool = False
    fits_url: str | None = None


def _load_live_series(query: FrameQuery) -> tuple[SearchRegion, ProcessedSeries, list[str], ArchiveSearch]:
    region = parse_region(query.ra, query.dec, query.fov_arcmin)
    warnings = []
    try:
        result = search_observations(region, SIA_MAX_ROWS, detector_id=query.detector_id, allow_partial=True)
        warnings.extend(item["message"] for item in result.warnings)
        by_id = {item.observation_id: item for item in result.observations}
        target_ids = (
            list(dict.fromkeys(query.observation_ids))
            if query.observation_ids
            else _automatic_ids(result, query)
        )
        missing = set(target_ids) - by_id.keys()
        if missing:
            if any(item["code"] == "archive_release_unavailable" for item in result.warnings):
                raise ArchiveUnavailable("The archive did not return every required release")
            status = 409 if result.truncated else 404
            raise HTTPException(status, detail={"code": "observations_missing", "message": ", ".join(sorted(missing))})
        def load(item):
            try:
                data, _ = get_cutout(item, region)
                return extract_cutout_metadata(data, item, target_coord=(region.ra_deg, region.dec_deg)), data
            except (ArchiveUnavailable, OSError, KeyError, ValueError) as exc:
                return exc

        inputs = []
        failed = 0
        with ThreadPoolExecutor(max_workers=4) as threads:
            for value in threads.map(load, (by_id[identifier] for identifier in target_ids)):
                if isinstance(value, Exception):
                    if query.observation_ids:
                        raise value
                    failed += 1
                else:
                    inputs.append(value)
        if target_ids and not inputs:
            raise ArchiveUnavailable("IRSA did not deliver any of the selected cutouts")
        if not query.observation_ids and len(result.observations) > len(target_ids):
            warnings.append(f"Se examinaron {len(target_ids)} de {len(result.observations)} candidatos para este detector.")
        if failed:
            warnings.append(f"IRSA no entregó {failed} de los recortes seleccionados.")
        if not query.observation_ids:
            versions = {}
            for metadata, _ in inputs:
                versions[metadata.pipeline_version] = versions.get(metadata.pipeline_version, 0) + 1
            if len(versions) > 1:
                chosen = max(versions, key=versions.get)
                inputs = [item for item in inputs if item[0].pipeline_version == chosen]
                warnings.append(f"Se usó la versión de calibración {chosen} para mantener las exposiciones comparables.")
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
    return region, series, warnings, result


def _make_quicklook(
    region: SearchRegion, query: FrameQuery, series: ProcessedSeries, warnings: list[str],
    source: Literal["live", "saved"] = "live",
) -> QuickLookSeries:
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
        display_limits_mjy_sr=series.display_limits, frames=output, warnings=warnings, source=source,
    )


@router.post("/frames", response_model=QuickLookSeries)
def frames(query: FrameQuery) -> QuickLookSeries:
    region, series, warnings, result = _load_live_series(query)
    output = _make_quicklook(region, query, series, warnings)
    output.archive_observations = result.observations
    output.archive_count = len(result.observations)
    output.archive_truncated = result.truncated
    if output.frames:
        output.fits_url = _cache_series_fits(series, output.frames)
    return output


def _series_fits_bytes(series: ProcessedSeries) -> bytes:
    if not series.frames:
        raise HTTPException(404, detail={"code": "empty_series", "message": "No matching frames to export"})
    hdus = [fits.PrimaryHDU()]
    for index, frame in enumerate(series.frames, start=1):
        header = series.grid.to_header()
        header["DATE-BEG"] = min(item.time.start_utc for item in frame.observations)
        header["DATE-END"] = max(item.time.end_utc for item in frame.observations)
        header["TIMESYS"] = "UTC"
        for item in frame.observations:
            header.add_history(f"{item.observation.release} {item.observation.observation_id} {item.pipeline_version}")
        header["WAVEMIN"] = frame.effective_band_um[0]
        header["WAVEMAX"] = frame.effective_band_um[1]
        header["WAVEUNIT"] = "um"
        for name, data, unit in (
            ("IMAGE", frame.intensity, "MJy / sr"),
            ("VARIANCE", frame.variance, "MJy2 / sr2"),
            ("COVERAGE", frame.coverage, ""), ("REJECTED", frame.rejected_mask, ""),
        ):
            hdu = fits.ImageHDU(data, header=header.copy(), name=f"{name}{index}")
            if unit:
                hdu.header["BUNIT"] = unit
            hdus.append(hdu)
    stream = io.BytesIO()
    fits.HDUList(hdus).writeto(stream)
    return stream.getvalue()


def _series_fits(series: ProcessedSeries) -> Response:
    return Response(_series_fits_bytes(series), media_type="application/fits",
                    headers={"Content-Disposition": 'attachment; filename="spherex_series.fits"'})


def _series_directory() -> Path:
    return Path(os.environ.get("SPHEREX_CACHE_DIR", ".cache/spherex")) / "series"


def _cache_series_fits(series: ProcessedSeries, frames: list[QuickLookFrame]) -> str | None:
    directory = _series_directory()
    key = hashlib.sha256("|".join(frame.frame_id for frame in frames).encode()).hexdigest()
    temporary = None
    try:
        directory.mkdir(parents=True, exist_ok=True)
        cutoff = time.time() - SERIES_TTL_SECONDS
        for path in directory.glob("*.fits"):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
            except OSError:
                pass
        with tempfile.NamedTemporaryFile(dir=directory, suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(_series_fits_bytes(series))
        temporary.replace(directory / f"{key}.fits")
    except OSError:
        return None
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
    return f"/api/spherex/frames/{key}/fits"


@router.get("/frames/{series_id}/fits", response_class=FileResponse)
def cached_frames_fits(series_id: str) -> FileResponse:
    if not re.fullmatch("[0-9a-f]{64}", series_id):
        raise HTTPException(404, detail="Serie FITS no encontrada.")
    path = _series_directory() / f"{series_id}.fits"
    try:
        if time.time() - path.stat().st_mtime < SERIES_TTL_SECONDS:
            return FileResponse(path, media_type="application/fits", filename="spherex_series.fits")
    except FileNotFoundError:
        pass
    raise HTTPException(404, detail="La serie FITS caducó. Vuelve a consultar el campo.")


@router.post("/frames/fits", response_class=Response)
def frames_fits(query: FrameQuery) -> Response:
    _, series, _, _ = _load_live_series(query)
    return _series_fits(series)


@router.get("/targets")
def spherex_targets() -> dict[str, Any]:
    """Return verified SPHEREx data availability and sample metadata manifest for the 5 NASA targets."""
    manifest_path = ROOT_DIR / "resources/spherex/samples/manifest.json"
    if manifest_path.exists():
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    targets_path = ROOT_DIR / "resources/gaia/targets.json"
    return json.loads(targets_path.read_text(encoding="utf-8"))


@router.get("/samples/{target_id}")
def spherex_sample_target(target_id: TargetId) -> dict[str, Any]:
    """Return pre-verified SPHEREx observations and extracted FITS cutout metadata for a benchmark target."""
    sample_path = ROOT_DIR / "resources/spherex/samples" / f"{target_id}.json"
    if not sample_path.exists():
        raise HTTPException(404, detail={"code": "sample_not_found", "message": f"No saved sample for '{target_id}'."})
    return json.loads(sample_path.read_text(encoding="utf-8"))


def _saved_sample_series(target_id: TargetId, release: Literal["dr1", "qr3"]):
    saved = spherex_sample_target(target_id)
    cutout_file = saved["sample_fits_files"].get(release)
    if not cutout_file:
        raise HTTPException(404, detail={"code": "sample_not_found", "message": f"No saved {release.upper()} cutout for this target."})
    region = SearchRegion.model_validate(saved["search_region"])
    observation = Observation.model_validate(saved["sample_cutouts"][release]["metadata"]["observation"])
    data = (ROOT_DIR / cutout_file).read_bytes()
    metadata = extract_cutout_metadata(data, observation, target_coord=(region.ra_deg, region.dec_deg))
    wavelength = metadata.target_wavelength_um or metadata.center_wavelength_um
    bandwidth = metadata.target_bandwidth_um or metadata.center_bandwidth_um
    if wavelength is None or bandwidth is None:
        raise HTTPException(422, detail={"code": "missing_band", "message": "No wavelength calibration for this cutout."})
    query = FrameQuery(
        ra=str(region.ra_deg), dec=str(region.dec_deg), fov_arcmin=region.fov_arcmin,
        detector_id=observation.detector_id, wavelength_um=wavelength, bandwidth_um=bandwidth,
    )
    series = process_series(
        region, [(metadata, data)], detector_id=query.detector_id,
        wavelength_um=query.wavelength_um, bandwidth_um=query.bandwidth_um,
    )
    return region, query, series


@router.get("/samples/{target_id}/frames", response_model=QuickLookSeries)
def spherex_saved_frames(target_id: TargetId, release: Literal["dr1", "qr3"] = "dr1") -> QuickLookSeries:
    region, query, series = _saved_sample_series(target_id, release)
    return _make_quicklook(region, query, series, [], source="saved")


@router.get("/samples/{target_id}/frames/fits", response_class=Response)
def spherex_saved_fits(target_id: TargetId, release: Literal["dr1", "qr3"] = "dr1") -> Response:
    _, _, series = _saved_sample_series(target_id, release)
    return _series_fits(series)


@router.get("/demo", include_in_schema=False)
def blink_demo() -> FileResponse:
    return FileResponse(Path(__file__).with_name("spherex_demo.html"), media_type="text/html")


@router.get("/demo/series", include_in_schema=False)
def blink_demo_series() -> FileResponse:
    return FileResponse(Path(__file__).with_name("spherex_demo_snapshot.json"), media_type="application/json")


@router.get("/demo/series/fits", include_in_schema=False)
def blink_demo_fits() -> FileResponse:
    return FileResponse(
        ROOT_DIR / "resources/sample_data/r_draconis_series.fits", media_type="application/fits",
        filename="r_draconis_series.fits",
    )
