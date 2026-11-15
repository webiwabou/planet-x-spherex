# Contexto para continuar en Windows — Planet-X / SPHEREx

Actualizado: 2026-11-15. Leer este archivo primero y después [el seguimiento de tareas de Notion](docs/NOTION_TASK_TRACKER.md). Este documento transfiere el contexto del agente de Linux al agente de Windows; el cambio de equipo no reinicia el proyecto.

## Instrucciones vigentes del usuario

El usuario es **Member 4: catálogos astronómicos, integración y despliegue**. Ya dio visto bueno para continuar paso a paso con los módulos y autorizó hacer push a su fork.

Sus instrucciones más recientes son:

> Ya tengo visto verde, continua nomas, paso por paso con todos los módulos.
>
> No te metas mucho en el frontend: solo haz lo necesario para que sean visibles los cambios en el backend. Avanza sobre todo backend y despliegue, mi parte. Quiero dejar trabajo para el resto del equipo.
>
> Importante que los avances se hagan de acuerdo a los pasos del Notion, de los tasks que tiene cada miembro; de esa forma puedo saber qué ya está y qué falta.

Reglas de continuación:

1. **Notion marca el orden y las unidades de trabajo.** Relacionar cada cambio con una tarea concreta del tablero y respetar sus dependencias. El seguimiento local está en `docs/NOTION_TASK_TRACKER.md`.
2. Priorizar M4 y las dependencias backend de M1/M2 necesarias para integrar. El visto bueno permite avanzar estas piezas; mantener sus nombres y responsabilidades, coordinar mediante contratos y revisar primero lo que hayan subido los otros miembros.
3. Limitar M3 a la conexión y visualización mínima que permita comprobar el backend. Conservar el frontend del equipo y dejarle sus mejoras de diseño, interacción y presentación.
4. No pedir otra confirmación para cada paso ya autorizado. Implementar, verificar, actualizar seguimiento, hacer commit y push a `origin`. No sobrescribir cambios ajenos ni hacer force-push.
5. Informar con este formato: **miembro y tarea → qué cambió → evidencia → qué falta → siguiente tarea de Notion**. Si hay un bloqueo real, indicar exactamente qué falta; continuar con tareas independientes que estén listas.
6. No marcar una tarea Done porque exista un mock, un botón o una prueba que no cubra su objetivo real. Distinguir avance parcial, validación científica y prueba end-to-end.
7. Después de cada avance actualizar el tracker y este contexto cuando cambien contratos, comandos, despliegue o decisiones. No crear un plan alternativo que oculte las tareas de Notion.

La tarea inmediata de esta sesión de traspaso es dejar estas instrucciones y el estado comprobado en Markdown, y subirlo al fork. La siguiente sesión en Windows continuará la implementación siguiendo el tracker. En esta sesión documental no se han implementado nuevos módulos científicos ni un despliegue.

## Repositorios y estado de partida

- Fork del usuario, privado: https://github.com/pedrochgdev/planet-x-spherex
- Repositorio del equipo, privado: https://github.com/mrtorture-dev/planet-x-spherex
- Rama de trabajo: `main` del fork. `origin` debe ser el fork; `upstream`, el repositorio del equipo.
- Commit funcional existente: `12cee9e2442771d32415b41da696e804457fe293` — `feat: add Member 4 Gaia catalogue service and standalone demo`.
- Verificación remota al preparar este contexto: `origin/main` estaba en ese commit y `upstream/main` en `8273e06761113c2e257a545cc52396a4208b239d` (base inicial). Reconsultar al retomar, porque los compañeros pueden haber avanzado.
- El commit de documentación que contiene este archivo será posterior al commit funcional indicado. No volver a un SHA anterior para empezar.
- Carpeta anterior en Linux: `/home/drocho/Github/Nasa/planet-x-spherex`. En Windows usar la carpeta elegida allí; no conservar rutas absolutas de Linux.

No crear un fork nuevo. No subir directamente al repositorio del equipo ni fusionar upstream a ciegas. El usuario autorizó los pushes a su fork; si hace falta compartir cambios con el equipo, preparar una integración revisable.

## Qué estamos construyendo

Herramienta web pública para explorar observaciones **reales SPHEREx**, introducir RA/Dec y campo de visión, y comparar imágenes cronológicas mediante blink. El reto propone estudiar Barnard’s Star, Epsilon Indi B, WISE 0855, RW Aurigae y R Draconis.

