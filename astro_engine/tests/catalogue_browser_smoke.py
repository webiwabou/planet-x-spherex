"""Check the explorer and Gaia overlay in Chrome. Run the backend first."""

import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--chromium", help="Optional installed Chromium executable")
    parser.add_argument("--output", type=Path, default=Path(".cache/browser-check"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium, headless=True)
        for name, width, height in (("desktop", 1440, 1000), ("mobile", 390, 844)):
            page = browser.new_page(viewport={"width": width, "height": height}, reduced_motion="reduce")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(args.url.rstrip("/") + "/catalogues/demo", wait_until="domcontentloaded")
            expect(page.locator(".epoch")).to_have_count(3)
            expect(page.locator("#catalogue-status")).to_contain_text("catálogo guardado")
            assert page.locator("#gaia-rows tr").count() > 0
            assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
            assert not errors, errors
            page.screenshot(path=args.output / f"gaia-{name}.png", full_page=True)
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
