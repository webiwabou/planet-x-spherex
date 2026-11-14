"""Offline contract and astrometry checks. Live queries are exercised by catalogue_sample.py."""

import io
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
import numpy as np
import pytest
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.table import MaskedColumn, Table
from astropy.wcs import WCS
from fastapi.testclient import TestClient
from pydantic import ValidationError

from catalogue import (
    CatalogueQuery,
    CatalogueSource,
    GaiaCatalogue,
    CatalogueUnavailable,
    ProjectionRequest,
    build_adql,
    demo_wcs,
    project_sources,
    propagate,
)
from catalogue_routes import get_catalogue_service
from main import app


def source(**changes):
    fields = dict(
        source_id="4472832130942575872",
        ra_deg=0.0,
        dec_deg=60.0,
        ref_epoch=2016.0,
        pmra_mas_yr=1000.0,
        pmdec_mas_yr=0.0,
        parallax_mas=-1.0,
        phot_g_mean_mag=None,
        propagated_ra_deg=0.0,
        propagated_dec_deg=60.0,
        propagation_status="reference",
    )
    return CatalogueSource(**(fields | changes))


def votable(n=2):
    table = Table(
        {
            "SOURCE_ID": np.array(
                [4472832130942575872 + i for i in range(n)], dtype=np.int64
            ),
            "ra": [0.0] * n,
            "dec": [60.0] * n,
            "ref_epoch": [2016.0] * n,
            "pmra": MaskedColumn([1000.0] * n, mask=[i == 0 for i in range(n)]),
            "pmdec": [0.0] * n,
            "parallax": [-1.0] * n,
            "phot_g_mean_mag": [float("nan")] * n,
        }
    )
    output = io.BytesIO()
    table.write(output, format="votable")
    return output.getvalue()


@pytest.mark.parametrize(
    "fields",
    [
        {"ra_deg": 360},
        {"ra_deg": -1},
        {"dec_deg": 91},
        {"ra_deg": float("nan")},
        {"dec_deg": float("inf")},
        {"fov_arcmin": 0},
        {"limit": 5001},
        {"observation_time": "2026-01-01;DROP TABLE"},
        {"observation_time": "2200-01-01"},
        {"observation_time": "2100-01-01"},
    ],
)
def test_invalid_query(fields):
    with pytest.raises(ValidationError):
        CatalogueQuery(**(dict(ra_deg=0, dec_deg=0) | fields))


def test_motion_cosdec_wrap_and_negative_parallax():
    # Ten arcsec tangent-plane motion at dec=60 corresponds to 20 arcsec in RA.
    moved = propagate(source(ra_deg=359.999), "2026-01-01T12:00:00")
    delta = (moved.propagated_ra_deg - 359.999 + 180) % 360 - 180
    assert delta * 3600 == pytest.approx(20, abs=0.01)
    assert 0 <= moved.propagated_ra_deg < 360
    assert moved.parallax_mas == -1
    assert moved.propagation_status == "angular_proper_motion"


def test_missing_motion_is_not_invented():
    moved = propagate(source(pmra_mas_yr=None), "2026-01-01")
    assert moved.propagation_status == "missing_proper_motion"
    assert moved.propagated_dec_deg == 60


def test_reference_epoch_and_pole_finite():
    moved = propagate(source(dec_deg=90), "2016-01-01T12:00:00")
    assert np.isfinite(moved.propagated_ra_deg)
    # UTC vs TCB epoch offset is sub-second of angular motion here.
    assert (
        SkyCoord(moved.propagated_ra_deg * u.deg, moved.propagated_dec_deg * u.deg)
        .separation(SkyCoord(0 * u.deg, 90 * u.deg))
        .arcsec
        < 0.001
    )


def test_query_padding_covers_high_motion():
    q = CatalogueQuery(ra_deg=0, dec_deg=0, fov_arcmin=0.5)
    adql, radius = build_adql(q)
    assert radius * 3600 > 150
    assert "TOP 1001" in adql
    assert (
        "AS search_distance_deg" in adql
        and "ORDER BY search_distance_deg, source_id" in adql
    )
    assert "gaiadr3.gaia_source" in adql