Mínimo del proyecto: coordenadas, consulta y cutouts reales, alineación WCS, selección espectral comparable, reproducción temporal, metadatos y calidad, cinco objetivos y URL pública. La resta y las combinaciones multibanda son extensiones científicas previstas; espectros y curvas de luz requieren fotometría calibrada válida. Gaia aporta contexto y movimiento propio. WISE sigue opcional.

No reinterpretar el nombre Planet-X como evidencia de descubrimiento de un planeta. No presentar espectros, diferencias o imágenes sintéticas como mediciones de la misión.

## Fuentes y reparto que debe conservar el siguiente agente

SPHEREx observa en 102 bandas de infrarrojo cercano y el reto plantea comparar cobertura temporal del cielo. Las fechas, releases disponibles, estructura FITS, WCS espectral y flags deben verificarse en fuentes oficiales al implementar; no tratarlos como constantes garantizadas por el prototipo.

- SPHEREx / IRSA: https://irsa.ipac.caltech.edu/Missions/spherex.html
- Tutoriales oficiales: https://caltech-ipac.github.io/irsa-tutorials/spherex/
- Inspiración WiseView: http://byw.tools/wiseview
- Gaia: https://archive.stsci.edu/missions-and-data/gaia y las referencias ESA del contrato existente.
- Recursos opcionales NEOSSat/CADC del enunciado: https://www.asc-csa.gc.ca/eng/satellites/neossat/ , https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/ , https://github.com/asc-csa/NEOSSAT_Tutorial , https://data.asc-csa.gc.ca/dataset/neossat . No convertirlos en dependencias obligatorias ni desplazar SPHEREx.

M1 es responsable de recuperación real, coordenadas, DR1/QR3, cutouts, metadatos, cronología, caché y API. M2, de lectura FITS, WCS/reproyección, calidad, comparabilidad de longitudes de onda, resta, combinaciones multibanda y normalización. M3, del sitio y sus interacciones, controles, metadatos y visualización de overlays. M4, del catálogo Gaia, movimiento/épocas, conversión a píxeles, contratos, integración, pruebas completas, despliegue y demostración.

El reparto original incluye resta científicamente válida y multibanda; espectros medidos y curvas de luz son ampliaciones cuando haya fotometría válida. También se propusieron consultas por URL/embebidos y WISE opcional. Mantenerlo como alcance pendiente, asociado a tareas de Notion cuando existan; no darlo por terminado por el espectro sintético o el canvas heredados.

## Implementación existente comprobada

El commit `12cee9e` ya está en el fork. Añadió:

| Componente | Archivo/evidencia | Alcance real |
| --- | --- | --- |
| Consulta Gaia DR3 | `astro_engine/catalogue.py` | TAP oficial ESA, HTTPX y lectura VOTable con Astropy; sin autenticación |
| Propagación temporal | `propagate` en ese módulo | ICRS, época por fuente, `pm_ra_cosdec`; maneja nulos y advertencias |
| Proyección WCS | `project_sources` | WCS celestial final, rotación y SIP, píxeles origen cero y `in_frame` |
| API de catálogos | `astro_engine/catalogue_routes.py` | Router integrado en FastAPI, validación y errores |
| Caché | `GaiaCatalogue` | JSON local, TTL 24 h, clave por parámetros/versión; `.cache/gaia` ignorada por Git |
| Demo independiente | `astro_engine/catalogue_demo.html` | Consulta, selector de objetivos, mapa de catálogo, tabla y descarga JSON |
| Ejemplos reales | `resources/gaia/samples/` | Cinco consultas Gaia guardadas, hasta 200 fuentes por campo, todas truncadas |
| Centros de búsqueda | `resources/gaia/targets.json` | Procedencia CDS/SIMBAD; WISE 0855 conserva las coordenadas del enunciado |
| Pruebas y capturas | `astro_engine/tests/`, `resources/gaia/browser-checks.json` | Ver detalle en `docs/MEMBER4_VALIDATION.md` |

Endpoints existentes:

- `GET /api/catalogues/gaia`
- `POST /api/catalogues/gaia/project`
- `GET /api/catalogues/targets`
- `GET /api/catalogues/gaia/demo`
- `GET /api/catalogues/gaia/example`
- `GET /catalogues/demo`
- `GET /health`; contratos interactivos en `/docs` y `/openapi.json`.

