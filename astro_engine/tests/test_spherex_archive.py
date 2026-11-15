import io
import sys
from pathlib import Path

import httpx
import numpy as np
import pytest
from astropy.io import fits
from astropy.table import Table
from astropy.time import Time
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app
from spherex_archive import (
    ArchiveSearch,
    ArchiveUnavailable,
    Observation,
    SearchRegion,
    build_cutout_url,
    get_cutout,
    package_cutouts_mef,
    search_observations,
)
from spherex_fits import extract_cutout_metadata, group_by_epoch


REGION = SearchRegion(ra_deg=127.69444, dec_deg=-39.17760, fov_arcmin=0.848528137423857)


def image_row(release, revision, mjd, detector=3, obs_id="2025W17_4B_0127_1"):
    version = f"l2b-v{revision}-2026-196"
    url = (
        f"https://irsa.ipac.caltech.edu/ibe/data/spherex/{release}/level2/"
        f"2025W17_4B/{version}/{detector}/level2_{obs_id}D{detector}_spx_{version}.fits"
    )
    cells = (
        obs_id,
        f"spherex_{release}",
        f"SPHEREx-D{detector}",
        f"ivo://id/{version}",
        url,
        mjd,
        mjd + 0.001,
    )
    return "<TR>" + "".join(f"<TD>{cell}</TD>" for cell in cells) + "</TR>"


def votable(rows="", trailing_info=""):
    texts = ("obs_id", "obs_collection", "energy_bandpassname", "obs_publisher_did", "access_url")
    fields = "".join(f'<FIELD name="{name}" datatype="char" arraysize="*"/>' for name in texts)
    fields += '<FIELD name="t_min" datatype="double"/><FIELD name="t_max" datatype="double"/>'
    return f"""<VOTABLE version="1.3"><RESOURCE type="results">
        <INFO name="QUERY_STATUS" value="OK"/>
        <TABLE>{fields}<DATA><TABLEDATA>{rows}</TABLEDATA></DATA></TABLE>
        {trailing_info}
    </RESOURCE></VOTABLE>"""


