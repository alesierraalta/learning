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
choice. Saving stores the preferences (C1 format) in the learner database (see «Learner data»); the human
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
`pensamiento` are empty by default, which leaves each CLI its own setting;
`GET api/tutor/modelos?agente=pi|agy` lists the models of the provider selected
in the page (Pi's from `pi --list-models` as `provider/model`, Antigravity's from
`agy models`), the saved provider when `agente` is absent, and any other value is
refused with 400. An unknown field or model name is refused with 400. The thinking levels are per
provider because the CLIs differ: Pi takes `off`, `minimal`, `low`, `medium`,
`high`, `xhigh` and `max`, while Antigravity's `--effort` takes `low`, `medium`,
`high`, `xhigh` and `max`. A level the chosen provider cannot apply is refused
with 400 instead of being dropped.

Antigravity needs its CLI reachable from the studio's own environment: the studio
spawns `agy` from `PATH`, so a service whose `PATH` omits the CLI's directory
reports one actionable error (`no se encontró el ejecutable "agy"`) instead of a
bogus exit code. `deploy/vps/learning-studio.service` and its env example put
`~/.local/bin` on that `PATH`.

### The topic a turn teaches

Deep tutoring names its topic instead of guessing it: the composer on a topic page sends
`POST prompt {text, tema}`, the home chat and the quick notes send no `tema` and are never checked,
and `GET api/tema` / `POST api/tema` hold the selection. A topic the engine does not track — no
`.learning/state.json` — is refused with `400` before the tutor is reached.

### One turn at a time

The studio starts tutor turns; a tutor never starts one by itself. **One turn is active at a
time, studio-wide.** It is held from the moment the studio accepts it until its settle is
decided, and every turn start while it is held is refused with `409` and the Spanish sentence
`El tutor está trabajando; espera a que termine.` The routes that start a turn are `POST prompt`
(the composer), the hosted view's `POST submit` (the bridge asks the same lock before it writes
anything), `POST api/regenerar`, `POST api/aprender` and `POST api/metodo`. The routes that need
an idle studio are `POST api/tema`, `POST api/tutor` and the chat switches (`POST api/chats`,
`POST api/chats/abrir`).

Still available while a turn is held: answering a tutor dialog (`POST dialog`), `POST abort`,
`POST restart`, and every read — the library, a conversation's history, the views, the panorama.
`abort` and `restart` release the turn at once, and so does a dead runtime. Every exit releases
**only its own turn** (`releaseTurn(owner)`), so a settle that returns from a slow engine call can
never release the turn the learner started after an abort or a restart.

### The engine gate, for both tutors

The studio owns the settle rule for Pi and Antigravity alike; the rule lives in
`studio/runtime.ts` and the statuses and failed checks in `integrations/pi/gate-rules.ts`. When a
turn settles the studio runs `learning status` for the topic the turn teaches and streams a `gate`
event with the verdict. A report clears the turn when its status is `accepted`, `completed`,
`waiting` or `skipped` and no check reads `FAIL`; a turn that teaches no topic is never gated.

When the report does not clear it, the tutor gets **one follow-up prompt on the same turn**
carrying the engine's own words (`FAIL <id>: <reason>`), bounded by `MAX_CORRECTIONS` (`2`,
exported by `integrations/pi/gate-rules.ts`, spent once per learner turn). When the budget is gone
the learner reads, in the chat, `El tutor no pudo terminar: …` with what the engine still wants.
The studio's own prompts start with `Learning gate:` or `Learning engine:` and are never shown or
stored as something the learner typed.

The same rule, per runtime:

- **Antigravity** runs one plain `agy -p` process per turn, so the studio is the only thing that
  can bind it. Nothing else gates it.
