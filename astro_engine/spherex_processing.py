"""Read and align individual SPHEREx cutouts on a common celestial grid."""

from __future__ import annotations

import io
import math
from dataclasses import dataclass
from enum import IntFlag

import numpy as np
from astropy import units as u
from astropy.io import fits
from astropy.wcs import WCS

from spherex_archive import SearchRegion
from spherex_fits import CutoutMetadata, cutout_wcs, group_by_epoch


PIXEL_SCALE_ARCSEC = 6.15
SOURCE_FLAG = 1 << 21
INTENSITY_UNIT = u.MJy / u.sr


class PixelMask(IntFlag):
    OUTSIDE = 1
    INSTRUMENT_FLAG = 2
    INVALID_INTENSITY = 4
    INVALID_VARIANCE = 8
    INVALID_WAVELENGTH = 16
    BAND_MISMATCH = 32


@dataclass
class NativeCutout:
    intensity: np.ndarray
    variance: np.ndarray
    flags: np.ndarray
    celestial: WCS
    spectral: WCS


@dataclass
class AlignedCutout:
    intensity: np.ndarray
    variance: np.ndarray
    instrument_flags: np.ndarray
    wavelength_um: np.ndarray
    bandwidth_um: np.ndarray
    mask: np.ndarray
    grid: WCS


@dataclass
class ProcessedFrame:
    observations: list[CutoutMetadata]
    intensity: np.ndarray
    variance: np.ndarray
    coverage: np.ndarray
    rejected_mask: np.ndarray
    effective_band_um: tuple[float, float]


@dataclass
class ProcessedSeries:
    grid: WCS
    frames: list[ProcessedFrame]
    display_limits: tuple[float, float] | None


def read_cutout(data: bytes) -> NativeCutout:
    with fits.open(io.BytesIO(data), memmap=False) as hdul:
        image, variance, flags = (hdul[name] for name in ("IMAGE", "VARIANCE", "FLAGS"))
        if (
            len(image.shape) != 2 or variance.shape != image.shape or flags.shape != image.shape
            or flags.data.dtype.kind not in "iu" or flags.data.dtype.itemsize > 4
        ):
            raise ValueError("Incompatible SPHEREx cutout layers")
        celestial, spectral = cutout_wcs(hdul)
        return NativeCutout(
            intensity=image.data.astype(np.float64) * u.Unit(image.header["BUNIT"]).to(INTENSITY_UNIT),
            variance=variance.data.astype(np.float64) * u.Unit(variance.header["BUNIT"]).to(INTENSITY_UNIT**2),
            flags=flags.data.astype(np.uint32),
            celestial=celestial,
            spectral=spectral,
        )


def north_up_grid(region: SearchRegion) -> WCS:
    """Make a square north-up, east-left TAN grid with roughly native sampling."""
    size = math.ceil(region.fov_arcmin * 60 / PIXEL_SCALE_ARCSEC)
    scale = region.fov_arcmin / (60 * size)
    grid = WCS(naxis=2)
    grid.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    grid.wcs.radesys = "ICRS"
    grid.wcs.crval = [region.ra_deg, region.dec_deg]
    grid.wcs.crpix = [(size + 1) / 2] * 2
    grid.wcs.cdelt = [-scale, scale]
    grid.array_shape = (size, size)
    return grid


