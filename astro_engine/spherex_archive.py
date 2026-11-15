"""Retrieve SPHEREx Level 2 observations from the public IRSA archive."""

from __future__ import annotations

import hashlib
import io
import math
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

import httpx
import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.io.votable import parse
from astropy.wcs import WCS
from pydantic import BaseModel, Field


SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
RELEASES: tuple[Literal["dr1", "qr3"], ...] = ("dr1", "qr3")
SIA_MAX_ROWS = 2000
SIA_MAX_BYTES = 12_000_000
CUTOUT_MAX_BYTES = 24_000_000
REQUIRED_FIELDS = {
    "obs_id", "obs_collection", "energy_bandpassname", "obs_publisher_did",
    "access_url", "t_min", "t_max",
}
PRODUCT_PATH = re.compile(
    r"/ibe/data/spherex/(?P<release>dr1|qr3)/level2/[\w-]+/"
    r"(?P<version>l2b(?:_[\w-]+)?-v(?P<revision>\d+)-(?P<year>\d{4})-(?P<day>\d{3}))/"
    r"(?P<detector>[1-6])/level2_[\w-]+\.fits"
)


class ArchiveUnavailable(RuntimeError):
    """IRSA did not return a usable result for the given collection."""


class SearchRegion(BaseModel):
    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)
    fov_arcmin: float = Field(default=8, ge=0.5, le=120)


class Observation(BaseModel):
    observation_id: str
    release: Literal["dr1", "qr3"]
    processing_version: str
    archive_id: str
    access_url: str
    detector_id: int = Field(ge=1, le=6)
    archive_start_mjd: float = Field(allow_inf_nan=False)
    archive_end_mjd: float = Field(allow_inf_nan=False)


class ArchiveSearch(BaseModel):
    schema_version: Literal[1] = 1
    region: SearchRegion
    observations: list[Observation]
    truncated: bool
    warnings: list[dict[str, str]]


def _product_path(url: str) -> re.Match[str]:
    parts = urlsplit(url)
    match = PRODUCT_PATH.fullmatch(parts.path)
    if parts.scheme != "https" or parts.netloc != "irsa.ipac.caltech.edu" or (
        parts.query or parts.fragment or match is None
    ):
        raise ValueError("Invalid IRSA spectral-image URL")
    return match


def _read_response(client: httpx.Client, url: str, params: dict, byte_limit: int) -> bytes:
    for attempt in range(2):
        try:
            with client.stream("GET", url, params=params) as response:
                response.raise_for_status()
                data = bytearray()
                for chunk in response.iter_bytes(chunk_size=65536):
                    if len(data) + len(chunk) > byte_limit:
                        raise ValueError("IRSA response exceeded byte limit")
                    data.extend(chunk)
                return bytes(data)
        except httpx.HTTPStatusError as exc:
            if attempt or exc.response.status_code not in {502, 503, 504}:
                raise
            time.sleep(0.5)
    raise AssertionError("Unreachable")


def _extract_table_observations(table, release: str) -> list[tuple[Observation, tuple[int, int, int]]]:
    if not REQUIRED_FIELDS.issubset(table.colnames):
        raise ValueError("Missing SIA fields")

    observations = []
    for row in table:
        if any(np.ma.is_masked(row[field]) for field in REQUIRED_FIELDS):
            raise ValueError("Missing observation metadata")
        access_url = str(row["access_url"])
        product = _product_path(access_url)
        detector = int(product["detector"])
        obs_collection = str(row["obs_collection"])
        bandpass = str(row["energy_bandpassname"])
        t_min = float(row["t_min"])
        t_max = float(row["t_max"])
        if (
            product["release"] != release
            or obs_collection != f"spherex_{release}"
            or bandpass != f"SPHEREx-D{detector}"
            or t_max < t_min
        ):
            raise ValueError("Inconsistent observation metadata")
        observation = Observation(
            observation_id=f"{row['obs_id']}/D{detector}",
            archive_id=str(row["obs_publisher_did"]),
            release=release,  # type: ignore[arg-type]
            detector_id=detector,
            access_url=access_url,
            processing_version=product["version"],
            archive_start_mjd=t_min,
            archive_end_mjd=t_max,
        )
        version_order = (int(product["revision"]), int(product["year"]), int(product["day"]))
        observations.append((observation, version_order))
    return observations


