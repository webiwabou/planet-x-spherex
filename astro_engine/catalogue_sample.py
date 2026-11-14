"""Capture reproducible, real Gaia examples; never claims SPHEREx coverage."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from catalogue import (
    CatalogueQuery,
    GaiaCatalogue,
    ProjectionRequest,
    demo_wcs,
    project_sources,
)

ROOT = Path(__file__).resolve().parents[1]
TARGETS_PATH = ROOT / "resources/gaia/targets.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "resources/gaia/samples")
    parser.add_argument(
        "--target",
        default="all",
        help="all or target ID from resources/gaia/targets.json",
    )
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--date", default="2026-01-01T00:00:00")
    args = parser.parse_args()
    targets = json.loads(TARGETS_PATH.read_text())["targets"]
    if args.target != "all":
        targets = [t for t in targets if t["id"] == args.target]
        if not targets:
            parser.error("Unknown target ID")
    args.output.mkdir(parents=True, exist_ok=True)
    catalogue = GaiaCatalogue()
    results = []
    for target in targets:
        query = CatalogueQuery(
            ra_deg=target["ra_deg"],
            dec_deg=target["dec_deg"],
            fov_arcmin=8,
            observation_time=args.date,
            limit=args.limit,
        )
        try:
            result = catalogue.query(query)
            projection = project_sources(
                ProjectionRequest(
                    frame_id="demo-tan-grid",
                    observation_time=query.observation_time,
                    width=600,
                    height=600,
                    wcs_header=demo_wcs(query),
                    sources=result.sources,
                )
            )
            payload = {
                "image_kind": "synthetic WCS grid; no SPHEREx image",
                "target": target,
                "catalogue": result.model_dump(),
                "projection": projection,
            }
            path = args.output / (target["id"] + ".json")
            path.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
            entry = {
                "target_id": target["id"],
                "status": "ok",
                "file": path.name,
                "catalogue_count": len(result.sources),
                "in_frame_count": sum(s["in_frame"] for s in projection["sources"]),
                "truncated": result.truncated,
                "retrieved_at": result.retrieved_at,
                "spherex_coverage": "not tested",
                "target_identification": "not performed; field context only",
            }
        except Exception as exc:
            entry = {
                "target_id": target["id"],
                "status": "error",
                "detail": str(exc),
                "spherex_coverage": "not tested",
            }
        results.append(entry)
        print(json.dumps(entry), flush=True)
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "results": results,
        "scope": "Gaia field queries and synthetic TAN-grid projection; not SPHEREx end-to-end tests",
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return 1 if any(r["status"] == "error" for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
