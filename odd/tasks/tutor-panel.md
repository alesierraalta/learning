Reagrupar los 37 controles del panel del tutor — issue #364
Rama `design/364-tutor-panel` · diseño primero, implementación pendiente en T2.
Método y cifra previa: `odd/tasks/studio-ui-ux.md`; definiciones verificadas en `studio/ui/studio.js` (3242 líneas en este worktree).

## Specs

- S1 — Inventario real de los 37 controles con `path:line`, agrupado por propósito, sin estimaciones.
- S2 — Una propuesta visual sobre `design/system.md`, con los tokens ya resueltos y un solo primario por estado.
- S3 — Ninguna acción desaparece: cada control movido conserva etiqueta, comportamiento y accesibilidad por teclado.
- S4 — Objetivos de al menos 44 × 44 px en puntero grueso, y el panel sigue funcionando a 390 px.

## Tasks

- T1 — S1,S2,S3,S4 — agrupar los 37 controles en un tablero de 1440 × 900 con los estados «En reposo» y «Trabajando», un primario por estado y la degradación a 390 px — `design/tutor-panel/` — unstarted — commit: 
- T2 — S2,S3,S4 — aplicar el agrupamiento al cajón real con sus etiquetas, handlers y acceso de teclado, sin quitar ninguna acción — `studio/ui/` — unstarted — commit: 

## Inventario

Regla de conteo heredada de `odd/tasks/studio-ui-ux.md`: una entrada por sitio de definición distinto; una plantilla que dibuja N instancias (chats, chips sugeridos, opciones de diálogo, archivos adjuntos) cuenta una vez y se marca `per item`. Los nueve controles de `newLearningEntry()` se cuentan aquí en su segundo montaje, dentro del cajón. Los números se verificaron contra el fichero de este worktree; el inventario anterior de `studio-ui-ux.md` está desplazado varias líneas respecto a él.

### 1 · Conversación — 4 (siempre a la vista, junto al hilo)

- `Mensaje para el tutor` (textarea) — `studio/ui/studio.js:2423`
- `Enviar` (icono `send`) — `studio/ui/studio.js:3151`
- `Detener` (botón de texto del compositor) — `studio/ui/studio.js:3152`
- pregunta sugerida (`per item`, 3 instancias) — `studio/ui/studio.js:2451`

### 2 · Salidas del turno — 4 (en el hilo, bajo la respuesta; sólo al cerrar el turno)

- `Ir a la nota` de la cabecera (visible cuando hay nota guardada) — `studio/ui/studio.js:2713`
- CTA del siguiente paso (`Ir a Parte N`, etc.) — `studio/ui/studio.js:2705`
- CTA de nota al terminar el turno — `studio/ui/studio.js:2678`
- CTA de turno interrumpido (`Seguir con …`) — `studio/ui/studio.js:2624`

### 3 · Conversaciones — 8 (disclosure «Conversaciones»)

- conmutador de la lista de chats (icono `chat`) — `studio/ui/studio.js:3106`
- `＋ Chat` — `studio/ui/studio.js:3145`
- abrir chat (`per item`) — `studio/ui/studio.js:2403`
- `⋯` opciones de chat (`per item`) — `studio/ui/studio.js:2406`
- `Renombrar` — `studio/ui/studio.js:2408`
- `Borrar` (chat) — `studio/ui/studio.js:2409`
- `Exportar` — `studio/ui/studio.js:2410`
- `Nueva conversación` (del menú `Detener lo que está haciendo` / `Reiniciar el tutor`) — `studio/ui/studio.js:2432`

### 4 · Aprender algo nuevo — 10 (un disclosure con el formulario completo)

- resumen `Aprender algo nuevo` — `studio/ui/studio.js:3147`
- `¿Qué quieres aprender?` (textarea) — `studio/ui/studio.js:776`
- modos `Universitario` / `Rápido` / `Examen` (`per item`, 3 instancias) — `studio/ui/studio.js:791`
- formatos `Oral` / `Escrito` / `Práctico` (`per item`, 3 instancias) — `studio/ui/studio.js:798`
- prácticas `Laboratorios` / `Construir una aplicación` / `Ejercicios` / `Otro` (`per item`, 4 instancias) — `studio/ui/studio.js:806`
- `Que lo deduzca el tutor` — `studio/ui/studio.js:808`
- `Describe el tipo de práctica` (input) — `studio/ui/studio.js:811`
- `Adjuntar examen o documento` (file input) — `studio/ui/studio.js:816`
- `Quitar` (`per item`, por archivo adjunto) — `studio/ui/studio.js:886`
- `Empezar` — `studio/ui/studio.js:835`

