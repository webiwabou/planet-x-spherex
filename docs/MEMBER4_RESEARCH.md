# Member 4: investigación y plan de integración

Fecha: 2026-11-14. Estado original: investigación inicial. Actualización: módulo Gaia, demo y contrato implementados; ver [MEMBER4_API.md](MEMBER4_API.md). Las dependencias de integración final siguen en espera.

## Auditoría de la base

- Fork privado: https://github.com/pedrochgdev/planet-x-spherex
- Base: https://github.com/mrtorture-dev/planet-x-spherex (main).
- Frontend Next.js 14 y backend FastAPI existentes.
- `src/lib/astronomy` y `src/lib/spherex-bands` descritos en el README no están presentes en el checkout. Hay imports de astronomy sin resolver; falta confirmar la compilación instalando dependencias.
- SkyCanvas dibuja un campo generado, movimiento parametrizado y flags simulados. El overlay Gaia actual es un vector dibujado a partir del preset, no una consulta al catálogo.
- Los espectros de Python y del endpoint Next.js son modelos sintéticos; no fotometría extraída de FITS.
- No se encontró ingestión real SPHEREx, reproyección WCS ni consultas Gaia. El README no constituye evidencia de funcionalidades verificadas.

## Fuentes y decisiones propuestas

1. IRSA confirma DR1 y QR3 y recomienda estos productos sobre QR2. Conservar release, observación y versión de procesamiento para trazabilidad y evitar duplicados.
   https://irsa.ipac.caltech.edu/Missions/spherex.html
   https://caltech-ipac.github.io/irsa-tutorials/spherex/
2. El tutorial oficial usa TAP para descubrir imágenes y obtener URLs de cutouts; SIA también está soportado, con un posible retraso de alrededor de un día respecto a ingestión. No imponer SIA como única vía al miembro 1.
   https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/
3. Consultar `gaiadr3.gaia_source` por TAP/ADQL con astroquery. Las consultas públicas básicas no requieren cuenta. Especificar columnas, límite de filas, timeout y truncamiento; limitar el área y cachear.
   https://docs.astropy.org/projects/astroquery/en/latest/gaia/gaia.html
4. Gaia DR3 usa posiciones ICRS y época de referencia J2016.0. Leer ref_epoch por fuente. pmra incluye cos(dec); usar pm_ra_cosdec de Astropy para no aplicarlo dos veces.
   https://arxiv.org/abs/2204.12574
   https://gea.esac.esa.int/archive/documentation/GEDR3/Gaia_archive/chap_datamodel/sec_dm_main_tables/ssec_dm_gaia_source.html
5. Propagar movimiento propio a cada fecha de observación con SkyCoord.apply_space_motion. No equivale a modelar paralaje aparente anual ni la posición del observador. Sin velocidad radial el modelo asume cero; indicar aproximaciones. No invertir paralajes nulas o negativas como distancias. Conservar fuentes sin movimiento propio con estado explícito.
   https://docs.astropy.org/en/stable/coordinates/apply_space_motion.html
6. Proyectar con el WCS celestial de la imagen final usando world_to_pixel; convención propuesta: x/y con origen cero y orden de array y/x. El frontend debe aplicar la misma transformación de pantalla, orientación, zoom y pan a imagen y overlay.
   https://docs.astropy.org/en/stable/wcs/wcsapi.html

## Trabajo que puede empezar sin los demás

- Servicio Python aislado para consulta Gaia, normalización de nulos y caché.
- Esquemas y contrato de API propuestos, sin declararlos acordados por el equipo.
- Propagación temporal y pruebas con WCS sintético conocido.
- Ejemplo pequeño de catálogo real y demostración local, diferenciando explícitamente imágenes de prueba de datos reales.
- WISE opcional después de Gaia; no bloquea el mínimo.

## Contrato mínimo propuesto (pendiente de acuerdo)

Entrada de catálogo: ra_deg, dec_deg (ICRS), fov_arcmin definido como ancho completo de un campo cuadrado, observation_time con escala temporal explícita, limit.
Consultar el círculo circunscrito al campo más un margen de movimiento entre época de catálogo y observación; luego recortar en el WCS final. Documentar el límite de movimiento que determina ese margen.

Salida: catalogue=Gaia DR3, consulta y procedencia, ref_epoch, source_id como string (evitar pérdida de precisión JavaScript), ra_deg, dec_deg, pmra_mas_yr, pmdec_mas_yr, parallax_mas, phot_g_mean_mag, posiciones propagadas, estado de propagación, warnings y truncated. Nulos JSON en vez de NaN; unidades en nombres o esquema.

Entrada adicional para proyección: identificador de frame, WCS celestial final completo o referencia interna a él, dimensiones y fecha. No confiar solo en RA/Dec central o en el WCS previo a reproyección. Conservar distorsiones necesarias.
Salida proyectada: frame_id, source_id, x_px, y_px, in_frame, convención de origen y orientación documentadas.

## Dependencias y estados

| Tarea | Estado | Necesita |
| --- | --- | --- |
| Investigación Gaia y diseño API | Investigación inicial lista | Acordar contrato con equipo |
| Consulta real Gaia | Implementada y comprobada | Cliente TAP HTTPX + Astropy |
| Propagación temporal | Implementada y probada | Modelo angular documentado |
| Overlay sobre FITS real | En espera | Miembro 1: cutout y fecha; miembro 2: WCS final |
| Integración visual | En espera | Miembro 3: interfaz para frames y overlays |
| Prueba completa en cinco objetivos | En espera | Datos reales y pipeline de miembros 1–3 |
| Despliegue y demo final | En espera | Integración funcional |

Actualización: se verificaron consultas Gaia reales de los cinco campos; ver `resources/gaia/samples/manifest.json`. No se ha verificado cobertura SPHEREx de los cinco objetivos. No asumir que todos los objetivos infrarrojos tienen contraparte Gaia. Una consulta vacía válida no es un fallo del servicio.

## Validación prevista

- Consulta real pequeña con procedencia y resultados reproducibles.
- Casos RA 0/360, polos, nulos, límites y catálogo vacío.
- Posición a época de referencia y propagación de una fuente de alto movimiento propio; margen de búsqueda que no la excluya.
- WCS con rotación y escala conocidas, reproyección final, píxeles fuera del campo y origen cero.
- Matriz por objetivo: disponibilidad, fechas, canales comparables, flags, resultado y limitaciones. Sin afirmar detecciones por un dipolo simulado.

Etapa implementada: módulo Gaia, proyección WCS, pruebas y demo independiente. Siguiente etapa: acordar el contrato con el equipo e integrar los frames reales. No reemplazar el trabajo de los otros miembros durante esta fase de investigación.