def _read_observations(content: bytes, release: str):
    votable = parse(io.BytesIO(content))
    nodes = [votable]
    statuses = set()
    while nodes:
        node = nodes.pop()
        statuses.update(info.value for info in node.infos if info.name == "QUERY_STATUS")
        nodes.extend(node.resources)
    if not statuses or statuses - {"OK", "OVERFLOW"}:
        raise ValueError("IRSA returned an unsuccessful SIA query status")
    table = votable.get_first_table().to_table(use_names_over_ids=True)
    observations = _extract_table_observations(table, release)
    return observations, "OVERFLOW" in statuses or len(table) >= SIA_MAX_ROWS


def list_spherex_collections() -> list[str]:
    """List SPHEREx SIA collections registered at IRSA using astroquery (IRSA tutorial step 5)."""
    from astroquery.ipac.irsa import Irsa

    table = Irsa.list_collections(servicetype="SIA", filter="spherex")
    for col in ("collection", "obs_collection", "short_name"):
        if col in table.colnames:
            return [str(val) for val in table[col]]
    return [str(row[0]) for row in table]


def query_sia_astroquery(
    region: SearchRegion,
    *,
    releases: tuple[Literal["dr1", "qr3"], ...] = RELEASES,
    detector_id: int | None = None,
) -> list[Observation]:
    """Query IRSA SIA using astroquery.ipac.irsa.Irsa.query_sia and deduplicate chronologically."""
    from astroquery.ipac.irsa import Irsa

    radius_deg = (region.fov_arcmin * math.sqrt(2) / 120) * u.deg
    coord = SkyCoord(ra=region.ra_deg * u.deg, dec=region.dec_deg * u.deg, frame="icrs")
    collections = [f"spherex_{rel}" for rel in releases]
    try:
        table = Irsa.query_sia(pos=(coord, radius_deg), collection=collections)
    except Exception as exc:
        raise ArchiveUnavailable("astroquery IRSA SIA query failed") from exc

    by_id: dict[str, tuple[tuple[int, int, int, str, str], Observation]] = {}
    if table is not None and len(table) > 0:
        for rel in releases:
            mask = [str(val) == f"spherex_{rel}" for val in table["obs_collection"]]
            subtable = table[mask]
            if len(subtable) == 0:
                continue
            for observation, version in _extract_table_observations(subtable, rel):
                if detector_id is not None and observation.detector_id != detector_id:
                    continue
                rank = (*version, observation.release, observation.access_url)
                current = by_id.get(observation.observation_id)
                if current is None or rank > current[0]:
                    by_id[observation.observation_id] = (rank, observation)

    return sorted(
        (item[1] for item in by_id.values()),
        key=lambda obs: (obs.archive_start_mjd, obs.observation_id),
    )


