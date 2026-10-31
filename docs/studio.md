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

## Wide reading mode

Every part page carries a **Modo ancho** toggle in its top-right corner. Off by
default: the reader keeps one narrow column. Switched on, on a screen at least
1080px wide, the prose spreads into two columns, headings, tables, code and the
app button span both, and the page uses up to 1400px of the monitor. The choice is
remembered per browser, so it survives a reload and a studio restart; below 1080px
the text stays in one column even with the mode on. Interactive apps and the
mini-quiz are not affected: only the explanation text is a reading surface.

## Panorama del tema

Every topic page carries **Panorama del tema**: the whole picture of one topic,
in two views that share one header.

- `#/panorama/<topic>` is **Planificación**: the route built from `plan.json` and
the tutor's `planificador.md` — one row per part with its `subtema`, what the
diagnosis knew, the depth the plan asked for and the reason it gave, then the
plan's own sections as openable blocks (the first one open). A part the tutor
still owes is a request («Escribir esta parte»), not a dead label.
- `#/panorama/<topic>/mapa` is **Mapa de dependencias**: `mapa.mmd` drawn by the
studio itself, one column and frame per `subgraph` (that is, per subtema),
`classDef` colours as the node tone, drag to travel and the wheel to zoom. Any
box opens: what it needs, what it unlocks, and the part of the route that
explains it, with the button that reads it or asks for it.

The two views never repeat each other: `parsePlan` drops the
table under the /^tabla de plan$/i. heading (it already is the route) and the
/^mapa de dependencias$/i. section, whose Mermaid diagram is replaced by the map
view, and counts it so the section can say «su diagrama vive en el mapa».

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

A concept no part covers is not a dead end: the box says so and offers
«Pedir la parte de (subtema)», a request whose text names the subtema the tutor
should write. The request names the number itself when the subtema stops at three
segments, and its parent when the concept sits four levels deep.

The map is drawn by the studio, not by Mermaid: the shell page loads marked and
DOMPurify only, and a picture whose boxes must open, follow a pointer and hold
their own detail panel needs geometry the client owns.


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
Microphone capture requires HTTPS remotely (loopback HTTP still works).

## What runs

- `studio/server.ts` listens on 127.0.0.1 behind a per-run token and spawns
  `pi --mode rpc --session-id estudio` in the Learnings folder with
  `GENTLE_SHELL_INTERACTIVE_HOST=1`, so Gentle asks its questions (university or
  quick mode, any `ask_user_choice`) as RPC dialogs the studio shows as buttons.
  The `estudio` session id keeps one persistent conversation of its own; a Pi
  open in a terminal is never written by two processes.
- It hosts its own study-view bridge (`integrations/pi/bridge.ts`): part pages,
  rich pages, apps, the diagnosis and quick notes open in the center viewer, and
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
