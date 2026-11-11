# IRSA / NASA Services & Astronomical API Integration Reference

Esta referencia documenta las APIs y herramientas astronómicas estándar empleadas para obtener y procesar datos de SPHEREx y encuestas auxiliares (Gaia DR3, AllWISE/CatWISE, 2MASS).

---

## 1. NASA/IPAC Infrared Science Archive (IRSA)
- **Base URL:** `https://irsa.ipac.caltech.edu/`
- **SIA (Simple Image Access) / Cutout Service:**
  - Permite solicitar cortes FITS centrados en coordenadas $(\text{RA}, \text{Dec})$ con un tamaño de caja especificado (FOV en minutos de arco o grados).
  - Formato de respuesta: FITS multi-extensión o arrays binarios.
- **TAP (Table Access Protocol):**
  - Consultas ADQL (Astronomical Data Query Language) estándar:
    ```sql
    SELECT source_id, ra, dec, phot_g_mean_mag, pmra, pmdec
    FROM gaiadr3.gaia_source
    WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 133.795, -7.245, 0.1))
    ```

---

## 2. CDS Aladin Lite & HiPS (Hierarchical Progressive Surveys)
- **Aladin Lite API v3:** Visualizador de cielo en WebGL/HTML5 Canvas desarrollado por el CDS (Strasbourg).
- **Proyección:** Proyección HEALPix jerárquica con pirámides de teselas multi-resolución.
- Permite capas superpuestas (Overlays):
  - SPHEREx Survey Coadds (HiPS / FITS Cutouts)
  - AllWISE W1/W2/W3/W4
  - 2MASS J/H/Ks
  - Gaia DR3 catalog vectors (flechas de movimiento propio)

---

## 3. Utilidades Python (Astropy & Core Tools)
- `astropy.coordinates`: `SkyCoord`, parsing de formatos sexagesimales `08h55m10.831s -07d14m42.53s` a decimales y viceversa.
- `astropy.io.fits`: Lectura y escritura de cabeceras FITS con keywords WCS (`CRVAL1`, `CRVAL2`, `CDELT1`, `CDELT2`, `CTYPE`, etc.).
- `astropy.wcs`: Proyección biyectiva píxel $\leftrightarrow$ cielo.
- `reproject`: Interpolación y remuestreo de imágenes astronómicas en grids comunes.
