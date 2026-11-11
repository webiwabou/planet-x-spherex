from __future__ import annotations

from typing import List, Optional, Tuple
from pydantic import BaseModel, Field


class SkyCoordinateInput(BaseModel):
    ra: str | float = Field(..., description="Right Ascension in decimal degrees or sexagesimal string")
    dec: str | float = Field(..., description="Declination in decimal degrees or sexagesimal string")
    fov_arcmin: float = Field(default=8.0, ge=0.5, le=120.0, description="Field of view in arcminutes")


class ProperMotionVector(BaseModel):
    pm_ra_mas_yr: float = Field(..., description="Proper motion in RA in milliarcsec/year (true arc)")
    pm_dec_mas_yr: float = Field(..., description="Proper motion in Dec in milliarcsec/year")
    total_pm_arcsec_yr: float = Field(..., description="Total proper motion in arcsec/year")


class SpectralBandPoint(BaseModel):
    band_index: int = Field(..., ge=1, le=102)
    detector_id: int = Field(..., ge=1, le=6)
    wavelength_microns: float
    flux_density: float
    uncertainty: float


class ExtractedSpectrumResponse(BaseModel):
    target_name: str
    ra_deg: float
    dec_deg: float
    total_channels: int = 102
    spectrum: List[SpectralBandPoint]
    detector_binned_flux: dict[str, float]


class DifferenceImageResult(BaseModel):
    epoch_1: str
    epoch_2: str
    residual_type: str  # "dipole_motion" | "monopole_variable" | "null_noise"
    flux_difference_mean: float
    peak_positive: float
    peak_negative: float