def make_synthetic_cutout_fits(
    obs_id: str = "2025W17_4B_0127_1",
    detector: int = 3,
    version: str = "7.0.5",
    date_beg: str = "2025-04-25T14:00:00.000",
    date_avg: str = "2025-04-25T14:01:23.604",
    date_end: str = "2025-04-25T14:02:47.208",
    ra_deg: float = 127.69444,
    dec_deg: float = -39.17760,
    wave_um: float = 2.05,
    band_um: float = 0.05,
) -> bytes:
    """Create a standards-compliant 7-HDU SPHEREx cutout MEF for unit testing."""
    primary = fits.PrimaryHDU()
    primary.header["VERSION"] = version

    shape = (8, 8)
    img_data = np.full(shape, 4.5, dtype=np.float32)
    image_hdu = fits.ImageHDU(data=img_data, name="IMAGE")
    ihdr = image_hdu.header
    ihdr["OBSID"] = obs_id
    ihdr["DETECTOR"] = detector
    ihdr["BUNIT"] = "MJy / sr"
    ihdr["TIMESYS"] = "UTC"
    ihdr["DATE-BEG"] = date_beg
    ihdr["DATE-AVG"] = date_avg
    ihdr["DATE-END"] = date_end
    ihdr["MJD-BEG"] = float(Time(date_beg, format="isot", scale="utc").mjd)
    ihdr["MJD-AVG"] = float(Time(date_avg, format="isot", scale="utc").mjd)
    ihdr["MJD-END"] = float(Time(date_end, format="isot", scale="utc").mjd)
    ihdr["PSF_FWHM"] = 7.25
    # Primary spatial WCS
    ihdr["WCSAXES"] = 2
    ihdr["CTYPE1"] = "RA---TAN"
    ihdr["CTYPE2"] = "DEC--TAN"
    ihdr["CUNIT1"] = "deg"
    ihdr["CUNIT2"] = "deg"
    ihdr["CRPIX1"] = 4.5
    ihdr["CRPIX2"] = 4.5
    ihdr["CRVAL1"] = ra_deg
    ihdr["CRVAL2"] = dec_deg
    ihdr["CDELT1"] = -0.00170833
    ihdr["CDELT2"] = 0.00170833
    # Alternate spectral WCS 'W' using linear wave/band for test self-containment
    ihdr["WCSNAMEW"] = "Approximated per-pixel wavelength and bandwidth"
    ihdr["WCSAXESW"] = 2
    ihdr["CTYPE1W"] = "WAVE"
    ihdr["CTYPE2W"] = "AWAV"
    ihdr["CUNIT1W"] = "um"
    ihdr["CUNIT2W"] = "um"
    ihdr["CRPIX1W"] = 4.5
    ihdr["CRPIX2W"] = 4.5
    ihdr["CRVAL1W"] = wave_um
    ihdr["CRVAL2W"] = band_um
    ihdr["CDELT1W"] = 0.001
    ihdr["CDELT2W"] = 0.0001

    flags_data = np.zeros(shape, dtype=np.int32)
    flags_data[3, 3] = 1 << 21  # SOURCE flag
    flags_data[0, 0] = 1 << 10  # HOT pixel flag
    flags_hdu = fits.ImageHDU(data=flags_data, name="FLAGS")
    flags_hdu.header["MSKN0010"] = "HOT"
    flags_hdu.header["MSKD0010"] = "Hot pixel"
    flags_hdu.header["MSKN0021"] = "SOURCE"
    flags_hdu.header["MSKD0021"] = "Pixel mapped to a known source"

    var_data = np.full(shape, 0.25, dtype=np.float32)
    var_hdu = fits.ImageHDU(data=var_data, name="VARIANCE")
    var_hdu.header["BUNIT"] = "MJy2 / sr2"

    zodi_hdu = fits.ImageHDU(data=np.full(shape, 0.8, dtype=np.float32), name="ZODI")
    zodi_hdu.header["BUNIT"] = "MJy / sr"

    epsf_cols = fits.ColDefs([fits.Column(name="XCENTER", format="J", array=np.array([1020], dtype=np.int32))])
    epsf_hdu = fits.BinTableHDU.from_columns(epsf_cols, name="EPSF")

    wave_cols = fits.ColDefs([
        fits.Column(name="X", format="2J", array=np.array([[1, 8]], dtype=np.int32)),
        fits.Column(name="Y", format="2J", array=np.array([[1, 8]], dtype=np.int32)),
        fits.Column(name="VALUES", format="8E", array=np.ones((1, 8), dtype=np.float32)),
    ])
    wcs_wave_hdu = fits.BinTableHDU.from_columns(wave_cols, name="WCS-WAVE")

    hdul = fits.HDUList([primary, image_hdu, flags_hdu, var_hdu, zodi_hdu, epsf_hdu, wcs_wave_hdu])
    buf = io.BytesIO()
    hdul.writeto(buf, overwrite=True)
    return buf.getvalue()


def test_keeps_latest_revision_and_overflow():
    def reply(request):
        if request.url.params["COLLECTION"] == "spherex_dr1":
            return httpx.Response(200, text=votable(image_row("dr1", 27, 60790)))
        return httpx.Response(
            200, text=votable(image_row("qr3", 28, 60790), '<INFO name="QUERY_STATUS" value="OVERFLOW"/>')
        )

    out = search_observations(REGION, transport=httpx.MockTransport(reply))
    assert len(out.observations) == 1
    assert out.observations[0].release == "qr3"
    assert out.observations[0].processing_version == "l2b-v28-2026-196"
    assert out.truncated


