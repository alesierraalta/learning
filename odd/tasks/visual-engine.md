# Visual engine

Draw every note figure from its meaning, in one theme that has a light and a
black paper, and refuse the figures that are typed by hand.

## Specs

- **S1** The engine lives in this repository (`tools/visuals/`) and owns the
  drawing: a note names meaning, never coordinates.
- **S2** No hand coordinates, no glyph arrows (`→`, `↑`), no `rgba()` layered
  over an assumed white page.
- **S3** One token set, two papers: `light` and `dark`, selected by
  `prefers-color-scheme` or `data-theme`.
- **S4** On black, fills mix against the black paper and the ink is light —
  a figure must not become invisible or shout.
- **S5** The note stays the source: a figure is a JSON scene, like
  `lk-walkthrough` decks already are.
- **S6** Meaning is structure: `kind: "policy"` with a `dir`, `kind: "value"`
  with a `value`, `wall`, `exit`, `hazard`, `robot`.
- **S7** One arrow rule: a path with a real head, and a label placed by rule.
- **S8** A note that draws by hand is refused by a gate, not by review memory.

## Tasks

| id | what | specs | state |
| --- | --- | --- | --- |
| T1 | `tools/visuals/`: theme, colour mixing, label placement, scene markup, CLI | S1 S2 S3 S4 S6 S7 | done |
| T2 | Note gate refusing hand-written `<svg>`, `rgba()`, glyph meaning, unknown keys | S2 S8 | done |
| T3 | Tests for what the engine draws and refuses, and for what the gate refuses | S1 S2 S5 S8 | done |
| T4 | Reader component (`lk-figure`) so the note renders the scene in the reader's theme | S3 S5 | pending |
| T5 | Migrate the figures of the published notes to scenes | S5 S6 | pending |

## Log

- **L1** The user, on a diagram in the Parte 3 note: the diagrams "se generan
  bastante deficientes, parecen hechos por gemini 2 flash", and asked for our
  own visual engine with absolute control, with the theme adapted.
- **L2** Diagnosis: both figures were hand-written SVG — every coordinate
  typed, arrows as the characters `→`/`↑`, fills as `rgba(...)` over white.
  Meaning lived in the colour value, so nothing could restyle or audit them.
- **L3** Rebuilt after the parked copy was lost: the module set is theme,
  colour mixing, label placement, scene markup, CLI, gate.
- **L4** First screenshot pass found three real defects: the arrowhead was
  never defined for a policy drawn inside a cell (only scene-level arrows
  registered their tone), a hazard with its own label had a cross drawn on top
  of the text, and the page nested a `<style>` inside another so its CSS
  printed as text. All three fixed and re-verified by screenshot.
- **L5** T4 is blocked on the kit: `integrations/pi/kit/kit.js` has no scene
  renderer on `main`, and the component belongs to whoever owns the reader.
  T5 has no material yet: the published Parte 3 note carries zero `<figure>`
  blocks, so the gate already passes on it (`0 figure(s)`).
