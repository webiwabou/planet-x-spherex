"""Extract metadata from IRSA Level 2 multi-extension cutouts."""

from __future__ import annotations

import io
import math
from typing import Any

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.io.fits import HDUList
from astropy.time import Time
from astropy.wcs import WCS
from pydantic import BaseModel, Field

from spherex_archive import Observation


# Standard SPHEREx Level 2 bitmask definitions (Explanatory Supplement Table 16 / IRSA tutorial section 9)
STANDARD_SPHEREX_FLAGS: dict[int, tuple[str, str]] = {
    0: ("TRANSIENT", "Transient detected during SUR"),
    1: ("OVERFLOW", "Overflow detected during SUR"),
    2: ("SUR_ERROR", "Error in onboard processing"),
    6: ("NONFUNC", "Permanently unusable"),
    7: ("DICHROIC", "Low efficiency due to dichroic"),
    9: ("MISSING_DATA", "Onboard data lost"),
    10: ("HOT", "Hot pixel"),
    11: ("COLD", "Anomalously low signal"),
    12: ("FULLSAMPLE", "Pixel full sample history is available"),
    14: ("PHANMISS", "Phantom correction was not applied"),
    15: ("NONLINEAR", "Nonlinearity correction cannot be applied reliably"),
    17: ("PERSIST", "Persistent charge above threshold"),
    19: ("OUTLIER", "Pixel flagged by Detect Outliers"),
    20: ("CROSSTALK", "Pixel affected by crosstalk"),
    21: ("SOURCE", "Pixel mapped to a known source"),
    22: ("GHOST", "Affected by a bright source inside the exposure"),
    23: ("GHOST_FPA", "Affected by a bright source on another detector"),
    24: ("GHOST_EXT", "Pixel affected by a bright source outside FOV"),
    25: ("STREAK", "Pixel affected by a streak"),
    26: ("BLOOM", "Pixel part of a bloom artifact"),
    27: ("SNOWBALL", "Pixel part of a snowball artifact"),
    28: ("HALO", "Pixel part of a transient halo"),
}

SOURCE_BIT = 21
SOURCE_MASK = 1 << SOURCE_BIT


class CutoutTimes(BaseModel):
    start_utc: str
    mid_utc: str
    end_utc: str
    original_scale: str
    original_values: dict[str, str]


class VarianceSummary(BaseModel):
    min_val: float | None = None
    max_val: float | None = None
    median_val: float | None = None
    mean_val: float | None = None
    positive_finite_pixels: int
    total_pixels: int


class QualityFlagsSummary(BaseModel):
    total_pixels: int
    unflagged_pixels: int
    source_flagged_pixels: int
    bad_flagged_pixels: int
    bitwise_or_mask: int
    active_flags: dict[str, int] = Field(default_factory=dict)
    flag_definitions: dict[str, str] = Field(default_factory=dict)


class CutoutMetadata(BaseModel):
    observation: Observation
    pipeline_version: str
    time: CutoutTimes
    width: int
    height: int
    wcs_header: dict[str, Any]
    center_wavelength_um: float | None
    center_bandwidth_um: float | None
    target_wavelength_um: float | None = None
    target_bandwidth_um: float | None = None
    psf_fwhm_arcsec: float | None = None
    image_unit: str
    variance_unit: str
    variance_summary: VarianceSummary | None = None
    quality_flags: QualityFlagsSummary | None = None
    extensions: list[str]


def group_by_epoch(cutouts: list[CutoutMetadata]) -> list[list[CutoutMetadata]]:
    """Chronological visit groups, with at most 24 h between first and last midpoint."""
    timed = [(Time(item.time.mid_utc), item.observation.observation_id, item) for item in cutouts]
    groups: list[list[CutoutMetadata]] = []
    first_time = None
    for observed, _, item in sorted(timed, key=lambda entry: entry[:2]):
        if first_time is None or observed - first_time > 24 * u.hour:
            groups.append([])
            first_time = observed
        groups[-1].append(item)
    return groups


def cutout_wcs(hdul: HDUList) -> tuple[WCS, WCS]:
    header = hdul["IMAGE"].header
    celestial = WCS(header, fobj=hdul).celestial
    spectral = WCS(header, fobj=hdul, key="W")
    # The alternate WCS-WAVE table maps detector pixels directly (IRSA cutout tutorial).
    spectral.sip = None
    return celestial, spectral


def _summarize_variance(variance_hdu) -> VarianceSummary:
    data = np.asarray(variance_hdu.data, dtype=np.float64)
    total = int(data.size)
    valid = data[np.isfinite(data) & (data > 0)]
    if valid.size == 0:
        return VarianceSummary(positive_finite_pixels=0, total_pixels=total)
    return VarianceSummary(
        min_val=float(np.min(valid)),
        max_val=float(np.max(valid)),
        median_val=float(np.median(valid)),
        mean_val=float(np.mean(valid)),
        positive_finite_pixels=int(valid.size),
        total_pixels=total,
    )


