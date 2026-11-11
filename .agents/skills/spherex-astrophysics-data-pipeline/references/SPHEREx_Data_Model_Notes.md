# SPHEREx Data Model & Astrophysics Knowledge Base
*(Memoria Persistente para el NASA Space Apps Challenge 2026)*

> **Estado:** Base configurada y lista para retroalimentación con recursos técnicos, papers y manuales de IRSA/NASA.

---

## 1. Arquitectura de Datos de la Misión SPHEREx
- **Filtros Variables Lineales (LVF):** 
  En lugar de un filtro estático tradicional, cada uno de los 6 detectores posee un LVF donde la longitud de onda varía continuamente en una dimensión del chip sensor. Al realizar múltiples exposiciones con solapamiento espacial mientras la nave barre el cielo, se reconstruyen cubos espectrales tridimensionales $(\text{RA}, \text{Dec}, \lambda)$ para cada punto celeste.
- **Niveles de Procesamiento de Datos:**
  - **Level 1 (L1):** Raw telemetry converted to calibrated individual detector readouts.
  - **Level 2 (L2):** Calibrated single exposures with astrometric WCS solution and photometric zero-points.
  - **Level 3 (L3):** Deep coadds, spectral cubes and all-sky mosaic tiles per survey epoch (Surveys S1, S2, S3, etc.).
  - **Level 4 (L4):** Value-Added Catalogs (All-Sky Point Source Catalog, Galaxy Redshift Survey, Ice Absorption Maps).

---

## 2. Detección de Objetos en Movimiento y Variables
- **Planeta X / Objetos Transneptunianos (TNOs):**
  - Distancia heliocéntrica típica: $> 40 - 500\ \text{AU}$.
  - Movimiento propio aparente: dominado por la paralaje reflexiva de la órbita de la Tierra ($\approx 6\ \text{meses}$ entre pasadas opuestas de la Tierra).
  - Firma visual: Pequeño salto astrométrico entre Survey 1 y Survey 2, prácticamente invisible en catálogos ópticos convencionales debido al extremo oscurecimiento y frío, pero detectable en bandas $3.8 - 5.0\ \mu\text{m}$ (Detectores D5 y D6).
- **Enanas Marrones Ultracríticas (WISE 0855, Epsilon Indi B):**
  - Muestran caídas espectrales profundas causadas por absorción de metano ($\text{CH}_4$) y nubes de agua/amoniaco.
  - Desplazamiento visible inmediato en el comparador de parpadeo (Blink Comparator) en ventanas de 6 meses.
- **Estrellas Variables (RW Aurigae, R Draconis):**
  - Diferencia de intensidad fotométrica sin cambio de posición espacial. La resta de imágenes $I(t_2) - I(t_1)$ muestra una fuente puntual intensa residual (positiva o negativa).

---

## 3. Bitácora de Ingesta y Retroalimentación
*(Aquí se añadirán los resúmenes, hiperparámetros y esquemas de los recursos que subas próximamente).*

- [ ] **Recurso 1 (Pendiente):** Subida de manuales/papers oficiales SPHEREx.
- [ ] **Recurso 2 (Pendiente):** Esquemas de tablas de IRSA / Cutout API de SPHEREx.
- [ ] **Recurso 3 (Pendiente):** Calibraciones fotométricas y perfiles de respuesta espectral LVF.
