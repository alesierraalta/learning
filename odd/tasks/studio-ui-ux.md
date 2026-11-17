Objective: Studio UI/UX overhaul — a real, parameterised design system and a hierarchy for the chrome, so the wide screen stops being a row of equivalent buttons over empty space. Issue #355.
Branch: design/355-studio-ui-ux · Delivery: design first, implementation of the chosen direction is a separate task. No commit or push in this round.

## Specs

- S1 — "necesito que pongas parámetros incluso": a real design system that syncs the Studio, reader and kit values, with tunable parameters (spacing step, base radius, control height/density, type-scale ratio) exposed and applicable to a preview.
- S2 — "me parece horrible que hayan como 27 botones arriba a la derecha": reduce the crowd of equivalent actions in the top-right chrome; one place and one rank per action, without losing any action.
- S3 — "pero luego esté vacío": give the empty area of the wide screen a purpose instead of leaving it blank.
- S4 — "que los botones no tengan sentido unos con otros": mutual coherence between buttons — a shared criterion of importance, with consistent labels, icons and grouping across screens.
- S5 — "Necesitamos mejorar de forma inminente la UI y UX" and "No sé si quieres hacer un Gentle Design, no sé, pero hay que mejorarlo ya": produce design directions first, then implement the chosen one; "Creo que GentleAI tiene skills que te sirven para mejorar la UI y UX" — use the available design guidance.

## Tasks

- T1 — S1,S4 — design system: sync tokens from `studio/ui/studio.css`, `integrations/pi/view/app.css`, `integrations/pi/kit/kit.css` and build the interactive parameter board — `design/system.md`, `design/system.html` — inline — commit: 
- T2 — S2,S3,S4,S5 — three differentiated directions for the Studio chrome, with the empty area assigned and one rank per action — `design/studio-ui/` — worker — commit: 
- T3 — S2,S3,S4,S5 — implement the chosen direction in the running Studio, preserving every action and its handler — `studio/ui/` — worker — commit: 

## Inventario de controles

Counting rule: one entry per distinct control **definition site** in the current worktree; a template that renders N data-driven instances (topics, parts, chats, reasons, dialog options) is counted once and marked `per item`. `newLearningEntry()` is mounted twice, so its nine definitions are counted once under Inicio and once again inside the drawer, where they really appear. For brevity every short `:N` below means `studio/ui/studio.js:N`; `studio/server.ts` lines are written in full. Click-only scrims, the non-interactive offline banner and the reader iframe are not controls. `studio/server.ts` renders no controls: its shell only mounts `<main id="studio">` (`studio/server.ts:1862`), loads `studio.css` (`:1857`) and `studio.js` (`:1869`). The tutorial deck's own buttons live in `studio/ui/tutorial.js:225-275`, not in `studio.js`, and are therefore outside these per-screen totals.

### Shell / top bar (every screen) — 8

- brand link `Estudio · Learnings` — `studio/ui/studio.js:3042`
- mobile back `←` — `:517`
- breadcrumb links (per crumb) — `:547`
- theme icon button `moon`/`sun`, mounted at `:3044` — `:207`
- `Configuración` (settings icon) — `:3044`
- `Tutorial` (deck icon) — `:3044`
- tutor pill `Tutor` / status — `:2322`
- tasks pill `Tareas` / status — `:2672`

### Inicio / biblioteca (`#/`) — 18

- `¿Qué quieres aprender?` textarea — `:747`
- mode picks `Universitario`, `Rápido`, `Examen` (one template, 3 instances) — `:762`
- `Adjuntar examen o documento` file input (label at `:790`) — `:783`
- `Quitar` per attached file — `:857`
- exam format picks `Oral`, `Escrito`, `Práctico` (one template, 3 instances) — `:769`
- `Que lo deduzca el tutor` — `:779`
- practice picks `Laboratorios`, `Construir una aplicación`, `Ejercicios`, `Otro` (one template, 4 instances) — `:777`
- `Describe el tipo de práctica` text input — `:782`
- `Empezar` — `:806`
- next-step CTA (`Ir a Parte N`, etc.) from `continueCard()` — `:726`
- `Ver el tema` from `continueCard()` — `:727`
- topic card button (per topic) — `:1033`
- `Panorama del tema` (per topic) — `:1039`
- `Nueva nota` — `:1048`
- quick-note open button (per note) — `:1060`
- `Editar` (per note) — `:1064`
- `Ver el tutorial` — `:1071`
- `Abrir tutorial` (icon-only, aria-label) — `:1076`