- **Pi inside the studio** keeps its stage pushes (method, planning, remedial, explanation — they
  chain the tutor's own work) but leaves a *failing* stage to the studio, so a stage is corrected
  once, not twice: with `LEARNING_SETTLE_GATE=studio` the adapter ends the turn instead of
  re-prompting. **A standalone Pi session** (a terminal, no studio) still gates itself: it asks
  the engine, corrects up to `MAX_CORRECTIONS` and leaves an explicit *blocked* entry when the
  engine is missing or prints no report.
- **An engine that is missing or unreadable** therefore differs by where the turn runs: inside the
  studio it is a `notice` in the chat (`El motor no pudo revisar «…»`) and the turn ends without
  the engine's verdict; a standalone Pi session fails closed with a blocked entry.

A failing verdict also blocks the next deep turn on that topic with `409`, after the engine is
asked once more, so a topic that passes again is released. `POST api/restart` works while a turn
runs and replaces the tutor: the way out of a turn that never settles.

### The part's own checks, run by the studio

The engine reads a part's structure; it cannot see how its figure is drawn. Once the engine has
cleared a turn, the studio measures the part notes that turn wrote or edited — the paths come from
the turn's own `write`/`edit` events, never from the plan — with the four tools the tutor's skill
already names:

| Tool | What it measures |
| --- | --- |
| `tools/scene-gate.mjs` | the canvas: type below 11 px, a piece on or past the `viewBox` edge, a blank band taller than 60 units, text outside the canvas |
| `tools/scene-lint.mjs` | how the pieces of a scene live together: a stroke over text, an arrow to nowhere, a buried or oversized head, two labels on top of each other |
| `tools/deck-gate.mjs` | the ink: a word outside its box, a free label crossing a box, a label on an arrow |
| `tools/explain-check.mjs` | the whole standard, rule by rule (it measures the figure again through `scene-lint`) |

`scene-gate` runs first: a figure drawn past the edge of its own canvas is clipped in the reader no
matter how well its pieces live together, so the learner hears about that before the rest. They run
with **the studio's own Node** (`process.execPath`), never `node` from `PATH`: one of them imports a
`.ts` module and the distro's Node 22 cannot load it, which already broke a deploy. A
note is the `.md` the standard is written in, so a rich `.html` part is measured through the note
beside it. This applies to every topic, including one whose `.learning/rules.json` is frozen: the
engine's exemptions are about shape, not about a figure drawn over its own text.

On findings the tutor gets **one correction turn on the same turn**, through the same gate path,
carrying each tool's exact output and the fix, and spending the same `MAX_CORRECTIONS` budget the
engine's corrections spend. When the budget is gone the learner reads, in the chat,
`La parte todavía tiene problemas visuales: <n> hallazgo(s). El primero: <el primero>. Se agotaron
las 2 correcciones.` — never a silent pass. A tool that cannot run at all (missing, crashed,
timed out, or failed without naming a finding) is a **check failure for the studio's log**, not a
finding for the tutor: nobody is asked to fix a part that was never measured. A turn that wrote no
part runs no checks.

### The learner's questions are asked by the page

- **The study mode.** `POST api/aprender {text, modo}` — the «Aprender algo nuevo» entry on the
  home and in the tutor panel — takes `rapido`, `universitario` or `examen`; without one it is `400`
  and nothing reaches the tutor. The source text may be up to 200000 characters; a longer source is
  refused with `400` and its character limit. The home entry and tutorial show all three modes. The
  mode travels in the turn's prompt as one explicit line (`[Modo de estudio: …]`, built by
  `modeLine` in `studio/runtime.ts`), and the studio tells each tutor never to ask or choose the
  mode. For `examen`, the tutor then asks whether the exam is oral, written or practical, and, for
  practical, what kind of practice it requires. Antigravity's contract says not to ask for the mode
  on every turn; inside the studio Pi's system prompt carries the same rule (the adapter's
  `before_agent_start`, studio mode only).
- **Exam topic tag.** A topic whose engine state contains `exam` shows an `Examen` tag in the
  library; its title and accessible label identify the exam format.
