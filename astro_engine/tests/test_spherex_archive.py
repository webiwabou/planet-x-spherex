import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app
from spherex_archive import ArchiveUnavailable, SearchRegion, search_observations


REGION = SearchRegion(ra_deg=127.69444, dec_deg=-39.17760, fov_arcmin=0.848528137423857)


def image_row(release, revision, mjd):
    obs_id = "2025W17_4B_0127_1"
    version = f"l2b-v{revision}-2026-196"
    url = (
        f"https://irsa.ipac.caltech.edu/ibe/data/spherex/{release}/level2/"
        f"2025W17_4B/{version}/3/level2_{obs_id}D3_spx_{version}.fits"
    )
    cells = (obs_id, f"spherex_{release}", "SPHEREx-D3", f"ivo://id/{version}", url, mjd, mjd + 0.001)
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