### Tema (`#/tema/:id`) — 14

- `← Volver a tus temas` — `:1176`
- diagnosis row `Responder` / `Ver` — `:1126`
- `Leer` (per written part) — `:1155`
- `Escribir esta parte` (per unwritten part) — `:1156`
- `Resolver` (per exercise) — `:1164`
- method pick `Pareto` — `:983`
- method pick `Preferencias` — `:984`
- `Panorama del tema` — `:1186`
- `Pedir las que faltan` — `:1198`
- next-step CTA from `continueCard(topic, step, true)` — `:726`
- `Repasar mis lagunas` — `:1215`
- `Preguntar sobre este tema` — `:1216`
- `Guardar el tema sin conexión` (icon `doc`) — `:143`
- `Borrar el tema` (icon `x`) — `:1219`

### Panorama — planificación (`#/panorama/:id`) — 10

- `Volver` (icon `back`) — `:1305`
- tabs `Planificación` / `Mapa de dependencias` (one template, 2 instances) — `:1267`
- `Leer` (per written part) — `:1346`
- `Escribir esta parte` (per pending part) — `:1347`
- `Pedir la planificación` — `:1378`
- `Pedir el mapa` — `:1392`
- `pano-section` disclosure `summary` (per section) — `:1353`
- next-step CTA from `continueCard()` — `:726`
- `Ver el tema` (icon `deck`) — `:1405`
- `Abrir el mapa` (icon `map`) — `:1406`

### Panorama — mapa de dependencias (`#/panorama/:id/mapa`) — 12

- `Volver` (icon `back`) — `:1305`
- tabs `Planificación` / `Mapa de dependencias` — `:1267`
- `Alejar` (icon `−`) — `:1670`
- `Acercar` (icon `+`) — `:1671`
- `Ajustar a la ventana` (icon `fit`) — `:1672`
- map node (`role="button"`, per concept) — `:1556`
- dependency link button (per edge endpoint) — `:1495`
- `Grafo de dependencias` scroll region (`tabindex="0"`) — `:1675`
- `Pedir la parte de …` — `:1509`
- `Leer esta parte` — `:1514`
- `Escribir esta parte` — `:1515`
- `Pedir el mapa de dependencias` (branch when there is no map) — `:1428`

### Lector (`#/leer/:topic/:part`, `#/rapido/:id`) — 14

- reader `Volver` (icon `back`) — `:1873`
- `Descargar para ver sin conexión` (icon `doc`, state changes to `Guardada`) — `:1761`
- `Preguntar` (icon `chat`) — `:1764`
- `Anterior` (icon `back`) — `:1876`
- `Siguiente` (icon `next`) — `:1877`
- `Sugerir` (icon `pencil`) — `:1770`
- `Regenerar` (icon `refresh`) — `:1773`
- `Modo: art./ancho/libro` action button — `:1776`
- `Borrar` (icon `x`) — `:1784`
- `Modo de lectura` select — `:1754`
- `Más acciones` overflow trigger — `:1826`
- reader menu item (10 actions, one template) — `:1817`
- `Página anterior` (icon `back`) — `:1885`
- `Página siguiente` (icon `next`) — `:1886`

### Quiz (`#/leer/:topic/quiz`) — 7

- reader `Volver` — `:1873`
- `Preguntar` — `:1764`
- `Modo: …` action button — `:1776`
- `Modo de lectura` select — `:1754`
- `Más acciones` overflow trigger — `:1826`
- reader menu item — `:1817`
- `Página anterior` / `Página siguiente` in book mode — `:1885`, `:1886`

The quiz fields, options and submission button are drawn inside the reader frame by the kit (`integrations/pi/kit/kit.css`, `integrations/pi/view/app.css:163-201`); they are not created in `studio.js`.

