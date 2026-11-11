---
name: spherex-astrophysics-data-pipeline
description: Pipeline de procesamiento astrofísico para la misión NASA SPHEREx. Especializado en ingesta de datos FITS/HiPS, manejo de 102 bandas infrarrojas (0.75-5.0 um), calibración de los 6 detector arrays, sustracción temporal de imágenes (time-series blink), extracción de curvas espectrales (SED) y cruce con catálogos astronómicos (Gaia DR3, CatWISE, SIMBAD).
---

# SPHEREx Astrophysics Data Pipeline Skill

Esta skill dota al agente y al entorno de la capacidad de operar, procesar, calibrar y transformar datos espectrofotométricos de la misión **NASA SPHEREx** (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) y catálogos infrarrojos/ópticos complementarios.

---

## 1. Misión SPHEREx: Fundamentos Astrofísicos y Datos

### A. Especificaciones de la Misión
- **Lanzamiento / Operación:** Mapeo de todo el cielo cada 6 meses (Survey Cadence: All-Sky cada ~6 meses, generando épocas multi-temporales S1, S2, S3, S4...).
- **Rango Espectral:** Infrarrojo cercano de $0.75\ \mu\text{m}$ a $5.00\ \mu\text{m}$.
- **Resolución Espectral:** 102 bandas espectrales discretas obtenidas mediante filtros variables lineales (Linear Variable Filters - LVF).
  - Resoluciones típicas:
    - Bandas 1–3 ($0.75 - 2.42\ \mu\text{m}$): $R \approx 41$
    - Bandas 4–6 ($2.42 - 5.00\ \mu\text{m}$): $R \approx 135$
- **Plano Focal:** 6 detectores arrays independientes ($2048 \times 2048$ píxeles H2RG cada uno):
  - **Array 1:** $0.75 - 1.11\ \mu\text{m}$ (Detector 1)
  - **Array 2:** $1.11 - 1.64\ \mu\text{m}$ (Detector 2)
  - **Array 3:** $1.64 - 2.42\ \mu\text{m}$ (Detector 3)
  - **Array 4:** $2.42 - 3.82\ \mu\text{m}$ (Detector 4)
  - **Array 5:** $3.82 - 4.42\ \mu\text{m}$ (Detector 5)
  - **Array 6:** $4.42 - 5.00\ \mu\text{m}$ (Detector 6)
- **Resolución Espacial:** ~6.2 arcsec / pixel.

### B. Fuentes Astrofísicas Clave
1. **Objetos de Alto Movimiento Propio (High Proper Motion - HPM):**
   - **Barnard's Star:** $\mu \approx 10.3\ \text{arcsec/año}$ (la mayor tasa de movimiento propio conocida).
   - **WISE 0855-0714:** Enana marrón de tipo Y extremadamente fría ($T \sim 250\ \text{K}$) a ~2.2 pc, $\text{RA} = 08^{\text{h}}55^{\text{m}}10.831^{\text{s}}$, $\text{Dec} = -07^{\circ}14'42.53''$.
   - **Epsilon Indi B:** Sistema binario de enanas marrones (T1 + T6) orbitando Epsilon Indi A, movimiento propio alto ($\mu \approx 4.7\ \text{arcsec/año}$).
2. **Estrellas Variables y Transitorias:**
   - **RW Aurigae:** Estrella T Tauri binaria con eclipses y caídas dramáticas de brillo por discos protoplanetarios y nubes de polvo.
   - **R Draconis:** Estrella variable tipo Mira de largo periodo (~245 días), con amplia oscilación en el infrarrojo.
3. **Cuerpos Menores del Sistema Solar (SSOs):**
   - Asteroides (NEAs, MBAs, Troyanos) y cometas que se mueven entre tomas consecutivas y épocas semestrales.
4. **Candidatos a Planeta X / Objetos Transneptunianos (TNOs):**
   - Cuerpos helados lejanos cuyo desplazamiento angular aparente entre épocas semestrales evidencia paralaje heliocéntrico y movimiento orbital lento.

---

## 2. Métodos de Procesamiento de Imágenes y Datos

### A. Alineación Astrométrica y WCS (World Coordinate System)
- Conversión estricta entre coordenadas esféricas $(\text{RA}, \text{Dec})$ en grados decimales o sexagesimales (ICRS/J2000) y coordenadas píxel $(x, y)$.
- Uso de `astropy.wcs.WCS` y `astropy.coordinates.SkyCoord`.
- Reproyección entre diferentes épocas y misiones usando `reproject` (reprojection homográfica con conservación de flujo).

