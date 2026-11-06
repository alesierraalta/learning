# Learning studio

A local study app: browse every Learnings content and drive the study from the
browser while Pi works in the background with the skill and engine
(spec: `odd/tasks/learning-studio.md`).

## Start

```bash
estudio            # shell function in ~/.bashrc: rebuilds bin/learning if needed, starts, opens the browser
estudio --no-open  # print the URL only
```

`node studio/server.ts` is the same without the engine rebuild. `LEARNING_ROOT`
overrides the Learnings folder. Ctrl+C stops the studio and its Pi.

Set `STUDIO_AGENT_DISABLED=1` to browse without starting Pi. Tutor requests,
restarts and regeneration return 503. This option is not a security sandbox:
use separate credentials, data and process isolation for untrusted previews.

## Configuración › Preferencias

The header opens the preferences page, where each aspect has a menos, medio or más
choice. Saving writes `<LEARNING_ROOT>/preferencias.json` in C1 format; the human
history in `preferencias.md` is not changed. JSON levels take precedence over the
history when the tutor uses the preferences method. Before a JSON file exists,
the page starts from the seeded defaults without creating a file.

The token-gated `GET api/preferences` returns the full `{version: 1, aspectos}`
document. `POST api/preferences` accepts that same document with changed levels,
validates the exact aspect IDs and fields, and atomically replaces the file. It
requires the same origin and JSON content type as the studio's other POSTs;
invalid input returns 400 without changing the existing file.

The list is no longer closed. When telemetry holds a category with at least
three answers and an accuracy at or below 0.6, a dashed callout above the form
offers what the learner's own answers suggest («Tu uso sugiere un refuerzo
nuevo»).
`GET api/preferences/candidatos` returns those categories, minus the ones the
file already has; `POST api/preferences/descubrir` appends them as aspects after
the seven shipped ones, so the page then shows the eighth with the badge
«descubierto por tu uso» and its evidence («3 respuestas, 1 acierto»). A
discovered aspect carries `origen: "telemetria"` and `evidencia: {respuestas,
aciertos}`, so the reason travels with it and a save keeps both. `POST
api/preferences/olvidar` with `{id}` removes it and leaves the seven shipped
aspects — and their levels — as they were; those seven never show the badge or
the button. Nothing is applied without the learner's click.

## Tutor choice and the engine gate

The tutor is chosen in the same page, above the learning aspects. `GET api/tutor`
returns `{version: 1, agente, modelo, pensamiento}` and `POST api/tutor` replaces
it atomically in `<LEARNING_ROOT>/tutor.json`. `agente` is `pi` or `agy`: Pi runs
`pi --mode rpc` and Antigravity runs `agy -p … --output-format stream-json`, one
process per turn and `--conversation` for the turns after the first. `modelo` and
`pensamiento` are empty by default, which leaves each CLI its own setting, and an
unknown field or model name is refused with 400. The thinking levels are per
provider because the CLIs differ: Pi takes `off`, `minimal`, `low`, `medium`,
`high`, `xhigh` and `max`, while Antigravity's `--effort` takes `low`, `medium`,
`high`, `xhigh` and `max`. A level the chosen provider cannot apply is refused
with 400 instead of being dropped.

Antigravity needs its CLI reachable from the studio's own environment: the studio
spawns `agy` from `PATH`, so a service whose `PATH` omits the CLI's directory
reports one actionable error (`no se encontró el ejecutable "agy"`) instead of a
bogus exit code. `deploy/vps/learning-studio.service` and its env example put
`~/.local/bin` on that `PATH`.

Deep tutoring names its topic instead of guessing it. The composer on a topic page
sends `POST prompt {text, tema}`; the home chat and the quick notes send no `tema`
and are never checked. The selection also lives in `GET api/tema` / `POST
api/tema`. A topic the engine does not track — no `.learning/state.json` — is
refused with 400 before the tutor is reached, so a deep conversation can never
run without the gate that belongs to it.

Both providers are checked by one rule, `integrations/pi/gate-rules.ts`: the
report passes when its status is `accepted`, `completed`, `waiting` or `skipped`
and no check reads `FAIL`. Pi applies it inside its settle gate, where it can also
push the next stage; Antigravity has no such hook, so the studio applies the same
rule once after `agent_settled` and streams a `gate` event with the verdict. Pi's
gate is never run a second time. A failing verdict blocks the next deep turn on
that topic with 409, but only after the engine is asked once more, so a topic that
passes again is released; an engine that is missing or prints no report counts as
failing. `POST api/restart` works while a turn is still running and replaces the
tutor, which is the way out of a turn that never settles.