### Resultados (`#/resultados/...`) — 1

- `Ir a lo siguiente` — `:2036`

### Preferencias (`#/preferencias`) — 8

- `← Volver al inicio` — `:574`
- `Ver tu feedback` — `:575`
- `Añadirlo` / `Añadirlos` — `:597`
- `Quitar` (per discovered aspect) — `:605`
- radios `menos`, `medio`, `más` (one template, 3 per aspect) — `:614`
- tutor runtime select `agente` — `:618`
- model select `modelo` — `:622`
- `Guardar preferencias` — `:652`

### Tu feedback (`#/sugerencias`) — 2

- `← Volver a preferencias` — `:675`
- long-entry disclosure `summary` / `Ver completo` (per entry) — `:693`

### Editor de nota (`#/editar`) — 5

- `Título` text input — `:2094`
- `Texto (Markdown, diapositivas incluidas)` textarea — `:2095`
- `Cancelar` — `:2260`
- `Guardar` — `:2099`
- `Recargar` (conflict branch) — `:2180`

### Tutor drawer (global overlay) — 37

- resize handle `Ancho del tutor` (`role="separator"`, keyboard) — `:2898`
- `Ir a la nota` (hidden until a note exists) — `:2608`
- chat-list toggle (icon `chat`) — `:2950`
- full-window toggle (icon `fit`) — `:2962`
- `Más opciones` (icon `more`) — `:2984`
- `Detener lo que está haciendo` (icon `stop`) — `:2326`
- `Nueva conversación` (icon `fresh`) — `:2327`
- `Reiniciar el tutor` (icon `restart`) — `:2331`
- `Cerrar el tutor` (icon `x`) — `:2985`
- `＋ Chat` — `:2989`
- chat open button (per chat) — `:2298`
- chat options `⋯` summary (per chat) — `:2301`
- `Renombrar` — `:2303`
- `Borrar` (chat) — `:2304`
- `Exportar` — `:2305`
- suggested-question chip (3 instances) — `:2346`
- next-step CTA — `:2600`
- note CTA — `:2573`
- interrupted-turn CTA — `:2519`
- dialog option button (select) — `:2474`
- dialog `Sí` / `No` (confirm) — `:2476`
- dialog `Enviar respuesta` — `:2477`
- dialog `Ahora no` — `:2478`
- dialog answer textarea — `:2466`
- `Aprender algo nuevo` disclosure in the drawer — `:2991`
- the same nine `newLearningEntry()` controls mounted a second time — `:747`, `:762`, `:783`, `:857`, `:769`, `:779`, `:777`, `:782`, `:806`
- `Mensaje para el tutor` textarea — `:2318`
- `Enviar` (icon `send`) — `:2995`
- `Detener` — `:2996`

### Panel de tareas (global overlay) — 2

- `Cerrar las tareas` (icon `x`) — `:2680`
- `Detener` per background task — `:2726`

The panel is opened by the tasks pill counted in the shell; its dialog cards reuse the five `dialogCard()` templates counted in the drawer.

### Modales compartidos — 7

- `Cancelar` (delete) — `:225`
- `Mover a la papelera` — `:227`
- suggestion textarea — `:278`
- `Dictar` — `:280`
- reason chips (per catalogue reason) — `:291`
- `Guardar sugerencia` / `Regenerar la parte` — `:283`
- `Cancelar` (suggestion) — `:302`

Total counted definitions across all sections: **145**. Largest single screen: **tutor drawer, 37** (the top bar itself holds only 5 actions plus the two status pills; the crowd is distributed across the drawer, reader bar and its menu, which is what T2 must reorganise).

## Log