def search_observations(
    region: SearchRegion,
    limit: int = 500,
    *,
    releases: tuple[Literal["dr1", "qr3"], ...] = RELEASES,
    detector_id: int | None = None,
    transport: httpx.BaseTransport | None = None,
) -> ArchiveSearch:
    if not 1 <= limit <= SIA_MAX_ROWS:
        raise ValueError(f"limit must be between 1 and {SIA_MAX_ROWS}")
    if not releases or any(rel not in RELEASES for rel in releases):
        raise ValueError("releases must be a non-empty subset of ('dr1', 'qr3')")
    if detector_id is not None and not 1 <= detector_id <= 6:
        raise ValueError("detector_id must be between 1 and 6")

    radius = region.fov_arcmin * math.sqrt(2) / 120
    position = f"circle {region.ra_deg:.12g} {region.dec_deg:.12g} {radius:.12g}"
    by_id = {}
    truncated = False
    with httpx.Client(timeout=25, transport=transport, follow_redirects=False) as client:
        for release in releases:
            try:
                params = {"COLLECTION": f"spherex_{release}", "POS": position, "MAXREC": SIA_MAX_ROWS}
                data = _read_response(client, SIA_URL, params, SIA_MAX_BYTES)
                items, overflow = _read_observations(data, release)
            except (httpx.HTTPError, ValueError, TypeError, IndexError, OSError) as exc:
                raise ArchiveUnavailable(f"IRSA SIA did not return usable {release.upper()} data") from exc
            truncated |= overflow
            for observation, version in items:
                if detector_id is not None and observation.detector_id != detector_id:
                    continue
                rank = (*version, observation.release, observation.access_url)
                current = by_id.get(observation.observation_id)
                if current is None or rank > current[0]:
                    by_id[observation.observation_id] = (rank, observation)
    ordered = sorted(
        (item[1] for item in by_id.values()),
        key=lambda observation: (observation.archive_start_mjd, observation.observation_id),
    )
    truncated |= len(ordered) > limit
    warnings = [
        {"code": "truncated", "message": "The requested field has more observations than returned."}
    ] if truncated else []
    return ArchiveSearch(region=region, observations=ordered[:limit], truncated=truncated, warnings=warnings)


def build_cutout_url(observation: Observation, region: SearchRegion) -> str:
    """Construct the direct IRSA IBE cutout request URL for an observation and sky region."""
    product = _product_path(observation.access_url)
    if product["release"] != observation.release or int(product["detector"]) != observation.detector_id:
        raise ValueError("Observation does not match the IRSA spectral-image URL")
    size_deg = region.fov_arcmin / 60
    return f"{observation.access_url}?center={region.ra_deg:.12g},{region.dec_deg:.12g}&size={size_deg:.12g}"


def download_cutout(
    observation: Observation, region: SearchRegion, *, transport: httpx.BaseTransport | None = None
) -> bytes:
    """Return the original multi-extension cutout after structural checks."""
    product = _product_path(observation.access_url)
    if product["release"] != observation.release or int(product["detector"]) != observation.detector_id:
        raise ValueError("Observation does not match the IRSA spectral-image URL")

    params = {
        "center": f"{region.ra_deg:.12g},{region.dec_deg:.12g}",
        "size": f"{region.fov_arcmin / 60:.12g}",
    }
    try:
        with httpx.Client(timeout=40, transport=transport, follow_redirects=False) as client:
            data = _read_response(client, observation.access_url, params, CUTOUT_MAX_BYTES)
        _validate_cutout(data, observation)
    except (httpx.HTTPError, OSError, ValueError, KeyError, fits.VerifyError) as exc:
        raise ArchiveUnavailable(f"IRSA did not return a valid cutout for {observation.observation_id}") from exc
    return data


def _validate_cutout(data: bytes, observation: Observation) -> None:
    with fits.open(io.BytesIO(data), memmap=False, lazy_load_hdus=False) as hdul:
        hdul.verify("exception")
        image = hdul["IMAGE"]
        shape = image.shape
        if (
            len(shape) != 2 or not all(0 < length < 2040 for length in shape)
            or any(hdul[name].shape != shape for name in ("FLAGS", "VARIANCE"))
            or "WCS-WAVE" not in hdul
            or any(hdu.fileinfo()["datLoc"] + hdu.fileinfo()["datSpan"] > len(data) for hdu in hdul)
        ):
            raise ValueError("Invalid spectral-image cutout extensions")
        if f"{image.header['OBSID']}/D{image.header['DETECTOR']}" != observation.observation_id:
            raise ValueError("Cutout does not match the requested observation")


