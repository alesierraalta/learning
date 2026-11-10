# Estándar Audiovisual Obligatorio: Videos MP4 Educativos (Estilo Distill Paper White)

Este estándar rige la creación de explicaciones en video MP4 para las sesiones de estudio en Obsidian. Garantiza máxima retención, mínima fatiga visual y sincronización fiable entre narración y diagramas.

**Base de investigación**: principios de aprendizaje multimedia de Mayer (coherencia, señalización, redundancia, contigüidad espacial y temporal, segmentación, pre-entrenamiento, modalidad, personalización, voz, imagen) y el contrato de composición de la skill `2d-animation-composition` (cargarla antes de renderizar: `adapters/distill.md` + `references/{hierarchy,layout,text-and-icons,staging-and-timing,visual-qa}.md`).

---

## 0. Principios cognitivos → reglas operativas

| Principio (Mayer) | Regla operativa en video |
|---|---|
| **Coherencia** | Nada que no enseñe: sin música por defecto, sin logos, sin decoración, sin meta-texto. |
| **Señalización** | El foco se marca con contraste, posición y movimiento (spotlight); no con flechas ni colores extra. |
| **Redundancia** | Prohibido duplicar la narración en pantalla: sin subtítulos quemados, sin párrafos espejo. |
| **Contigüidad espacial** | Cada etiqueta vive junto al elemento que describe (misma tarjeta, misma fila). |
| **Contigüidad temporal** | El elemento aparece cuando la voz lo nombra y se asienta con la palabra, no después. |
| **Segmentación** | Micro-beats de 10–25 s con pausa de 0.4 s entre beats; el video se puede consumir por partes. |
| **Pre-entrenamiento** | Los términos clave (PK, FK, `ORA-XXXXX`) se nombran antes de usarlos en la simulación. |
| **Modalidad** | La explicación va en audio; la pantalla muestra la simulación, no el guion. |
| **Personalización** | Guion conversacional («imagina que…»), no lectura académica. |
| **Voz** | Voz neural humana en español neutro, ritmo natural. |
| **Imagen** | Sin cara del instructor. |
| **Actividad generativa** | Cierre con regla mnemotécnica y llamado al mini-quiz de la parte. |

Fuentes: Mayer, R. E. *Multimedia Learning* (3.ª ed.); Mayer & Fiorella, *Principles for Reducing Extraneous Processing*; Mayer, «Evidence-based principles for how to design effective instructional videos» (JARM, 2021).

---

## 1. Filosofía de Diseño: Distill Academic Paper White

Inspirado en el estándar de publicaciones científicas de *Distill.pub*:

1. **Lienzo Blanco Papel Puro (`#ffffff`)**:
   - Fondo blanco limpio sin texturas ruidosas ni degradados oscuros de arcade.
   - Proporciona descanso visual, máxima legibilidad y lectura natural como en un libro técnico o paper de investigación.
2. **Paleta Sobria de Grado Editorial**:
   - **Tinta principal (Charcoal)**: `#0f172a` (alta legibilidad y contraste nítido).
   - **Texto secundario (Slate)**: `#334155`–`#475569` para anotaciones legibles; `#64748b` para metadatos.
   - **Contenedores y tarjetas**: Fondo `#f8fafc` (Slate 50) con bordes ultra-finos `#e2e8f0` (Slate 200).
   - **Acentos semánticos limpios**:
     - *Cobalto* (`#2563eb`): Señales primarias, títulos y tablas maestras.
     - *Esmeralda* (`#059669`): Claves foráneas válidas, autorizaciones y verificaciones exitosas.
     - *Ámbar* (`#d97706`): Claves primarias, llamadas de atención y advertencias.
     - *Carmesí* (`#dc2626`): Excepciones, bloqueos del motor (`ORA-XXXXX`), tuplas huérfanas y errores.
     - *Púrpura* (`#7c3aed`): Desvinculaciones (`SET NULL`).
   - Prohibido el gris lavado (`#94a3b8`) en texto que deba leerse: solo para elementos decorativos o deshabilitados.

---

## 2. Principio «Show, Don't Duplicate the Speaker»