def test_live_shape_nulls_precision_truncation_and_cache(tmp_path):
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(200, content=votable())

    service = GaiaCatalogue(tmp_path, transport=httpx.MockTransport(respond))
    q = CatalogueQuery(ra_deg=0, dec_deg=60, limit=1)
    r = service.query(q)
    assert r.truncated and not r.cache_hit
    assert r.sources[0].source_id == "4472832130942575872"
    assert r.sources[0].phot_g_mean_mag is None
    assert r.sources[0].pmra_mas_yr is None
    assert r.sources[0].propagation_status == "missing_proper_motion"
    assert "NaN" not in r.model_dump_json()
    assert service.query(q).cache_hit
    assert len(calls) == 1
    # A changed date cannot reuse positions from the old cache entry.
    service.query(q.model_copy(update={"observation_time": "2027-01-01T00:00:00"}))
    assert len(calls) == 2


def test_corrupt_cache_and_expiry(tmp_path):
    service = GaiaCatalogue(
        tmp_path,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, content=votable(0))
        ),
    )
    q = CatalogueQuery(ra_deg=0, dec_deg=0)
    assert service.query(q).sources == []
    next(tmp_path.glob("*.json")).write_text("not json")
    assert not service.query(q).cache_hit
    service.ttl_seconds = -1
    assert not service.query(q).cache_hit


@pytest.mark.parametrize(
    "response", [httpx.Response(503), httpx.Response(200, content=b"<not-a-votable/>")]
)
def test_upstream_failure_not_empty_catalogue(tmp_path, response):
    service = GaiaCatalogue(tmp_path, transport=httpx.MockTransport(lambda r: response))
    with pytest.raises(CatalogueUnavailable):
        service.query(CatalogueQuery(ra_deg=0, dec_deg=0))


def projection(**changes):
    q = CatalogueQuery(ra_deg=0, dec_deg=60)
    fields = dict(
        frame_id="frame-1",
        observation_time=q.observation_time,
        width=600,
        height=600,
        wcs_header=demo_wcs(q),
        sources=[source(pmra_mas_yr=0)],
    )
    return ProjectionRequest(**(fields | changes))


def test_center_origin_rotated_wcs_and_out_of_frame():
    req = projection(sources=[source(pmra_mas_yr=0), source(ra_deg=1, pmra_mas_yr=0)])
    result = project_sources(req)
    assert result["sources"][0]["x_px"] == pytest.approx(299.5)
    assert result["sources"][0]["y_px"] == pytest.approx(299.5)
    assert result["sources"][0]["in_frame"]
    assert not result["sources"][1]["in_frame"]
    # Independent pixel->sky round trip with a rotated WCS.
    w = WCS(req.wcs_header)
    w.wcs.pc = [[0, -1], [1, 0]]
    sky = w.pixel_to_world(100, 400)
    s = source(ra_deg=float(sky.ra.deg), dec_deg=float(sky.dec.deg), pmra_mas_yr=0)
    out = project_sources(projection(wcs_header=dict(w.to_header()), sources=[s]))[
        "sources"
    ][0]
    assert out["x_px"] == pytest.approx(100, abs=1e-7)
    assert out["y_px"] == pytest.approx(400, abs=1e-7)


def test_projection_recomputes_date_instead_of_trusting_client():
    s = source(propagated_ra_deg=120, propagated_dec_deg=-30)
    out = project_sources(projection(sources=[s]))["sources"][0]
    assert abs(out["propagated_ra_deg"]) < 0.01
    assert out["y_px"] == pytest.approx(299.5, abs=0.1)


@pytest.mark.parametrize(
    "header",
    [
        {},
        {"CTYPE1": "LINEAR", "CTYPE2": "LINEAR"},
        {"CPDIS1": "LOOKUP"},
        {"NAXIS1": 42},
    ],
)
def test_invalid_projection_rejected(header):
    with pytest.raises(Exception):
        project_sources(projection(wcs_header=header))


