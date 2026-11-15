# Planet-X & SPHEREx Explorer

Explore real SPHEREx DR1 and QR3 observations and compare infrared images across dates. The backend offers coordinate search, FITS cutouts, a local cache, and Gaia DR3 overlays. The R Draconis demo shows three epochs aligned to a common sky grid and brightness scale.

## Run locally

Use Python 3.11 or later. From the repository root, run:

```sh
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\python.exe -m pip install -r astro_engine/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir astro_engine --host 127.0.0.1 --port 8000
```

On Linux or macOS, use `.venv/bin/python` for the two commands after creating the environment.

- [SPHEREx explorer](http://localhost:8000/explorer) — choose one of the five benchmark fields or enter coordinates, select a detector and passband, compare epochs, download FITS, and inspect Gaia sources on the same screen.
- [Interactive API reference](http://localhost:8000/docs) — request schemas for observations, cutouts, frames and catalogue projection.
- [SPHEREx API & Data Contract](docs/SPHEREX_API.md) — documented inputs, outputs, and FITS metadata schema for Member 1's SPHEREx data retrieval & backend module.
- [NASA 5-Target SPHEREx Validation Report](docs/SPHEREX_VALIDATION.md) — live archive verification and sample FITS cutouts (`resources/sample_data/` & `resources/spherex/samples/`) generated via `astro_engine/spherex_sample.py`.

The saved SPHEREx and Gaia observations work offline. Live queries need network access to IRSA or the ESA Gaia Archive. Each saved cutout is shown at its own observed passband. A live search checks a bounded sample of the requested detector and retains pixels only when their passbands overlap the requested band.

## Run the sky viewer

The frontend is a Next.js app under `src`. With Node 18 or later, run `npm install` and then `npm run dev`, and open http://localhost:3000.

By default it shows recorded `POST /api/spherex/frames` responses for the five targets from `public/fixtures`, so it runs without the backend or IRSA. The data mode comes from `?data=` in the address or `NEXT_PUBLIC_SPHEREX_DATA` at build time:

- `mock` (default): recorded frames only.
- `live`: every request goes to the backend at `NEXT_PUBLIC_SPHEREX_API` (default `http://localhost:8000`).
- `auto`: recorded frames for the five targets, and the backend for every other position or detector.

Each target's series is one narrow band seen at several visits. Its observation IDs, wavelength and bandwidth are in `src/lib/series-presets.json`. With the backend running, `npm run record-fixtures` records fresh responses.

## Test and run in a container

```sh
python -m pytest astro_engine/tests -q
docker build -t planet-x-spherex .
docker run --rm -p 8000:8000 planet-x-spherex
```

The image serves the sky viewer at http://localhost:8000/, the explorer at `/explorer` and the API under `/api`, all from the same origin. It builds the frontend as a static export in `auto` mode, so the five targets open instantly from recordings and other positions query IRSA through the backend. The backend serves the export only when `WEB_DIR` is set, as the image does, so local runs are unchanged.

The backend exposes `/health`. Set `SPHEREX_CACHE_DIR` and `GAIA_CACHE_DIR` to writable directories to control local cache storage.

Data sources: [NASA SPHEREx archive at IRSA](https://irsa.ipac.caltech.edu/Missions/spherex.html) and [ESA Gaia Archive](https://gea.esac.esa.int/archive/).
