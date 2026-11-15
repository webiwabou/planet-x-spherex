from pathlib import Path
import json
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import ValidationError
from fastapi.responses import HTMLResponse
from catalogue import (
    CatalogueQuery,
    CatalogueResponse,
    CatalogueUnavailable,
    GaiaCatalogue,
    ProjectionRequest,
    ProjectionResponse,
    demo_wcs,
    project_sources,
)

router = APIRouter(tags=["Gaia DR3 — Member 4"])
service = GaiaCatalogue()


def get_catalogue_service():
    return service


def query_parameters(
    ra_deg: float = Query(..., ge=0, lt=360),
    dec_deg: float = Query(..., ge=-90, le=90),
    fov_arcmin: float = Query(8, ge=0.5, le=120),
    observation_time: str = Query("2026-01-01T00:00:00", description="ISO UTC date"),
    limit: int = Query(1000, ge=1, le=5000),
):
    try:
        return CatalogueQuery(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            fov_arcmin=fov_arcmin,
            observation_time=observation_time,
            limit=limit,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/api/catalogues/gaia", response_model=CatalogueResponse)
def gaia_catalogue(
    query: CatalogueQuery = Depends(query_parameters),
    catalogue: GaiaCatalogue = Depends(get_catalogue_service),
):
    try:
        return catalogue.query(query)
    except CatalogueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/api/catalogues/gaia/project", response_model=ProjectionResponse)
def gaia_project(request: ProjectionRequest):
    try:
        return project_sources(request)
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail="Invalid or unsupported frame WCS: " + str(exc)
        ) from exc


@router.get("/api/catalogues/gaia/demo")
def gaia_demo(
    query: CatalogueQuery = Depends(query_parameters),
    catalogue: GaiaCatalogue = Depends(get_catalogue_service),
):
    result = gaia_catalogue(query, catalogue)
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
    return {
        "image_kind": "synthetic WCS grid; no SPHEREx image",
        "catalogue": result.model_dump(),
        "projection": projection,
    }


@router.get("/catalogues/demo", response_class=HTMLResponse, include_in_schema=False)
def demo_page():
    return Path(__file__).with_name("catalogue_demo.html").read_text(encoding="utf-8")


@router.get("/api/catalogues/targets")
def catalogue_targets():
    return json.loads(
        (
            Path(__file__).resolve().parents[1] / "resources/gaia/targets.json"
        ).read_text()
    )


@router.get("/api/catalogues/gaia/example")
def catalogue_example():
    path = (
        Path(__file__).resolve().parents[1]
        / "resources/gaia/samples/barnards_star.json"
    )
    if not path.exists():
        raise HTTPException(
            status_code=404, detail="Run catalogue_sample.py to capture the example"
        )
    return json.loads(path.read_text())