def align_cutout(cutout: NativeCutout, grid: WCS) -> AlignedCutout:
    """Nearest native pixel per output center, with variance, flags and LVF passband."""
    shape = grid.array_shape
    y, x = np.indices(shape)
    native_x, native_y = cutout.celestial.world_to_pixel(grid.pixel_to_world(x, y))
    height, width = cutout.intensity.shape
    covered = (
        (native_x >= -0.5) & (native_x < width - 0.5)
        & (native_y >= -0.5) & (native_y < height - 0.5)
    )
    source_x = np.floor(native_x[covered] + 0.5).astype(int)
    source_y = np.floor(native_y[covered] + 0.5).astype(int)

    intensity = np.full(shape, np.nan)
    variance = np.full(shape, np.nan)
    wavelength = np.full(shape, np.nan)
    bandwidth = np.full(shape, np.nan)
    instrument_flags = np.zeros(shape, dtype=np.uint32)
    mask = np.zeros(shape, dtype=np.uint8)
    mask[~covered] = PixelMask.OUTSIDE
    if covered.any():
        source_wave, source_band = cutout.spectral.pixel_to_world(source_x, source_y)
        wavelength[covered] = source_wave.to_value(u.um)
        bandwidth[covered] = source_band.to_value(u.um)
        intensity[covered] = cutout.intensity[source_y, source_x]
        variance[covered] = cutout.variance[source_y, source_x]
        instrument_flags[covered] = cutout.flags[source_y, source_x]

    bad = (instrument_flags & np.uint32(0xFFFFFFFF ^ SOURCE_FLAG)) != 0
    mask[covered & bad] |= np.uint8(PixelMask.INSTRUMENT_FLAG)
    mask[covered & ~np.isfinite(intensity)] |= np.uint8(PixelMask.INVALID_INTENSITY)
    mask[covered & (~np.isfinite(variance) | (variance <= 0))] |= np.uint8(PixelMask.INVALID_VARIANCE)
    mask[covered & (
        ~np.isfinite(wavelength) | (wavelength <= 0) | ~np.isfinite(bandwidth) | (bandwidth <= 0)
    )] |= np.uint8(PixelMask.INVALID_WAVELENGTH)
    intensity[mask != 0] = np.nan
    variance[mask != 0] = np.nan
    return AlignedCutout(intensity, variance, instrument_flags, wavelength, bandwidth, mask, grid)


def process_series(
    region: SearchRegion, cutouts: list[tuple[CutoutMetadata, bytes]],
    *, detector_id: int, wavelength_um: float, bandwidth_um: float,
) -> ProcessedSeries:
    """Produce band-matched, inverse-variance coadds of visits for quick-look display."""
    if not (math.isfinite(wavelength_um) and math.isfinite(bandwidth_um) and 0 < bandwidth_um < 2 * wavelength_um):
        raise ValueError("A positive finite wavelength and passband are required")
    selected = {
        metadata.observation.observation_id: (metadata, data)
        for metadata, data in cutouts if metadata.observation.detector_id == detector_id
    }
    if len({metadata.pipeline_version for metadata, _ in selected.values()}) > 1:
        raise ValueError("Mixed pipeline versions require separate series")
    grid = north_up_grid(region)
    lower, upper = wavelength_um - bandwidth_um / 2, wavelength_um + bandwidth_um / 2
    frames = []
    for visit in group_by_epoch([metadata for metadata, _ in selected.values()]):
        shape = grid.array_shape
        weight_sum = np.zeros(shape)
        weighted_flux = np.zeros(shape)
        coverage = np.zeros(shape, dtype=np.uint32)
        rejected = np.zeros(shape, dtype=np.uint8)
        contribution_min = math.inf
        contribution_max = -math.inf
        contributing = []
        for metadata in visit:
            _, data = selected[metadata.observation.observation_id]
            aligned = align_cutout(read_cutout(data), grid)
            sample_lower = aligned.wavelength_um - aligned.bandwidth_um / 2
            sample_upper = aligned.wavelength_um + aligned.bandwidth_um / 2
            overlap = np.minimum(upper, sample_upper) - np.maximum(lower, sample_lower)
            matches = overlap >= 0.85 * np.maximum(bandwidth_um, aligned.bandwidth_um)
            valid = (aligned.mask == 0) & matches
            rejected |= aligned.mask
            rejected[(aligned.mask == 0) & ~matches] |= np.uint8(PixelMask.BAND_MISMATCH)
            if not np.any(valid):
                continue
            weight = 1 / aligned.variance[valid]
            weight_sum[valid] += weight
            weighted_flux[valid] += weight * aligned.intensity[valid]
            coverage[valid] += 1
            contribution_min = min(contribution_min, float(np.min(sample_lower[valid])))
            contribution_max = max(contribution_max, float(np.max(sample_upper[valid])))
            contributing.append(metadata)

        used = coverage > 0
        if np.any(used):
            mean = np.divide(weighted_flux, weight_sum, out=np.full(shape, np.nan), where=used)
            variance = np.divide(1, weight_sum, out=np.full(shape, np.nan), where=used)
            frames.append(ProcessedFrame(
                observations=contributing, intensity=mean, variance=variance, coverage=coverage,
                rejected_mask=rejected, effective_band_um=(contribution_min, contribution_max),
            ))
    return ProcessedSeries(grid, frames, shared_display_limits(frames))


def shared_display_limits(frames: list[ProcessedFrame]) -> tuple[float, float] | None:
    if not frames:
        return None
    values = np.concatenate([frame.intensity[frame.coverage > 0] for frame in frames])
    low, high = np.percentile(values, [2, 98])
    return float(low), float(high)
