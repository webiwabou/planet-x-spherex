import pytest
import numpy as np
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pipeline import parse_sky_coordinates, compute_102_band_spectrum, compute_image_difference_residual
from fastapi.testclient import TestClient
from main import app


def test_parse_sexagesimal_coordinates():
    # WISE 0855 test case
    ra_str = "08h 55m 10.831s"
    dec_str = "-07d 14m 42.53s"
    ra_deg, dec_deg = parse_sky_coordinates(ra_str, dec_str)

    assert pytest.approx(ra_deg, abs=1e-3) == 133.795
    assert pytest.approx(dec_deg, abs=1e-3) == -7.245


def test_parse_decimal_degrees():
    ra_deg, dec_deg = parse_sky_coordinates(269.452083, 4.693361)
    assert pytest.approx(ra_deg, abs=1e-4) == 269.452083
    assert pytest.approx(dec_deg, abs=1e-4) == 4.693361


@pytest.mark.parametrize(("ra", "dec", "expected"), [
    ("12:00:00", "-0.25", (180.0, -0.25)),
    ("180", "-00° 30′ 00″", (180.0, -0.5)),
    ("12 00 00", "+90:00:00", (180.0, 90.0)),
    (0, -90, (0.0, -90.0)),
])
def test_parse_coordinates_with_mixed_formats_and_poles(ra, dec, expected):
    assert parse_sky_coordinates(ra, dec) == pytest.approx(expected)


@pytest.mark.parametrize(("ra", "dec"), [
    ("nan", "0"),
    ("120", "inf"),
    ("-1", "0"),
    ("360", "0"),
    ("24:00:00", "0"),
    ("-00:00:01", "0"),
    ("12:60:00", "0"),
    ("12h00m60s", "0"),
    ("120", "90.01"),
    ("120", "-90:00:01"),
    ("120", "12:60:00"),
    ("120", "--00:30:00"),
])
def test_parse_coordinates_rejects_invalid_angles(ra, dec):
    with pytest.raises(ValueError):
        parse_sky_coordinates(ra, dec)


def test_resolve_coordinates_reports_invalid_dec():
    response = TestClient(app).get("/api/coordinates/resolve", params={"ra": "12:00:00", "dec": "91"})
    assert response.status_code == 400
    assert response.json()["detail"].startswith("Dec must be")


def test_102_band_spectrum_generation():
    result = compute_102_band_spectrum(133.795, -7.245, "wise-0855")
    assert result.total_channels == 102
    assert len(result.spectrum) == 102
    assert result.spectrum[0].wavelength_microns >= 0.75
    assert result.spectrum[-1].wavelength_microns <= 5.00
    assert "D1" in result.detector_binned_flux
    assert "D6" in result.detector_binned_flux


def test_difference_imaging_dipole():
    # Simulate a moving object jumping 10 pixels
    grid_size = 50
    t1 = np.zeros((grid_size, grid_size))
    t2 = np.zeros((grid_size, grid_size))

    t1[20, 20] = 50.0  # Source at position 1
    t2[20, 30] = 50.0  # Source shifted to position 2

    res = compute_image_difference_residual(t1, t2)
    assert res.residual_type == "dipole_motion"
    assert res.peak_positive > 0
    assert res.peak_negative < 0
