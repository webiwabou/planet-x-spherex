# Seguimiento por tareas de Notion

Corte documental: 2026-11-15. Código evaluado: `12cee9e2442771d32415b41da696e804457fe293`. [Contexto de continuación](../CONTEXT.md).

Este archivo conserva **el orden de las filas de Notion por miembro**. Es el índice de trabajo para el agente de Windows y los informes al usuario. No es una sincronización automática con Notion.

## Cómo leer y actualizar

- **Tablero**: estado visible en las capturas que entregó el usuario; no se ha modificado desde el agente.
- **Código/evidencia**: estado comprobado del repositorio. `Parcial` significa que falta parte del criterio; no es una tarea completada.
- `En espera` requiere una dependencia concreta. Con el visto bueno actual se puede implementar esa dependencia backend siguiendo sus propias filas; no quedarse esperando si puede avanzarse dentro del alcance autorizado.
- Las referencias `M1-01`…`M4-07` son **locales**, asociadas al orden de las capturas. No son los IDs reales SPX de Notion. No deducir IDs de textos truncados.
- Los nombres siguen las capturas, con abreviaturas desarrolladas para claridad. Si se obtiene el texto completo de Notion, conservar su nombre exacto y añadir su ID real.
- Cada tarea terminada debe enlazar archivos, pruebas pertinentes, evidencia real y commit. Cuando cambie el estado, actualizar también el registro al final y explicar al usuario qué fila de Notion corresponde.
- No declarar terminado un miembro completo por cerrar una de sus filas. No ocultar la diferencia entre un control visible y una funcionalidad backend real.

## M1 — Data

Fuente: [captura M1](handoff/notion-m1-data.png). Todas las filas tienen Status `To do` en esa captura; las dos primeras pueden empezar y el resto muestra dependencias.

