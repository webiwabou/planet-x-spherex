---
name: spherex-sky-blink-viewer
description: Skill de diseño y desarrollo frontend especializado en herramientas web públicas de astronomía interactiva para NASA Space Apps (SPHEREx Blink Comparator, visualizador de series temporales multi-época, generador de espectros SED on-the-fly de 102 bandas y deep linking).
---

# SPHEREx Sky Blink Viewer Skill

Esta skill define la arquitectura visual, patrones de interacción, componentes UI y directivas de frontend para construir herramientas públicas de visualización astronómica en tiempo real para la misión **NASA SPHEREx**.

---

## 1. Módulos y Arquitectura del Visor Web

### A. Motor de Comparación de Parpadeo (Blink Comparator Engine)
Inspirado en el comparador óptico con el que Clyde Tombaugh descubrió Plutón en 1930, pero modernizado para la era digital con cubos de datos infrarrojos multi-temporales:
1. **Modo Automático (Loop Animation):**
   - Conmutación suave o brusca entre épocas (Survey 1, Survey 2, Survey 3, ...) a una cadencia ajustable (de 0.5 Hz a 5 Hz).
   - Indicador visual HUD mostrando la época activa ($t_1, t_2$), fecha de observación y detector array.
2. **Modo Manual (Step / Slider):**
   - Navegación cuadro a cuadro con atajos de teclado (`Espacio` para pausar/reanudar, flechas $\leftarrow / \rightarrow$ para alternar épocas).
3. **Modo Sustracción / Diferencia (Difference Imaging):**
   - Renderizado en tiempo real de $I(t_2) - I(t_1)$.
   - Paleta de color divergente (ej. Coolwarm / Seismic) centrada en cero, donde:
     - Fondo invariable permanece gris neutro.
     - Posición anterior del objeto desplazado aparece azul (pozo negativo).
     - Posición nueva del objeto desplazado aparece roja (pico positivo).
     - Variabilidad estelar pura (como *RW Aurigae* o *R Draconis*) aparece como una fuente puntual fija encendiéndose o atenuándose.

### B. Espectrofotometría On-The-Fly (102 Bandas & 6 Detectores)
- Gráfico interactivo de Distribución Espectral de Energía (Spectral Energy Distribution - SED):
  - Eje X: Longitud de onda $\lambda$ ($0.75 - 5.00\ \mu\text{m}$).
  - Eje Y: Flujo relativo o calibrado ($F_\nu$ o $F_\lambda$).
  - Selector para alternar entre:
    - **Full 102-Channel Spectrum:** Muestra la resolución completa de los filtros variables lineales (LVF).
    - **6-Detector Binned Mode:** Suma o promedio por array de detector (D1 a D6) para maximizar la relación señal-ruido ($\text{SNR}$).
  - Marcadores de absorción molecular clave:
    - $\text{H}_2\text{O}$ ($1.4\ \mu\text{m}, 1.9\ \mu\text{m}$)
    - $\text{H}_2\text{O}\text{ Ice}$ ($3.05\ \mu\text{m}$)
    - $\text{CH}_4\text{ (Metano)}$ ($1.66\ \mu\text{m}, 2.20\ \mu\text{m}, 3.30\ \mu\text{m}$)
    - $\text{CO}_2\text{ Ice}$ ($4.27\ \mu\text{m}$)
    - $\text{CO}$ ($4.67\ \mu\text{m}$)

### C. Deep Linking y Estado en URL
La herramienta debe ser 100% integrable y citable en papers o foros de ciencia ciudadana:
- Parámetros en URL estándar:
  `/?ra=133.7951&dec=-7.2451&fov=8&bands=d5_d6&mode=blink&speed=2`
- Soporte para coordenadas tanto en grados decimales (`ra=269.452&dec=4.693`) como en formato sexagesimal (`ra=08h55m10.83s&dec=-07d14m42.5s`).
- Modo Embebido (`/embed?ra=...&dec=...`): Oculta barras de navegación pesadas para ser incrustado en iframes de Zooniverse, Backyard Worlds o blogs de divulgación.

### D. Presets Canónicos del Desafío NASA
Acceso instantáneo de 1-clic a los objetivos requeridos:
- **Barnard's Star:** Desplazamiento propio récord visible a simple vista.
- **WISE 0855:** Enana marrón fría a 2.2 pc detectable en bandas D5 y D6.
- **Epsilon Indi B:** Sistema binario de enanas marrones.
- **RW Aurigae:** Curva de luz y atenuación por disco circunestelar.
- **R Draconis:** Variabilidad gigante tipo Mira en ventanas semestrales.

### E. Capas y Overlays Astronómicos
- Superposición de catálogos:
  - **Gaia DR3:** Marcadores circulares con flechas de vectores de movimiento propio.
  - **CatWISE / AllWISE:** Fuentes infrarrojas W1, W2.
  - **Crosshair / Retícula:** Indicador de coordenadas celestes en el centro de visión.
- Flags de contaminación: Máscaras visuales para saturación, glints ópticos o luz parásita.

---

## 2. Directivas de Estilo Visual (Astro-UI)

- **Atmósfera:** Estética de centro de control astronómico moderno y sobrio (dark theme profundo, tipografía monospace para coordenadas y métricas, acentos celestes y ámbar inspirados en las longitudes de onda del infrarrojo).
- **Accesibilidad y Ciencia Ciudadana:**
  - Controles táctiles y atajos de teclado accesibles.
  - Explicaciones contextuales en tooltips ("¿Por qué parpadea este objeto?", "¿Qué significa la banda D5?").
  - Botón de exportación: Descarga de GIF animado del parpadeo, PNG de alta resolución o espectro CSV para análisis en Python/Topcat.

---

## 3. Conexión de Memoria y Recursos

- La memoria de este skill se encuentra en `references/UI_Design_Specs.md`.
- Mañana, al subirse recursos adicionales de diseño, logotipos de NASA Space Apps, paletas o directrices del jurado, se documentarán en esta carpeta para retroalimentar la generación de componentes.