def test_api_contract_and_errors(tmp_path):
    service = GaiaCatalogue(
        tmp_path,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=votable())),
    )
    app.dependency_overrides[get_catalogue_service] = lambda: service
    try:
        with TestClient(app) as client:
            params = dict(ra_deg=0, dec_deg=60)
            r = client.get("/api/catalogues/gaia", params=params)
            assert r.status_code == 200
            assert isinstance(r.json()["sources"][0]["source_id"], str)
            assert (
                client.get(
                    "/api/catalogues/gaia", params=params | {"observation_time": "bad"}
                ).status_code
                == 422
            )
            assert (
                client.get(
                    "/api/catalogues/gaia", params=params | {"ra_deg": "nan"}
                ).status_code
                == 422
            )
            assert (
                client.get(
                    "/api/catalogues/gaia", params=params | {"fov_arcmin": 121}
                ).status_code
                == 422
            )
            assert (
                client.post(
                    "/api/catalogues/gaia/project", json=projection().model_dump()
                ).status_code
                == 200
            )
            bad = projection().model_dump()
            bad["wcs_header"] = {}
            assert (
                client.post("/api/catalogues/gaia/project", json=bad).status_code == 422
            )
            demo = client.get("/api/catalogues/gaia/demo", params=params)
            assert demo.status_code == 200 and "no SPHEREx" in demo.json()["image_kind"]
            assert client.get("/catalogues/demo").status_code == 200
            assert len(client.get("/api/catalogues/targets").json()["targets"]) == 5
            example = client.get("/api/catalogues/gaia/example")
            assert example.status_code == 200
            assert example.json()["catalogue"]["tap_url"].startswith(
                "https://gea.esac.esa.int/"
            )
            assert "/api/catalogues/gaia" in client.get("/openapi.json").json()["paths"]
        app.dependency_overrides[get_catalogue_service] = lambda: GaiaCatalogue(
            tmp_path / "fail",
            transport=httpx.MockTransport(lambda r: httpx.Response(503)),
        )
        with TestClient(app) as client:
            assert client.get("/api/catalogues/gaia", params=params).status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_cache_not_writable_does_not_hide_valid_results(tmp_path):
    file = tmp_path / "file"
    file.write_text("occupied")
    service = GaiaCatalogue(
        file,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=votable())),
    )
    result = service.query(CatalogueQuery(ra_deg=0, dec_deg=60))
    assert result.sources
    assert any("cache unavailable" in w for w in result.warnings)


def test_sip_wcs_and_nonfinite_projection():
    from astropy.wcs import Sip

    req = projection()
    w = WCS(req.wcs_header)
    a = np.zeros((3, 3))
    b = np.zeros((3, 3))
    a[2, 0] = 1e-5
    b[0, 2] = -1e-5
    w.wcs.ctype = ["RA---TAN-SIP", "DEC--TAN-SIP"]
    w.sip = Sip(a, b, None, None, w.wcs.crpix)
    sky = w.pixel_to_world(150, 420)
    s = source(ra_deg=float(sky.ra.deg), dec_deg=float(sky.dec.deg), pmra_mas_yr=0)
    result = project_sources(
        projection(wcs_header=dict(w.to_header(relax=True)), sources=[s])
    )
    assert result["sources"][0]["x_px"] == pytest.approx(150, abs=1e-4)
    assert result["sources"][0]["y_px"] == pytest.approx(420, abs=1e-4)
    # Opposite hemisphere is outside the tangent plane, not valid screen pixels.
    result = project_sources(
        projection(sources=[source(ra_deg=180, dec_deg=-60, pmra_mas_yr=0)])
    )
    out = result["sources"][0]
    assert out["x_px"] is None and out["y_px"] is None and not out["in_frame"]


@pytest.mark.parametrize("status", ["ERROR", "OVERFLOW"])
def test_tap_status_is_not_silently_ignored(tmp_path, status):
    data = votable(1).replace(
        b"<TABLE",
        f'<INFO name="QUERY_STATUS" value="{status}">upstream status</INFO><TABLE'.encode(),
        1,
    )
    service = GaiaCatalogue(
        tmp_path,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=data)),
    )
    if status == "ERROR":
        with pytest.raises(CatalogueUnavailable):
            service.query(CatalogueQuery(ra_deg=0, dec_deg=60))
    else:
        assert service.query(CatalogueQuery(ra_deg=0, dec_deg=60)).truncated