| Ref. | Tarea de Notion, en orden | Tablero | Código/evidencia actual | Dependencia y criterio de cierre |
| --- | --- | --- | --- | --- |
| M1-01 | Study SPHEREx cutouts tutorial | To do; Ready | Reproducido el flujo SIA2 y recortes de ambos releases. [Evidencia y comandos](SPHEREX_VALIDATION.md) | TAP del notebook agotó el tiempo durante esta comprobación. SIA2 entregó las dos colecciones |
| M1-02 | Parse RA/Dec input (decimal degrees and hms/dms) | To do; Ready | Implementado y probado en Windows, incluidos formatos mixtos, signos, límites y errores. [Contrato](SPHEREX_API.md) | Publicar el contrato para el consumo de M3 |
| M1-03 | Query archive (TAP/SIA) for DR1 + QR3 images | To do; Waiting | SIA2 Wide verificado con 414 observaciones DR1 y 14 QR3 en el campo de IRSA | Se preservan release, versión e ID. Las colecciones Deep quedan fuera del alcance implementado |
| M1-04 | Download FITS cutouts sized to the field of view | To do; Waiting | Recortes FITS de ambos releases descargados y verificados. Límite de campo y bytes | Se observaron fallos transitorios de IRSA en recortes individuales |
| M1-05 | Extract metadata: date, wavelength, detector, WCS, variance/flags | To do; Waiting | Se validaron tiempos UTC, detector, WCS espacial, WCS espectral en centro, unidades y presencia de varianza/flags en ambos releases | Interpretar los bits y la compatibilidad espectral por píxel en M2 |
| M1-06 | Sort observations by time and group into epochs | To do; Waiting | Agrupador cronológico verificado con tres visitas reales y una prueba con varios aportes en una visita | Revisar con el equipo la ventana de 24 h |
| M1-07 | Local cache for downloaded cutouts | To do; Waiting | Caché atómica por producto versionado y región. Reutilización comprobada con ocho recortes reales | Integrar límites de almacenamiento en el entorno de despliegue |
| M1-08 | Build backend API endpoints (frames + metadata) | To do; Waiting | Parcial. Observaciones, FITS nativo, metadatos y serie de vista preliminar con IDs explícitos | Falta descubrimiento automático de exposiciones compatibles y FITS procesado |
| M1-09 | Pre-download data for the 5 test targets | To do; Waiting | Parcial. Cinco campos DR1 y tres QR3 con recortes reales verificados. [Matriz](SPHEREX_VALIDATION.md#cinco-campos-del-reto) | Verificar cobertura y calidad por objetivo/época, y candidatos de canales comparables. WISE 0855 sin coincidencias QR3 en esta búsqueda, Barnard con candidatos QR3 sin recorte validado |

## M2 — Processing

Fuente: [captura M2](handoff/notion-m2-processing.png). Todas las filas están `To do` y Waiting.

| Ref. | Tarea de Notion, en orden | Tablero | Código/evidencia actual | Dependencia y criterio de cierre |
| --- | --- | --- | --- | --- |
| M2-01 | Read FITS image, WCS, variance and flags | To do; Waiting | Lector comprobado con FITS reales DR1 y QR3 | Validar otros productos si se incorporan colecciones adicionales |
| M2-02 | Reproject all cutouts to a common north-up grid | To do; Waiting | TAN norte arriba por vecino más cercano, verificado con dos FITS reales y WCS final usado por Gaia | Verificar centramiento con fuentes identificadas y método fotométrico para mediciones |
| M2-03 | Mask flagged and invalid pixels | To do; Waiting | Máscaras de instrumento, cobertura, intensidad, varianza y espectro con códigos. Pruebas de flags y NaN | Revisar el criterio de flags por uso científico y presentar las capas en FITS procesado |
| M2-04 | Stack images per epoch and per detector | To do; Waiting | Parcial. Selección de pasabanda por píxel y varianza inversa, tres frames reales D3. Caso con múltiples exposiciones en test controlado | Validar un coadd con varios aportes reales, PSF y fondo antes de mediciones |
| M2-05 | Same brightness scaling on every frame | To do; Waiting | Verificado en el blink de R Draconis con percentiles conjuntos 2/98 | Validar la visualización para los otros objetivos |

El reparto original también contempla resta, multibanda, espectros y curvas de luz. **No inventar nuevas filas de Notion ni adelantarlas al flujo básico.** Registrar esas extensiones como pendientes del reparto original y asociarlas a tareas reales del tablero cuando el equipo las incorpore. La resta heredada no satisface PSF matching, comparabilidad espectral o propagación de errores.

## M3 — Frontend

Fuente: [captura M3](handoff/notion-m3-frontend.png). Todas las filas están `To do`; solo el layout figura Ready. El usuario pide dejar la mayor parte del frontend al equipo.

| Ref. | Tarea de Notion, en orden | Tablero | Código/evidencia actual | Criterio y alcance autorizado para este agente |
| --- | --- | --- | --- | --- |
| M3-01 | Website layout and plain-language intro | To do; Ready | Prototipo Next.js heredado; imports compartidos ausentes. Demo Gaia independiente funcional | Preservar el diseño del equipo. Reparar solo lo imprescindible para mostrar backend; no rediseñar ni dar Next.js por compilado sin verificar |
| M3-02 | Search form: RA, Dec and field-of-view selector | To do; Waiting | Formulario heredado; demo Gaia tiene consulta en grados/FOV | M3-01 y contrato backend. Conexión mínima a datos reales, validación y errores; el formulario Gaia no demuestra consulta SPHEREx |
| M3-03 | Buttons for the 5 targets | To do; Waiting | Componentes heredados y selector de cinco centros en demo Gaia | M3-02 y metadatos de objetivos verificados. Conectar presets adecuados sin confundir centros de búsqueda con efemérides |
| M3-04 | Blink viewer: play/pause, speed, prev/next, timeline | To do; Waiting | Demo FastAPI con blink real de R Draconis, play/pausa y navegación, comprobada en Chrome | M3 conserva el visor general, su integración, velocidad y línea de tiempo |
| M3-05 | Detector / wavelength selector | To do; Waiting | Controles heredados; no aplican a observaciones reales | M3-04 y metadatos espaciales/espectrales. Seleccionar datos realmente disponibles y comparables; no fabricar canales uniformes |
| M3-06 | Metadata panel with quality warnings | To do; Waiting | Metadata y avisos Gaia disponibles; flags SPHEREx del canvas son simulados | M3-04 y metadatos M1/M2. Mostrar fecha, escala temporal, banda, detector, cobertura y calidad reales con avisos entendibles |
| M3-07 | Loading, no-data and error states | To do; Waiting | Cubiertos y probados en la demo Gaia, no en el flujo SPHEREx completo | M3-04. Conexión mínima con carga, vacío válido, error, truncamiento y cancelación/datos anteriores; conservar trabajo de diseño al equipo |

## M4 — Integration (parte principal del usuario)

Fuente: [captura M4](handoff/notion-m4-integration.png). Las tres primeras filas aparecen Done; las demás To do y Waiting. La evidencia del repositorio debe complementar ese estado, sin asumir funciones inexistentes.

| Ref. | Tarea de Notion, en orden | Tablero | Código/evidencia actual | Qué falta / criterio de cierre verificable |
| --- | --- | --- | --- | --- |
| M4-01 | Define API contract between members (endpoints, inputs/outputs) | Done | [Contrato Gaia](MEMBER4_API.md) y [contrato SPHEREx](SPHEREX_API.md) con observaciones y metadatos implementados | Revisar con el equipo el contrato de series y los criterios de comparabilidad antes de cerrar la integración |
| M4-02 | Set up shared repo and project structure | Done | Fork privado y remotos configurados; backend integrado; commit `12cee9e` en GitHub | Mantener Done. Preparar Windows y sincronizar con cuidado. No recrear el fork ni borrar aportes del equipo |
| M4-03 | Propagate fast-moving targets to observation dates | Done | Gaia DR3 por ID y [comprobación de campo](MEMBER4_API.md#m4-03-comprobación-de-centros-para-objetivos-rápidos) de Barnard y Epsilon Indi B | Completar WISE 0855, RW Aurigae y R Draconis y comprobar la cobertura real por fecha y WCS |
| M4-04 | Connect backend, processing and frontend end-to-end | To do; Waiting | Parcial. Recorrido real en Chrome para R Draconis, tres frames, metadatos y overlay Gaia sobre WCS final | Generalizar la búsqueda, selección espectral y visor; sumar casos fuera del ejemplo fijo |
| M4-05 | Deploy to a public URL | To do; Waiting | Parcial. Dockerfile, puerto, variables y comprobación de salud documentados. Backend verificado con Python local | Construir y probar la imagen en un entorno con Docker y publicar en un hosting habilitado |
| M4-06 | Test the full app on the 5 targets | To do; Waiting | Parcial. Adquisición de cinco campos y un flujo end-to-end en R Draconis | Cuatro flujos end-to-end pendientes y comprobación de la presencia del objetivo en cada época |
| M4-07 | Demo video and submission materials | To do; Waiting | Capturas y docs técnicas disponibles; sin vídeo ni entrega final | M4-05/06 según tablero. Demo reproducible con datos reales/procedencia, rol de cada miembro, limitaciones, créditos de datos y materiales del reto. No enviar a terceros sin instrucción explícita de envío |

## Avances Gaia ya realizados que sostienen M4

No son nuevas tareas inventadas de Notion: son componentes de M4-03/04 y de las responsabilidades de catálogos del reparto original.

| Componente | Estado comprobado | Evidencia |
| --- | --- | --- |
| Consulta real Gaia DR3, metadatos, IDs sin pérdida y nulos | Implementado y probado | `astro_engine/catalogue.py`, `test_catalogue.py`, ejemplos reales |
| Propagación por época y proyección al WCS final | Implementado y probado en cuadrículas de prueba | Tests con rotación, SIP, RA 0/360, polos, máscaras de presencia y salidas no finitas |
| Caché local de catálogo y errores TAP | Implementado y probado | TTL, caché corrupta/no escribible, estados ERROR/OVERFLOW y errores HTTP |
| Demo visible independiente y descarga JSON | Implementado y probado en Linux | `catalogue_demo.html`, `browser-checks.json`, capturas |
| Investigación WISE | Inicial; opcional, sin implementación | Referencias de IRSA en `MEMBER4_API.md` |

## Siguiente orden de trabajo

1. **Preparación de continuidad:** revisar remotos y avances del equipo, preparar Windows y reproducir la validación existente. Registrar cualquier discrepancia sin sobrescribir trabajo.
2. **M4-01:** completar los acuerdos de interfaces necesarios para integrar los subsistemas; **M4-03:** precisar astrometría/épocas/FOV de objetivos rápidos. Son ampliaciones de alcance técnico, no un borrado del Done del tablero.
3. **M1-01 → M1-02 → M1-03 → M1-04 → M1-05 → M1-06 → M1-07 → M1-08 → M1-09.** El orden de filas guía el trabajo; respetar dependencias y permitir tareas independientes preparatorias (por ejemplo, diseño de caché) sin declararlas cerradas antes de probarlas con datos.
4. **M2-01 → M2-02 → M2-03 → M2-04 → M2-05.** Verificar calidad científica con los cutouts reales.
5. **M4-04:** conectar el flujo y hacer solo la adaptación necesaria en M3-01…M3-07 para verlo. El miembro 3 conserva diseño y mejoras del frontend.
6. **M4-05 → M4-06 → M4-07**, respetando la dependencia real y lo que aparezca actualizado en Notion. Preparar despliegue antes es avance parcial; el cierre exige evidencia pública y del recorrido real. Las pruebas locales de los objetivos pueden empezar antes de publicar si sus dependencias ya existen.

Si el tablero real cambia, actualizar este orden con la nueva evidencia; no tratar las capturas como estado en vivo. Las tareas científicas adicionales del reparto original deben seguir visibles como pendientes, sin desplazar las filas básicas.

## Registro de avances

| Fecha | Tarea(s) | Cambio | Evidencia | Qué queda |
| --- | --- | --- | --- | --- |
| 2026-11-14 | M4-02; componentes Gaia de M4-03/04 | Fork y módulo Gaia, API, caché, proyección y demo | Commit `12cee9e`; 37 tests aprobados en Linux; cinco campos Gaia; [validación](MEMBER4_VALIDATION.md) | Contrato global, astrometría completa de objetivos, SPHEREx real, integración y despliegue |
| 2026-11-15 | Continuidad de M4-02 y seguimiento transversal | Contexto Windows, instrucciones del usuario y mapa de las 28 filas de Notion | `CONTEXT.md`, este tracker y cuatro capturas del usuario | Implementación posterior en Windows siguiendo este orden; esta fila no declara nuevas tareas científicas terminadas |
| 2026-11-14 (Lima) | M4-01/02/03, M1-01–09 | Remotos verificados, contrato SPHEREx, dos objetivos Gaia por ID y backend de adquisición | `8ec0b39`, [validación Windows](SPHEREX_VALIDATION.md), [contrato](SPHEREX_API.md), FastAPI y caché FITS | Cerrar los casos de adquisición pendientes y validar canales comparables |
| 2026-11-14 (Lima) | M2-01–05, M1-08, M3-04, M4-04/05/06 | Procesamiento y demo mínima de R Draconis, Gaia sobre el WCS final, configuración de contenedor | [Serie real](SPHEREX_VALIDATION.md#serie-de-r-draconis), 60 pruebas en Windows y comprobación Chrome | Generalizar el recorrido, validar coadds reales y el contenedor, publicar y probar los demás objetivos |

Plantilla para cada siguiente avance:

```text
Fecha / commit:
Miembro y tarea de Notion (referencia local + ID real si existe):
Estado anterior → estado comprobado nuevo:
Implementación y archivos:
Validación pertinente y límites:
Qué debe actualizarse en Notion (si no hay conexión directa):
Dependencias y qué falta:
Siguiente tarea del tablero:
```

Las capturas son materiales suministrados por el usuario el 15 de noviembre de 2026, conservados como evidencia del tablero para este traspaso. No son una exportación completa de Notion ni acreditan por sí mismas el funcionamiento del software.
