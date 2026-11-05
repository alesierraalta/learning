# The audio engine

One part of a note becomes one listenable episode: a debate, an interview, a
conversation between two voices, or a single voice explaining. The engine owns
the mechanics — voices, pacing, chapters, loudness, transcript — and takes the
words from a JSON spec the tutor writes from the note.

```
spec.json ──synth.py──▶ <key>.mp3 + <key>.json   (per turn, cached, on the VPS)
                          │
                          └──render.mjs──▶ .m4a (48 kHz mono, −16 LUFS, chapters)
                                            .srt (the same words, timed)
```

Nothing is generated twice: a turn's cache key is the hash of its voice, the
rate and its exact words, so editing one line re-records one turn.

## Commands

```bash
# 1. Ask what the spec will cost, before recording a single word.
node tools/audio/render.mjs --spec tools/audio/specs/rl-p1-debate.json --dry-run

# 2. Record the turns. Needs edge-tts: run it where the venv lives.
python3 tools/audio/synth.py --spec tools/audio/specs/rl-p1-debate.json \
  --out ~/.cache/learning-audio/rl-p1-debate

# 3. Assemble. Needs only ffmpeg.
node tools/audio/render.mjs --spec tools/audio/specs/rl-p1-debate.json \
  --audio ~/.cache/learning-audio/rl-p1-debate \
  --out "content/<topic>/explicaciones/adjuntos/audio/Parte 1 - <slug> - debate.m4a" \
  --srt "content/<topic>/explicaciones/adjuntos/audio/Parte 1 - <slug> - debate.srt"
```

`--remote user@host:dir` fetches a missing take over scp, so the recording step
can stay on the machine that owns the voice cache. `--date YYYY-MM-DD` pins the
metadata date; `--work` keeps the intermediate wavs somewhere explicit.

## The spec

```json
{
  "part": "p1",
  "title": "Agentes que actúan",
  "topic": "aprendizaje-por-refuerzo",
  "style": "debate",
  "minutes": 20,
  "chapters": [
    { "title": "Qué es un agente", "segments": [
      { "speaker": "A", "text": "…" },
      { "speaker": "B", "text": "…" }
    ]}
  ]
}
```

`style` is one of `debate`, `entrevista`, `charla`, `formal`. `voices` overrides
the style's roster:

| style | A | B |
| --- | --- | --- |
| `debate` | Alvaro | Elvira |
| `entrevista` | Elvira | Alvaro |
| `charla` | Alvaro | Elvira |
| `formal` | Alvaro | — |

`A` is the host or the explainer, so `entrevista` opens with Elvira asking and
Alvaro answering.

Rules the renderer enforces, all of them before any recording is loaded:

- every turn is 6–130 words; longer is a monologue, shorter is a sound bite;
- a conversation needs both voices in every chapter and never repeats a
  speaker on consecutive turns — two turns by the same voice are one turn;
- `formal` declares exactly one speaker;
- the whole part is at least 200 words, and its estimate must land between 12
  and 28 minutes of speech (the target is `minutes`, default 20, ±2 min warns).

A part under 12 minutes is not a podcast; split the spec into one spec per
part rather than padding it.

## What the output carries

- AAC 128 kbit/s, 48 kHz, mono, `loudnorm=I=-16:TP=-1.5:LRA=11` — the level a
  phone and a car stereo both agree on;
- one chapter per `chapters[]` entry, titled with the spec's own title;
- an `.srt` built from the synthesiser's word boundaries, so the transcript is
  the audio and not a second copy of the script;
- `<work>/report.json`: the measured duration, the turns, the cues, the voices
  and the estimated-vs-actual minutes, so a delivery can be audited later.

## Failure modes

| message | meaning |
| --- | --- |
| `missing N recording(s)` | the synthesiser never ran for these turns, or ran elsewhere: run it, or pass `--remote` |
| `stale recordings` | the take says other words than the spec: re-synthesise that turn (the key changed) |
| `must land between 12 and 28 minutes` | the spec is too short or too long; rebalance chapters, do not stretch sentences |
| `edge-tts is not installed` | `synth.py` needs the venv that has `edge-tts`; install it there, not here |

Synthesis stops at the first network error and keeps the cache, so re-running
resumes where it stopped instead of re-recording the whole part.

## Files

- `lib/spec.mjs` — the spec's contract: styles, voices, `validate`, `readSpec`.
- `lib/timeline.mjs` — pure planning: turn order, silence, chapters, cues,
  duration estimate, SRT.
- `lib/audio.mjs` — the recorded cache: load, verify the words, measure.
- `synth.py` — edge-tts, one take per turn, boundaries per take.
- `render.mjs` — the one command that produces the `.m4a` and the `.srt`.
- `test/` — the suites; they need `ffmpeg`, never the network or a real voice.