## Wide reading mode

Every part page carries a **Modo ancho** toggle in its top-right corner. Off by
default: the reader keeps one narrow column. Switched on, on a screen at least
1080px wide, the prose spreads into two columns, headings, tables and code span both, and the page uses up to 1400px of the monitor. The choice is
remembered per browser, so it survives a reload and a studio restart; below 1080px
the text stays in one column even with the mode on. The video block and the
mini-quiz are not affected: only the explanation text is a reading surface.

## Modos de lectura del estudio

La barra del lector ofrece tres modos, en un interruptor de tres botones:
**Art.** (el de siempre, por defecto), **Ancho** y **Libro**. La elección se
guarda en el navegador (`learnings.reading-mode`), así que volver a abrir la
parte la conserva.

En **Libro** la parte se pagina de verdad: una pantalla, una página, y la
siguiente continúa donde terminó la anterior. Se pasa con los botones de la
píldora flotante (`2 / 5`), con las flechas del teclado o con un deslizamiento
horizontal sobre la página; en la primera y en la última el botón se detiene en
vez de dar la vuelta. Con `prefers-reduced-motion: reduce` la página cambia sin
animación y el contenido es el mismo.

La página la mide el propio documento, que es el único lado que puede hacerlo:
el estudio solo dice el modo y pide el giro, y el documento contesta en qué
página está y cuántas hay. Por eso el modo ancho del documento (el de la
sección anterior) y el modo Ancho del estudio son cosas distintas: el primero
cambia la tipografía, el segundo le da al marco todo el ancho disponible.

## Tema oscuro

The header's moon (or sun) button repaints the studio and every reader it opens.
The first visit follows the operating system's preference; after that the choice is
kept per browser in `localStorage` (`learnings.theme`), so it survives a reload, a
studio restart and a new part page. The reader frames are another origin and cannot
read that storage, so the studio hands them the theme in their address (`?theme=dark`)
and by `postMessage` when it changes; `kit/theme.js` is the one bootstrap that reads
either and sets `data-theme` on `<html>` before the body paints.

Both stylesheets carry a `:root[data-theme="dark"]` block that only swaps tokens
(`--paper`, `--ink`, `--muted`, `--line`, the accent colours) and sets
`color-scheme: dark`; the layout is untouched. Authored figures keep a light paper
surface in dark mode: a diagram's colours are part of what it teaches, so inverting
them would change the lesson. The deck (tutorial) and the code editor follow the
same tokens.

## Panorama del tema

Topic cards and topic pages offer **Panorama del tema**, with a back control to
the entry point. The topic page lists written parts only; the panorama shows
the whole planned route and the tutor's plan prose.

The dependency map draws the connections from `mapa.mmd`. Node colours come
from the most recent recorded concept verdict: claro green, dudoso yellow,
laguna red, and no verdict blue. Diagnosis comes first, then feedback files in
plan order, including remedial parts. Select a node to see its evidence and the
part that explains it, or where it will be learned. Drag and zoom to explore the map.

### Which part explains a concept

A concept's number and a part's `subtema` do not always have the same depth: the
map writes `1.2.1.3`, while a part may carry `1.2.1a`. The map also writes the
number in two places: before the name (`1.1.1 Qué es una capa`) or after a dot
(`Frase base · 1.1 · pregunta 1 · verde`). Both are read; when the number is not
first, its segment becomes the number, the first segment stays the name and the
rest becomes the note under it.

The rule is one function, `partFor`, and it is covered by tests:

1. strip the trailing letters of the `subtema` (`1.2.1a` → `1.2.1`);
2. a number belongs to a `subtema` when it equals it or starts with it plus a
dot (`1.2.1` covers `1.2.1`, `1.2.1.3`; it does not cover `1.2.10`);
3. when several `subtemas` cover it, the longest one wins.

A concept no part covers is not a dead end: when its subtema is known, the box
offers «Pedir la parte de (subtema)». The request names the number itself when
the subtema stops at three segments, and its parent when the concept sits four
levels deep. The panorama names unwritten parts without showing their content.

The map is drawn by the studio, not by Mermaid: the shell page loads marked and
DOMPurify only, and a picture whose boxes must open, follow a pointer and hold
their own detail panel needs geometry the client owns.

## Student telemetry and adaptive profile

The studio and the bridge maintain student telemetry to adapt explanations dynamically:
- In every explanatory point, an embedded quick-quiz evaluates understanding immediately.
- Results (right/wrong, confidence, and diagnostic 'por qué') are recorded locally per explanation (`<topic>/telemetria.json`) and globally (`telemetria.json` in the root).
- `api/telemetry` (GET/POST) serves and persists the student profile: cognitive tendencies (e.g. reinforcing mathematical parts, visual anchors), statistics per category, and tutor adaptation directives.


