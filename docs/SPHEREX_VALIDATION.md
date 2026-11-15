# Evidencia SPHEREx en Windows

## M1-01 a M1-05

IRSA sirve las imágenes espectrales de nivel 2 de Survey 1/2 en `spherex_dr1` y las de Survey 3/4 en `spherex_qr3`. El cliente usa esas dos colecciones Wide. Existe una colección Deep por release. El cubo DR1 es un producto distinto y queda fuera del recorrido de exposiciones individuales. Consultar el [acceso a los datos](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/), los [releases](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-releases/) y el [notebook oficial de recortes](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/).

Se reprodujeron las consultas SIA2 del ejemplo de IRSA en formato VOTable para RA 127.69444°, Dec −39.17760° y radio 0.01°. La misma consulta pasó por el nuevo cliente con campo cuadrado de 0.848528137423857′ y devolvió 414 productos DR1 y 14 QR3, con 428 identidades distintas `obs_id/detector` y `truncated=false`. La versión del directorio se conserva para deduplicar revisiones. El intento TAP del notebook agotó 75 s sin datos y hubo respuestas transitorias HTTP 502/503 en SIA y recortes. Las cifras corresponden a las solicitudes SIA2 exitosas.

El cliente de recortes descargó ambos ejemplos de la misma consulta usando `center` y `size` en grados. Los FITS se verificaron con Astropy 8.0.2.

| Release | ID de observación | Fecha media UTC | Píxeles | Longitud de onda / ancho en el centro geométrico (µm) | Bytes |
| --- | --- | --- | --- | --- | --- |
| DR1 | `2025W17_4B_0127_1/D3` | 2025-04-25 14:01:23.604 | 8 × 8 | 2.383036 / 0.059892 | 4 037 760 |
| QR3 | `2026W21_1A_0480_1/D1` | 2026-05-21 03:28:18.064 | 8 × 8 | 0.965559 / 0.025216 | 3 954 240 |

Ambos contienen `PRIMARY`, `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`, `EPSF` y `WCS-WAVE`. Los headers indican `VERSION=7.0.5`, `TIMESYS=UTC`, intensidad en MJy/sr y varianza en (MJy/sr)². El cálculo espectral usa la tabla `WCS-WAVE` y el WCS alternativo `W` sin SIP. El WCS espacial conserva SIP. Los dos recortes de la tabla pertenecen a canales diferentes.

