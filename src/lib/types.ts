export type Release = "dr1" | "qr3";

export type Observation = {
  observation_id: string;
  release: Release;
  processing_version: string;
  archive_id: string;
  access_url: string;
  detector_id: number;
  archive_start_mjd: number;
  archive_end_mjd: number;
};

export type CutoutTimes = {
  start_utc: string;
  mid_utc: string;
  end_utc: string;
  original_scale: string;
  original_values: Record<string, string>;
};

export type VarianceSummary = {
  min_val: number | null;
  max_val: number | null;
  median_val: number | null;
  mean_val: number | null;
  positive_finite_pixels: number;
  total_pixels: number;
};

export type QualityFlagsSummary = {
  total_pixels: number;
  unflagged_pixels: number;
  source_flagged_pixels: number;
  bad_flagged_pixels: number;
  bitwise_or_mask: number;
  active_flags: Record<string, number>;
  flag_definitions: Record<string, string>;
};

export type CutoutMetadata = {
  observation: Observation;
  pipeline_version: string;
  time: CutoutTimes;
  width: number;
  height: number;
  wcs_header: Record<string, unknown>;
  center_wavelength_um: number | null;
  center_bandwidth_um: number | null;
  target_wavelength_um: number | null;
  target_bandwidth_um: number | null;
  psf_fwhm_arcsec: number | null;
  image_unit: string;
  variance_unit: string;
  variance_summary: VarianceSummary | null;
  quality_flags: QualityFlagsSummary | null;
  extensions: string[];
};

export type SearchRegion = { ra_deg: number; dec_deg: number; fov_arcmin: number };

export type QuickLookFrame = {
  frame_id: string;
  observation_time: string;
  observations: CutoutMetadata[];
  effective_band_um: [number, number];
  covered_pixels: number;
  /** Row-major, row 0 is the southern edge; 0 to 255 on the shared scale, -1 where nothing was observed. */
  preview: number[];
};

export type QuickLookSeries = {
  schema_version: number;
  region: SearchRegion;
  width: number;
  height: number;
  wcs_header: Record<string, unknown>;
  display_limits_mjy_sr: [number, number] | null;
  frames: QuickLookFrame[];
};

export type FrameQuery = {
  ra: string;
  dec: string;
  fov_arcmin: number;
  detector_id: number;
  wavelength_um: number;
  bandwidth_um: number;
  observation_ids?: string[];
};

export type ResolvedCoordinates = { ra_deg: number; dec_deg: number };

export type TargetAvailability = {
  target_id: string;
  name: string;
  status: string;
  search_ra_deg: number;
  search_dec_deg: number;
  fov_arcmin: number;
  total_observations: number;
  dr1_count: number;
  qr3_count: number;
  counts_by_detector: Record<string, number>;
};

export type ApiErrorCode =
  | "invalid_coordinates"
  | "invalid_request"
  | "unusable_series"
  | "observations_missing"
  | "observation_not_found"
  | "search_truncated"
  | "invalid_fits_metadata"
  | "archive_unavailable"
  | "no_fixture"
  | "network"
  | "aborted"
  | "unknown";
