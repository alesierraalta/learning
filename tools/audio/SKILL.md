---
name: learnings-audio
description: Turn a Learnings part into a 20-minute episode — debate, interview, chat or one-voice explanation — with the engine in tools/audio.
---

# Authoring an audio part

Trigger: "genera el audio de la parte 3", "haz el podcast de esta explicación",
"quiero la parte en formato debate", "un audio de 20 minutos de esto".

The engine (`tools/audio/`) does the voices, the pacing, the chapters and the
transcript. You write **one spec**: the words, in turns, with a style. Read
`tools/audio/README.md` before your first spec; it is the contract.

## 1. Read the note, then decide the shape

Read the whole part note (`<topic>/explicaciones/Parte N - <slug>.md`). Its
`##` headings are your chapters, in that order — a listener should be able to
name the same sections as a reader. Do not reorder them to make a better story;
reorder the note instead, in the note.

Pick the style from what the user asked, and from what the note supports:

| style | when it works | shape of a turn |
| --- | --- | --- |
| `debate` | the part has claims with limits, trade-offs, "it depends" | A states, B pushes with the counter-case or the edge, A refines |
| `entrevista` | the part is new to the listener; questions are the syllabus | B asks 8–15 words, A answers 60–120 |
| `charla` | the part is a tour with many moving pieces | both build on each other, 40–90 words each |
| `formal` | the user wants a lecture, or the part is procedure | one voice, 90–130 words, explicit signposts |

## 2. Budget the words before writing them

Speech runs at about **158 words a minute** for Alvaro and Elvira at −4% — measured,
not assumed: the delivered RL Parte 1 debate rendered 2 893 words as 18:53, gaps included.
A 20-minute episode is therefore **about 3 000 words**, and a part with six chapters
needs about 500 words each. (Older versions of this skill used 145 and produced a
17-minute episode: the estimate is a budget, so it is calibrated on real audio.)
Write the budget down first: a spec that undershoots is padded with filler, and a
spec that overshoots is cut badly.

```bash
node tools/audio/render.mjs --spec <spec> --dry-run
```

Run this after every chapter you write. The command prints each chapter's
word count and the running estimate, and refuses a spec outside 12–28 minutes.
You want to land at 18–22 and be told so by the numbers, not by your sense of
length.

## 3. Write turns, not paragraphs

- A turn is what one person says between two other people speaking. If a turn
  needs a colon and a bullet list, it is two turns.
- `debate` and `charla` alternate: never two consecutive turns by the same
  speaker, and both voices appear in every chapter.
- `entrevista` never lets B answer their own question.
- `formal` may have one speaker throughout, but still changes its move every
  turn: claim, mechanism, example, limit, next.

Do not write the speaker's name into the text, do not write "(pausa)", do not
narrate sound effects. The only punctuation that reaches the voice is the
punctuation you write: a comma is a breath, a full stop is a beat, a dash is a
cut. Numbers are read as numbers — write "0,9" or "noventa por ciento" the way
you want it heard, and never "1e-3".

## 4. Ground every claim in the note

This is the rule that makes the audio worth listening to:

- every claim, number, formula and example exists in the note, in the same
  sense; you may expand an example the note gives, never invent one;
- a formula is spoken, then named: "el retorno descontado, suma de las
  recompensas por el factor de descuento elevado al paso";
- a table or a figure is described by what it shows, not by its position: "en
  la tercera iteración la política ya elige la puerta correcta";
- if the note is thin on a chapter, the episode is thinner there: say less, do
  not fill the gap with general knowledge.

When the note and the user's framing disagree, the note wins and you say so.

## 5. Produce it

```bash
python3 tools/audio/synth.py --spec <spec> --out ~/.cache/learning-audio/<name>
node tools/audio/render.mjs --spec <spec> --audio ~/.cache/learning-audio/<name> \
  --out "<topic>/explicaciones/adjuntos/audio/Parte N - <slug> - <style>.m4a" \
  --srt "<topic>/explicaciones/adjuntos/audio/Parte N - <slug> - <style>.srt"
```

Synthesis needs the venv with `edge-tts` (on the VPS); rendering needs only
`ffmpeg`. If the voice cache lives on another machine, pass
`--remote user@host:path` to the renderer instead of copying by hand.

## 6. Verify, then report

1. the render printed a duration inside 18–22 minutes and the chapter count
   matches the note's sections;
2. `ffprobe -v error -show_chapters <file>` names those chapters;
3. the `.srt` first and last cues land where a listener hears them;
4. the part page shows the new style as a player with its download.

Report the file, the duration, the style and the number of turns. If any check
fails, fix the spec and re-render — never hand-edit the `.m4a` or the `.srt`.