For HTTPS on a private network through a TLS reverse proxy (the VPS uses Caddy on
its ZeroTier address, see `docs/deploy-vps.md`), keep both listeners on loopback
and configure the two public origins together:

```bash
STUDIO_PUBLIC_ORIGIN=https://10.154.59.151:8445 \
STUDIO_BRIDGE_PUBLIC_ORIGIN=https://10.154.59.151:8446 \
STUDIO_BRIDGE_PORT=4748 node studio/server.ts
```

`STUDIO_PUBLIC_ORIGIN` is the studio's browser origin; it prints that origin's
entry URL and implies `--no-open`. `STUDIO_BRIDGE_PUBLIC_ORIGIN` is the bridge's
browser origin. Both must be bare HTTPS origins (lowercase host, optional port,
no path). `STUDIO_BRIDGE_PORT` is the numeric loopback bridge port; unset or `0`
picks a free port. A fixed proxy mapping needs a fixed bridge port.

Forward the studio HTTPS port to `127.0.0.1:4747` (`STUDIO_PORT`) and the bridge
HTTPS port to `127.0.0.1:4748`, preserving Host. With public origins configured,
a taken studio port is an error, not a fallback: the proxy must not silently
point at another process. With these options unset, loopback behavior is unchanged.
Keep the proxy on a private network only: this app controls a local Pi agent, not a public service.

## Dictation

Set `STUDIO_TRANSCRIBER_URL` and `STUDIO_TRANSCRIBER_TOKEN` together to enable
server-side transcription (for example `http://10.154.59.151:8765`). A partial
configuration refuses startup. The token stays on the server, never in page config.
«Dictar» records microphone audio; «Detener» uploads it (maximum 15 MiB), then
«Transcribiendo…» waits for the transcript. Jobs are deleted after use; transcription
has a 90-second deadline. Without these variables the existing Web Speech path remains.
The suggestions box in the studio uses the same script and the same service through its
own `POST api/transcribe` proxy (503 when no transcriber is configured), so a dictation
behaves the same in the reader and in the studio.
Microphone capture requires HTTPS remotely (loopback HTTP still works).

## What runs

- `studio/server.ts` listens on 127.0.0.1 behind a per-run token and spawns
  `pi --mode rpc --session-id estudio` in the Learnings folder with
  `GENTLE_SHELL_INTERACTIVE_HOST=1`, so Gentle asks its questions (university or
  quick mode, any `ask_user_choice`) as RPC dialogs the studio shows as buttons.
  The `estudio` session id keeps one persistent conversation of its own; a Pi
  open in a terminal is never written by two processes.
- It hosts its own study-view bridge (`integrations/pi/bridge.ts`): part pages,
  rich pages, the diagnosis and quick notes open in the center viewer, and
  every submission from them (quiz, reasoning, confidence, questions, video
  requests) becomes a prompt of the same Pi session.
- `studio/ui/` is the browser client: library (topics with engine status and
  parts, quick notes), viewer, and tutor panel (streamed text, tool activity,
  dialogs, input, stop, new conversation, restart).

The quick-note list is ordered by use: the note edited or opened most recently
comes first, so the list opens on the thing being written. Ties break by id, which
keeps the order stable when two notes share a timestamp.

## Deleting a note

Every note can be deleted from the studio: a quick note or a part from the
reader's **Borrar**, and a whole topic from **Borrar el tema** on its page. The
confirmation names exactly what leaves, and nothing is destroyed:

- what moves lands in `<vault>/.papelera/<stamp>__<kind>__<label>/`, keeping its
  vault-relative paths (`explicaciones/Parte 2 - ….md`, `mini-quiz/p2.json`, …);
- a `papelera.json` manifest records the kind, the ids, the moment and every path
  that moved, so putting it back is a `mv` to the recorded path;
- deleting a part also drops its entry from `plan.json`, and the manifest keeps
  the removed entry (`planPart`) so the plan can be rebuilt by hand;
- a part takes its whole footprint with it: note, rich page, app, demos,
  attachments (its video) and mini-quiz.

The trash is a dotted folder, so the library and the engine ignore it; the vault
backup (`git add -A`) keeps deleted notes in its history as well. Only paths
inside the vault are deletable: ids are validated, symbolic links and the
reserved folders (`.papelera`, `rapidos`) are refused, and a refused delete moves
nothing.

## Sugerencias y regenerar

