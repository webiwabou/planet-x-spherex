from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from models import ExtractedSpectrumResponse, SkyCoordinateInput, DifferenceImageResult
from catalogue_routes import router as catalogue_router
from spherex_routes import blink_demo, router as spherex_router
from pipeline import parse_sky_coordinates, compute_102_band_spectrum

app = FastAPI(
    title="SPHEREx Astrophysics Processing Engine",
    description="High-precision astrometric, spectral and difference-imaging backend for NASA Space Apps 2026",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "SPHEREx Astrophysics Engine"}


@app.get("/api/coordinates/resolve")
def resolve_coordinates(ra: str = Query(...), dec: str = Query(...)):
    try:
        ra_deg, dec_deg = parse_sky_coordinates(ra, dec)
        return {
            "status": "success",
            "ra_deg": ra_deg,
            "dec_deg": dec_deg,
            "query_ra": ra,
            "query_dec": dec,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/spectrum/extract", response_model=ExtractedSpectrumResponse)
def extract_spectrum(
    ra: str = Query(..., description="RA in deg or sexagesimal"),
    dec: str = Query(..., description="Dec in deg or sexagesimal"),
    target_id: str = Query("generic", description="Target identifier"),
):
    try:
        ra_deg, dec_deg = parse_sky_coordinates(ra, dec)
        return compute_102_band_spectrum(ra_deg, dec_deg, target_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


app.include_router(catalogue_router)
app.include_router(spherex_router)
app.add_api_route("/explorer", blink_demo, include_in_schema=False)

# The Docker image serves the exported sky viewer from WEB_DIR; mounted last so every API route keeps priority
WEB_DIR = os.environ.get("WEB_DIR")
if WEB_DIR and Path(WEB_DIR).is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
