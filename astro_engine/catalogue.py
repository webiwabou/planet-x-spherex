"""Gaia DR3 context, independent of SPHEREx retrieval and image processing."""

from __future__ import annotations

import hashlib
import io
import math
import os
from pathlib import Path
import tempfile
import time
import warnings
from datetime import datetime, timezone

import httpx
import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.io.votable import parse
from astropy.time import Time
from astropy.wcs import WCS
from pydantic import BaseModel, ConfigDict, Field, field_validator

TAP_URL = "https://gea.esac.esa.int/tap-server/tap/sync"
COLUMNS = "source_id, ra, dec, ref_epoch, pmra, pmdec, parallax, phot_g_mean_mag"
LIMITATIONS = [
    "Positions use constant angular proper motion, without observer-dependent annual parallax or radial-velocity perspective effects.",
    "Search padding assumes reference epoch J2016.0 and proper motion <= 15000 mas/yr; faster sources may be missed.",
    "Gaia is an optical catalogue: an infrared target need not have a Gaia counterpart.",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", allow_inf_nan=False, validate_default=True
    )


class CatalogueQuery(StrictModel):
    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)
    fov_arcmin: float = Field(default=8, ge=0.5, le=120)
    observation_time: str = "2026-01-01T00:00:00"
    limit: int = Field(default=1000, ge=1, le=5000)

    @field_validator("observation_time")
    @classmethod
    def validate_time(cls, value):
        try:
            t = Time(value, format="isot", scale="utc")
            if not 2000 <= t.ymdhms.year < 2100:
                raise ValueError("date outside supported range")
        except Exception as exc:
            raise ValueError(
                "Use an ISO UTC date between 2000 and 2099, e.g. 2026-01-01T00:00:00"
            ) from exc
        return t.utc.isot


class CatalogueSource(StrictModel):
    source_id: str
    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)
    ref_epoch: float
    pmra_mas_yr: float | None = None
    pmdec_mas_yr: float | None = None
    parallax_mas: float | None = None
    phot_g_mean_mag: float | None = None
    propagated_ra_deg: float
    propagated_dec_deg: float
    propagation_status: str
    propagation_warning: str | None = None


class CatalogueResponse(StrictModel):
    catalogue: str = "Gaia DR3"
    table: str = "gaiadr3.gaia_source"
    tap_url: str = TAP_URL
    query: CatalogueQuery
    adql: str
    retrieved_at: str
    cache_hit: bool
    search_radius_deg: float
    truncated: bool
    sources: list[CatalogueSource]
    warnings: list[str] = Field(default_factory=lambda: list(LIMITATIONS))


class ProjectionRequest(StrictModel):
    frame_id: str = Field(min_length=1, max_length=200)
    observation_time: str
    width: int = Field(ge=1, le=32768)
    height: int = Field(ge=1, le=32768)
    wcs_header: dict[str, str | float | int | bool] = Field(max_length=500)
    sources: list[CatalogueSource] = Field(max_length=5000)

    _time = field_validator("observation_time")(CatalogueQuery.validate_time.__func__)


class ProjectedSource(CatalogueSource):
    x_px: float | None
    y_px: float | None
    in_frame: bool


class ProjectionResponse(StrictModel):
    frame_id: str
    observation_time: str
    width: int
    height: int
    pixel_origin: int = 0
    pixel_order: str
    orientation: str
    warnings: list[str]
    sources: list[ProjectedSource]


class CatalogueUnavailable(RuntimeError):
    pass


