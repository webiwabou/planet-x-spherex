# 🚀 Planet-X & SPHEREx Explorer
### NASA Space Apps Challenge 2026 &bull; Advanced Astrophysics & Time-Series Web Platform

[![NASA Space Apps Challenge](https://img.shields.io/badge/NASA%20Space%20Apps-2026-blue.svg)](https://www.spaceappschallenge.org/)
[![Mission](https://img.shields.io/badge/NASA%20Mission-SPHEREx-red.svg)](https://spherex.caltech.edu/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2014-black.svg)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Backend-Python%203.11+-yellow.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Public-facing interactive web tool to visualize and discover moving objects, brown dwarfs, Planet X candidates, and variable stars using all-sky time-series data from NASA's **SPHEREx** mission across **102 near-infrared bands** ($0.75 - 5.0\ \mu\text{m}$).

---

## SPHEREx and Gaia DR3 demos

Real Gaia field queries, epoch propagation, WCS projection API, local caching and a standalone demo are implemented. Run:

```bash
pip install -r astro_engine/requirements.txt
python -m uvicorn main:app --app-dir astro_engine --host 127.0.0.1 --port 8000
```

- Open the [SPHEREx blink demo](http://localhost:8000/api/spherex/demo) to compare three epochs of R Draconis and overlay Gaia sources. See the [SPHEREx API](docs/SPHEREX_API.md) and [validation guide](docs/SPHEREX_VALIDATION.md).
- Open the [Gaia catalogue demo](http://localhost:8000/catalogues/demo) and choose **Ver ejemplo guardado** to load a saved field or query the archive. See the [Gaia API](docs/MEMBER4_API.md).

**Current status:** the original sky canvas and spectra below are simulations, and the Next.js checkout has missing shared imports. This Gaia demo works independently; its background is a test WCS grid, not SPHEREx imagery. Full integration and deployment await the other subsystems.

## 🌟 Key Features

1. **Digital Blink Comparator Engine:**
   - Seamless loop animation and frame-by-frame navigation between 6-month SPHEREx survey cadences (Survey 1, Survey 2, Survey 3, Survey 4).
   - Adjustable blink rate ($0.5 - 3\ \text{Hz}$) and manual step controls.
2. **Real-Time Difference Imaging ($\Delta I = I_2 - I_1$):**
   - Instant subtraction mode displaying characteristic **dipoles** (blue trough / red peak) for high proper motion sources, and **monopoles** for variable stars.
3. **On-the-Fly 102-Band Spectral Extraction (SED):**
   - Interactive Spectral Energy Distribution plot covering all 102 LVF channels.
   - Detector Array binning across the 6 focal planes (D1 to D6) for SNR maximization.
   - Direct markers for molecular signatures: $\text{H}_2\text{O}$ vapor/ice ($1.4, 1.9, 3.05\ \mu\text{m}$), Methane $\text{CH}_4$ ($1.66, 2.2, 3.3\ \mu\text{m}$), $\text{CO}_2$ ice ($4.27\ \mu\text{m}$), and $\text{CO}$ ($4.67\ \mu\text{m}$).
4. **Canonical Challenge Presets (1-Click Access):**
   - **WISE 0855:** Coldest known brown dwarf at 2.2 pc with water clouds.
   - **Barnard's Star:** Benchmark high proper motion red dwarf ($10.39''/\text{yr}$).
   - **Epsilon Indi B:** Binary methane brown dwarf system (T1 + T6).
   - **RW Aurigae:** Circumstellar dust occultation variable star.
   - **R Draconis:** Long-period Mira pulsating giant.
5. **Deep Linking & Embeddable View:**
   - Query patch coordinates directly via URL (`/?ra=133.7951&dec=-7.2451&fov=8`).
   - Clean `/embed` route for lightweight iframe integration into citizen science projects (Backyard Worlds, Zooniverse).
6. **Cross-Mission Overlays & Quality Flags:**
   - Gaia DR3 astrometric motion vectors and artifact/glint contamination masks.

---

## 🏗️ Project Architecture

```
planet-x-spherex/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Main Sky Explorer interface
│   │   ├── embed/page.tsx         # Lightweight embeddable viewer
│   │   ├── api/astro/targets/     # Pre-configured benchmark endpoints
│   │   └── api/astro/spectrum/    # On-the-fly 102-band SED synthesizer
│   ├── components/
│   │   ├── SkyCanvas.tsx          # Hardware-accelerated interactive sky viewport
│   │   ├── BlinkControls.tsx      # Playback, survey cadence & detector binning
│   │   ├── SpectralGraph.tsx      # 102-channel spectrophotometry chart
│   │   ├── TargetPresets.tsx      # 1-click access to NASA benchmark objects
│   │   ├── CoordinateSearchBar.tsx# Sexagesimal & decimal parser with deep-link
│   │   └── Header.tsx             # Challenge & mission branding
│   └── lib/
│       ├── spherex-bands.ts       # 102 LVF bands and detector definitions
│       └── astronomy.ts           # Coordinate math & proper motion propagation
├── astro_engine/                  # Optional High-Precision Python Backend
│   ├── main.py                    # FastAPI microservice
│   ├── models.py                  # Strict Pydantic v2 schemas
│   ├── pipeline.py                # Difference imaging & SED extraction
│   ├── tests/                     # Automated pytest suite
│   └── requirements.txt
├── resources/
│   └── gaia/                      # Target coordinates and Gaia catalogue examples
└── docs/
    └── SPHEREx_CHALLENGE_GUIDE.md # Astrophysics and mission handbook
```

---

## 🚀 Quick Start

### 1. Frontend Web App (Next.js)

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application in your browser.

### 2. Python Astrophysics Engine (Optional)

```bash
cd astro_engine
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest tests/
uvicorn main:app --reload --port 8000
```

---

## 📄 License
Developed for the **NASA Space Apps Challenge 2026**. Licensed under the MIT License.
