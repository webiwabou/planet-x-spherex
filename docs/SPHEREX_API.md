# SPHEREx Data Retrieval & Backend API Specification (Member 1)

This document specifies the inputs, outputs, data models, caching rules, and error semantics of the **SPHEREx Data Retrieval & Backend** subsystem (`astro_engine/spherex_archive.py`, `astro_engine/spherex_fits.py`, `astro_engine/spherex_routes.py`).

---

## 1. Overview & Data Sources

The backend queries the public **NASA/IPAC Infrared Science Archive (IRSA)** Simple Image Access (`SIA`) and Image Server (`IBE`) services for calibrated Level 2 SPHEREx Spectral Image Multi-Extension FITS (`MEF`) products across both active releases recommended by the SPHEREx project:
- **`spherex_dr1` (DR1):** Wide Survey epochs from Survey 1/2.
- **`spherex_qr3` (QR3):** Weekly Quick Release 3 products from Survey 3/4.

Both direct streaming SIA queries (`https://irsa.ipac.caltech.edu/SIA`) and `astroquery.ipac.irsa.Irsa.query_sia` are supported (`spherex_archive.search_observations` and `spherex_archive.query_sia_astroquery`).

---

## 2. Coordinate Input Handling

All SPHEREx endpoints accept celestial coordinates (`ra`, `dec`) in ICRS and validate them via `pipeline.parse_sky_coordinates`:
- **Right Ascension (`ra`):**
  - Decimal degrees in `[0, 360)` (e.g., `269.452077`, `133.795129`).
  - Sexagesimal hours in `[0, 24)` using `HHh MMm SS.ss` or `HH:MM:SS.ss` or space-delimited `HH MM SS.ss` (e.g., `08h55m10.831s`, `17:57:48.5`).
- **Declination (`dec`):**
  - Decimal degrees in `[-90, 90]` (e.g., `-7.245147`, `66.754979`).
  - Sexagesimal degrees using `±DDd MMm SS.ss`, `±DD:MM:SS.ss`, or `±DD° MM' SS.ss"` (e.g., `-07d14m42.53s`, `+04:41:36.1`).
- **Field of View (`fov_arcmin`):**
  - Full width of the square cutout in arcminutes (`0.5` to `120.0`, default `8.0`).
  - For candidate discovery, the SIA query searches a bounding circle of radius $r = \frac{\text{fov\_arcmin} \cdot \sqrt{2}}{120}$ degrees covering the full square cutout.

---

## 3. Endpoints Summary

| Method & Path | Purpose | Query / Body Inputs | Output |
| :--- | :--- | :--- | :--- |
| `GET /api/coordinates/resolve` | Parse & normalize RA/Dec strings to decimal ICRS degrees | `ra`, `dec` | `{status, ra_deg, dec_deg, query_ra, query_dec}` |
| `GET /api/spherex/observations` | Search IRSA for DR1 & QR3 observations sorted chronologically | `ra`, `dec`, `fov_arcmin=8`, `limit=500`, `release=dr1\|qr3` (opt), `detector_id=1..6` (opt) | `ArchiveSearch` JSON |
| `GET /api/spherex/observations/{observation_id}/cutout` | Download (or serve from local cache) a validated 7-HDU FITS cutout | `ra`, `dec`, `fov_arcmin=8` | `application/fits` binary + `X-Cache-Hit: true\|false` |
| `GET /api/spherex/observations/{observation_id}/metadata` | Extract full metadata from a FITS cutout (time, wavelength, detector, WCS, variance, flags) | `ra`, `dec`, `fov_arcmin=8` | `CutoutMetadata` JSON |
| `POST /api/spherex/cutouts/mef` | Package multiple cutouts into one combined Multi-Extension FITS (`CUTOUT_INFO` + numbered HDUs) | JSON `{ra, dec, fov_arcmin, observation_ids}` | `application/fits` attachment (`spherex_cutouts_mef.fits`) |
| `POST /api/spherex/frames` | Align & stack cutouts by epoch/visit onto a common North-up TAN WCS grid | JSON `{ra, dec, fov_arcmin, detector_id, wavelength_um, bandwidth_um, observation_ids (optional)}` | `QuickLookSeries` JSON |
| `GET /api/spherex/targets` | Return verified SPHEREx availability manifest for NASA's 5 required targets | None | Manifest JSON |
| `GET /api/spherex/samples/{target_id}` | Return pre-captured sample observations & FITS cutout metadata for a target | Path `target_id` (`barnards_star`, `epsilon_indi_b`, `wise_0855`, `rw_aurigae`, `r_draconis`) | Target sample JSON |

---

## 4. Detailed Endpoint Inputs & Outputs

### 4.1 `GET /api/spherex/observations`

Queries `spherex_dr1` and `spherex_qr3` (or a single release when `release` is provided), deduplicates pipeline revisions by keeping the latest `l2b-v{revision}-{year}-{day}` per `obs_id/D{detector}`, filters optionally by `detector_id`, and sorts chronologically by `(archive_start_mjd, observation_id)`.

**Example Request:**
```http
GET /api/spherex/observations?ra=08h55m10.831s&dec=-07d14m42.53s&fov_arcmin=8&detector_id=3
```