def test_filters_by_release_and_detector_and_sorts_chronologically():
    rows_dr1 = image_row("dr1", 27, 60800.5, detector=3, obs_id="2025W18_1A_0010_1") + image_row(
        "dr1", 27, 60790.1, detector=2, obs_id="2025W17_1A_0005_1"
    )
    rows_qr3 = image_row("qr3", 28, 61150.2, detector=3, obs_id="2026W20_1A_0020_1")

    def reply(request):
        col = request.url.params["COLLECTION"]
        return httpx.Response(200, text=votable(rows_dr1 if col == "spherex_dr1" else rows_qr3))

    transport = httpx.MockTransport(reply)
    all_obs = search_observations(REGION, transport=transport)
    assert [o.observation_id for o in all_obs.observations] == [
        "2025W17_1A_0005_1/D2",
        "2025W18_1A_0010_1/D3",
        "2026W20_1A_0020_1/D3",
    ]

    d3_only = search_observations(REGION, detector_id=3, transport=transport)
    assert [o.observation_id for o in d3_only.observations] == [
        "2025W18_1A_0010_1/D3",
        "2026W20_1A_0020_1/D3",
    ]

    dr1_d2 = search_observations(REGION, releases=("dr1",), detector_id=2, transport=transport)
    assert len(dr1_d2.observations) == 1
    assert dr1_d2.observations[0].observation_id == "2025W17_1A_0005_1/D2"


def test_distinguishes_empty_results_and_archive_failure():
    empty = httpx.MockTransport(lambda _: httpx.Response(200, text=votable()))
    assert search_observations(REGION, transport=empty).observations == []

    failure = httpx.MockTransport(lambda _: httpx.Response(502))
    with pytest.raises(ArchiveUnavailable, match="DR1"):
        search_observations(REGION, transport=failure)