- **La pantalla no es un teleprompter**: Se prohíbe terminantemente colocar párrafos o definiciones largas que repitan lo que el locutor está pronunciando.
- **El guion vive en el audio; la pantalla vive en la simulación**: Tablas mínimas, esquemas entidad-relación, cables de validación, árboles dicotómicos y estados paso a paso (`T0`, `T1`, `T2`).
- **Cero meta-comentarios**: Jamás incluir textos en pantalla que hablen de las reglas visuales o del formato (ej. *"Foco único: Solo tenemos a López en pantalla"*). Todo elemento debe ser 100% contenido técnico evaluable para el estudiante.
- **Mostrar el objeto, no rotularlo (regla dura, 2026-10-25)**: una caja con la frase que dice la voz («Segundo truco», «Hasta ahora», «Menos error») son subtítulos bonitos, no un visual; la persona lo rechazó como «pura basura». Cada escena dibuja **la cosa de la que se habla**: los pesos como matriz de números, un bit como casillas 0/1, la memoria como un contenedor que se desborda, cuantizar como una recta con escalones y un punto que cae al más cercano, una rotación como red de mezcla con signos y barras antes/después, un trellis como red de estados con el camino iluminado, una arquitectura como componentes reales con sus conexiones. Los números del ejemplo se calculan y se ven. Prueba antes de renderizar: tapar el audio y mirar el último fotograma de cada bloque; si solo hay frases en cajas, el bloque no está hecho. El motor `html_diagram` admite `shapes` (rect, circ, line, path, txt) con `mv` (mover en un cue), `hl` (cambiar color en un cue) y `until` (retirar en un cue): ver `learnings-video-runs/exl3/beats_def.py` como referencia.

---

## 3. Un Solo Foco por Beat: Jerarquía y Spotlight

- **Descomposición en micro-beats secuenciales**: Dividir cada parte en 7 a 10 micro-escenas atómicas de 10 a 25 segundos cada una.
- **Jerarquía máxima de 3 niveles**:
  - `P1`: sujeto focal / resultado / decisión activa (domina por tamaño, contraste o posición).
  - `P2`: información de soporte (etiquetas contextuales, métricas, líneas de conexión).
  - `P3`: contexto / decoración (contenedores, fondos, bordes).
  - Si un beat exige un `P4`, **no se inventan más niveles**: se divide en beats secuenciales.
- **Spotlight teatral (regla dura)**: cuando entra el siguiente sujeto, se **atenúa el anterior** con una transición suave (~0.4 s) a 0.60–0.70 de opacidad; lo secundario nunca compite con el héroe del momento.
- **Un solo cambio semántico por beat**: secuenciar `sujeto → acción → consecuencia`; nunca disparar cambios simultáneos de sujetos independientes.
- **Prohibido saturar con múltiples elementos al inicio**:
  - *Incorrecto*: Mostrar la tabla `EMPLOYEE` y la tabla `DEPARTMENT` simultáneamente mientras la voz habla de un nuevo empleado.
  - *Correcto*:
    1. Beat 1: Solo la ficha del nuevo empleado en el centro.
    2. Beat 2: La ficha se atenúa a un lado y entra la tabla maestra para buscar la clave.
    3. Beat 3: Si no existe, se muestra la tupla huérfana y la consecuencia en el balance del negocio.
- **Presupuesto de movimiento**: 1 solo sujeto principal en movimiento; máximo 5 elementos moviéndose a la vez; en escenas complejas ≤1/3 del total. El resto permanece anclado y estable.

---

## 4. Contrato Espacial y Tipográfico

- **Área segura**: margen ≥5% del lienzo (≥96 px en 1920×1080); reservar el 12% inferior para la barra del reproductor. Todo texto crítico dentro del área segura.
- **Capas semánticas**: `L0` fondo · `L1` entorno · `L2` sujeto (`P1`) · `L3` soporte (`P2`) · `L4` etiquetas · `L5` subtítulos (solo si se piden) · `L6` overlays.
- **Espaciado y bordes**: `gap_between_groups ≥ 2 × gap_inside_group`; padding interno ≥14 px; ningún texto toca ni cruza un borde.
- **Medir antes de dibujar**: calcular el ancho real del texto y envolver o acortar la copia antes de reducir la fuente. **Nunca reducir la fuente para encajar**: se reorganiza el layout.
- **Escala tipográfica en 1080p** (mínimos de legibilidad a distancia de móvil/escritorio):
  - Título de beat: 36–40 px bold.
  - Título de tarjeta: 26–28 px bold.
  - Cuerpo y mono: 24–26 px.
  - Badges/etiquetas: 18–20 px bold.