### Repetir la prueba

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir astro_engine --host 127.0.0.1 --port 8000
```

```powershell
$region = 'ra=127.69444&dec=-39.17760&fov_arcmin=0.848528137423857'
$base = 'http://127.0.0.1:8000/api/spherex/observations'
Invoke-RestMethod "${base}?${region}"
Invoke-RestMethod "$base/2025W17_4B_0127_1/D3/metadata?$region"
Invoke-WebRequest "$base/2025W17_4B_0127_1/D3/cutout?$region" -OutFile .cache/field-dr1.fits
```

Los ejemplos dependen de la disponibilidad de IRSA. Usar los IDs de la respuesta actual para descargar. En una consulta válida sin coincidencias, `observations` queda vacío. Una respuesta de error de archivo no se toma como campo vacío.

## Cinco campos del reto

Búsqueda Wide con campo de 8′. Barnard usa el centro propagado de la revisión M4-03 para la búsqueda. Los otros campos usan los centros registrados en `resources/gaia/targets.json`. Se tomó hasta un recorte validado por release y campo. Los conteos SIA son candidatos geométricos de todas las longitudes de onda.

| Campo | Candidatos SIA | Muestra DR1: observación, fecha UTC, λ central (µm) | Muestra QR3: observación, fecha UTC, λ central (µm) |
| --- | ---: | --- | --- |
| Barnard | 401 | `2025W33_2C_0321_1/D3`, 2025-08-15, 2.30825 | Candidatos devueltos. No hubo recorte validado en los primeros tres intentos |
| Epsilon Indi B | 496 | `2025W17_4B_0017_1/D2`, 2025-04-24, 1.55596 | `2026W39_1A_0276_1/D6`, 2026-09-22, 4.49692 |
| WISE 0855 | 301 | `2025W19_1B_0116_1/D3`, 2025-05-05, 2.36505 | Cero coincidencias QR3 para esta consulta |
| RW Aurigae | 386 | `2025W36_1A_0095_1/D1`, 2025-09-01, 1.06833 | `2026W36_1A_0476_1/D1`, 2026-09-02, 0.98171 |
| R Draconis | 598 | `2025W20_2D_0243_2/D3`, 2025-05-16, 1.69311 | `2026W20_2A_0294_2/D3`, 2026-05-16, 1.64543 |

Las ocho descargas pasaron la validación de extensiones y se recuperaron en la siguiente llamada desde la caché local. Todas eran 78 × 78 píxeles, versión 7.0.5. El detalle local está en `.cache/irsa-check/targets-spherex.json`. La selección de estos ejemplos valida adquisición por campo. La cobertura del objetivo, los flags útiles y la existencia de canales comparables se evalúan en procesamiento.

FastAPI devolvió HTTP 200 para búsqueda, metadatos y recorte de Epsilon Indi B con `2025W17_4B_0017_1/D2`. La ruta de descarga devolvió `X-Cache-Hit: true` y 4 046 400 bytes. `/health`, `/catalogues/demo` y el ejemplo Gaia guardado devolvieron HTTP 200.

## Gaia en Windows

Se preparó Python 3.11.9 con Astropy 8.0.2, FastAPI 0.163.0 y HTTPX 0.28.1. Se repitieron las cinco consultas reales al TAP Gaia y todas devolvieron 200 fuentes con truncamiento. Sus conteos proyectados en la cuadrícula de la demo fueron 200, 137, 148, 200 y 104 en el orden de [los cinco centros](../resources/gaia/targets.json). Se guardaron en `.cache/gaia-check/`. Para Barnard y Epsilon Indi B se consultó además por identificador y se [comparó la posición propagada con el centro del campo](MEMBER4_API.md#m4-03-comprobación-de-centros-para-objetivos-rápidos).

La suite de Windows aprobó 57 pruebas con `python -m pytest astro_engine/tests -q`. Usa datos de prueba para validar la API y los estados del archivo. Los resultados IRSA y ESA de arriba se obtuvieron en solicitudes reales independientes.

## Serie de R Draconis

Las imágenes DR1 y QR3 se leen con sus arrays de intensidad, varianza y banderas y con el WCS espacial y espectral. La reproyección usa el píxel nativo más cercano en una cuadrícula TAN norte arriba. Esta elección conserva el valor de superficie brillante y la varianza del píxel elegido. Puede duplicar muestras y no modela covarianza de píxeles ni conservación de flujo integrado. En los recortes de 8 × 8 de la prueba IRSA, el grid de 9 × 9 conservó 67 píxeles válidos DR1 y 64 QR3. El mayor desplazamiento por muestreo fue 3.89″ y 4.28″, respectivamente.

Se dejan pasar los píxeles sin banderas o con el bit SOURCE (21) exclusivamente. Los demás bits de instrumento, valores no finitos, varianza no positiva y ausencia de cobertura producen marcas separadas en la máscara. Véanse las [banderas del visor de IRSA](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html) y la tabla 16 del [suplemento SPHEREx](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf).

El procesamiento agrupa visitas por cada periodo de hasta 24 h. Dentro de una visita combina por varianza inversa los píxeles del detector seleccionado y una única versión del pipeline, cuando el solapamiento nominal entre el intervalo LVF nativo y el pedido es al menos 85% del ancho mayor. Se conserva la cobertura efectiva. Los percentiles 2 y 98 se calculan juntos para todos los frames. El solapamiento de intervalos y la reproyección son criterios para el blink preliminar. Quedan por validar respuesta espectral, PSF, fondo y errores sistemáticos para mediciones de variabilidad.

Prueba de extremo a extremo por FastAPI para R Draconis, D3, centro 1.720 µm, ancho 0.042 µm, campo 8′. El WCS final de 79 × 79 píxeles se usó para proyectar Gaia a cada fecha. La escala común fue 0.213151 a 15.214818 MJy/sr.

| Observación real | Release | Fecha media UTC | Píxeles válidos | Fuentes Gaia dentro del WCS |
| --- | --- | --- | ---: | ---: |
| `2025W52_2A_0161_4/D3` | DR1 | 2025-12-26 05:19:15.204 | 2544 | 104 |
| `2026W20_2A_0294_4/D3` | QR3 | 2026-05-16 08:49:02.889 | 2648 | 104 |
| `2026W24_1A_0125_2/D3` | QR3 | 2026-06-08 13:57:53.767 | 429 | 104 |

El catálogo se truncó a 300 fuentes por consulta. Una fuente proyectada dentro del WCS puede caer en un píxel sin cobertura. Cada frame de esta serie recibió una exposición. La prueba automatizada independiente cubre la combinación de más de una exposición en la misma visita.

Ejecutar Uvicorn con el comando anterior y abrir `http://127.0.0.1:8000/api/spherex/demo`. Pulsar **Cargar serie** y **Mostrar Gaia**. La demo necesita conexión a IRSA y ESA. Usa los IDs específicos de la tabla, que pueden cambiar si el archivo retira o reprocesa productos.

Chrome en un viewport de 390 × 844 verificó carga real, navegación anterior/siguiente, reproducción y pausa, proyección Gaia, datos dibujados en canvas y ausencia de errores JavaScript o desbordamiento horizontal. La captura de Windows quedó en `.cache/irsa-check/r-draconis-blink.png`. La suite final aprobó 60 pruebas.

## Preparación de despliegue

```powershell
docker build -t planet-x-spherex .
docker run --rm -p 8000:8000 planet-x-spherex
```

El contenedor propone Uvicorn en el puerto 8000, un usuario sin privilegios y `/health` como comprobación de vida. Las variables `GAIA_CACHE_DIR` y `SPHEREX_CACHE_DIR` permiten montar rutas persistentes. Configurar salida HTTPS hacia IRSA y ESA, almacenamiento con cuota y un timeout de proxy compatible con consultas y descargas remotas. Este equipo Windows no tenía Docker disponible para construir la imagen. El servidor y los endpoints se comprobaron con Python local. Falta un entorno de hosting apto para este backend y una prueba de la imagen antes de publicar una URL.