### B. Stacking y Coadds por Detector Array (Optimización SNR)
- Co-adición ponderada de las bandas individuales de cada detector array:
  $$I_{\text{Array}_k}(x, y) = \frac{\sum_{i \in \text{Detector}_k} w_i \cdot I_i(x, y)}{\sum_{i \in \text{Detector}_k} w_i}$$
  donde $w_i = 1 / \sigma_i^2$ (peso por varianza del ruido).
- Mejora sustancial de la relación señal-ruido ($\text{SNR}$) para detectar fuentes difusas o débiles previo al análisis espectral fino.

### C. Sustracción de Imágenes Multi-Época (Difference Imaging Analysis - DIA)
- Para dos épocas $T_1$ y $T_2$ con PSF matching:
  $$\Delta I_{12} = I(T_2) - \mathcal{K} \ast I(T_1)$$
  donde $\mathcal{K}$ es el kernel de convolución para emparejar la dispersión PSF y niveles de fondo (Sky background).
- En la imagen de diferencia:
  - Objetos estáticos cancelan a cero (nivel de ruido).
  - Objetos en movimiento dejan un doblete característico (dipolo negativo/positivo: "pozo y pico").
  - Objetos variables en luminosidad muestran un residual monopolar positivo o negativo.

### D. Extracción de Curvas Espectrales (SED on-the-fly)
- Muestreo de las 102 bandas en el centroide de la fuente seleccionada $(\text{RA}_0, \text{Dec}_0)$:
  $$\mathcal{F}(\lambda_i) = \int_{\text{Apertura}} I(\lambda_i, x, y)\, dx\, dy - \text{Background Sky}$$
- Identificación de firmas espectrales clave:
  - Absorción de $\text{H}_2\text{O}$ en $1.4\ \mu\text{m}, 1.9\ \mu\text{m}, 3.0\ \mu\text{m}$.
  - Absorción de $\text{CO}_2$ en $4.27\ \mu\text{m}$.
  - Hielo de $\text{CO}$ en $4.67\ \mu\text{m}$.
  - Bandas de $\text{CH}_4$ (metano) típicas en enanas marrones frías (tipo T e Y) alrededor de $1.6\ \mu\text{m}, 2.2\ \mu\text{m}, 3.3\ \mu\text{m}$.

### E. Flags de Calidad y Contaminación (Masking)
- Bitmasks estándar SPHEREx:
  - Bit 0: Cosmic ray hit
  - Bit 1: Pixel saturado
  - Bit 2: Stray light / Earth/Moon shine contamination
  - Bit 3: Bad pixel / Hot pixel
  - Bit 4: Ghost / Glint instrumental
  - Bit 5: Grisma/Filtro edge artifact

---

## 3. Estructura de Memoria Persistente y Recursos

Este skill cuenta con los siguientes directorios para ser enriquecidos con recursos subidos por el usuario:
- `references/`: Almacena especificaciones técnicas oficiales de IRSA/IPAC, whitepapers de SPHEREx, fórmulas matemáticas y guías de APIs.
  - `SPHEREx_Data_Model_Notes.md`: Bitácora continua de arquitectura de datos.
  - `IRSA_APIs_and_Services.md`: Especificación de endpoints TAP, SIA, Cutout Service.
- `resources/`:
  - `canonical_targets.json`: Coordenadas, épocas y propiedades astrofísicas de los 5 objetos de prueba obligatorios.
  - `spherex_102_bands.json`: Definición exhaustiva de las 102 longitudes de onda centrales, anchos de banda $\Delta\lambda$ y detectores D1-D6.
- `scripts/`: Scripts ejecutables en Python para consulta, mockeo y transformación de datos.

---

## 4. Guía Operativa para el Asistente

Cuando el usuario suba nuevos recursos (PDFs, Jupyter Notebooks, tablas CSV, FITS samples o documentación de IRSA/NASA):
1. Extraer los datos mediante la skill `markitdown` o lectura directa.
2. Sintetizar los nuevos esquemas de datos en `references/SPHEREx_Data_Model_Notes.md`.
3. Actualizar `resources/` con cualquier nueva tabla de calibración o endpoint.
4. Validar que cualquier pipeline o backend desarrollado cumpla estrictamente con el tipado estricto (Python 3.11+, Pydantic v2, Astropy).