def get_cutout(
    observation: Observation, region: SearchRegion, *, cache_dir: Path | None = None,
    transport: httpx.BaseTransport | None = None,
) -> tuple[bytes, bool]:
    """Reuse immutable, versioned products and publish new cache entries atomically."""
    cache_dir = cache_dir or Path(os.environ.get("SPHEREX_CACHE_DIR", ".cache/spherex"))
    key = hashlib.sha256(f"v1|{observation.access_url}|{region.model_dump_json()}".encode()).hexdigest()
    path = cache_dir / f"{key}.fits"
    try:
        with path.open("rb") as stream:
            data = stream.read(CUTOUT_MAX_BYTES + 1)
        if len(data) > CUTOUT_MAX_BYTES:
            raise ValueError("Cached cutout exceeded size limit")
        _validate_cutout(data, observation)
        return data, True
    except (OSError, ValueError, KeyError, fits.VerifyError):
        pass

    data = download_cutout(observation, region, transport=transport)
    temporary = None
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=cache_dir, suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        temporary.replace(path)
    except OSError:
        pass
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
    return data, False


def package_cutouts_mef(
    cutouts: list[tuple[Observation, bytes]],
    region: SearchRegion,
) -> bytes:
    """Package multiple SPHEREx cutouts into a combined Multi-Extension FITS (MEF) file.

    Follows Sections 6, 8 and 9 of the official IRSA SPHEREx Cutouts Tutorial:
    - PrimaryHDU left blank because cutouts may span multiple processing versions.
    - Extension 1 (`CUTOUT_INFO` BinTableHDU) records `cutout_index`, `observation_id`,
      `release`, `observation_date` (MJD), `central_wavelength` (um), `version`, and `access_url`.
    - Subsequent extensions copy each cutout's HDUs with `cutout_index` appended to `EXTNAME`.
    """
    coord = SkyCoord(ra=region.ra_deg * u.deg, dec=region.dec_deg * u.deg, frame="icrs")
    indices: list[int] = []
    obs_ids: list[str] = []
    releases: list[str] = []
    obs_dates: list[float] = []
    wavelengths: list[float] = []
    versions: list[str] = []
    urls: list[str] = []
    all_hdus: list[fits.HDUList | Any] = []

    for idx, (obs, raw_bytes) in enumerate(cutouts, start=1):
        with fits.open(io.BytesIO(raw_bytes), memmap=False) as hdul:
            header = hdul["IMAGE"].header
            spatial_wcs = WCS(header, fobj=hdul).celestial
            x, y = spatial_wcs.world_to_pixel(coord)
            spectral_wcs = WCS(header, fobj=hdul, key="W")
            spectral_wcs.sip = None
            wl, _ = spectral_wcs.pixel_to_world(x, y)
            wl_um = float(wl.to_value(u.um))
            version = str(hdul[0].header.get("VERSION", obs.processing_version))

            indices.append(idx)
            obs_ids.append(obs.observation_id)
            releases.append(obs.release)
            obs_dates.append(obs.archive_start_mjd)
            wavelengths.append(wl_um if math.isfinite(wl_um) else np.nan)
            versions.append(version)
            urls.append(build_cutout_url(obs, region))

            for hdu in hdul[1:]:
                copied = hdu.copy()
                copied.header["EXTNAME"] = f"{copied.header['EXTNAME']}{idx}"
                all_hdus.append(copied)

    cols = fits.ColDefs([
        fits.Column(name="cutout_index", format="J", array=np.array(indices, dtype=np.int32), unit=""),
        fits.Column(name="observation_id", format="A40", array=np.array(obs_ids, dtype="U40"), unit=""),
        fits.Column(name="release", format="A8", array=np.array(releases, dtype="U8"), unit=""),
        fits.Column(name="observation_date", format="D", array=np.array(obs_dates, dtype=np.float64), unit="d"),
        fits.Column(name="central_wavelength", format="D", array=np.array(wavelengths, dtype=np.float64), unit="um"),
        fits.Column(name="version", format="A32", array=np.array(versions, dtype="U32"), unit=""),
        fits.Column(name="access_url", format="A240", array=np.array(urls, dtype="U240"), unit=""),
    ])
    table_hdu = fits.BinTableHDU.from_columns(cols)
    table_hdu.header["EXTNAME"] = "CUTOUT_INFO"

    combined = fits.HDUList([fits.PrimaryHDU(), table_hdu, *all_hdus])
    buffer = io.BytesIO()
    combined.writeto(buffer, overwrite=True)
    return buffer.getvalue()