def _summarize_flags(flags_hdu) -> QualityFlagsSummary:
    flags = np.asarray(flags_hdu.data, dtype=np.uint32)
    header = flags_hdu.header
    total = int(flags.size)
    unflagged = int(np.sum(flags == 0))
    source_only_or_flagged = int(np.sum((flags & np.uint32(SOURCE_MASK)) != 0))
    bad_mask = np.uint32(0xFFFFFFFF ^ SOURCE_MASK)
    bad_pixels = int(np.sum((flags & bad_mask) != 0))
    or_mask = int(np.bitwise_or.reduce(flags.ravel())) if total > 0 else 0

    bit_map: dict[int, tuple[str, str]] = dict(STANDARD_SPHEREX_FLAGS)
    for key in header.keys():
        if key.startswith("MSKN") and key[4:].isdigit():
            bit = int(key[4:])
            name = str(header[key]).strip()
            desc = str(header.get(f"MSKD{key[4:]}", "")).strip()
            if name:
                bit_map[bit] = (name, desc)

    active_flags: dict[str, int] = {}
    flag_definitions: dict[str, str] = {}
    for bit, (name, desc) in sorted(bit_map.items()):
        flag_definitions[name] = desc
        if or_mask & (1 << bit):
            count = int(np.sum((flags & np.uint32(1 << bit)) != 0))
            if count > 0:
                active_flags[name] = count

    return QualityFlagsSummary(
        total_pixels=total,
        unflagged_pixels=unflagged,
        source_flagged_pixels=source_only_or_flagged,
        bad_flagged_pixels=bad_pixels,
        bitwise_or_mask=or_mask,
        active_flags=active_flags,
        flag_definitions=flag_definitions,
    )


def extract_cutout_metadata(
    data: bytes,
    observation: Observation,
    target_coord: tuple[float, float] | None = None,
) -> CutoutMetadata:
    with fits.open(io.BytesIO(data), memmap=False) as hdul:
        image_header = hdul["IMAGE"].header
        detector = int(image_header["DETECTOR"])
        observation_id = f"{image_header['OBSID']}/D{detector}"
        if detector != observation.detector_id or observation_id != observation.observation_id:
            raise ValueError("FITS observation does not match the archive record")

        width, height = image_header["NAXIS1"], image_header["NAXIS2"]
        original_scale = image_header["TIMESYS"].strip().lower()
        original_values = {key: image_header[key] for key in ("DATE-BEG", "DATE-AVG", "DATE-END")}
        start, mid, end = (
            Time(value, format="isot", scale=original_scale, precision=3)
            for value in original_values.values()
        )
        if not start <= mid <= end:
            raise ValueError("FITS observation times are out of order")

        image_unit = image_header["BUNIT"]
        variance_unit = hdul["VARIANCE"].header["BUNIT"]
        if not (
            u.Unit(image_unit).is_equivalent(u.MJy / u.sr)
            and u.Unit(variance_unit) == u.Unit(image_unit) ** 2
        ):
            raise ValueError("FITS intensity and variance units are inconsistent")

        celestial, spectral = cutout_wcs(hdul)
        if celestial.has_distortion and any(
            getattr(celestial, name) is not None for name in ("cpdis1", "cpdis2", "det2im1", "det2im2")
        ):
            raise ValueError("Cannot serialize a WCS that depends on external distortion tables")
        wave, band = spectral.pixel_to_world((width - 1) / 2, (height - 1) / 2)
        wave_um, band_um = float(wave.to_value(u.um)), float(band.to_value(u.um))

        target_wave_um: float | None = None
        target_band_um: float | None = None
        if target_coord is not None:
            coord = SkyCoord(ra=target_coord[0] * u.deg, dec=target_coord[1] * u.deg, frame="icrs")
            tx, ty = celestial.world_to_pixel(coord)
            if np.isfinite(tx) and np.isfinite(ty):
                tw, tb = spectral.pixel_to_world(float(tx), float(ty))
                tw_val, tb_val = float(tw.to_value(u.um)), float(tb.to_value(u.um))
                if math.isfinite(tw_val) and tw_val > 0:
                    target_wave_um = tw_val
                if math.isfinite(tb_val) and tb_val > 0:
                    target_band_um = tb_val

        psf_fwhm = image_header.get("PSF_FWHM")
        psf_fwhm_val = float(psf_fwhm) if isinstance(psf_fwhm, (int, float)) and math.isfinite(psf_fwhm) else None

        variance_summary = _summarize_variance(hdul["VARIANCE"]) if "VARIANCE" in hdul else None
        quality_flags = _summarize_flags(hdul["FLAGS"]) if "FLAGS" in hdul else None

        return CutoutMetadata(
            observation=observation,
            pipeline_version=str(hdul[0].header["VERSION"]),
            time=CutoutTimes(
                start_utc=f"{start.utc.isot}Z", mid_utc=f"{mid.utc.isot}Z", end_utc=f"{end.utc.isot}Z",
                original_scale=original_scale, original_values=original_values,
            ),
            width=width,
            height=height,
            wcs_header=dict(celestial.to_header(relax=True)),
            center_wavelength_um=wave_um if math.isfinite(wave_um) and wave_um > 0 else None,
            center_bandwidth_um=band_um if math.isfinite(band_um) and band_um > 0 else None,
            target_wavelength_um=target_wave_um,
            target_bandwidth_um=target_band_um,
            psf_fwhm_arcsec=psf_fwhm_val,
            image_unit=image_unit,
            variance_unit=variance_unit,
            variance_summary=variance_summary,
            quality_flags=quality_flags,
            extensions=[hdu.name for hdu in hdul],
        )
