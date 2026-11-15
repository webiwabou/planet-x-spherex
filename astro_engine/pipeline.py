from __future__ import annotations

import math
import re
from typing import Dict, List, Tuple
import numpy as np

from models import ExtractedSpectrumResponse, SpectralBandPoint, DifferenceImageResult


DETECTOR_RANGES = {
    1: (0.75, 1.11),
    2: (1.11, 1.64),
    3: (1.64, 2.42),
    4: (2.42, 3.82),
    5: (3.82, 4.42),
    6: (4.42, 5.00),
}


SEXAGESIMAL = re.compile(r"([0-9]+)(?:\s*:\s*|\s+)([0-9]+)(?:\s*:\s*|\s+)([0-9]+(?:\.[0-9]+)?)")
HMS = re.compile(r"([0-9]+)\s*h\s*([0-9]+)\s*m\s*([0-9]+(?:\.[0-9]+)?)\s*s?", re.IGNORECASE)
DMS = re.compile(r"""([0-9]+)\s*[d°]\s*([0-9]+)\s*[m'′]\s*([0-9]+(?:\.[0-9]+)?)\s*[s"″]?""", re.IGNORECASE)


def _parse_angle(value: str | float, axis: str, units: re.Pattern[str]) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{axis} must be a decimal angle or a sexagesimal string.")
    raw = str(value).strip()
    try:
        return float(raw)
    except ValueError:
        pass

    unsigned = raw[1:] if raw.startswith(("+", "-")) else raw
    match = SEXAGESIMAL.fullmatch(unsigned) or units.fullmatch(unsigned)
    if match is None:
        raise ValueError(f"Invalid {axis} format.")

    major, minutes, seconds = (float(part) for part in match.groups())
    if minutes >= 60 or seconds >= 60:
        raise ValueError(f"{axis} minutes and seconds must each be less than 60.")
    angle = major + minutes / 60.0 + seconds / 3600.0
    if axis == "RA":
        if raw.startswith("-"):
            raise ValueError("RA hours must be non-negative.")
        angle *= 15.0
    return -angle if raw.startswith("-") else angle


def parse_sky_coordinates(ra_input: str | float, dec_input: str | float) -> Tuple[float, float]:
    """Convert ICRS coordinates to degrees, accepting mixed input formats."""
    ra_deg = _parse_angle(ra_input, "RA", HMS)
    dec_deg = _parse_angle(dec_input, "Dec", DMS)
    if not 0 <= ra_deg < 360:
        raise ValueError("RA must be finite and in [0, 360) degrees.")
    if not -90 <= dec_deg <= 90:
        raise ValueError("Dec must be finite and in [-90, 90] degrees.")
    return ra_deg, dec_deg


def compute_102_band_spectrum(ra_deg: float, dec_deg: float, target_id: str = "generic") -> ExtractedSpectrumResponse:
    """Generate 102-band SPHEREx spectrophotometric model and 6-detector coadded bins."""
    points: List[SpectralBandPoint] = []
    binned_flux: Dict[str, float] = {f"D{i}": 0.0 for i in range(1, 7)}
    counts: Dict[str, int] = {f"D{i}": 0 for i in range(1, 7)}

    global_idx = 1
    for det_id in range(1, 7):
        w_min, w_max = DETECTOR_RANGES[det_id]
        step = (w_max - w_min) / 17.0

        for i in range(17):
            wl = w_min + (i + 0.5) * step

            # Archetypal spectral shapes
            if "0855" in target_id.lower():
                # Y brown dwarf thermal tail
                flux = np.exp(-14387.7 / (250 * wl)) / (wl ** 5) * 1e8
                if 1.55 < wl < 1.75 or 2.1 < wl < 2.3 or 3.1 < wl < 3.4:
                    flux *= 0.2  # Methane dips
            elif "barnard" in target_id.lower():
                flux = np.exp(-14387.7 / (3130 * wl)) / (wl ** 5) * 1.5e5
            else:
                flux = 50.0 / (wl ** 1.5)

            flux = float(max(0.01, round(flux, 4)))
            unc = float(round(0.03 * flux, 4))

            points.append(
                SpectralBandPoint(
                    band_index=global_idx,
                    detector_id=det_id,
                    wavelength_microns=round(wl, 4),
                    flux_density=flux,
                    uncertainty=unc,
                )
            )
            binned_flux[f"D{det_id}"] += flux
            counts[f"D{det_id}"] += 1
            global_idx += 1

    for det_key in binned_flux:
        binned_flux[det_key] = round(binned_flux[det_key] / counts[det_key], 4)

    return ExtractedSpectrumResponse(
        target_name=target_id,
        ra_deg=ra_deg,
        dec_deg=dec_deg,
        spectrum=points,
        detector_binned_flux=binned_flux,
    )


def compute_image_difference_residual(
    epoch_1_flux: np.ndarray, epoch_2_flux: np.ndarray
) -> DifferenceImageResult:
    """Compute difference residual array delta_I = I_2 - I_1 and classify signature."""
    delta = epoch_2_flux - epoch_1_flux
    peak_pos = float(np.max(delta))
    peak_neg = float(np.min(delta))
    mean_diff = float(np.mean(delta))

    # A dipole consists of a strong positive peak and a strong negative trough
    if peak_pos > 5.0 and peak_neg < -5.0:
        res_type = "dipole_motion"
    elif peak_pos > 5.0 or peak_neg < -5.0:
        res_type = "monopole_variable"
    else:
        res_type = "null_noise"

    return DifferenceImageResult(
        epoch_1="S1",
        epoch_2="S2",
        residual_type=res_type,
        flux_difference_mean=round(mean_diff, 4),
        peak_positive=round(peak_pos, 4),
        peak_negative=round(peak_neg, 4),
    )