The reader of a written part offers **Sugerir** and **Regenerar**. Both open the same
dialog: the reason chips («Demasiado texto», «Faltan ejemplos», «Matemáticas confusas»…)
and a box for the learner's own words, typed or dictated. A suggestion needs at least one
chip or one sentence; the accept button stays disabled until then.

- **Sugerir** stores it and nothing else: the tutor reads it the next time it writes.
- **Regenerar** stores it and asks the tutor for that part again — rich page, note and
  mini-quiz — with the reason as the request. Before the tutor starts, the page, the note
  and the mini-quiz move to `.papelera/<stamp>__regeneracion__<topic>-<part>/`, keeping
  their vault-relative paths (`redes/explicaciones/Parte 1 - Capas.html`), with a
  `papelera.json` manifest; the video, the demos, the attachments and `plan.json` stay
  where they are, so regeneration replaces a part without deleting anything. When two
  backups of one part land in the same millisecond, the second folder gets a `-2` suffix
  instead of overwriting the first: the trash never keeps one copy of two.
  Everything that can refuse the request — an unknown part, a malformed reason, a prompt
  over the limit — is decided before the first write, so a refused regeneration leaves
  the part exactly where it was.

`<LEARNING_ROOT>/sugerencias.json` holds every entry (`{id, tema, parte, motivos, texto,
origen: sugerencia|regenerar, timestamp}`, version 1). It is validated on read and
nothing is repaired behind the learner's back: a file that cannot be parsed reads as
empty and is renamed to `sugerencias.corrupta-<stamp>.json` before the next write, and an
entry that no longer matches the shape is copied to `sugerencias.corrupta-<stamp>.json`
before the store is rewritten without it. An empty, healthy store keeps nothing aside.
The learner's words are never lost to a bad edit.

Each chip moves one preference level, deterministically: «Faltan ejemplos» sets
`ejemplos` to más, «Demasiado texto» lowers `texto`, «Matemáticas confusas» lowers
`matematicas` and raises `pasos`. Repeating a suggestion does not stack; it keeps the
aspect where the learner asked for it. The preferences page shows the result, so
the change is visible and reversible. Moving a preference is the only part that can
fail without losing the feedback: if `preferencias.json` cannot be read, the entry is
still stored and the adaptation simply waits, because a file the learner cannot repair
must not swallow their words.

The loop leans on what is already stored: before writing, the prompts for a part, the
plan and the map carry a compact context built from `preferencias.json`, the weak
categories in `telemetria.json` and the last words from `sugerencias.json`. The
token-gated routes are `GET api/sugerencias?tema=&parte=` (entries, chips and derived
lines), `POST api/sugerencias` (record), `POST api/regenerar` (record, back up, prompt)
and `GET api/contexto?tema=` (the lines a writing prompt carries). Malformed input
returns 400; nothing is written on a failure.

## Design and tutorial

The UI uses the visual language of the Learnings slides
(`~/Developer/learnings-video-runs/slides`: `deck.css`, `illus.py`): white paper, the
slides' serif (Tinos, metric-compatible with Liberation Serif, pinned with SRI), boxes
with 2px strokes, dashed containers, illustrated objects and the deck palette.
`studio/ui/tutorial.js` is a six-slide deck in that style (1920×1080 slides scaled to the
window, pieces revealed step by step, keyboard ← → and Esc). From a terminal, `learning web` opens it (it reuses the studio already running on the
port instead of starting a second one), `learning chat` opens the study chat, and
`learning <engine command>` runs the engine. It opens on the first visit
and from the «Tutorial» button. Open it at **http://127.0.0.1:4747/**: that stable address
redirects to the current run's token URL. The studio listens on port 4747 (`STUDIO_PORT`; a taken
port falls back to a free one) so the browser remembers that it was seen.

## Tablets and touch

Layouts answer to the room the page has, not to the screen. The stage is a CSS
container (`container: stage / inline-size`), and the two-column layouts (home,
topic page, panorama, note editor) stack below 1000px **of stage**. That matters on
an iPad held sideways: the screen is 1133–1366px wide, but with the tutor open the
page gets about 700–930px, so it stacks; with the tutor closed it keeps both columns.

Below 1100px of screen the tutor lies over the page instead of pushing it. The
page behind it dims, and a tap on the dimmed page closes the tutor.

On a touch screen (`pointer: coarse`) every control is at least 44px, the minimum
Apple sets for a finger; a mouse keeps the compact controls. The breadcrumb keeps
«Inicio» and the current page whole, and a long topic between them ends in «…».

