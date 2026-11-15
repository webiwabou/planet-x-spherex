# Contrato propuesto del visor SPHEREx (M4-01)

Versión del contrato `1`, pendiente de revisión por el equipo. M1 produce observaciones y recortes, M2 produce frames comparables, M4 proyecta Gaia y M3 consume la serie. La ruta de frames disponible genera una vista preliminar a partir de observaciones seleccionadas.

## Región y rutas

| Método y ruta | Entrada | Respuesta |
| --- | --- | --- |
| `GET /api/spherex/observations` | `ra`, `dec`, `fov_arcmin` (por defecto 8), `limit` | `schema_version`, `region`, `observations`, `truncated`, `warnings` |
| `GET /api/spherex/observations/{observation_id}/cutout` | La misma región de la búsqueda | FITS multiextensión (`application/fits`), que M2 recibe junto con los metadatos de la observación |
| `GET /api/spherex/observations/{observation_id}/metadata` | La misma región de la búsqueda | Metadatos extraídos del FITS, incluidos el tiempo, WCS, unidades y espectro local |
| `POST /api/spherex/frames` | Región de 0.5′–12′, 1–6 `observation_ids` de la búsqueda, `detector_id`, `wavelength_um` y `bandwidth_um` positivas | `schema_version`, `region`, `width`, `height`, `wcs_header`, `display_limits_mjy_sr`, `frames` |
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

## Serie preliminar y cuadrícula (M2 → M3/M4)

- Cada frame contiene `frame_id`, `observation_time`, observaciones de origen con fechas, `effective_band_um`, `covered_pixels` y `preview`. Cuando no haya aportes compatibles, `frames` está vacío y los límites de visualización son `null`.
- El WCS es TAN norte arriba, este a la izquierda. Sus coordenadas de píxel usan origen cero. La serie aplica una escala lineal compartida en MJy/sr entre percentiles globales 2 y 98. `preview` contiene enteros de 0 a 255 en orden `[y,x]` aplanado, con −1 para píxeles sin contribución. Para un canvas con origen superior izquierdo, invertir filas y usar `y_canvas = height - 1 - y_px`.
- El procesamiento conserva en memoria intensidad, varianza estadística, cobertura por píxel y motivos de rechazo. Falta servir la descarga FITS procesada con estas capas, y la selección automática de observaciones aptas para la banda.

Ejemplo de búsqueda, con valores de entrada únicamente:

```text
GET /api/spherex/observations?ra=269.4520769586187&dec=4.69336496657667&fov_arcmin=8
```

La [demo de R Draconis](http://127.0.0.1:8000/api/spherex/demo) usa tres IDs reales y la ruta de proyección Gaia. Ver [validación](SPHEREX_VALIDATION.md#serie-de-r-draconis).

## Estados de respuesta

Una búsqueda exitosa sin coincidencias devuelve `200` con lista vacía. Un límite del archivo o del backend devuelve `200` con `truncated: true` y advertencia. Si una colección falla, la API devuelve un error con su nombre. Las rutas SPHEREx devuelven `422` con entradas inválidas, `404` si el recurso no aparece en una búsqueda completa, `409` si hay que reducir una búsqueda truncada antes de resolver el ID, `502` si el archivo devuelve datos inválidos, `503` cuando el servicio no esté disponible y `504` al agotar el tiempo de espera. El error de dominio en `detail` expone `code` y `message`.
