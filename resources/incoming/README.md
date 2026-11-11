# 📥 Carpeta de Recursos Entrantes (SPHEREx Knowledge Base)

Este directorio está especialmente preparado para recibir los documentos, datos y manuales técnicos que subas para retroalimentar la memoria persistente del agente y el pipeline astrofísico.

---

## 📂 Tipos de Recursos Soportados:
1. **Documentación Técnica & Papers:**
   - Manuales de usuario del SPHEREx Science Data Center (SSDC / IPAC / IRSA).
   - Especificaciones de los filtros variables lineales (LVF) y curvas de transmisión cuántica.
   - Whitepapers sobre detección de Objetos Transneptunianos (TNOs), Brown Dwarfs y estrellas variables.
2. **Archivos FITS y Muestras de Imagen:**
   - Cutouts FITS de prueba de Level 2 o Level 3.
   - Headers WCS con metadatos de calibración fotométrica.
3. **Tablas de Calibración & Catálogos (CSV / Parquet / VOTable):**
   - Coordenadas y épocas de candidatos adicionales.
   - Curvas de luz infrarrojas y tablas espectrales.

---

## ⚡ Flujo de Procesamiento Automático
Al depositar tus archivos en este directorio o en la raíz de `resources/`:
1. El agente procesará los textos, tablas y diagramas mediante las skills `markitdown` y `spherex-astrophysics-data-pipeline`.
2. Se actualizarán las notas de memoria persistente en `references/SPHEREx_Data_Model_Notes.md` y los archivos de configuración en `src/lib/`.
3. Los nuevos datos quedarán disponibles de inmediato en la aplicación web y en el motor astrofísico.
