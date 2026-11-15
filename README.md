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

The live demos require access to IRSA and the ESA Gaia Archive. The saved Gaia example runs locally. The blink viewer is a quick-look tool with selected observation IDs. The separate Next.js prototype contains simulated imagery and spectra.

## Test and run in a container

```sh
python -m pytest astro_engine/tests -q
docker build -t planet-x-spherex .
docker run --rm -p 8000:8000 planet-x-spherex
```

The backend exposes `/health`. Set `SPHEREX_CACHE_DIR` and `GAIA_CACHE_DIR` to writable directories to control local cache storage.

Data sources: [NASA SPHEREx archive at IRSA](https://irsa.ipac.caltech.edu/Missions/spherex.html) and [ESA Gaia Archive](https://gea.esac.esa.int/archive/).
