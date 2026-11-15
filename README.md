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

- [SPHEREx blink viewer](http://localhost:8000/api/spherex/demo) — load the R Draconis series and optionally enable Gaia.
- [Gaia catalogue viewer](http://localhost:8000/catalogues/demo) — choose **Ver ejemplo guardado** for a saved field, or query Gaia.
- [Interactive API reference](http://localhost:8000/docs) — request schemas for observations, cutouts, frames and catalogue projection.
- [SPHEREx API & Data Contract](docs/SPHEREX_API.md) — documented inputs, outputs, and FITS metadata schema for Member 1's SPHEREx data retrieval & backend module.
- [NASA 5-Target SPHEREx Validation Report](docs/SPHEREX_VALIDATION.md) — live archive verification and sample FITS cutouts (`resources/sample_data/` & `resources/spherex/samples/`) generated via `astro_engine/spherex_sample.py`.

The live demos require access to IRSA and the ESA Gaia Archive. The saved Gaia example runs locally. The blink viewer is a quick-look tool with selected observation IDs.

## Run the sky viewer

The frontend is a Next.js app under `src`. With Node 18 or later, run `npm install` and then `npm run dev`, and open http://localhost:3000.

By default it shows recorded `POST /api/spherex/frames` responses for the five targets from `public/fixtures`, so it runs without the backend or IRSA. Add `?data=live` to the address, or set `NEXT_PUBLIC_SPHEREX_DATA=live` at build time, to call the backend at `NEXT_PUBLIC_SPHEREX_API` (default `http://localhost:8000`).

Each target's series is one narrow band seen at several visits. Its observation IDs, wavelength and bandwidth are in `src/lib/series-presets.json`. With the backend running, `npm run record-fixtures` records fresh responses.

## Test and run in a container

```sh
python -m pytest astro_engine/tests -q
docker build -t planet-x-spherex .
docker run --rm -p 8000:8000 planet-x-spherex
```

The backend exposes `/health`. Set `SPHEREX_CACHE_DIR` and `GAIA_CACHE_DIR` to writable directories to control local cache storage.

Data sources: [NASA SPHEREx archive at IRSA](https://irsa.ipac.caltech.edu/Missions/spherex.html) and [ESA Gaia Archive](https://gea.esac.esa.int/archive/).
