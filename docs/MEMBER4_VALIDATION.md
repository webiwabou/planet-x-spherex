# Validación del módulo Gaia — Member 4

Fecha: 2026-11-14. Entorno: Python 3.13, Astropy 8.0.2, FastAPI 0.163.0, HTTPX 0.28.1. No se ha probado el frontend Next.js heredado ni una integración con frames SPHEREx reales.

## Evidencia

- `pytest astro_engine/tests -q`: **37 pruebas aprobadas**, incluyendo las 8 pruebas heredadas y 29 casos nuevos. Advertencias: deprecación de Starlette/TestClient y ERFA por fechas fuera de rango usadas para probar rechazo. No hubo fallos.
- Ruff, comprobación F de los cinco archivos Python nuevos: aprobada.
- `git diff --check`: aprobado antes de commit.
- Consulta real oficial ESA al campo de Barnard: RA 269.4520769586187°, Dec 4.69336496657667°, FOV 0.5 arcmin, fecha 2026-01-01 UTC, límite 5000. Devuelve **575 fuentes en el círculo ampliado, sin truncamiento**. La repetición devuelve `cache_hit=true`. Es un conteo del círculo ampliado, no del área cuadrada ni de contrapartes del objetivo.
- Los cinco campos requeridos devolvieron catálogos reales: [manifiesto](../resources/gaia/samples/manifest.json). Los ejemplos guardados usan límite 200 y son incompletos; sus conteos y esquemas se validaron contra `CatalogueResponse` y `ProjectionResponse`.
- Chromium: escritorio 1365×1050 y móvil 390×844, sin errores JavaScript ni desbordamiento horizontal de página. Selección con teclado y tabla, descarga JSON, limpieza de resultados al cambiar parámetros, recuperación de HTTP 503 y catálogo vacío aprobados. [Informe](../resources/gaia/browser-checks.json), [captura escritorio](../resources/gaia/demo-desktop.png), [captura móvil](../resources/gaia/demo-mobile.png).

## Alcance científico

La proyección se probó con WCS TAN, rotación, SIP, límites de imagen y proyecciones no finitas. La propagación se probó con RA 0/360, polos, cos(dec), datos ausentes y paralaje negativa. El mapa de demostración no es una imagen de SPHEREx y no identifica automáticamente el objetivo entre las fuentes Gaia.

Siguen en espera los cutouts reales y sus fechas, WCS final del procesamiento, conexión al visor del miembro 3, pruebas end-to-end SPHEREx, despliegue público y vídeo final. WISE se investigó como ampliación opcional; no está implementado.