**Response (`200 OK`, `ArchiveSearch`):**
```json
{
  "schema_version": 1,
  "region": {
    "ra_deg": 133.79512916666667,
    "dec_deg": -7.245147222222222,
    "fov_arcmin": 8.0
  },
  "observations": [
    {
      "observation_id": "2025W19_1B_0116_1/D3",
      "release": "dr1",
      "processing_version": "l2b-v27-2026-196",
      "archive_id": "ivo://irsa.ipac/spherex_dr1/2025W19_1B_0116_1_D3",
      "access_url": "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W19_1B/l2b-v27-2026-196/3/level2_2025W19_1B_0116_1D3_spx_l2b-v27-2026-196.fits",
      "detector_id": 3,
      "archive_start_mjd": 60800.412,
      "archive_end_mjd": 60800.414
    }
  ],
  "truncated": false,
  "warnings": []
}
```

---

### 4.2 `GET /api/spherex/observations/{observation_id}/cutout`

Downloads a spatial cutout (`?center={ra_deg},{dec_deg}&size={fov_deg}`) rather than the full $2040 \times 2040$ image, verifies its FITS structure (`PRIMARY`, `IMAGE`, `FLAGS`, `VARIANCE`, `WCS-WAVE`), stores it atomically in the local cache (`SPHEREX_CACHE_DIR`, default `.cache/spherex`), and returns the raw FITS binary with header `X-Cache-Hit: true` or `false`.

**Example Request:**
```http
GET /api/spherex/observations/2025W19_1B_0116_1/D3/cutout?ra=133.795129&dec=-7.245147&fov_arcmin=8
```

---

### 4.3 `GET /api/spherex/observations/{observation_id}/metadata`

Extracts comprehensive scientific metadata from the cached/downloaded FITS cutout:
- **Observation date/time:** `start_utc`, `mid_utc`, `end_utc` (`DATE-BEG`, `DATE-AVG`, `DATE-END` in `TIMESYS`).
- **Wavelength & detector info:** `detector_id` (1–6), `center_wavelength_um` & `center_bandwidth_um` at the cutout center, `target_wavelength_um` & `target_bandwidth_um` at the requested `(ra, dec)` evaluated via the `WCS-WAVE` lookup table (`key="W"` with `sip=None`), and `psf_fwhm_arcsec`.
- **WCS coordinates:** Full serialized celestial WCS header (`RA---TAN-SIP`, `DEC--TAN-SIP`).
- **Variance & quality flags:**
  - `variance_summary`: `min_val`, `max_val`, `median_val`, `mean_val`, `positive_finite_pixels`, `total_pixels` in `MJy2 / sr2`.
  - `quality_flags`: `total_pixels`, `unflagged_pixels`, `source_flagged_pixels` (bit 21 `SOURCE`), `bad_flagged_pixels`, `bitwise_or_mask`, `active_flags` (pixel counts per triggered bit), and `flag_definitions` (`MSKNnnnn` / `MSKDnnnn`).
- **Observation identifier:** `observation_id` (`{OBSID}/D{DETECTOR}`), `archive_id`, `release`, `processing_version`, and `pipeline_version` (`VERSION` from `PRIMARY` HDU).

---

### 4.4 `POST /api/spherex/cutouts/mef`

Implements the multi-cutout packaging workflow from the official IRSA **SPHEREx Cutouts Tutorial**:
- Extension 0: Blank `PrimaryHDU`.
- Extension 1: `CUTOUT_INFO` binary table recording `cutout_index`, `observation_id`, `release`, `observation_date` (MJD), `central_wavelength` ($\mu\text{m}$), `version`, and `access_url`.
- Subsequent extensions: `IMAGE{i}`, `FLAGS{i}`, `VARIANCE{i}`, `ZODI{i}`, `EPSF{i}`, `WCS-WAVE{i}` for each cutout $i = 1 \dots N$.

---

### 4.5 `POST /api/spherex/frames`

Aligns cutouts onto a common North-up, East-left `TAN` celestial grid, groups exposures into chronological visit epochs ($\le 24\ \text{h}$ window via `group_by_epoch`), masks bad instrument flags while preserving `SOURCE` (bit 21), performs band-matched inverse-variance stacking, and computes shared 2nd–98th percentile brightness limits across all epochs.
- If `observation_ids` is provided, uses those exact observations.
- If `observation_ids` is omitted (`null`), automatically selects chronological candidates matching `detector_id` across available survey epochs.

---

## 5. HTTP Status & Error Semantics

| Status Code | Domain Code | Meaning |
| :--- | :--- | :--- |
| `200 OK` | — | Successful search (including `observations: []`), cutout FITS, metadata, or frame series |
| `404 Not Found` | `observation_not_found` / `observations_missing` | Requested observation ID was not found in a complete (non-truncated) regional search |
| `409 Conflict` | `search_truncated` / `observations_missing` | Regional search was truncated before resolving the requested observation ID |
| `422 Unprocessable Entity` | `invalid_coordinates` / `unusable_series` | Malformed RA/Dec, out-of-range FOV/wavelength, or incompatible pipeline versions |
| `502 Bad Gateway` | `archive_unavailable` / `invalid_fits_metadata` | Upstream IRSA response failed structural or FITS validation |
| `503 Service Unavailable` | `archive_unavailable` | IRSA SIA/IBE network error or HTTP 429/503 |
| `504 Gateway Timeout` | `archive_unavailable` | Upstream IRSA request timed out |