def propagate(source: CatalogueSource, observation_time: str) -> CatalogueSource:
    """Angular-only propagation. Gaia pmra is already mu_alpha*cos(delta)."""
    if source.pmra_mas_yr is None or source.pmdec_mas_yr is None:
        return source.model_copy(
            update={
                "propagated_ra_deg": source.ra_deg,
                "propagated_dec_deg": source.dec_deg,
                "propagation_status": "missing_proper_motion",
                "propagation_warning": None,
            }
        )
    coord = SkyCoord(
        ra=source.ra_deg * u.deg,
        dec=source.dec_deg * u.deg,
        pm_ra_cosdec=source.pmra_mas_yr * u.mas / u.yr,
        pm_dec=source.pmdec_mas_yr * u.mas / u.yr,
        obstime=Time(source.ref_epoch, format="jyear", scale="tcb"),
        frame="icrs",
    )
    # ERFA warns that distance was overridden for the deliberately angular-only model.
    with warnings.catch_warnings(record=True) as notices:
        warnings.simplefilter("always")
        moved = coord.apply_space_motion(
            new_obstime=Time(observation_time, format="isot", scale="utc")
        )
    return source.model_copy(
        update={
            "propagated_ra_deg": float(moved.ra.deg),
            "propagated_dec_deg": float(moved.dec.deg),
            "propagation_status": "angular_proper_motion",
            "propagation_warning": "Astropy flagged approximate propagation; inspect astrometric inputs."
            if any("distance overridden" not in str(n.message) for n in notices)
            else None,
        }
    )


def _number(value):
    return (
        None
        if np.ma.is_masked(value) or not np.isfinite(float(value))
        else float(value)
    )


def build_adql(query: CatalogueQuery) -> tuple[str, float]:
    years = abs(Time(query.observation_time, scale="utc").tcb.jyear - 2016.0)
    radius = query.fov_arcmin / 120 * math.sqrt(2) + years * 15000 / 3_600_000
    # All interpolated values are validated finite numbers, never raw input strings.
    adql = f"""SELECT TOP {query.limit + 1} {COLUMNS}, DISTANCE(POINT('ICRS',ra,dec),POINT('ICRS',{query.ra_deg:.12f},{query.dec_deg:.12f})) AS search_distance_deg
FROM gaiadr3.gaia_source
WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{query.ra_deg:.12f},{query.dec_deg:.12f},{radius:.12f}))
ORDER BY search_distance_deg, source_id"""
    return adql, radius


class GaiaCatalogue:
    def __init__(self, cache_dir=None, ttl_seconds=86400, transport=None):
        self.cache_dir = Path(
            cache_dir or os.environ.get("GAIA_CACHE_DIR", ".cache/gaia")
        )
        self.ttl_seconds = ttl_seconds
        self.transport = transport

    def _fetch(self, adql):
        try:
            with httpx.Client(
                timeout=30, transport=self.transport, follow_redirects=False
            ) as client:
                result = client.post(
                    TAP_URL,
                    data={
                        "REQUEST": "doQuery",
                        "LANG": "ADQL",
                        "FORMAT": "votable",
                        "QUERY": adql,
                        "MAXREC": "5001",
                    },
                )
                result.raise_for_status()
                if len(result.content) > 20_000_000:
                    raise ValueError("Catalogue response exceeded size limit")
                # TAP may return HTTP 200 with a VOTable error: Astropy raises on it.
                votable = parse(io.BytesIO(result.content))
                statuses = []
                stack = [votable]
                while stack:
                    node = stack.pop()
                    statuses.extend(
                        info.value
                        for info in getattr(node, "infos", [])
                        if info.name == "QUERY_STATUS"
                    )
                    stack.extend(getattr(node, "resources", []))
                if "ERROR" in statuses:
                    raise ValueError("TAP reported QUERY_STATUS=ERROR")
                table = votable.get_first_table().to_table(use_names_over_ids=True)
                table.meta["tap_overflow"] = "OVERFLOW" in statuses
                # ESA VOTable FIELD ID for source_id is uppercase.
                for name in list(table.colnames):
                    table.rename_column(name, name.lower())
                if not set(COLUMNS.split(", ")).issubset(table.colnames):
                    raise ValueError("Missing required Gaia fields")
                return table
        except Exception as exc:
            raise CatalogueUnavailable(
                "Gaia TAP could not return a valid catalogue. Retry later."
            ) from exc

    def query(self, query: CatalogueQuery) -> CatalogueResponse:
        adql, radius = build_adql(query)
        key = hashlib.sha256(
            ("v4|" + TAP_URL + query.model_dump_json()).encode()
        ).hexdigest()
        path = self.cache_dir / f"{key}.json"
        try:
            if time.time() - path.stat().st_mtime < self.ttl_seconds:
                cached = CatalogueResponse.model_validate_json(path.read_text())
                return cached.model_copy(update={"cache_hit": True})
        except (OSError, ValueError):
            pass
        table = self._fetch(adql)
        sources = []
        for row in table[: query.limit]:
            source = CatalogueSource(
                source_id=str(int(row["source_id"])),
                ra_deg=float(row["ra"]),
                dec_deg=float(row["dec"]),
                ref_epoch=float(row["ref_epoch"]),
                pmra_mas_yr=_number(row["pmra"]),
                pmdec_mas_yr=_number(row["pmdec"]),
                parallax_mas=_number(row["parallax"]),
                phot_g_mean_mag=_number(row["phot_g_mean_mag"]),
                propagated_ra_deg=float(row["ra"]),
                propagated_dec_deg=float(row["dec"]),
                propagation_status="reference",
            )
            sources.append(propagate(source, query.observation_time))
        response = CatalogueResponse(
            query=query,
            adql=adql,
            retrieved_at=datetime.now(timezone.utc).isoformat(),
            cache_hit=False,
            search_radius_deg=radius,
            truncated=len(table) > query.limit or table.meta.get("tap_overflow", False),
            sources=sources,
        )
        if any(s.propagation_warning for s in sources):
            response.warnings.append(
                "Some sources have Astropy propagation warnings; inspect propagation_warning per source."
            )
        if any(
            s.pmra_mas_yr is not None
            and s.pmdec_mas_yr is not None
            and math.hypot(s.pmra_mas_yr, s.pmdec_mas_yr) > 15000
            for s in sources
        ):
            response.warnings.append(
                "Some sources exceed the search-padding motion bound; coverage is not guaranteed."
            )
        if response.truncated:
            response.warnings.append(
                "Result limit reached: the field is incomplete. Reduce FOV or increase limit."
            )
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w", dir=self.cache_dir, delete=False
            ) as stream:
                tmp = Path(stream.name)
                stream.write(response.model_dump_json(indent=2))
            tmp.replace(path)
        except OSError:
            response.warnings.append(
                "Local cache unavailable; the live query succeeded."
            )
        return response


