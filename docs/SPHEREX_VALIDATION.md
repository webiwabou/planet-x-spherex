# SPHEREx Data Availability & Backend Verification Report (Member 1)

Verified on **2026-11-15 UTC** against the live **NASA/IPAC Infrared Science Archive (IRSA)** `spherex_dr1` and `spherex_qr3` collections using `astro_engine/spherex_sample.py` (`fov_arcmin = 8.0`).

---

## 1. NASA's Five Required Benchmark Targets — Live Archive Matrix

All five targets mandated by the 2026 NASA Space Apps Challenge ("Planet X and SPHEREx") were queried across all six SPHEREx Linear Variable Filter (LVF) detector arrays (`D1`–`D6`) and verified with real Multi-Extension FITS (`MEF`) cutouts.

| Target | Search Center $(\text{RA}, \text{Dec})$ ICRS | Total Obs. | DR1 | QR3 | Counts by Detector (`D1`–`D6`) | Verified DR1 Sample Cutout | Verified QR3 Sample Cutout |
| :--- | :--- | ---: | ---: | ---: | :--- | :--- | :--- |
| **Barnard's Star** | `269.44850°, +4.76693°` *(propagated)* | **400** | 270 | 130 | D1:64, D2:74, D3:63, D4:63, D5:73, D6:63 | `2025W33_2C_0321_1/D3` (`2.3074 µm`, `2025-08-15`) | `2026W33_2A_0594_3/D3` (`2026-08-16`) |
| **Epsilon Indi B** | `331.04415°, -56.78284°` | **496** | 376 | 120 | D1:51, D2:101, D3:104, D4:49, D5:91, D6:100 | `2025W17_4B_0017_1/D2` (`1.5560 µm`, `2025-04-24`) | `2026W39_1A_0276_1/D3` (`2026-09-22`) |
| **WISE 0855** | `133.79513°, -7.24515°` | **301** | 301 | 0 | D1:53, D2:52, D3:46, D4:53, D5:51, D6:46 | `2025W19_1B_0116_1/D3` (`2.3651 µm`, `2025-05-05`) | *No QR3 pass ingested yet at this sky position* |
| **RW Aurigae** | `76.95653°, +30.40144°` | **386** | 250 | 136 | D1:69, D2:65, D3:58, D4:68, D5:68, D6:58 | `2025W36_1A_0095_1/D1` (`1.0683 µm`, `2025-09-01`) | `2026W36_1A_0476_1/D1` (`0.9817 µm`, `2026-09-02`) |
| **R Draconis** | `248.16761°, +66.75498°` | **598** | 465 | 133 | D1:96, D2:97, D3:107, D4:95, D5:96, D6:107 | `2025W20_2D_0243_2/D3` (`1.6931 µm`, `2025-05-16`) | `2026W20_2A_0294_2/D3` (`1.6454 µm`, `2026-05-16`) |

---

## 2. Included Sample FITS Cutouts & Metadata Deliverables

### A. Real FITS Cutouts (`resources/sample_data/`)
1. `resources/sample_data/barnards_star_dr1_2025W33_2C_0321_1_D3.fits`
2. `resources/sample_data/barnards_star_qr3_2026W33_2A_0594_3_D3.fits`
3. `resources/sample_data/epsilon_indi_b_dr1_2025W17_4B_0017_1_D2.fits`
4. `resources/sample_data/epsilon_indi_b_qr3_2026W39_1A_0276_1_D3.fits`
5. `resources/sample_data/wise_0855_dr1_2025W19_1B_0116_1_D3.fits`
6. `resources/sample_data/rw_aurigae_dr1_2025W36_1A_0095_1_D1.fits`
7. `resources/sample_data/rw_aurigae_qr3_2026W36_1A_0476_1_D1.fits`
8. `resources/sample_data/r_draconis_dr1_2025W20_2D_0243_2_D3.fits`
9. `resources/sample_data/r_draconis_qr3_2026W20_2A_0294_2_D3.fits`

Each file preserves the calibrated `PRIMARY`, `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`, and `WCS-WAVE` HDUs extracted from IRSA's Image Server (`IBE`).

### B. Extracted Metadata & Availability JSON (`resources/spherex/samples/`)
- `resources/spherex/samples/manifest.json`
- `resources/spherex/samples/barnards_star.json`
- `resources/spherex/samples/epsilon_indi_b.json`
- `resources/spherex/samples/wise_0855.json`
- `resources/spherex/samples/rw_aurigae.json`
- `resources/spherex/samples/r_draconis.json`

---

## 3. Reproducing Verification & Running the Test Suite

```powershell
# Run full automated backend test suite (63 tests)
.\.venv\Scripts\python.exe -m pytest astro_engine/tests -q

# Re-verify live IRSA SPHEREx DR1 & QR3 availability and refresh sample cutouts
.\.venv\Scripts\python.exe astro_engine/spherex_sample.py
```
