# Contrato propuesto del visor SPHEREx (M4-01)

Versión del contrato `1`, pendiente de revisión por el equipo. M1 produce observaciones y recortes, M2 produce frames comparables, M4 proyecta Gaia y M3 consume la serie. Están disponibles las rutas de observaciones, recortes, metadatos y proyección Gaia. La ruta de frames sigue propuesta.

## Región y rutas

| Método y ruta | Entrada | Respuesta |
| --- | --- | --- |
| `GET /api/spherex/observations` | `ra`, `dec`, `fov_arcmin` (por defecto 8), `limit` | `schema_version`, `region`, `observations`, `truncated`, `warnings` |
| `GET /api/spherex/observations/{observation_id}/cutout` | La misma región de la búsqueda | FITS multiextensión (`application/fits`), que M2 recibe junto con los metadatos de la observación |
| `GET /api/spherex/observations/{observation_id}/metadata` | La misma región de la búsqueda | Metadatos extraídos del FITS, incluidos el tiempo, WCS, unidades y espectro local |
| `GET /api/spherex/frames` | Región, `wavelength_um` y `bandwidth_um` positivas | `schema_version`, `region`, `band`, `grid`, `frames`, `display`, `truncated`, `warnings` |
| `POST /api/catalogues/gaia/project` | `frame_id`, `observation_time`, `width`, `height`, `wcs_header`, `sources` | Proyección al WCS final. Véase [contrato Gaia](MEMBER4_API.md#proyección-sobre-el-frame-final) |

`region` contiene `ra_deg`, `dec_deg` ICRS y `fov_arcmin`, ancho completo del cuadrado entre 0.5′ y 120′. RA admite grados `[0, 360)` u horas HMS `[0, 24)`. Dec admite grados `[-90, 90]` o DMS, con el signo aplicado a los tres componentes. Los campos pueden mezclar formatos. La ruta heredada `/api/coordinates/resolve` conserva su error HTTP 400. Las rutas nuevas usan 422. Para seleccionar candidatos, M1 consulta un círculo que cubre el cuadrado. El footprint final determina la cobertura efectiva.

## Observación y recorte (M1 → M2)

| Campo | Convención |
| --- | --- |
| `observation_id` | `obs_id` de SIA más el sufijo `/D1` a `/D6`. Una revisión de calibración de la misma adquisición no crea otra época |
| `release`, `processing_version`, `archive_id`, `access_url` | Versión y procedencia del producto exacto seleccionado. Preservar el ID original de IRSA y la URL del producto, y resolver el cutout del lado servidor por ID |
| `detector_id` | Entero 1–6 según el producto. Un detector LVF tiene respuesta espectral que depende del píxel |
| Tiempo | En búsqueda, `archive_start_mjd` y `archive_end_mjd` son valores del índice SIA. El endpoint de metadatos publica `time.start_utc`, `time.mid_utc`, `time.end_utc` del FITS, escala original y valores fuente |
| Información espectral | `center_wavelength_um` y `center_bandwidth_um` son muestras del centro geométrico del FITS. La selección fotométrica debe usar el WCS espectral por píxel |
| `warnings` | Lista de objetos `{code, message}` |

Conservar el FITS completo del recorte y sus dependencias WCS. Mantener `IMAGE`, `FLAGS`, `VARIANCE` y `WCS-WAVE` y leer el WCS espectral alternativo `W` con el HDUList abierto. Mantener `ZODI` y `EPSF` cuando el servicio los entregue. Leer las unidades de los headers y verificar la coherencia de superficie brillante y varianza. El [suplemento SPHEREx](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf) documenta el producto.

La caché de FITS incluye URL versionada y región normalizada. Solo se publica una entrada cuando terminó la descarga y pasó la comprobación estructural. `SPHEREX_CACHE_DIR` cambia su carpeta (por defecto `.cache/spherex`). Los recortes devuelven `X-Cache-Hit`. El cliente limita por colección la búsqueda a 2000 filas y su respuesta a 12 MB. Cada recorte se limita a 24 MB.

El agrupador de visitas usa el tiempo medio FITS. Ordena por UTC y apertura de cada grupo, con un intervalo máximo de 24 h entre el primer y el último midpoint. Este criterio operativo conserva por separado los recortes y sus longitudes de onda para que M2 determine su compatibilidad.

## Serie y cuadrícula (M2 → M3/M4)

- `band` declara `wavelength_um`, `bandwidth_um` y el criterio de compatibilidad aplicado. Cada frame conserva el rango espectral efectivo de sus aportes. Cuando no haya aportes compatibles, la serie queda vacía y explica el motivo.
- `grid` declara `width`, `height`, `wcs_header`, `pixel_origin: 0` y orientación norte arriba. El WCS celestial final se usa en todos los frames y debe poder reconstruirse desde el header sin tablas externas para la ruta Gaia actual.
- Cada elemento de `frames` lleva `frame_id`, `epoch_id`, `observation_ids`, `observation_time` (UTC, representativo del frame), intervalo temporal, detectores, `science_url`, `preview_url`, unidades y calidad. El ID identifica región, banda, cuadrícula, versiones de entrada y receta de procesamiento. Ordenar por fecha y usar `frame_id` como desempate.
- El FITS procesado lleva intensidad, varianza propagada cuando sea válida, footprint y máscara de calidad. Píxeles inválidos o sin datos se representan como NaN en ciencia y con cobertura o máscara explícita. En JSON los valores ausentes se representan por `null`. No interpretar incertidumbre desconocida como cero.
- `display` registra los límites, transformación y unidad compartidos por toda la serie. El PNG se sirve con píxeles inválidos transparentes. Si su fila cero corresponde a la última del FITS, usar `y_png = height - 1 - y_px`. La proyección Gaia recibe el WCS del FITS final y la fecha real de ese frame.

Ejemplo de búsqueda, con valores de entrada únicamente:

```text
GET /api/spherex/observations?ra=269.4520769586187&dec=4.69336496657667&fov_arcmin=8
GET /api/spherex/frames?ra=269.4520769586187&dec=4.69336496657667&fov_arcmin=8&wavelength_um=1.65&bandwidth_um=0.04
```

## Estados de respuesta

Una búsqueda exitosa sin coincidencias devuelve `200` con lista vacía. Un límite del archivo o del backend devuelve `200` con `truncated: true` y advertencia. Si una colección falla, la API devuelve un error con su nombre. Las rutas SPHEREx devuelven `422` con entradas inválidas, `404` si el recurso no aparece en una búsqueda completa, `409` si hay que reducir una búsqueda truncada antes de resolver el ID, `502` si el archivo devuelve datos inválidos, `503` cuando el servicio no esté disponible y `504` al agotar el tiempo de espera. El error de dominio en `detail` expone `code` y `message`.
