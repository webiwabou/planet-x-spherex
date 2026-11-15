"""Extract metadata from IRSA Level 2 multi-extension cutouts."""

from __future__ import annotations

import io
import math
from typing import Any

from astropy import units as u
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astropy.io.fits import HDUList
from pydantic import BaseModel

from spherex_archive import Observation


class CutoutTimes(BaseModel):
    start_utc: str
    mid_utc: str
    end_utc: str
    original_scale: str
    original_values: dict[str, str]


class CutoutMetadata(BaseModel):
    observation: Observation
    pipeline_version: str
    time: CutoutTimes
    width: int
    height: int
    wcs_header: dict[str, Any]
    center_wavelength_um: float | None
    center_bandwidth_um: float | None
    image_unit: str
    variance_unit: str
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


def extract_cutout_metadata(data: bytes, observation: Observation) -> CutoutMetadata:
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
        wave_um, band_um = wave.to_value(u.um), band.to_value(u.um)
        return CutoutMetadata(
            observation=observation,
            pipeline_version=hdul[0].header["VERSION"],
            time=CutoutTimes(
                start_utc=f"{start.utc.isot}Z", mid_utc=f"{mid.utc.isot}Z", end_utc=f"{end.utc.isot}Z",
                original_scale=original_scale, original_values=original_values,
            ),
            width=width,
            height=height,
            wcs_header=dict(celestial.to_header(relax=True)),
            center_wavelength_um=wave_um if math.isfinite(wave_um) and wave_um > 0 else None,
            center_bandwidth_um=band_um if math.isfinite(band_um) and band_um > 0 else None,
            image_unit=image_unit,
            variance_unit=variance_unit,
            extensions=[hdu.name for hdu in hdul],
        )