The dependency map opens at a readable size (scale 0.85) when fitting it whole
would shrink its words, starting at its first column so the learner drags right.
«Ajustar a la ventana» still shows the whole map. Two fingers zoom around the point
between them; the wheel does the same with a mouse.

## Reading with no connection

A part can be read with no connection, inside the studio itself.

- **Saving.** Every part opened with a connection is saved on the device. The
  topic page saves all its written parts at once with **Guardar el tema sin
  conexión**, and each saved part says *Guardada en este dispositivo*. The reader also offers **Descargar para ver sin conexión**, changing to *Guardada en este dispositivo* when saved.
- **Reading.** With no connection the studio still opens at its usual address, with
  the library as it last saw it and a notice: *Sin conexión · estás viendo lo
  guardado en este dispositivo*. A saved part opens in the same reader; one never
  saved says to open it once with a connection.
- **What travels.** The text, its figures, formulas (KaTeX), diagrams (Mermaid),
  walkthroughs and demos. What needs the tutor or the network says so where it
  would be: the video, the mini-quiz (the tutor grades it) and questions to the
  tutor.

How it works:

- `GET api/offline?topic=&part=` asks the bridge for the part once and folds it
  into one HTML file (`studio/offline.ts`): stylesheets and scripts inline,
  pictures and demos as `data:` URLs, and the CDN libraries the kit loads on
  demand in `window.learningOffline`. Only the bridge and `cdn.jsdelivr.net` are
  asked, and a CDN library is taken only when its bytes match the SHA-384 pinned
  next to its URL in the code that loads it. A library downloaded once stays in
  `~/.cache/learning-studio/cdn` (`offlineCacheDir`).
- The file names nothing of the bridge (address, run token, routes to the tutor)
  and is served with `sandbox allow-scripts` and `connect-src 'none'`: its scripts
  run in an opaque origin that can reach nothing. Every document of the copy (the
  part and each demo) is refused if it still names the bridge's or the studio's
  run token. A stylesheet may bring only WOFF2 fonts and pictures; CDN downloads
  never follow a redirect.
- Two limits are deliberate. Pictures a note links from elsewhere on the internet
  (`https://…`) do not travel: fetching them would mean the server asks any host
  the note names. And a script of the copy can navigate its own frame, but the
  studio frames only the bridge and its own origin, where every route but `/` and
  `/sw.js` needs a token the copy does not have.
- A service worker (`studio/ui/sw.js`, served at `/sw.js` with scope `/`) answers
  every studio request from the network first and keeps each good answer, so
  online the studio always shows what the server has now. With no network it
  serves what it kept, marked `x-learning-saved: 1` so the studio can say so.
  Answers are filed without the run token, which changes on every restart, so a
  part saved before a deploy still opens after it. `events`, `api/view` and
  `api/note` are never kept.

On an iPad (Safari), a service worker runs only on a certificate the device
trusts: install the Infra Root CA once (`docs/deploy-vps.md`). Without it the
studio works online exactly as before and **Guardar el tema sin conexión** says
why it cannot save. Each address is its own store: parts saved through
`https://learnings.infra.local/` are not seen from `https://10.154.59.151:8445`, and
a web app added to the home screen keeps its own store apart from Safari. Safari
may clear a site's store after weeks without visiting it; opening the studio
once with a connection saves again what is opened.

## Writing notes

The studio writes quick notes itself, so the vault does not need an external
editor. «Nueva nota» and «Editar» open `#/editar` and `#/editar/<id>`: a title,
the Markdown with its guided decks, and a preview that is the real reader.

The preview draws the **draft**: while the author types, the studio posts the
body to `api/draft`, the bridge renders it with the same page builder and keeps
it in memory for a while, and the frame loads that URL. Nothing is written, so a
deck that still breaks the rules can be previewed; only «Guardar» writes.

Saving runs the deck rules first (`tools/deck-lint.mjs`) and answers 400 with the
problems, which the editor shows verbatim. An update names the revision it was
built from; if the file changed underneath, the answer is 409 with the current
revision, the editor never adopts it, and the other editor's bytes stay.

## Contract and security

The server ↔ UI API is the contract in `odd/tasks/learning-studio.md`. Every
route needs the token; the Host header must be loopback or the configured public
host; a POST must come from
the studio origin with a JSON body of at most 64 KiB (prompts up to 20 000
characters). The bridge allows only the studio origin to frame its pages
(`frameAncestors`). The shell page frames nothing but that bridge. A draft is a
capability URL with a random key that expires: it renders submitted content and
never touches the vault.

## Tests

```bash
node --test studio/*.test.mjs   # real server, fake Pi (studio/testdata/fake-pi.mjs)
```