El contrato implementado corresponde a Gaia y su proyección. **Todavía falta el contrato completo de observaciones, procesamiento y reproducción**, y su integración entre los miembros. Consultar [MEMBER4_API.md](docs/MEMBER4_API.md), [investigación](docs/MEMBER4_RESEARCH.md) y [validación](docs/MEMBER4_VALIDATION.md).

### Evidencia de validación anterior

- Linux: 37 pruebas aprobadas (8 heredadas y 29 casos nuevos), Python 3.13, Astropy 8.0.2, FastAPI 0.163.0, HTTPX 0.28.1.
- Consultas reales a los cinco **campos Gaia**, no pruebas SPHEREx end-to-end ni identificaciones automáticas de los objetivos.
- Consulta Gaia adicional sin truncamiento: RA 269.4520769586187°, Dec 4.69336496657667°, campo 0.5 arcmin, fecha 2026-01-01 UTC y límite 5000 → 575 fuentes en el círculo ampliado. Repetición con `cache_hit=true`.
- Chromium: escritorio y móvil, selección por teclado, descarga, estados vacío/error y limpieza de datos anteriores, sin errores JavaScript ni desbordamiento horizontal.
- Estas son verificaciones históricas del 14 de noviembre. Volver a ejecutar las pertinentes en Windows; no afirmar que Windows ya fue validado.

## Limitaciones y trabajo pendiente que no se debe perder

1. El visor original `src/components/SkyCanvas.tsx` dibuja estrellas, movimientos y flags simulados. Los espectros de `pipeline.py` y del endpoint Next.js son sintéticos.
2. El checkout inicial no incluye `src/lib/astronomy` ni `src/lib/spherex-bands`, aunque se importan en varios componentes. No afirmar que Next.js compila. Solucionar lo estrictamente necesario si bloquea una tarea de integración.
3. No están implementadas la recuperación real SPHEREx, las series FITS, la alineación/reproyección científica, las máscaras instrumentales, los stacks calibrados ni su integración con Gaia y el visor.
4. La resta heredada opera sobre arrays y clasifica por umbrales; no resuelve PSF, unidades, fondo, varianza ni comparación espectral. No es validación de cambios astronómicos.
5. El modelo Gaia es de movimiento propio angular uniforme: no aplica paralaje anual dependiente del observador, velocidad radial ni órbitas/aceleraciones. No invertir paralajes nulas/negativas como distancias.
6. El círculo de consulta se amplía con un límite de movimiento de 15000 mas/año desde J2016.0. Los resultados pueden truncarse. No garantizar cobertura completa ni presencia de una contraparte infrarroja en Gaia.
7. Los centros devueltos por CDS no aportan época astrométrica en la respuesta guardada. Son centros de búsqueda, no posiciones del objetivo propagadas a una fecha. Verificar época y FOV para objetivos rápidos: una posición antigua puede dejar el objetivo fuera de campo.
8. Los presets heredados de `.agents/.../canonical_targets.json` tienen diferencias importantes para Epsilon Indi B, RW Aurigae y R Draconis. Los centros verificados están en `resources/gaia/targets.json`; no copiar movimientos propios o épocas sin procedencia.
9. La proyección header-only admite SIP, pero rechaza distorsiones por lookup tables. Conservar el HDUList y acordar un adaptador si los FITS reales lo necesitan; no borrar distorsiones para pasar validación.
10. La demo usa un fondo WCS TAN de prueba, no una imagen SPHEREx. Su ejemplo guardado es un subconjunto limitado de catálogo. No confundirlo con una prueba de los cinco objetivos del reto.
11. No existe un despliegue público comprobado, configuración de hosting ni pipeline CI/CD. Un proceso en localhost de Linux no estará disponible después de cambiar a Windows.
12. Las capturas de Notion marcan las tres primeras filas de M4 como Done. Respetar ese estado reportado sin confundirlo con evidencia de contrato global cerrado o efemérides completas de los cinco objetivos. El tracker detalla las diferencias.

## Preparar Windows (PowerShell)

Se necesita Git, una instalación Python compatible y autenticación para el repositorio privado. GitHub CLI es una opción; usar la autenticación existente si ya está configurada. No copiar tokens en archivos ni commits.

