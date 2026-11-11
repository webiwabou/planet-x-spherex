# 🪐 NASA Space Apps Challenge 2026: Planet X and SPHEREx Guide

## 1. Misión SPHEREx (NASA / Caltech / JPL)
Desde mayo de 2025, el telescopio espacial **SPHEREx** (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) cartografía el cielo completo cada 6 meses en **102 bandas de luz en el infrarrojo cercano** ($0.75 - 5.0\ \mu\text{m}$).

### Reto Principal
Crear una herramienta web pública e interactiva que visualice las imágenes del cielo obtenidas por SPHEREx, permitiendo a cualquier persona (científicos ciudadanos, investigadores, estudiantes) detectar fácilmente cómo cambian las fuentes astronómicas a lo largo del tiempo.

---

## 2. Objetivos Astrofísicos y Objetos Clave
1. **Detección de Objetos en Movimiento Rápido:**
   - Asteroides cercanos a la Tierra (NEAs) y cometas.
   - Enanas marrones frías (Brown Dwarfs) de tipos T e Y.
   - Candidatos al esquivo **Planeta X** u objetos del cinturón de Kuiper / transneptunianos lejanos.
2. **Estrellas Variables y Transitorias:**
   - Oscilaciones periódicas (estrellas Mira) y eventos de ocultación por polvo protoplanetario (estrellas T Tauri).

---

## 3. Casos de Prueba Canónicos Requeridos por NASA
| Objeto | Categoría | RA (J2000) | Dec (J2000) | Movimiento Propio | Interés Científico |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **WISE 0855** | Enana marrón fría (Tipo Y) | `08h 55m 10.831s` | `-07d 14m 42.53s` | $8.15''/\text{año}$ | A ~2.2 pc, atmósfera a ~250 K con hielo de agua. Pico en bandas D5 y D6. |
| **Barnard's Star** | Enana roja tipo M | `17h 57m 48.5s` | `+04d 41m 36.1s` | $10.39''/\text{año}$ | Mayor movimiento propio del cielo. Salto de $5''$ entre encuestas semestrales. |
| **Epsilon Indi B** | Binaria de enanas marrones | `22h 03m 21.7s` | `-56d 47m 12.0s` | $4.70''/\text{año}$ | Par T1 + T6 orbitando una estrella K. Fuertes absorciones de metano ($1.66, 2.2, 3.3\ \mu\text{m}$). |
| **RW Aurigae** | Estrella variable T Tauri | `05h 09m 51.4s` | `+30d 24m 04.0s` | $0.02''/\text{año}$ | Caídas de brillo masivas por discos de polvo y flujos de marea. |
| **R Draconis** | Gigante variable tipo Mira | `16h 30m 14.9s` | `+66d 42m 15.0s` | $0.029''/\text{año}$ | Pulsación gigante con periodo de 245 días. Gran modulación de flujo en el infrarrojo. |

---

## 4. Capacidades Técnicas Implementadas
- **Comparador de Parpadeo Digital (Blink Comparator):** Alternancia rítmica ajustable entre épocas semestrales ($S1, S2, S3, S4$).
- **Sustracción de Imágenes en Tiempo Real ($\Delta I = I_2 - I_1$):** Visualización de dipolos azul/rojo para movimiento propio y monopoles para variabilidad estelar.
- **Espectrofotometría On-the-Fly (102 Bandas):** Desglose continuo en los 6 arrays detectores (D1: $0.75-1.11\,\mu\text{m}$ a D6: $4.42-5.00\,\mu\text{m}$) con detección de firmas de $\text{H}_2\text{O}, \text{CH}_4, \text{CO}_2, \text{CO}$.
- **Deep Linking y Estado en URL:** Acceso directo a coordenadas celestes mediante parámetros (`?ra=...&dec=...&fov=...`).
- **Modo Embebido (`/embed`):** Iframe liviano para plataformas de ciencia ciudadana como Zooniverse o Backyard Worlds.
- **Superposición de Catálogos Externos:** Integración visual de Gaia DR3 (vectores astrométricos) y banderas de contaminación (flags).