def project_sources(request: ProjectionRequest) -> dict:
    """Use the FINAL frame WCS, including SIP; reject unsupported lookup distortions."""
    header = fits.Header(request.wcs_header)
    if any(str(k).startswith(("CPDIS", "DP1", "DP2", "D2IM")) for k in header):
        raise ValueError(
            "Lookup-table distortions require the original FITS HDUList; header-only projection is unsupported"
        )
    wcs = WCS(header).celestial
    if not wcs.has_celestial or wcs.pixel_n_dim != 2:
        raise ValueError("A two-dimensional celestial WCS is required")
    for key, size in (("NAXIS1", request.width), ("NAXIS2", request.height)):
        if key in header and header[key] != size:
            raise ValueError(f"{key} disagrees with supplied frame dimensions")
    output = []
    for source in request.sources:
        moved = propagate(source, request.observation_time)
        coord = SkyCoord(
            moved.propagated_ra_deg * u.deg,
            moved.propagated_dec_deg * u.deg,
            frame="icrs",
        )
        x, y = wcs.world_to_pixel(coord)
        finite = bool(np.isfinite(x) and np.isfinite(y))
        output.append(
            {
                **moved.model_dump(),
                "x_px": float(x) if finite else None,
                "y_px": float(y) if finite else None,
                "in_frame": bool(
                    finite
                    and -0.5 <= x < request.width - 0.5
                    and -0.5 <= y < request.height - 0.5
                ),
            }
        )
    return {
        "frame_id": request.frame_id,
        "observation_time": request.observation_time,
        "width": request.width,
        "height": request.height,
        "pixel_origin": 0,
        "pixel_order": "x,y; array indexing is [y,x]; pixel centers are integers",
        "orientation": "Native FITS WCS axes. Apply the same screen transform as the image; do not assume north-up.",
        "warnings": list(LIMITATIONS),
        "sources": output,
    }


def demo_wcs(query: CatalogueQuery, size=600):
    wcs = WCS(naxis=2)
    wcs.wcs.crpix = [(size + 1) / 2, (size + 1) / 2]
    wcs.wcs.crval = [query.ra_deg, query.dec_deg]
    wcs.wcs.cdelt = [-query.fov_arcmin / 60 / size, query.fov_arcmin / 60 / size]
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    return dict(wcs.to_header())
