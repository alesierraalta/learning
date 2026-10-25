# Learning studio

A local study app: browse every Learnings content and drive the study from the
browser while Pi works in the background with the unchanged skill, engine,
preferences and mode choice (spec: `odd/tasks/learning-studio.md`).

## Start

```bash
estudio            # shell function in ~/.bashrc: rebuilds bin/learning if needed, starts, opens the browser
estudio --no-open  # print the URL only
```

`node studio/server.ts` is the same without the engine rebuild. `LEARNING_ROOT`
overrides the Learnings folder. Ctrl+C stops the studio and its Pi.

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

## Design and tutorial

The UI uses the visual language of the Learnings slides
(`~/Developer/learnings-video-runs/slides`: `deck.css`, `illus.py`): white paper, the
slides' serif (Tinos, metric-compatible with Liberation Serif, pinned with SRI), boxes
with 2px strokes, dashed containers, illustrated objects and the deck palette.
`studio/ui/tutorial.js` is a six-slide deck in that style (1920×1080 slides scaled to the
window, pieces revealed step by step, keyboard ← → and Esc). It opens on the first visit
and from the «Tutorial» button; the studio listens on port 4747 (`STUDIO_PORT`; a taken
port falls back to a free one) so the browser remembers that it was seen.

## Contract and security

The server ↔ UI API is the contract in `odd/tasks/learning-studio.md`. Every
route needs the token; the Host header must be loopback; a POST must come from
the studio origin with a JSON body of at most 64 KiB (prompts up to 20 000
characters). The bridge allows only the studio origin to frame its pages
(`frameAncestors`). The shell page frames nothing but that bridge.

## Tests

```bash
node --test studio/*.test.mjs   # real server, fake Pi (studio/testdata/fake-pi.mjs)
```