- **Anti-vacío**: el contenido articulado ocupa 60–75% del área segura; prohibido dejar cajas gigantes con un texto huérfano o "cajas en el desierto".

---

## 5. Texto en Pantalla: Presupuesto de Lectura

- **Presupuesto de lectura**: `max(0.8, palabras / 3.5)` segundos (+0.3 s si contiene números). Techo de lectura: ~3 palabras/s (≤17 caracteres/s en subtítulos).
- **Ciclo de vida obligatorio**: `ENTER (0.2–0.6 s) → SETTLE → HOLD (presupuesto de lectura, completamente quieto) → EXIT (solo si hace falta)`.
- **Durante el HOLD no hay movimiento**: prohibido escalar, agitar o desplazar el texto que se está leyendo.
- **Nunca animar propiedades de reflujo** (`font-size`, `width`, `letter-spacing`): solo opacidad y traslaciones de 16–40 px.
- **Texto que aporta algo que la voz no dice** (diagrama, código, tabla): mantenerlo ≥1.5–2.5 s asentado antes de retirarlo o cambiarlo.

---

## 6. Sincronización con la Narración (por palabra, honesta)

Cada elemento gráfico debe aparecer en pantalla **cuando la voz lo pronuncia**. El pipeline v5 graba la voz con `edge-tts` pidiendo los eventos `WordBoundary`, así que conoce el instante de **cada palabra** (`audio/<id>.words.json`); los specs atan cada revelación a una palabra con `{"$cue": "palabra"}` (tolerancia objetivo ≤ 100 ms). Los pasos de abajo describen el mecanismo; en la práctica los hace `tts_v5.py` + los cues del spec:

1. Generar el audio de cada beat con `edge-tts` exportando tanto el audio `.mp3` como los subtítulos `.vtt`:
   ```bash
   edge-tts --voice "es-ES-AlvaroNeural" --text "<guion>" --write-media beat.mp3 --write-subtitles beat.vtt
   ```
2. Leer los timestamps del `.vtt` para fijar los umbrales de tiempo exactos en el código de animación (ej. si "departamento 99" se pronuncia en `00:00:03.850`, la casilla 99 se revela desde `t >= 3.85`).
3. **Adelanto de aterrizaje**: las revelaciones se disparan 0.3–0.4 s antes de la palabra (constante `LEAD`) para que el elemento esté asentado cuando la voz lo nombra; revelar con la animación a mitad de camino se percibe tarde.
4. **Deriva A/V**: medir la duración de audio y video de cada beat; tolerancia `|Δ| < 20 ms`. El video se genera a partir de la duración real del audio (probe) + pausa, y **nunca se trunca el audio** para encajar el video: esa es la causa raíz de la deriva acumulada en el concat `-c copy`.
5. **Honestidad de precisión**: la sincronización es por palabra porque usa la alineación real de `WordBoundary`; la cuantización a 30 fps deja un error de hasta medio frame (16,7 ms), que el preflight informa. No prometer más precisión que eso.

---

## 7. Animaciones Suaves (detalle en `2d-animation-composition`)

- **Entradas** con desaceleración (`easeOutCubic`): deslizamiento de 16–40 px + fundido, duración 0.3–0.6 s.
- **Salidas** 60–80% de la duración de entrada; sin rebotes ni overshoot en bloques de texto.
- **Cascada (stagger)** de 40–80 ms por ítem; el grupo completo ≤0.5 s; el héroe entra primero.
- **Hold tras asentarse**: ≥1 s en video explicativo; 1.5–2.5 s si hay que leer o entender algo.
- **No animar lo que no cambia significado**: si un diagrama estático explica, no se anima. El movimiento que no enseña es carga cognitiva.
- **Prohibido**: bucles decorativos, pulsos/palpitos, parpadeos; máximo 3 destellos por segundo (seguridad fotosensible).
- Las líneas y cables de validación se dibujan progresivamente desde el origen hasta el destino.