- L1 (user, verbatim): "Necesitamos mejorar de forma inminente la UI y UX. O sea, necesito que pongas parámetros incluso. Creo que GentleAI tiene skills que te sirven para mejorar la UI y UX, porque me parece horrible que hayan como 27 botones arriba a la derecha, pero luego esté vacío, que los botones no tengan sentido unos con otros. Necesitamos mejorar todo eso que tenemos con UI y UX. No sé si quieres hacer un Gentle Design, no sé, pero hay que mejorarlo ya."
- L2: diagnosis — the five top-bar actions (`studio/ui/studio.js:3044`) are only the visible tip; the same actions reappear in the reader bar (`:1759-1887`), its ten-item menu (`:1817`) and the 37-definition drawer, with no stated rule of importance. The wide layout leaves the stage empty because `.page` is capped at 1180px (`studio/ui/studio.css:68`) while the chrome is right-aligned (`:51`).
- L3: decision — per-screen inventory counts definition sites, not runtime rows, so it is reproducible from source; repeated per-item templates are named and marked. This is why no data-dependent number is presented as a fact.
- L4: decision — the design-system sync is read-only; `studio/ui/studio.css` is included for the first time alongside the reader and kit. The installed CodeGraph index was stale for this worktree (it reported a different `preferencesView()` at `studio/ui/studio.js:547`), so all line numbers were verified against the worktree files with `rtk read -n` / `rtk grep -n`.
- L5: decision — the board exposes the four parameters the request names ("parámetros incluso"): spacing step, base radius, control height/density and type-scale ratio. Every endpoint comes from a value already present in the three synced stylesheets; the board applies them with custom properties and copies the chosen set as a prompt.
- L6: decision — T2 and T3 stay unstarted: this round only writes the three allowed files. The three directions and the implementation belong to their own tasks.
- L7: self-check — every literal colour and font stack used in `design/system.html` is listed in `design/system.md` with a source path; no external URL, font, image or script is used.
- L8: T2 — tres direcciones para el cromo ancho en `design/studio-ui/`: `01-acciones-ancladas.html` «Ancladas», `02-cabecera-contexto.html` «Cabecera de contexto» y `03-riel-de-acciones.html` «Riel de acciones»; cada tablero con Lector e Inicio conmutables, un solo primario, los cinco conflictos resueltos y su contraoferta.
- L9: T3 shell — implementada «Ancladas» sin tocar el lector. `studio/ui/studio.css` 973→1025 líneas (+162/−110), `studio/ui/studio.js` 3083→3200 (+129/−12), `studio/layout.test.mjs` 2862→2928 (+80/−14), `odd/tasks/studio-ui-ux.md` 216→221 (+5/0, sólo este `## Log`); `studio/server.ts` sin cambios. `git status --short`: esos cuatro ficheros permitidos y ninguno más.
- L10: tokens — `--ctl-radius:0px` sustituye 66 declaraciones de radio (`6px`, `8px`, `10px`, `12px`, `14px`, `18px`, `3px`, `4px`, `999px`, `0` y `0 !important`) y se elimina el hackeo global `border-radius:0 !important`; se conservan los puntos circulares `50%` del tablero. `--space:8px` y `--gutter:48px` sustituyen: topbar `gap 20`/`padding 0 32`, brand `gap 10`/`padding-block 7`, crumbs/top-actions `8`/`10`, píldoras `7px 14px 7px 12px` y `7px 11px`, `.page 56/48/110`, `.section-title 64/20/10`, `.btn gap 9`/`padding 10 20`, `.btn.small 6 13`, hero `gap 80`, tarjetas `gap 18`, how `padding 26`/`gap 20`, offline `8 32`, preferencias `64/36/90`, editor `34/48/70`. `--ctl:40px` (44px en `(pointer:coarse)`) sustituye `38px` de icon-btn y theme-btn, `34px` de `.reader-mode` (retirado), `42px` de `.composer .send`, `36px` de los ítems de menú y los `44px` sueltos del bloque grueso; `--accent:var(--blue)` sustituye `#1d4ed8`, `#93c5fd`, el azul transparente del primario en la piel papel y `#fff` sobre acento por `var(--on-ink)`; `#b45309` → `var(--amber)`. Noche ya coincidía: `#E4EDF1` sobre `#0D191F`, acento `#8FC2E3`. No aplica a trazos de 1/2px, círculos `50%`, el cuadrado fijo de 44px del móvil, tipografías en `ch`/`rem`, ni a `app.css`/`kit.css` (fuera de esta unidad). Conflictos resueltos: radio, espaciado, altura, acento único y tinta nocturna.
- L11: cromo — 8 controles del inventario: 5 visibles (marca, migas, mobile back sólo en móvil, píldora Tutor, píldora Tareas) + 3 en «Contexto» (tema, Configuración, Tutorial). En escritorio las 5 visibles son marca, migas, el CTA anclado «Escribir la Parte 2» (que sale de `continueCard`, no es un control nuevo), Tutor y Tareas; en móvil el back ocupa el lugar de las migas y «Contexto» conserva su nombre accesible. Se omiten el cuarto ítem del tablero «Volver a tus temas» (es el back por pantalla del inventario y duplicaría las migas) y el bloque «Servicios» del rail (los estados viven ya en las píldoras; duplicarlos rompería un rango por acción). El rail de Inicio usa sólo `library.topics`, `nextStep()`, `progress()` y `saved`; «Guardado» aparece sólo si hay partes guardadas reales. Menú: `aria-expanded`/`aria-controls`, foco al primer ítem, flechas, Escape cierra y devuelve el foco al disparador; `render()` lo cierra al navegar.
- L12: pruebas — baseline `node --test studio/*.test.mjs`: 445 tests, 441 pass, 0 fail, 4 skip. RED observado al actualizar 8 aserciones que fijaban la estructura vieja: «preferences are reachable» y «a saved tutor model» pasan de `getByRole("button",{name:"Configuración"})` a abrir «Contexto», comprobar `aria-expanded="true"` y pulsar `getByRole("menuitem",{name:"Configuración"})`; «home editorial» pasa de `.home-page .hero .continue .actions button` a `.topbar .header-action`; «topic route hides unwritten parts» pasa de `article.continue .actions button` a `.topbar .header-action` y añade que la tarjeta ya no tiene botones; «next step asks…» y «first missing part…» pasan de `card.locator(".actions button").first()` a `.topbar .header-action`; «topic page keeps the same next step» pasa de `card.getByRole("button",{name:"Ir a Parte 1"}).count()===1` al texto del encabezado; «a next step refused…» pasa de `card.getByRole("button",{name:"Regenerar Parte 2"})` al encabezado. Se añade un test del cromo (posiciones, 12ch, 48px, 3 menuitems, foco y Escape). GREEN: 9/9 enfocados; final: 446 tests, 442 pass, 0 fail, 4 skip (234912ms).
- L13: navegador real — Playwright Chromium: capturas en memoria de `.topbar` a 1440/1280 en claro y noche (9287/9512/9153/9367 bytes). Sin rutas de archivo: los tipos permitidos no incluyen ningún destino de imagen, hace falta una ruta autorizada. A 1280: migas 81px con `min-width:12ch` (80.9px), primario 192×40px, inset 48px, rail 248px, desbordamiento horizontal 0. Noche: papel `rgb(13,25,31)`, tinta `rgb(228,237,241)`, acento `rgb(143,194,227)`. El menú abre, enfoca el primer ítem, cierra con Escape y devuelve el foco a «Contexto» (`aria-expanded=false`).
- L14: T3 lector — «Ancladas» dentro de una parte, sin tocar cabecera ni Inicio. Ficheros: `studio/ui/studio.css` 1025→1055 (+38/−8), `studio/ui/studio.js` 3200→3238 (+73/−35), `studio/layout.test.mjs` 2928→3047 (+136/−17), este `## Log` 221→222 (+1/0); `studio/server.ts` intacto; `git status --short` sólo esos cuatro permitidos. Barra visible: back, título, `Modo de lectura`, «Preguntar» (ghost, sin un segundo primario) y el único disparador «Más acciones»; al menú pasan, con su etiqueta y handler originales, `Descargar para ver sin conexión`, `Sugerir`, `Regenerar`, `Modo: art.`, `Borrar`, `Conversación de esta parte`, `Tema oscuro`, `Configuración`, `Tutorial`, más «Preguntar» (el tablero lo repite) y «Anterior»/«Siguiente» cuando hay partes escritas vecinas: 14 sitios del inventario del Lector contabilizados (10 ítems del tablero en la fixture de una sola parte escrita; 12 instancias del template cuando hay dos vecinas). «Página anterior»/«Página siguiente» siguen en la barra flotante del modo libro. El disparador de móvil deja de ser un mecanismo aparte: mismo `aria-controls`, `aria-expanded`, foco al primer ítem, Escape y foco de vuelta en todos los anchos; en móvil la etiqueta se oculta por espacio pero el nombre accesible sigue siendo «Más acciones». Rail `.study-rail` a 288px (248px con stage ≤1320px), oculto con `@container stage (max-width:1100px)` —también con el tutor abierto—; «Progreso» sale de `progress(topic)` (partes escritas reales), «Siguiente paso» de `nextStep(topic).label/text`, «Guardado» de `saved` intersectado con las partes del tema y se actualiza tras guardar, con el nombre de la parte cuando es la actual. Se omiten «Servicios» (ya en las píldoras) y cualquier métrica inventada; las notas rápidas no tienen rail porque no hay partes ni `nextStep`. Pruebas: baseline 446/442/0/4; RED enfocado 5/10 al escribir primero las aserciones nuevas; GREEN 10/10; final `node --test studio/*.test.mjs`: 447 tests, 443 pass, 0 fail, 4 skip (239656ms). Cambios de aserción: barra de escritorio `.reader-more.isVisible() false` → `true` y lista `[Volver,Preguntar,Sugerir,Regenerar,Borrar]`+save → `[Volver,Preguntar,Más acciones]` con `select [Modo de lectura]`, menú de 10 ítems y sin `.btn.primary`; tutor estrecho añade `.study-rail` oculto; guardado pasa de botón en `.reader-bar` a ítem deshabilitado en `.reader-menu` más «Guardado» en el rail; «no se puede guardar» y «Sugerir» pasan de pulsar botones de la barra a pulsar ítems del menú; los dos tests del índice pasan de viewport 1440 a 1680 para que la hoja conserve los 1360px que necesita el índice lateral con el rail (misma aserción de no solapamiento). Las pruebas de móvil (10 ítems, dos controles visibles, título a 320px) no se tocaron. Navegador real: 1440 rail 288/hoja 1152, 1280 rail 248/hoja 1032, barra 58px, disparador 174px, artículo 648px en ambos; claro `rgb(255,255,255)`/`rgb(15,46,61)`/`rgb(0,66,118)`, noche `rgb(13,25,31)`/`rgb(228,237,241)`/`rgb(143,194,227)`; a 1080 rail 0/hoja 1080. Menú abre, enfoca, cierra con Escape y devuelve el foco a «Más acciones» a los cuatro anchos/temas; capturas en memoria (71693/69171/72531/70285 bytes), ningún fichero de imagen. Límite de datos: el tablero dibuja diez ítems pero el inventario cuenta «Anterior»/«Siguiente» aparte; se añaden al mismo menú en vez de perderlos o crear un segundo mecanismo.
- L15: banda del índice — medida dentro del frame real, con el rail, a stage 1440/1536/1680 y a 1280/1080, más un 1440 sin rail (geometría anterior). Sin rail, 1440: `.lk-toc` `position:fixed`, rect `[1060,16,240,103]`, al lado del texto (`main.right=1044`), 2 enlaces enfocables. Con rail, 1440: hoja 1152px, rail 288px, `position:static`, rect `[276,160,600,104]` en la columna de lectura tras el título y antes de las secciones, mismos 2 enlaces y foco; 1280 (hoja 1032, rail 248) `[216,160,600,104]`, 1536 (hoja 1248) `[324,160,600,104]`, 1080 (rail 0, hoja 1080) `[240,160,600,104]`, todos visibles y enfocables; 1680 (hoja 1392) vuelve a `fixed` `[1036,16,240,103]` al lado. Ningún ancho pierde el índice: no desaparece ni se vuelve inalcanzable, sólo se compone distinto cuando la hoja baja de 1360px. Regla aplicada: «no quitar una ayuda de lectura existente» → el rail se queda; se documenta en el comentario de `the reading index survives the study rail across the wide band` y se añade ese test de medida. No se tocan `app.css`, la medida de 648px ni los controles de la barra.
