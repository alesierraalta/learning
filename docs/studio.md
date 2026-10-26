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

## HTTPS reverse proxy

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
window, pieces revealed step by step, keyboard ← → and Esc). From a terminal, `learning web` opens it (it reuses the studio already running on the
port instead of starting a second one), `learning chat` opens the study chat, and
`learning <engine command>` runs the engine. It opens on the first visit
and from the «Tutorial» button. Open it at **http://127.0.0.1:4747/**: that stable address
redirects to the current run's token URL. The studio listens on port 4747 (`STUDIO_PORT`; a taken
port falls back to a free one) so the browser remembers that it was seen.

## Contract and security

The server ↔ UI API is the contract in `odd/tasks/learning-studio.md`. Every
route needs the token; the Host header must be loopback or the configured public
host; a POST must come from
the studio origin with a JSON body of at most 64 KiB (prompts up to 20 000
characters). The bridge allows only the studio origin to frame its pages
(`frameAncestors`). The shell page frames nothing but that bridge.

## Tests

```bash
node --test studio/*.test.mjs   # real server, fake Pi (studio/testdata/fake-pi.mjs)
```