```python
def ease_out_cubic(t):
    t = max(0.0, min(1.0, t))
    return 1.0 - (1.0 - t) ** 3

# Desplazamiento vertical suave (slide-up)
card_y = target_y + int((1.0 - ease_out_cubic(progress)) * 40)

# Fundido suave (fade-in con canal alfa)
card_alpha = min(1.0, progress)

# Atenuación del sujeto anterior (spotlight)
def dim_factor(t, start, target=0.62, dur=0.4):
    if t <= start:
        return 1.0
    p = ease_out_cubic(min(1.0, (t - start) / dur))
    return 1.0 - (1.0 - target) * p
```

---

## 8. Fatiga Visual (Reglas de Descanso)

- **Papel blanco, paleta sobria**: sin temas oscuros, sin degradados, sin neones. El blanco con tinta oscura es el modo de menor fatiga para lectura sostenida.
- **Contraste alto sin deslumbramiento**: texto oscuro sobre blanco; WCAG ≥4.5:1 para texto legible; no usar el color como único portador de significado (acompañar con símbolos/etiquetas).
- **Movimiento con propósito**: después de cada movimiento, quietud. Entre beats, pausa real de 0.4 s con silencio: el ojo y el oído descansan y la idea se asienta.
- **Variación de tempo**: nada de ritmo monótono; un beat deliberadamente pausado; los conceptos núcleo más lentos, los detalles de soporte más rápidos.
- **Una idea por pantalla**: si hay que leer y escuchar cosas distintas a la vez, se pierde una de las dos.
- **Duración objetivo**: 2–6 min por parte; si el tema es más largo, dividir en partes (el motor ya lo hace).

---

## 9. Audio

- **Voz**: neural humana en español neutro; ritmo natural, sin acelerar.
- **Loudness**: `-14 LUFS` integrado, `TP ≤ -1 dBTP`, `48 kHz` mono `AAC` 128–192 kbps, normalización `linear` de 2 pasadas.
- **Pausa entre beats** (segmentación): ~0.4 s de silencio exacto insertado en la pista PCM (`pad_s = N/fps − duración_audio`); fundidos anti-pop (fade-in 10 ms / fade-out 30 ms) en cada segmento de voz.
- **Sin música por defecto**: la música sin función pedagógica viola coherencia y añade carga.

---

## 10. Pipeline de Renderizado y Exportación

### 10.0 Dónde vive el pipeline real (usarlo, no reescribirlo)

Todo video de Learnings se construye con el repositorio **`~/Developer/learnings-video`** (repo git propio). No se escribe un script de render nuevo por video.

- **Una orden**: `python3 build.py --jobs 8` (tts → gen → preflight → render → finalize → srt → paridad → crosscheck → QA); `--deliver` copia al vault y verifica md5. Guía completa: `AUTHORING.md`.
- **Proyecto nuevo**: `python3 new_part.py --slug <slug> --name "<Parte N - Tema>" --beats <n> --vault-dest <adjuntos del vault>`; después solo se escriben `script_v5.py` (guion), `specs/<id>.json` (bloques) y, si hace falta, `data.py`. `--sync` propaga mejoras del runtime a todos los proyectos.
- **Dos motores de bloque**, el mismo pipeline:
  - **Arquetipos PIL** (`table_gate_result`, `truth_grid`, `flow_map`, …): simulaciones de datos y tablas.
  - **`html_diagram`**: diagramas de cajas y flechas con el estilo de informe (serif negra, líneas finas, flechas calculadas de borde a borde), dibujados por `htmlscene/engine.js` y renderizados con Chromium sin interfaz (`htmlscene/render.mjs`). Cada caja aparece en el paso `s` cuando la voz dice su cue; lo anterior se atenúa (spotlight). Ejemplo completo en `demo-html/`.
- **Gates que no se saltan**: el preflight falla antes de renderizar si un cue no existe en la voz, si hay un hueco > 5 s, si hay texto en pantalla sin respaldo en la voz y, para `html_diagram`, si los pasos no coinciden con los cues, algún texto desborda su caja, la letra baja de 24 px (26 px en negrita) o algo sale del área segura. El crosscheck exige además un evento como máximo cada 3,4 s.
- **Requisitos del motor HTML**: `node` y Playwright con Chromium (`npm i -g playwright && npx playwright install chromium`).

