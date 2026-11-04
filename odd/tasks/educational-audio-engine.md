Objective: every Learnings part can also become audio — a 20-minute podcast in four styles, authored from that part's note, with a generate-and-download control on the page — using our own engine, not a one-off script.
Branch: feat/tutor-runtime (shared worktree; no branch switch while another session edits studio/) · Delivery: ask-on-risk · Runner: `node --test tools/audio/test/*.test.mjs`, `node --test integrations/pi/*.test.mjs`.

## Specs

- S1 (engine): audio is a versioned engine in this repository (`tools/audio/`), one spec per part and style; a new note needs a spec file and no engine change. ("necesito crear un motor ... que también tenga la posibilidad de ... solamente me genere un audio")
- S2 (styles): four styles exist — `debate` (dos personas con posturas opuestas), `entrevista` (una pregunta, otra responde), `charla` (dos voces explicando juntas) and `formal` (una sola voz explicando). Every style draws only on the part's own note. ("Ya sea dos personas hablando, debatiendo sobre temas, obviamente de lo que involucra la nota o la explicación. De estilo explicación más formal, que sea alguien explicando el tema")
- S3 (grounding): the script is authored section by section from `explicaciones/Parte N - <slug>.md`; it adds no claim, number, source or anecdote the note does not support. An example may be extended, never invented.
- S4 (length): target 20 minutes, accepted window 18–22. The engine estimates duration from word counts before rendering and refuses a spec outside 12–28 minutes, so a five-minute fragment cannot ship as a podcast.
- S5 (voices): the vault voices `es-ES-AlvaroNeural` and `es-ES-ElviraNeural` at `-4%`, one distinct voice per speaker; `formal` has exactly one speaker. Output 48 kHz.
- S6 (delivery): `explicaciones/adjuntos/audio/Parte N - <slug> - <style>.m4a` plus the `.srt` transcript: AAC 128k, loudness −16 LUFS, one chapter per note section, and the part title exactly as the note names it.
- S7 (control): every part node shows an audio control — the versions that exist as player and download, and a generate control per style. The control asks the tutor, then becomes a player when the file exists. ("en cada nota aparezca el botón de generar audio y se pueda descargar")
- S8 (download): each delivered audio is downloadable as `.m4a`, and its transcript as `.srt`, from the same control.
- S9 (proof): RL Parte 1 is delivered as a real debate of about twenty minutes, playable on its live page, with ffprobe evidence (duration, AAC 48 kHz, chapters) and a downloaded copy byte-compared with the vault file.

## Tasks

- T1 S1,S5 engine core: spec schema + validation, turn cache keyed by voice+text, pure timeline (gaps, chapters, cues, duration estimate) — inline
- T2 S5,S6 synthesis + assemble: `synth.py` (edge-tts per turn, boundaries, stale detection) and `render.mjs` (concat with gaps, loudnorm, m4a chapters, srt, report) — inline
- T3 S1,S4 tests and CI: spec, timeline and render CLI suites with ffmpeg fixtures; glob added to the CI suite step — inline
- T4 S6 delivery contract + docs: engine README, naming rule, skill `learnings-audio` — inline
- T5 S7,S8 bridge: `partAudioInfo`, audio MIME types, payload in both routes, `ensureNodeAudio`, `{kind:"audio"}` prompt — inline
- T6 S7,S8 kit and SPA: `lk-audio` component, kit.css, audio block in `view/app.js`, adapter tests — inline
- T7 S9 real run: author the debate spec for RL Parte 1 (~2 900 words), synthesise and render on the VPS, deliver, verify the live page and the download — inline
- T8 close: docs (`docs/kit.md`, `docs/integration.md`), full suites, review gate, memory — inline

## Log

- L1 (2026-11-04, user, verbatim): "¿Te acuerdas del motor que integramos para el tema de video? O sea, para generar videos y todo eso. Ahora necesito crear un motor, o llámalo como quieras, llama un framework, como le quieras decir, que también tenga la posibilidad de no generar videos solamente, o sea, no generar video y audio, sino que solamente me genere un audio. Como si fuese un podcast de 20 minutos con distintos estilos. Ya sea dos personas hablando, debatiendo sobre temas, obviamente de lo que involucra la nota o la explicación. De estilo explicación más formal, que sea alguien explicando el tema, etcétera, etcétera, etcétera. Pero necesito, y de paso que en cada nota aparezca el botón de generar audio y se pueda descargar, evidentemente. Entonces, bueno, eso."
- L2 (decision, 2026-11-04): styles = the four in S2; length = 20-minute target adapted to the note; download = audio + transcript. The user was asked and answered "continua", so these defaults are adopted rather than blocking.
- L3 (evidence, 2026-11-04): the VPS has exactly three `es-ES` voices (`AlvaroNeural`, `ElviraNeural`, `XimenaNeural`). Two hosts therefore use Alvaro + Elvira; `formal` uses Alvaro alone. No second locale is mixed in: one accent for the whole podcast.
- L4 (decision): output is `.m4a` (AAC 128k, 48 kHz, −16 LUFS, chapters) plus `.srt`; a single `.mp3` was rejected because chapters and normalised loudness are what make a 20-minute file listenable on a phone. Delivered under `adjuntos/audio/` so video attachments stay legible.
- L5 (evidence, seams): `integrations/pi/bridge.ts:1055` builds the page config, `:1080` the SPA part payload, `:1297` maps `{kind:"video"}` to a tutor prompt; `integrations/pi/kit/kit.js:147` is `lk-video`; `integrations/pi/view/app.js:526` is the SPA video block; `.github/workflows/ci.yml:90` runs the video suites.
- L6 (decision): synthesis runs on the VPS with the existing `~/learnings-video/.venv` (edge-tts 7.3.1); assembly needs only ffmpeg, so the renderer runs locally too. No Chromium, no new host.
- L7 (decision): the engine never invents audio content. The tutor authors the spec from the note (skill `learnings-audio`), the engine synthesises and assembles it, and a spec that names a claim its note lacks is a content defect the audit reports, not a rendering choice.
