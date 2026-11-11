import unittest
import numpy as np
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pipeline import parse_sky_coordinates, compute_102_band_spectrum, compute_image_difference_residual


class TestAstroPipeline(unittest.TestCase):
    def test_parse_sexagesimal_coordinates(self):
        # WISE 0855 test case
        ra_str = "08h 55m 10.831s"
        dec_str = "-07d 14m 42.53s"
        ra_deg, dec_deg = parse_sky_coordinates(ra_str, dec_str)

        self.assertAlmostEqual(ra_deg, 133.795, places=2)
        self.assertAlmostEqual(dec_deg, -7.245, places=2)

    def test_parse_decimal_degrees(self):
        ra_deg, dec_deg = parse_sky_coordinates(269.452083, 4.693361)
        self.assertAlmostEqual(ra_deg, 269.452083, places=4)
        self.assertAlmostEqual(dec_deg, 4.693361, places=4)

    def test_102_band_spectrum_generation(self):
        result = compute_102_band_spectrum(133.795, -7.245, "wise-0855")
        self.assertEqual(result.total_channels, 102)
        self.assertEqual(len(result.spectrum), 102)
        self.assertGreaterEqual(result.spectrum[0].wavelength_microns, 0.75)
        self.assertLessEqual(result.spectrum[-1].wavelength_microns, 5.00)
        self.assertIn("D1", result.detector_binned_flux)
        self.assertIn("D6", result.detector_binned_flux)

    def test_difference_imaging_dipole(self):
        grid_size = 50
        t1 = np.zeros((grid_size, grid_size))
        t2 = np.zeros((grid_size, grid_size))

        t1[20, 20] = 50.0
        t2[20, 30] = 50.0

        res = compute_image_difference_residual(t1, t2)
        self.assertEqual(res.residual_type, "dipole_motion")
        self.assertGreater(res.peak_positive, 0)
        self.assertLess(res.peak_negative, 0)


if __name__ == "__main__":
    unittest.main()
