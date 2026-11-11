# SPHEREx Web UI & User Experience Specifications
*(Memoria Persistente de Diseño Frontend - NASA Space Apps 2026)*

> **Estado:** Estructura preparada para integrar guías de evaluación, recursos de jurados y assets adicionales.

---

## 1. Arquitectura de Componentes Frontend (Next.js / React)

1. **`SkyViewport`:**
   - Canvas interactivo acelerado por hardware para renderizado de teselas FITS o HiPS.
   - Paneo y zoom suaves con rueda del ratón o gestos táctiles.
   - Retícula astronómica con lectura en tiempo real de $(\text{RA}, \text{Dec})$ bajo el cursor.
2. **`BlinkController`:**
   - Barra de control de reproducción con botón Play/Pause, velocidad de parpadeo (fps), botón de toggle manual y slider de época.
   - Selector de modo: `Blink` vs `Difference (Subtraction)` vs `Side-by-Side` vs `Stack (Average)`.
3. **`SpectralSEDInspector`:**
   - Panel inferior o lateral colapsable con visualización de las 102 bandas infrarrojas.
   - Resaltado de bandas según detector array (D1: Azul/Cian, D2: Verde azulado, D3: Verde, D4: Amarillo, D5: Naranja, D6: Rojo profundo).
   - Detección interactiva de caídas de absorción molecular al hacer clic en cualquier píxel.
4. **`CatalogOverlayManager`:**
   - Toggles para superponer fuentes Gaia DR3, CatWISE y vectores de movimiento propio.
5. **`PresetsDrawer`:**
   - Tarjetas de acceso rápido para los 5 benchmarks: Barnard's Star, WISE 0855, Epsilon Indi B, RW Aurigae, R Draconis.

---

## 2. Parámetros de Integración y Deep Linking
- `ra`: Ascensión recta en grados o formato sexagesimal.
- `dec`: Declinación en grados o formato sexagesimal.
- `fov`: Campo de visión (en minutos de arco o grados).
- `mode`: `blink`, `diff`, `split`, `coadd`.
- `epoch`: Índice de la época o survey inicial.
- `embed`: Booleano `true` para modo iframe sin cabeceras.

---

## 3. Bitácora de Retroalimentación de Diseño
- [ ] **Recurso de Diseño (Pendiente):** Integración de feedback del usuario y assets oficiales de NASA Space Apps 2026.
- [ ] **Accesibilidad (Pendiente):** Calibración de mapas de color amigables para daltonismo (Viridis, Magma, Cividis).
