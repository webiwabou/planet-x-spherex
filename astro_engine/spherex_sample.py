"""Verify real SPHEREx DR1 & QR3 availability and capture sample cutouts/metadata for the 5 NASA targets."""

from __future__ import annotations

import argparse
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from astropy.io import fits

from spherex_archive import Observation, SearchRegion, get_cutout, search_observations
from spherex_fits import CutoutMetadata, extract_cutout_metadata, group_by_epoch

ROOT = Path(__file__).resolve().parents[1]
TARGETS_PATH = ROOT / "resources/gaia/targets.json"
DEFAULT_JSON_DIR = ROOT / "resources/spherex/samples"
DEFAULT_FITS_DIR = ROOT / "resources/sample_data"


# Propagated ~2025.5 search centers for ultra-fast proper motion targets (Barnard's Star & Epsilon Indi B)
# where J2000 catalog positions differ by several arcminutes from 2025/2026 observation epochs.
PROPAGATED_SEARCH_CENTERS: dict[str, tuple[float, float]] = {
    "barnards_star": (269.4485025, 4.7669315),
}


def _compact_sample_fits(raw_bytes: bytes) -> bytes:
    """Keep PRIMARY, IMAGE, FLAGS, VARIANCE, ZODI, WCS-WAVE for lightweight repository storage."""
    with fits.open(io.BytesIO(raw_bytes), memmap=False) as hdul:
        kept = [hdul[0].copy()]
        for hdu in hdul[1:]:
            if hdu.name != "EPSF":
                kept.append(hdu.copy())
        out = io.BytesIO()
        fits.HDUList(kept).writeto(out, overwrite=True)
        return out.getvalue()


def _select_valid_cutout(
    candidates: list[Observation],
    region: SearchRegion,
    cache_dir: Path,
    max_attempts: int = 5,
) -> tuple[Observation, CutoutMetadata, bytes, bool] | None:
    for obs in candidates[:max_attempts]:
        try:
            data, cache_hit = get_cutout(obs, region, cache_dir=cache_dir)
            meta = extract_cutout_metadata(data, obs, target_coord=(region.ra_deg, region.dec_deg))
            return obs, meta, data, cache_hit
        except Exception:
            continue
    return None


def verify_target(
    target: dict[str, Any],
    *,
    fov_arcmin: float = 8.0,
    json_dir: Path = DEFAULT_JSON_DIR,
    fits_dir: Path = DEFAULT_FITS_DIR,
    cache_dir: Path = ROOT / ".cache/spherex",
) -> dict[str, Any]:
    target_id = target["id"]
    ra_deg, dec_deg = PROPAGATED_SEARCH_CENTERS.get(target_id, (target["ra_deg"], target["dec_deg"]))
    region = SearchRegion(ra_deg=ra_deg, dec_deg=dec_deg, fov_arcmin=fov_arcmin)

    search = search_observations(region, limit=2000)
    dr1_obs = [obs for obs in search.observations if obs.release == "dr1"]
    qr3_obs = [obs for obs in search.observations if obs.release == "qr3"]
    by_detector = {f"D{d}": sum(1 for obs in search.observations if obs.detector_id == d) for d in range(1, 7)}

    samples_meta: dict[str, Any] = {}
    sample_fits_files: dict[str, str] = {}
    collected_cutouts: list[CutoutMetadata] = []

    for rel_name, rel_list in (("dr1", dr1_obs), ("qr3", qr3_obs)):
        if not rel_list:
            continue
        picked = _select_valid_cutout(rel_list, region, cache_dir=cache_dir)
        if picked is not None:
            obs, meta, raw_bytes, cache_hit = picked
            collected_cutouts.append(meta)
            samples_meta[rel_name] = {
                "cache_hit": cache_hit,
                "raw_size_bytes": len(raw_bytes),
                "metadata": meta.model_dump(),
            }
            fits_dir.mkdir(parents=True, exist_ok=True)
            fits_filename = f"{target_id}_{rel_name}_{obs.observation_id.replace('/', '_')}.fits"
            fits_path = fits_dir / fits_filename
            fits_path.write_bytes(_compact_sample_fits(raw_bytes))
            sample_fits_files[rel_name] = f"resources/sample_data/{fits_filename}"

    epoch_groups = group_by_epoch(collected_cutouts) if collected_cutouts else []

    payload = {
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "target": target,
        "search_region": region.model_dump(),
        "total_observations": len(search.observations),
        "dr1_count": len(dr1_obs),
        "qr3_count": len(qr3_obs),
        "counts_by_detector": by_detector,
        "truncated": search.truncated,
        "chronological_range_mjd": (
            [search.observations[0].archive_start_mjd, search.observations[-1].archive_end_mjd]
            if search.observations
            else None
        ),
        "sample_cutouts": samples_meta,
        "sample_fits_files": sample_fits_files,
        "verified_epoch_groups": len(epoch_groups),
        "first_10_observations": [obs.model_dump() for obs in search.observations[:10]],
    }

    json_dir.mkdir(parents=True, exist_ok=True)
    out_file = json_dir / f"{target_id}.json"
    out_file.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    return {
        "target_id": target_id,
        "name": target["name"],
        "status": "ok" if samples_meta else "no_cutout",
        "search_ra_deg": ra_deg,
        "search_dec_deg": dec_deg,
        "fov_arcmin": fov_arcmin,
        "total_observations": len(search.observations),
        "dr1_count": len(dr1_obs),
        "qr3_count": len(qr3_obs),
        "counts_by_detector": by_detector,
        "sample_dr1_id": samples_meta.get("dr1", {}).get("metadata", {}).get("observation", {}).get("observation_id"),
        "sample_qr3_id": samples_meta.get("qr3", {}).get("metadata", {}).get("observation", {}).get("observation_id"),
        "sample_fits_files": sample_fits_files,
        "metadata_file": out_file.name,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="all", help="all or target ID from resources/gaia/targets.json")
    parser.add_argument("--fov", type=float, default=8.0, help="Field of view in arcminutes")
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON_DIR)
    parser.add_argument("--fits-output", type=Path, default=DEFAULT_FITS_DIR)
    args = parser.parse_args()

    targets = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))["targets"]
    if args.target != "all":
        targets = [t for t in targets if t["id"] == args.target]
        if not targets:
            parser.error(f"Unknown target ID: {args.target}")

    results = []
    for target in targets:
        try:
            entry = verify_target(
                target,
                fov_arcmin=args.fov,
                json_dir=args.json_output,
                fits_dir=args.fits_output,
            )
        except Exception as exc:
            entry = {
                "target_id": target["id"],
                "name": target["name"],
                "status": "error",
                "detail": str(exc),
            }
        results.append(entry)
        print(json.dumps(entry), flush=True)

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mission": "NASA SPHEREx (IRSA DR1 + QR3)",
        "results": results,
    }
    args.json_output.mkdir(parents=True, exist_ok=True)
    (args.json_output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return 1 if any(r["status"] == "error" for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