```powershell
# Solo si hace falta autenticar GitHub CLI:
gh auth login

# Clonar el fork existente; no volver a hacer fork.
gh repo clone pedrochgdev/planet-x-spherex
Set-Location planet-x-spherex
git remote -v
# Solo si falta el remoto upstream:
git remote add upstream https://github.com/mrtorture-dev/planet-x-spherex.git

git status --short
git fetch origin
git fetch upstream
git log --oneline -5
```

Si el repositorio ya está clonado, entrar en su carpeta y revisar diferencias antes de sincronizar. No ejecutar `reset --hard` para adaptarlo a este documento.

```powershell
# Python 3.13 fue la versión comprobada en Linux; revisar versiones con py -0p.
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r astro_engine/requirements.txt
.\.venv\Scripts\python.exe -m pytest astro_engine/tests -q
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir astro_engine --host 127.0.0.1 --port 8000
```

Usar directamente el ejecutable del entorno evita depender de la política de ejecución de `Activate.ps1`. Si Python 3.13 no está instalado, seleccionar una versión compatible con las dependencias y registrar el entorno realmente probado; no dar por comprobadas otras versiones.

Abrir http://localhost:8000/catalogues/demo y pulsar **Ver ejemplo guardado**. Swagger: http://localhost:8000/docs. No hace falta levantar Next.js para ver este avance.

En otra consola PowerShell, desde la raíz del repo:

```powershell
# Red real; el script devuelve código 1 si falla algún campo.
.\.venv\Scripts\python.exe astro_engine/catalogue_sample.py --output .cache/gaia-check

# Revisión visual opcional:
.\.venv\Scripts\python.exe -m pip install playwright
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe astro_engine/tests/catalogue_browser_smoke.py --output .cache/browser-check
```

Los outputs temporales anteriores no sobrescriben la evidencia guardada del commit funcional. La prueba visual necesita el servidor activo. No copiar `.venv`, `node_modules`, `.cache`, procesos ni rutas de Chromium de Linux a Windows. Los archivos FITS grandes no se versionan por defecto.

## Primera sesión de implementación en Windows

1. Leer el tracker y revisar si `upstream` tiene avances nuevos de compañeros. Verificar el backend existente en Windows.
2. Registrar en el tracker qué tarea de Notion se aborda. Resolver primero los puntos pendientes de **M4-01: contrato entre módulos**, usando los contratos Gaia existentes y definiendo observaciones/frames, procesamiento, errores, unidades y procedencia. Revisar **M4-03** para precisar qué propagación está cubierta y qué falta para los objetivos rápidos.
3. Seguir las dependencias de **M4-04**: avanzar las tareas de M1 en su orden, luego M2 y finalmente la conexión mínima de M3. El detalle y los criterios están en el tracker. No comenzar por una tarea posterior que depende de datos inexistentes.
4. Cada módulo backend puede verificarse de forma aislada y exponerse mediante API/demo mínima. Mantener separados datos reales, fixtures y simulaciones, y publicar contratos consumibles por el equipo.
5. Cuando el backend permita un recorrido real, preparar configuración de despliegue, variables documentadas, comprobación de salud y reproducción de tests. Para hosting, comprobar servicios/cuentas disponibles y la idoneidad para Python, FITS, caché y tiempos de consulta; no inventar un proveedor elegido, una URL o credenciales. No contratar servicios de pago sin autorización de gasto.
6. Continuar **M4-05/06/07** según las dependencias del tablero: publicar un resultado honesto, probar el sistema completo y preparar demostración/materiales. Distinguir un despliegue técnico del backend de la entrega final del visor público.
7. Hacer commits revisables y push a `origin`. Cerrar cada avance con tarea de Notion, pruebas/evidencia, pendientes y siguiente paso. Si una decisión depende realmente de otra persona, señalar esa dependencia concreta y avanzar lo independiente.

## Cómo mantener el seguimiento

Las capturas del usuario están versionadas en `docs/handoff/`. No existe una conexión de escritura a Notion configurada en este repo. **Actualizar el Markdown no actualiza automáticamente Notion**: informar qué filas puede actualizar el usuario. No afirmar haber editado Notion sin hacerlo realmente.

Los identificadores `M1-01`, etc., son referencias locales estables al orden de las filas, no IDs SPX inventados. Mantener el nombre de cada tarea y añadir su ID real de Notion cuando se disponga de él. Al trabajar en varios módulos, agrupar el informe por miembro para que el usuario pueda reconocer su tablero.
