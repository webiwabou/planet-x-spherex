"""Optional visual smoke check. Start the backend; pip install playwright first."""

import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--chromium", default=None, help="Optional existing Chromium executable"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "resources/gaia",
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    checks = []
    with sync_playwright() as p:
        kwargs = {"executable_path": args.chromium} if args.chromium else {}
        browser = p.chromium.launch(headless=True, **kwargs)
        for name, width, height in [("desktop", 1365, 1050), ("mobile", 390, 844)]:
            page = browser.new_page(
                viewport={"width": width, "height": height}, device_scale_factor=1
            )
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(args.url + "/catalogues/demo")
            page.wait_for_function(
                "document.querySelector('#preset').options.length===6"
            )
            page.get_by_role("button", name="Ver ejemplo guardado").click()
            page.wait_for_function(
                "document.querySelector('#sources').children.length>0"
            )
            count = page.locator(".source").count()
            page.locator("#rows button").first.click()
            assert "Gaia DR3" in page.locator("#detail").inner_text()
            page.locator(".source").first.focus()
            page.keyboard.press("Enter")
            assert "Gaia DR3" in page.locator("#detail").inner_text()
            page.evaluate("window.scrollTo(0,0)")
            page.screenshot(path=str(args.output / f"demo-{name}.png"), full_page=False)
            overflow = page.evaluate("document.documentElement.scrollWidth>innerWidth")
            styles = page.locator("#summary").evaluate(
                "(e)=>({color:getComputedStyle(e).color,background:getComputedStyle(document.body).backgroundColor})"
            )
            assert not overflow and not errors, (name, overflow, errors)
            with page.expect_download() as download:
                page.locator("#download").click()
            assert download.value.suggested_filename == "gaia-dr3-context.json"
            page.locator("input[name=ra_deg]").fill("20")
            assert page.locator(".source").count() == 0
            assert not page.locator("#download").is_visible()
            page.route(
                "**/api/catalogues/gaia/demo?**",
                lambda route: route.fulfill(
                    status=503,
                    content_type="application/json",
                    body=json.dumps({"detail": "Gaia unavailable"}),
                ),
            )
            page.get_by_role("button", name="Consultar Gaia", exact=True).click()
            page.wait_for_function(
                "document.querySelector('#status').textContent.includes('Gaia unavailable')"
            )
            assert page.get_by_role(
                "button", name="Consultar Gaia", exact=True
            ).is_enabled()
            assert not errors, errors
            page.unroute("**/api/catalogues/gaia/demo?**")
            page.route(
                "**/api/catalogues/gaia/demo?**",
                lambda route: route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(
                        {
                            "projection": {
                                "sources": [],
                                "observation_time": "2026-01-01T00:00:00",
                            },
                            "catalogue": {
                                "sources": [],
                                "truncated": False,
                                "cache_hit": False,
                                "retrieved_at": "2026-11-14T00:00:00Z",
                            },
                        }
                    ),
                ),
            )
            page.get_by_role("button", name="Consultar Gaia", exact=True).click()
            page.wait_for_function(
                "document.querySelector('#status').textContent.includes('no hay fuentes')"
            )
            assert page.locator(".source").count() == 0
            checks.append(
                dict(
                    viewport=name,
                    width=width,
                    height=height,
                    visible_sources=count,
                    overflow=overflow,
                    js_errors=errors,
                    computed_styles=styles,
                    error_recovery=True,
                    keyboard_selection=True,
                    json_download=True,
                    stale_data_cleared=True,
                    empty_state=True,
                )
            )
            page.close()
        browser.close()
    (args.output / "browser-checks.json").write_text(
        json.dumps(checks, indent=2) + "\n"
    )
    print(json.dumps(checks, indent=2))


if __name__ == "__main__":
    main()