> El arquetipo `html_diagram` está en la rama `feat/html-renderer` del repo hasta que se integre en `master`.

- **Resolución**: `1920x1080 Full HD (16:9)`, `30 fps`.
- **Codificación de video**: `H.264 (libx264)`, `pix_fmt yuv420p`, `CRF 18`, `preset veryfast`.
- **Render por beat sin pista de audio (anti-deriva)**: cada beat se renderiza como video **sin audio** con frames exactos `N = round((duración_audio + 0.4) × fps)`. Codificar AAC por clip arrastra el *priming* del encoder en cada corte (~21–43 ms) y la deriva se acumula beat a beat en el concat: por eso el audio se ensambla aparte.
- **Pista de audio única**: decodificar cada `beatN.mp3` a PCM 48 kHz mono (fade-in 10 ms / fade-out 30 ms anti-pop), concatenar con silencios exactos `pad_s = N/fps − duración_audio` (~0.38–0.40 s) y aplicar loudnorm de 2 pasadas sobre el PCM; recién al unir con el video se codifica **una sola vez** a AAC (`-c:v copy -c:a aac … -shortest`). Verificación medida en el render v4 de referencia: deriva residual `0.0000 s` en los 9 beats.
- **Ensamble**: concatenar los clips de video con el demuxer concat (`-c copy`) y verificar la duración de cada clip (`|Δ| < 20 ms`) antes de continuar.
- **Nunca renderizar directo al vault**: primero master en scratch, QA completo (sección 11) y recién después copiar al vault con verificación `md5`.
- **Ruta de destino en el vault**:
  `04-RECURSOS/Learnings/<tema>/explicaciones/adjuntos/<tema - parte>.mp4`
- **Incrustación en la nota de Obsidian**:
  Al principio de la nota de la parte, debajo de la definición de línea 0, se inyecta:
  ```markdown
  > [!video] Explicación Animada en Video (Storytelling y Diagramas)
  > ![[<nombre-archivo>.mp4]]
  > *Duración: X:XX min · Resolución: 1080p Full HD · Narración: Álvaro (Neural Español) normalizado a -14 LUFS con fundidos anti-pop de 30ms · Estética Distill: Fondo blanco papel puro, ultra-minimalista, un solo foco por pantalla y sin subtítulos quemados.*
  ```

---

## 11. QA de Entrega (No Negociable)

1. **QA geométrico**: verificar área segura, colisiones de cajas infladas y presupuesto de lectura en frames críticos.
2. **Frames de prueba por beat**: `inicio`, `entrada`, `acción`, `hold`, `salida`, `final`; armar una hoja de contacto 3×2 y revisarla.
3. **Prueba de miniatura al 25%**: si el foco primario no se identifica a 480×270, eliminar ruido de fondo.
4. **Prueba de blur/squint**: el peso visual dominante debe coincidir con el `P1`.
5. **Prueba de copia extrema**: etiquetas dinámicas con 3× la longitud típica no deben desbordar ni aplastar vecinos.
6. **Cierre técnico**: deriva A/V por beat <20 ms; loudness medido; sin subtítulos quemados; `md5` del archivo del vault == master verificado.

---

## 12. Subtítulos, Sincronía y Entrega

- **Sin subtítulos quemados por defecto**: la pantalla no es un teleprompter; los subtítulos duplican al locutor y compiten con el diagrama. En Learnings no se queman salvo pedido explícito de la persona. El `.srt` puede entregarse como archivo aparte (sidecar) y debe regenerarse si cambia el tempo del video.
- **Si se piden, discretos**: zona inferior despejada, sin tapar el diagrama, sin contorno grueso y con fuente ≤ 40 px en 1080p. Un estilo tipo TikTok/Reels (fuente ~67 px, `MarginV` de zona segura para vertical) NO es válido para un video 16:9 educativo.
- **Verificación obligatoria antes de entregar**: extraer 3–5 frames en tiempos de cambio de cue y comparar contra el baseline aprobado. Si un subtítulo tapa contenido o hay cualquier regresión visual, no se entrega.
- **Sincronía A/V**: la sincronización es por frase (marcas VTT); no prometer palabra por palabra salvo que se use alineación real (por ejemplo, `WordBoundary` de `edge-tts`).
