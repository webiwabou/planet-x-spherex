import sys
from pathlib import Path

import numpy as np
import pytest
from astropy import units as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from spherex_archive import Observation, SearchRegion
from spherex_fits import CutoutMetadata, CutoutTimes
from spherex_processing import NativeCutout, PixelMask, SOURCE_FLAG, align_cutout, north_up_grid, process_series


class SpectralLookup:
    def pixel_to_world(self, x, y):
        return (1.0 + 0.001 * x) * u.um, np.full_like(y, 0.02, dtype=float) * u.um


def test_grid_alignment_carries_native_quality_and_variance():
    grid = north_up_grid(SearchRegion(ra_deg=359.99, dec_deg=70, fov_arcmin=0.5))
    assert grid.array_shape == (5, 5)
    assert grid.wcs.cdelt[0] < 0 < grid.wcs.cdelt[1]
    assert grid.pixel_to_world(2, 2).ra.deg == pytest.approx(359.99)

    data = np.arange(25, dtype=float).reshape(5, 5)
    variance = np.full((5, 5), 2.0)
    flags = np.zeros((5, 5), dtype=np.uint32)
    flags[1, 1] = SOURCE_FLAG
    flags[1, 2] = SOURCE_FLAG | 1
    variance[1, 2] = 0
    data[2, 1] = np.inf
    result = align_cutout(NativeCutout(data, variance, flags, grid, SpectralLookup()), grid)

    assert result.instrument_flags[1, 1] == SOURCE_FLAG
    assert result.mask[1, 1] == 0
    assert result.intensity[1, 1] == 6
    assert result.variance[1, 1] == 2
    assert result.wavelength_um[1, 1] == pytest.approx(1.001)
    assert result.mask[1, 2] == PixelMask.INSTRUMENT_FLAG | PixelMask.INVALID_VARIANCE
    assert result.mask[2, 1] == PixelMask.INVALID_INTENSITY
    assert np.isnan(result.intensity[1, 2]) and np.isnan(result.variance[1, 2])


def test_grid_distinguishes_no_coverage():
    region = SearchRegion(ra_deg=40, dec_deg=30, fov_arcmin=0.5)
    native = north_up_grid(region)
    wider = north_up_grid(region.model_copy(update={"fov_arcmin": 1.5}))
    ones = np.ones(native.array_shape)
    result = align_cutout(
        NativeCutout(ones, ones, np.zeros_like(ones, dtype=np.uint32), native, SpectralLookup()), wider
    )
    assert result.mask[0, 0] == PixelMask.OUTSIDE
    assert result.mask[7, 7] == 0


def test_coadd_uses_shared_band_inverse_variance_and_visit_window(monkeypatch):
    region = SearchRegion(ra_deg=40, dec_deg=30, fov_arcmin=0.5)
    grid = north_up_grid(region)
    ones = np.ones(grid.array_shape)
    flags = np.zeros(grid.array_shape, dtype=np.uint32)
    fixtures = {
        b"a": NativeCutout(4 * ones, ones, flags, grid, SpectralLookup()),
        b"b": NativeCutout(8 * ones, 3 * ones, flags, grid, SpectralLookup()),
        b"c": NativeCutout(10 * ones, ones, flags, grid, SpectralLookup()),
    }
    monkeypatch.setattr("spherex_processing.read_cutout", fixtures.__getitem__)

    def metadata(name, timestamp):
        return CutoutMetadata(
            observation=Observation(
                observation_id=name, release="dr1", processing_version="test", archive_id=name, access_url=name,
                detector_id=1, archive_start_mjd=0, archive_end_mjd=0,
            ),
            pipeline_version="test",
            time=CutoutTimes(
                start_utc=timestamp, mid_utc=timestamp, end_utc=timestamp,
                original_scale="utc", original_values={},
            ),
            width=5, height=5, wcs_header={}, center_wavelength_um=1.002, center_bandwidth_um=0.02,
            image_unit="MJy / sr", variance_unit="MJy2 / sr2", extensions=[],
        )

    inputs = [
        (metadata("c", "2026-01-03T00:00:00Z"), b"c"),
        (metadata("b", "2026-01-01T00:10:00Z"), b"b"),
        (metadata("a", "2026-01-01T00:00:00Z"), b"a"),
    ]
    series = process_series(region, inputs, detector_id=1, wavelength_um=1.002, bandwidth_um=0.02)
    first, second = series.frames
    assert first.intensity == pytest.approx(np.full((5, 5), 5))
    assert first.variance == pytest.approx(np.full((5, 5), 0.75))
    assert (first.coverage == 2).all()
    assert (second.coverage == 1).all()
    assert series.display_limits == pytest.approx((5, 10))
    assert process_series(region, inputs, detector_id=1, wavelength_um=2.0, bandwidth_um=0.02).frames == []