def test_spatial_validation_runs_before_archive_request():
    response = TestClient(app).get("/api/spherex/observations", params={"ra": "12h00m00s", "dec": "91"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_coordinates"


def test_cutout_caching_metadata_extraction_and_mef_packaging(tmp_path):
    obs = Observation(
        observation_id="2025W17_4B_0127_1/D3",
        release="dr1",
        processing_version="l2b-v27-2026-196",
        archive_id="ivo://irsa.ipac/spherex_dr1/2025W17_4B_0127_1",
        access_url=(
            "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/"
            "2025W17_4B/l2b-v27-2026-196/3/level2_2025W17_4B_0127_1D3_spx_l2b-v27-2026-196.fits"
        ),
        detector_id=3,
        archive_start_mjd=60790.583,
        archive_end_mjd=60790.585,
    )
    fits_bytes = make_synthetic_cutout_fits()
    calls = {"count": 0}

    def reply(_request):
        calls["count"] += 1
        return httpx.Response(200, content=fits_bytes)

    transport = httpx.MockTransport(reply)
    data1, hit1 = get_cutout(obs, REGION, cache_dir=tmp_path, transport=transport)
    assert not hit1
    assert calls["count"] == 1

    data2, hit2 = get_cutout(obs, REGION, cache_dir=tmp_path, transport=transport)
    assert hit2
    assert calls["count"] == 1
    assert data1 == data2

    meta = extract_cutout_metadata(data2, obs, target_coord=(REGION.ra_deg, REGION.dec_deg))
    assert meta.observation.observation_id == "2025W17_4B_0127_1/D3"
    assert meta.pipeline_version == "7.0.5"
    assert meta.time.mid_utc == "2025-04-25T14:01:23.604Z"
    assert meta.center_wavelength_um == pytest.approx(2.05, rel=1e-2)
    assert meta.target_wavelength_um == pytest.approx(2.05, rel=1e-2)
    assert meta.psf_fwhm_arcsec == pytest.approx(7.25)
    assert meta.variance_summary is not None
    assert meta.variance_summary.median_val == pytest.approx(0.25)
    assert meta.variance_summary.positive_finite_pixels == 64
    assert meta.quality_flags is not None
    assert meta.quality_flags.total_pixels == 64
    assert meta.quality_flags.source_flagged_pixels == 1
    assert meta.quality_flags.bad_flagged_pixels == 1
    assert meta.quality_flags.active_flags["SOURCE"] == 1
    assert meta.quality_flags.active_flags["HOT"] == 1
    assert "WCS-WAVE" in meta.extensions

    mef = package_cutouts_mef([(obs, data2)], REGION)
    with fits.open(io.BytesIO(mef)) as hdul:
        assert hdul[1].name == "CUTOUT_INFO"
        summary = Table(hdul["CUTOUT_INFO"].data)
        assert len(summary) == 1
        assert summary["observation_id"][0] == "2025W17_4B_0127_1/D3"
        assert "IMAGE1" in hdul
        assert "FLAGS1" in hdul
        assert "VARIANCE1" in hdul
        assert build_cutout_url(obs, REGION) in summary["access_url"][0]

    epochs = group_by_epoch([meta])
    assert len(epochs) == 1 and len(epochs[0]) == 1


def test_real_sample_cutouts_and_target_endpoints():
    client = TestClient(app)
    targets_res = client.get("/api/spherex/targets")
    assert targets_res.status_code == 200
    manifest = targets_res.json()
    assert len(manifest["results"]) == 5

    for entry in manifest["results"]:
        tid = entry["target_id"]
        sample_res = client.get(f"/api/spherex/samples/{tid}")
        assert sample_res.status_code == 200
        payload = sample_res.json()
        assert payload["total_observations"] > 0
        assert "dr1" in payload["sample_cutouts"]
        dr1_meta = payload["sample_cutouts"]["dr1"]["metadata"]
        obs = Observation(**dr1_meta["observation"])
        fits_rel = payload["sample_fits_files"]["dr1"]
        fits_path = Path(__file__).resolve().parents[2] / fits_rel
        assert fits_path.exists()
        extracted = extract_cutout_metadata(fits_path.read_bytes(), obs)
        assert extracted.observation.observation_id == obs.observation_id
        assert extracted.variance_summary is not None
        assert extracted.quality_flags is not None


def test_http_endpoints_observations_cutouts_mef_and_auto_frames(monkeypatch, tmp_path):
    monkeypatch.setenv("SPHEREX_CACHE_DIR", str(tmp_path))
    obs_dr1 = Observation(
        observation_id="2025W17_4B_0127_1/D3",
        release="dr1",
        processing_version="l2b-v27-2026-196",
        archive_id="ivo://irsa.ipac/spherex_dr1/2025W17_4B_0127_1",
        access_url=(
            "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/"
            "2025W17_4B/l2b-v27-2026-196/3/level2_2025W17_4B_0127_1D3_spx_l2b-v27-2026-196.fits"
        ),
        detector_id=3,
        archive_start_mjd=60790.583,
        archive_end_mjd=60790.585,
        wavelength_min_um=1.64,
        wavelength_max_um=2.42,
    )
    obs_qr3 = Observation(
        observation_id="2026W17_1A_0210_1/D3",
        release="qr3",
        processing_version="l2b-v29-2026-135",
        archive_id="ivo://irsa.ipac/spherex_qr3/2026W17_1A_0210_1",
        access_url=(
            "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/"
            "2026W17_1A/l2b-v29-2026-135/3/level2_2026W17_1A_0210_1D3_spx_l2b-v29-2026-135.fits"
        ),
        detector_id=3,
        archive_start_mjd=61150.583,
        archive_end_mjd=61150.585,
        wavelength_min_um=1.64,
        wavelength_max_um=2.42,
    )
    fits_dr1 = make_synthetic_cutout_fits(
        obs_id="2025W17_4B_0127_1",
        date_beg="2025-04-25T14:00:00.000",
        date_avg="2025-04-25T14:01:23.604",
        date_end="2025-04-25T14:02:47.208",
        ra_deg=133.795129,
        dec_deg=-7.245147,
    )
    fits_qr3 = make_synthetic_cutout_fits(
        obs_id="2026W17_1A_0210_1",
        date_beg="2026-04-20T14:00:00.000",
        date_avg="2026-04-20T14:01:23.604",
        date_end="2026-04-20T14:02:47.208",
        ra_deg=133.795129,
        dec_deg=-7.245147,
    )

    import spherex_routes

    def fake_search_observations(region, limit=500, *, releases=("dr1", "qr3"), detector_id=None, **_kwargs):
        items = [obs_dr1, obs_qr3]
        items = [o for o in items if o.release in releases]
        if detector_id is not None:
            items = [o for o in items if o.detector_id == detector_id]
        return ArchiveSearch(region=region, observations=items[:limit], truncated=False, warnings=[])

    def fake_get_cutout(obs, region, *, cache_dir=None, **_kwargs):
        data = fits_dr1 if obs.release == "dr1" else fits_qr3
        transport = httpx.MockTransport(lambda _req: httpx.Response(200, content=data))
        return get_cutout(obs, region, cache_dir=tmp_path, transport=transport)

    monkeypatch.setattr(spherex_routes, "search_observations", fake_search_observations)
    monkeypatch.setattr(spherex_routes, "get_cutout", fake_get_cutout)

    client = TestClient(app)

    # 1. GET /api/spherex/observations with release and detector_id filters
    obs_res = client.get(
        "/api/spherex/observations",
        params={"ra": "133.795129", "dec": "-7.245147", "fov_arcmin": "5.0", "release": "qr3", "detector_id": 3},
    )
    assert obs_res.status_code == 200
    obs_json = obs_res.json()
    assert len(obs_json["observations"]) == 1
    assert obs_json["observations"][0]["observation_id"] == "2026W17_1A_0210_1/D3"

    # 2. GET /api/spherex/observations/{id}/cutout (miss then hit) & /metadata
    cut_params = {"ra": "133.795129", "dec": "-7.245147", "fov_arcmin": "5.0"}
    cut1 = client.get("/api/spherex/observations/2025W17_4B_0127_1/D3/cutout", params=cut_params)
    assert cut1.status_code == 200
    assert cut1.headers["X-Cache-Hit"] == "false"

    cut2 = client.get("/api/spherex/observations/2025W17_4B_0127_1/D3/cutout", params=cut_params)
    assert cut2.status_code == 200
    assert cut2.headers["X-Cache-Hit"] == "true"

    meta_res = client.get("/api/spherex/observations/2025W17_4B_0127_1/D3/metadata", params=cut_params)
    assert meta_res.status_code == 200
    meta_json = meta_res.json()
    assert meta_json["variance_summary"]["positive_finite_pixels"] == 64
    assert meta_json["quality_flags"]["active_flags"]["SOURCE"] == 1

    # 3. POST /api/spherex/cutouts/mef
    mef_res = client.post(
        "/api/spherex/cutouts/mef",
        json={
            "ra": "133.795129",
            "dec": "-7.245147",
            "fov_arcmin": 5.0,
            "observation_ids": [obs_dr1.observation_id, obs_qr3.observation_id],
        },
    )
    assert mef_res.status_code == 200
    with fits.open(io.BytesIO(mef_res.content)) as hdul:
        assert "CUTOUT_INFO" in hdul
        assert "IMAGE1" in hdul and "IMAGE2" in hdul

    # 4. POST /api/spherex/frames with automatic observation selection (observation_ids omitted)
    frames_res = client.post(
        "/api/spherex/frames",
        json={
            "ra": "133.795129",
            "dec": "-7.245147",
            "fov_arcmin": 0.5,
            "detector_id": 3,
            "wavelength_um": 2.05,
            "bandwidth_um": 0.05,
        },
    )
    assert frames_res.status_code == 200
    frames_json = frames_res.json()
    assert len(frames_json["frames"]) == 2
    assert frames_json["frames"][0]["observations"][0]["observation"]["observation_id"] == "2025W17_4B_0127_1/D3"
    assert frames_json["frames"][1]["observations"][0]["observation"]["observation_id"] == "2026W17_1A_0210_1/D3"


