"""SPHEREx and Astronomical Coordinate / Data Processing Utilities.

Provides coordinate parsing, proper motion vector projection,
detector array mapping and difference imaging helpers.
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Tuple


def parse_sky_coordinates(ra_input: str | float, dec_input: str | float) -> Tuple[float, float]:
    """Parse RA and Dec from either float degrees or sexagesimal strings (e.g. '08h55m10.831s', '-07d14m42.53s').

    Returns (ra_deg, dec_deg) in decimal degrees.
    """
    if isinstance(ra_input, (int, float)) and isinstance(dec_input, (int, float)):
        return float(ra_input) % 360.0, max(-90.0, min(90.0, float(dec_input)))

    ra_str = str(ra_input).strip()
    dec_str = str(dec_input).strip()

    # Try simple float conversion first
    try:
        return float(ra_str) % 360.0, max(-90.0, min(90.0, float(dec_str)))
    except ValueError:
        pass

    # Parse RA sexagesimal: 08h55m10.831s or 08:55:10.831 or 08 55 10.831
    ra_match = re.match(
        r"^\s*([0-9]+)[\s:h]\s*([0-9]+)[\s:m]\s*([0-9.]+)[s]?\s*$", ra_str, re.IGNORECASE
    )
    if not ra_match:
        raise ValueError(f"Invalid RA format: '{ra_str}'. Expected decimal deg or 'XXh YYm ZZs'")

    h = float(ra_match.group(1))
    m = float(ra_match.group(2))
    s = float(ra_match.group(3))
    ra_deg = (h + m / 60.0 + s / 3600.0) * 15.0

    # Parse Dec sexagesimal: -07d14m42.53s or -07:14:42.53 or +30d24m04.0s
    dec_sign = -1.0 if "-" in dec_str else 1.0
    dec_clean = dec_str.lstrip("+-").strip()
    dec_match = re.match(
        r"^\s*([0-9]+)[\s:d°]\s*([0-9]+)[\s:m\']\s*([0-9.]+)[s\"]?\s*$", dec_clean, re.IGNORECASE
    )
    if not dec_match:
        raise ValueError(f"Invalid Dec format: '{dec_str}'. Expected decimal deg or '+-XXd YYm ZZs'")

    d = float(dec_match.group(1))
    dm = float(dec_match.group(2))
    ds = float(dec_match.group(3))
    dec_deg = dec_sign * (d + dm / 60.0 + ds / 3600.0)

    return ra_deg % 360.0, max(-90.0, min(90.0, dec_deg))


def format_sexagesimal(ra_deg: float, dec_deg: float) -> Tuple[str, str]:
    """Convert decimal degrees to standard astronomical sexagesimal strings."""
    ra_h_total = (ra_deg % 360.0) / 15.0
    ra_h = int(ra_h_total)
    ra_m_total = (ra_h_total - ra_h) * 60.0
    ra_m = int(ra_m_total)
    ra_s = (ra_m_total - ra_m) * 60.0
    ra_str = f"{ra_h:02d}h {ra_m:02d}m {ra_s:06.3f}s"

    sign = "-" if dec_deg < 0 else "+"
    dec_abs = abs(dec_deg)
    dec_d = int(dec_abs)
    dec_m_total = (dec_abs - dec_d) * 60.0
    dec_m = int(dec_m_total)
    dec_s = (dec_m_total - dec_m) * 60.0
    dec_str = f"{sign}{dec_d:02d}d {dec_m:02d}m {dec_s:05.2f}s"

    return ra_str, dec_str


def project_proper_motion(
    ra_deg: float,
    dec_deg: float,
    pm_ra_mas_yr: float,
    pm_dec_mas_yr: float,
    delta_years: float,
) -> Tuple[float, float]:
    """Calculate future or past position under linear proper motion.

    Proper motion in RA is true arc (pm_ra * cos(dec)).
    """
    cos_dec = math.cos(math.radians(dec_deg))
    if abs(cos_dec) < 1e-6:
        cos_dec = 1e-6

    delta_ra_deg = (pm_ra_mas_yr * delta_years / 3600000.0) / cos_dec
    delta_dec_deg = (pm_dec_mas_yr * delta_years) / 3600000.0

    return (ra_deg + delta_ra_deg) % 360.0, max(-90.0, min(90.0, dec_deg + delta_dec_deg))


def get_detector_info(band_index: int) -> Dict[str, Any]:
    """Return detector array assignment (1-6) and wavelength estimate for band index 1..102."""
    if not 1 <= band_index <= 102:
        raise ValueError("Band index must be between 1 and 102 inclusive.")

    # 17 bands per detector
    detector_id = ((band_index - 1) // 17) + 1
    band_in_detector = ((band_index - 1) % 17) + 1

    ranges = {
        1: (0.75, 1.11),
        2: (1.11, 1.64),
        3: (1.64, 2.42),
        4: (2.42, 3.82),
        5: (3.82, 4.42),
        6: (4.42, 5.00),
    }

    w_min, w_max = ranges[detector_id]
    wavelength = w_min + (band_in_detector - 0.5) * ((w_max - w_min) / 17.0)

    return {
        "band_index": band_index,
        "detector_id": detector_id,
        "band_in_detector": band_in_detector,
        "wavelength_microns": round(wavelength, 4),
        "detector_wavelength_range": (w_min, w_max),
    }