- **A concept question is answered in the chat.** «¿qué es la varianza?», «¿qué significa varianza
  finita?»: one line of definition, the topic's running example when the chat is about a part or a
  topic, and one visual when it helps (a small `lk-scene` or an annotated formula). Nothing is
  created on disk and no command runs to answer it. `«Aprender algo nuevo»` is offered only when
  the learner asks to study a whole new topic («quiero aprender X», «enséñame un tema nuevo»): then
  one line points at the entry and nothing is created. A part chat names its part — the studio adds
  `[Parte en curso: Parte N «<título>» de <tema>. …]` to the submission the hosted view sends — so
  the answer can use the example that part already runs. Both contracts are pinned as text by
  `integrations/pi/index.test.mjs` and by the studio's own suite: the instruction is asserted, a
  model's compliance is not.
- **The creation turn.** A `universitario` request teaches a topic that does not exist yet, so the
  turn starts with no topic and binds to the first successful `write`/`edit` whose path resolves to
  a topic folder (`topicFromPath`, the same rule the next-step offer uses). That folder is gated
  like any other topic — the studio asks the engine even before `.learning/state.json` exists, and
  the engine answers in its own words (`FAIL state-initialized: run not initialized: …`), so a
  tutor that wrote the plan and stopped is corrected. If it wrote nothing under a topic folder the
  turn ends with `El tutor no creó ningún tema todavía.` A `rapido` request writes under `rapidos/`,
  teaches no topic and is never gated.
- **The method.** At the engine's `method` stage the topic page asks Pareto or Preferencias;
  `POST api/metodo {tema, metodo}` records the choice with the engine's own command
  (`learning method --root … --workspace … --rules … --method pareto|preferencias --json`) and
  starts exactly one deep turn so the tutor plans with it. Inside the studio the Pi adapter no
  longer pushes the method question; a standalone Pi session still does.

### The next step at the end of a turn

Every tutor turn ends with **exactly one** next-step button, under the reply (`.next-cta` in the
chat, `offerTurnEnd` and `nextStep` in `studio/ui/studio.js`). The step is read from the engine's
own report on the topic the turn taught — the library is fetched again when the turn ends, so the
engine decides, never the files the turn happened to write. A turn that wrote nothing still gets
it: the `state` event carries `tema`, the topic of the last turn start (`null` when the turn
taught none), and the topic of the last successful `write`/`edit` is the fallback for a turn that
bound its topic while it ran. A turn that taught no topic offers none.

What the engine reports decides the button:

| Engine report | Button |
| --- | --- |
| `waiting`, stage `diagnosis` | «Responder el diagnóstico» → `#/leer/<topic>/quiz` |
| stage `method` with no recorded method | «Elegir el método» → the topic page's method card |
| a part that is written and still owes `explanation` or `quiz` | «Ir a Parte N» → `#/leer/<topic>/<part>` |
| a part the engine points at that is not written | «Escribir la Parte N» → one turn (`POST prompt`) |
| `remedial` (the part's mini-quiz failed) | «Regenerar Parte N» → one deep turn (`POST prompt {text, tema}`) |
| `completed` | «Repasar mis lagunas» |

A failed mini-quiz is the engine's remediation, not a rewrite: the part stays closed as failed and
owes the intermediate part declared right after it in `plan.json` (`<parte>r<n>`, with `remedia`
and `analisis`, and a mini-quiz whose questions are new). «Regenerar Parte N» asks the tutor for
exactly that, in a deep turn, so the gate judges it against the engine like any other turn. It does
not go through `POST api/regenerar`, whose contract is the opposite one — move the part to the
trash and keep the plan unchanged.

The same step is on the topic page (`continueCard` in `topicView`), so a reload never loses it, and
the results view of a submitted quiz offers it once the tutor has read the answers. One button per
destination: when the engine's step already opens the note the turn wrote, the note is not offered
a second time under the same reply, and the head keeps «Ir a la nota» / «Ir al diagnóstico».

Every button that starts a turn goes through the existing post path, so the single-turn rule holds:
pressed while the tutor works, it starts nothing and the chat shows the Spanish
`El tutor está trabajando; espera a que termine.` The button stays usable — nothing is queued.

### What tests prove, and what they do not

Byte for byte, the tests assert the prompts each tutor receives: the mode line inside the turn, the
no-mode rule in Antigravity's contract and in Pi's studio system prompt, the concept-question rule
and the one case that still points at «Aprender algo nuevo», the part a part chat names, the
correction carrying the engine's failing reason, the bound topic of a creation turn, and the
Spanish refusals. The part's own checks are proven with the repo's real tools on real notes: a part
whose arrow crosses its text asks for exactly one correction carrying `trazo-sobre-texto`, a part
that passes asks for none, a spent budget shows the Spanish notice, and a turn that wrote no part
runs no checks — for Pi and Antigravity alike. One
conformance scenario runs unchanged against both runtimes: the turn is held while it runs, one
correction per failing settle carrying the engine's reason, the turn released when the engine
clears, the Spanish stop when it never clears, the hosted view refused with the Spanish `409`
while the turn is held, and the gate prompt never served as the learner's message. The next step is
proven for both runtimes too: the button each engine state calls for (Parte 1 written, a passed
mini-quiz, a failed one), the same step after a reload, a turn that writes nothing, and the Spanish
refusal that starts nothing. What no test can prove is a model's compliance: the instructions are
asserted as text, and only the engine's verdict binds the outcome.

## Conversaciones

El cajón del tutor lleva arriba la lista de conversaciones. Cada una tiene el nombre que le
diste, un ancla opcional a la parte desde la que se abrió, y el identificador que cada
runtime necesita para retomarla. La lista vive fuera del vault, junto a `opened.json`
(`$XDG_STATE_HOME/learning-studio/chats.json`); un archivo dañado se reporta y arranca vacío
en vez de impedir que el estudio abra.

La conversación que el estudio ya tenía es la primera de la lista, «Chat general»: no se
borra ni se reinicia al actualizar. Abrir una parte (`#/leer/<tema>/<parte>`) activa la
conversación anclada a esa parte y la crea la primera vez, así que volver a abrirla no
multiplica chats. Una parte tiene como mucho una conversación anclada.

| Ruta | Qué hace |
|---|---|
| `GET api/chats` | La lista, con el uso de contexto de la conversación activa |
| `POST api/chats` | Crea una conversación con `{nombre, ambito?}` y la activa |
| `POST api/chats/abrir` | Abre por `{id}`, o por `{ambito}` creándola si aún no existe |
| `POST api/chats/renombrar` | Cambia el nombre: 1 a 80 caracteres, recortados |
| `POST api/chats/borrar` | Borra una conversación que no sea la activa |
| `POST api/chats/exportar` | Exporta la conversación activa a HTML y devuelve su ruta |

Borrar la conversación activa se rechaza con 409: el archivo de sesión que un agente está
escribiendo no se borra. Al borrar otra, el estudio elimina su `.jsonl` solo si está dentro
del directorio de sesiones de Pi; cualquier otra ruta se deja intacta.

Cada runtime retoma su conversación a su manera. Pi cambia de sesión con `switch_session`
sobre su único proceso y registra el archivo que `get_session_stats` reporta. Antigravity
lleva un id de `--conversation` guardado en el chat, porque su turno es un proceso aparte.
Una conversación empezada con un agente no se traslada en silencio al otro: al cambiar de
agente, el nuevo empieza la suya y la guarda en ese mismo chat.

El uso de contexto solo lo puede medir la sesión en la que Pi está, así que la barra muestra
el valor de la conversación activa y el último conocido de las demás; Antigravity no informa
ninguno y su fila no muestra barra. Las filas de herramientas pertenecen a la conversación
que las produjo: el evento `tool` lleva el id del chat y el navegador descarta las que no son
de la activa.

## La señal de ocupado y el turno interrumpido

El estudio escribe, junto a `opened.json`, dos archivos de estado que un despliegue lee sin
token (`$XDG_STATE_HOME/learning-studio/`):

- `busy.json`: `{"busy": true, "pid", "startedAt", "topic"}` mientras un turno está en
  vuelo. Se escribe al aceptar el turno (antes de pedirle nada al runtime) y se borra cuando
  el turno termina. `deploy/vps/update.sh` lo lee para no reiniciar el estudio mientras el
  tutor trabaja; la regla vive en `studio/state.ts` y el despliegue la consulta con
  `node studio/state.ts --busy <archivo>`. Un marcador cuyo proceso ya no existe, o cuyo
  turno empezó hace más de una hora, es un resto de un estudio caído y nunca bloquea un
  despliegue.
- `conversacion.json`: la copia que el estudio guarda de la conversación activa
  (`{version, chat, messages, interrupted}`). Se escribe al aceptar el turno, cada vez que
  llega un mensaje del alumno o del tutor, y otra vez al cerrar el proceso (SIGTERM). Si el
  runtime pierde su sesión, el chat se abre con esta copia en vez de quedar vacío.

Un turno que no llegó a terminar queda marcado (`interrupted: {topic, at}`) porque el
proceso que lo sostenía desapareció. Al arrancar, el chat lo dice en español y ofrece el
camino de vuelta: «El turno se interrumpió; el tutor puede seguir con <tema>», con el botón
«Seguir con <tema>», que retoma el tema como un turno profundo. La marca se limpia cuando el
turno termina o cuando el alumno empieza otro; mientras tanto sobrevive a las recargas.

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
- Results (right/wrong, confidence, and diagnostic 'por qué') are recorded locally per explanation (document `telemetria/<topic>`) and globally (document `telemetria`) in the learner database.
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

## Tutor instructions

Before a turn starts, the studio checks that the tutor would read this repo's
instructions: `~/.claude/skills/explicacion-interactiva`,
`~/.agents/skills/explicacion-interactiva` and `<LEARNING_ROOT>/AGENTS.md` must
resolve (`realpath`) to `skills/explicacion-interactiva` and
`deploy/vps/learnings/AGENTS.md` of the repo the studio runs from. When one
resolves elsewhere the turn does not start: the chat shows an error naming the
drifted path and the fix (`deploy/vps/update.sh`), and the request is refused with
`409`. The check is three `realpath` calls, so it runs before every turn of both
runtimes; only a test that does not exercise it starts the studio with
`skipContextCheck`.

The links themselves are made by the deploy, never by hand: see
[deploy-vps](deploy-vps.md#tutor-instructions).

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

The `sugerencias` document of the learner database holds every entry (`{id, tema, parte, motivos, texto,
origen: sugerencia|regenerar, timestamp}`, version 1). It is validated on read and
nothing is repaired behind the learner's back: a document that cannot be parsed reads as
empty and is copied to `sugerencias.corrupta-<stamp>.json` before the next write, and an
entry that no longer matches the shape is copied to `sugerencias.corrupta-<stamp>.json`
before the store is rewritten without it. An empty, healthy store keeps nothing aside.
The learner's words are never lost to a bad edit.

Each chip moves one preference level, deterministically: «Faltan ejemplos» sets
`ejemplos` to más, «Demasiado texto» lowers `texto`, «Matemáticas confusas» lowers
`matematicas` and raises `pasos`. Repeating a suggestion does not stack; it keeps the
aspect where the learner asked for it. The preferences page shows the result, so
the change is visible and reversible. Moving a preference is the only part that can
fail without losing the feedback: if the stored preferences cannot be read, the entry is
still stored and the adaptation simply waits, because a file the learner cannot repair
must not swallow their words.

### A review is of one part, or a lesson for every part

A review says one of two things, and the studio tells them apart when it records it, without a
model and without reading the learner's prose: a review is about **one passage of one part**
(«no entendí esta parte», «de dónde sale `c/(1−γ)`») or it is a **lesson about how explanations
are made anywhere** («faltan visuales», «da pasos intermedios en los ejercicios largos»). The
chips decide it. `faltan-visuales`, `faltan-ejemplos` and `sin-paso-a-paso` name a way of
explaining, so the review is `alcance: "general"` and carries a `regla` — one line, in Spanish,
imperative, at most 140 characters — built from those chips. Anything else (`no-entendi`,
`matematicas-confusas`, `demasiado-texto`, `muy-abstracto`, `sobran-preguntas`, or words with no
chip at all) is `alcance: "parte"`. Both fields are stored in the entry and survive every rewrite
of the store; the page never sends them.

A **general** lesson is read by every turn of every topic, not only by the regenerate of the part
that taught it. `startTurn` appends the block to the prompt of the turn — the one place both
runtimes pass through, so neither can start a turn without it — after the learner's words and
before the runtime's own contract:

```text
Escribe la Parte 1

[Lecciones del alumno (aplícalas siempre)
- Dibuja la cosa misma, no una caja con su nombre: la curva, el icono, el estado que cambia
- Cada idea con forma lleva su figura: si el lector tiene que imaginarla, falta la escena
…
]
```

The block is bounded and deduplicated: at most 10 rules and about 1200 characters, each rule once
(case and trailing punctuation do not make a second rule), the learner's newest general reviews
first and the repo's seed after them, so a lesson that just landed is never crowded out. The block
is the studio's, not the learner's: the chat strips it from the user message before serving it, so
the thread shows what the learner wrote. A **part-specific** review keeps its old path — the
regenerate prompt of its topic, through `tutorContext` — and never becomes a standing rule.

The seed is `studio/lecciones-base.json`: the general lessons of the reviews already read (the
first topic's, 12 of the 14), written down in the repo with the reviews that taught them and what
enforces them, so they apply from the deploy without editing the live `sugerencias.json`. It is
merged with the live general reviews at runtime. `odd/reviews/mapa-sugerencias.md` maps every one
of the 14 to its rule, check or skill section.

A new general lesson enters by itself when the learner picks a general chip: the studio classifies
it, gives it the chip's rule and the next turn — in any topic — already applies it. A lesson that
no chip names, and that several reviews repeat, is written by hand into `studio/lecciones-base.json`
and into the map, with the check or the skill section that enforces it; a rule with nothing that
measures or explains it is an opinion, and the skill is written first.

The loop leans on what is already stored: before writing, the prompts for a part, the
plan and the map carry a compact context built from the stored preferences, the weak
telemetry categories and the last suggestions. The
token-gated routes are `GET api/sugerencias?tema=&parte=` (entries, chips and derived
lines), `GET api/sugerencias/resumen` (every entry grouped by topic and part, with chip counts), `POST api/sugerencias` (record), `POST api/regenerar` (record, back up, prompt)
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

## Learner data

Preferences, suggestions and telemetry live in one SQLite database (built-in
`node:sqlite`, WAL): `STUDIO_DB` when set, otherwise `<LEARNING_ROOT>/learning.db`. Table
`documentos(clave, json, actualizado)` keeps each store's JSON document under its key
(`preferencias`, `sugerencias`, `telemetria`, `telemetria/<topic>`), validated on read
exactly as the files were. The studio and Pi's bridge share it from separate processes.

On the first open of a database, the JSON files the studio used to write
(`preferencias.json`, `sugerencias.json`, `telemetria.json`, `<topic>/telemetria.json`) are
imported once, as they are, in one transaction, and `meta.importado_v1` records it. The
files are never modified or deleted, and a later open imports nothing even if they changed.
`deploy/vps/learnings-backup.sh` commits a consistent snapshot, `learning.db.backup`
(`VACUUM INTO`), and keeps the live database files out of Git.

## Feedback page

`#/sugerencias` («Tu feedback», linked from the preferences page as «Ver tu feedback»)
lists everything said through «Sugerir» and «Regenerar»: the chip counts over all
entries, then one block per topic and part with its counts and the learner's words,
newest first. It reads `GET api/sugerencias/resumen` from the learner database, so it
works without SSH and in every theme.