### 5 · Preguntas del tutor — 5 (tarjeta dentro del hilo, sólo con pregunta abierta)

- opción de diálogo `select` (`per item`) — `studio/ui/studio.js:2579`
- `Sí` / `No` de confirmación (una plantilla con dos salidas) — `studio/ui/studio.js:2581`
- respuesta libre (textarea) — `studio/ui/studio.js:2571`
- `Enviar respuesta` — `studio/ui/studio.js:2582`
- `Ahora no` — `studio/ui/studio.js:2583`

### 6 · Marco del panel — 6 (borde, cabecera y menú «Más opciones»)

- `Ancho del tutor` (`role="separator"`, arrastre y flechas) — `studio/ui/studio.js:3053`
- ver el tutor a pantalla completa (icono `fit`) — `studio/ui/studio.js:3118`
- `Más opciones` (icono `more`) — `studio/ui/studio.js:3140`
- `Detener lo que está haciendo` — `studio/ui/studio.js:2431`
- `Reiniciar el tutor` — `studio/ui/studio.js:2436`
- `Cerrar el tutor` (icono `x`) — `studio/ui/studio.js:3141`

Tally: 4 + 4 + 8 + 10 + 5 + 6 = **37** controles, cada uno con un solo grupo y un solo rango en `design/tutor-panel/01-reagrupado.html`.

## Log

- L1 (issue #364, verbatim): "Reagrupar los 37 controles del panel del tutor: un rango por acción"
  - "Inventario real de los 37 controles con `path:line`, agrupado por propósito, sin estimaciones."
  - "Una propuesta visual sobre `design/system.md`, con los tokens ya resueltos y un solo primario por estado."
  - "Ninguna acción desaparece: cada control movido conserva etiqueta, comportamiento y accesibilidad por teclado."
  - "Objetivos de al menos 44 × 44 px en puntero grueso, y el panel sigue funcionando a 390 px."
- L2: decisión — el inventario cuenta sitios de definición, no filas en pantalla, para que sea reproducible; por eso los tres chips sugeridos, las tres opciones de examen o los cuatro tipos de práctica son una entrada cada uno, igual que en #355. La numeración de `studio-ui-ux.md` se actualizó contra el fichero actual antes de escribir este documento.
- L3: decisión — los grupos 3, 4 y 6 son rareza y pasan a disclosures con nombre; 1 queda en el compositor; 2 y 5 siguen en el hilo porque su sitio es el contexto de la respuesta. Ningún control se elimina ni se duplica en dos grupos.
- L4: decisión — un solo primario por estado: `Enviar` en reposo, `Detener` con el turno en curso. `studio/server.ts:2219` rechaza un prompt mientras hay turno (`requireNoTurn`), por lo que `Enviar`, los chips y las salidas del turno aparecen deshabilitados de forma visible en el estado de trabajo en lugar de quedar como botones que no pueden ejecutarse.
- L5: excepción a test-first — estos tres ficheros son artefactos de diseño sin comportamiento ejecutable; no hay RED/GREEN. En su lugar: autocomprobación de tokens/contrastes y escaneo estático del artboard (sin URL, fuente, imagen ni script externos).
- L6: T2 aplicado al cajón real: los 37 sitios de definición llevan un ancla única (`data-control` / `data-controls` con `data-group`) y un test de navegador comprueba grupo, unicidad, ruta de teclado y el relevo `Enviar`/`Detener`. Los grupos 3/4/6 quedan en un pila exclusiva con etiqueta; a 390 px se juntan bajo «Más». El tablero deja el hilo y los chips sin recorte con banda compacta y paneles flotantes; el fallo medido era 103px de recorte.
- L7: cuatro correcciones verificadas en navegador: (1) salidas del turno bloqueadas con `data-block-during-turn` mientras hay turno, incluido el fondo opaco inmediato; (2) Escape cierra el disclosure más interno (`chat-options` antes que su grupo) y devuelve el foco a su propio `summary`; (3) el cajón ocupa 390 × 844 a 390 px y su cabecera conserva la zona segura de la barra; (4) las salidas de una respuesta se insertan una sola vez aunque el estado busy→idle se repita tras abortar. Los 37 controles y los seis grupos siguen en su sitio.
