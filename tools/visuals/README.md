# Visuals

Notes used to carry hand-written SVG: every coordinate typed by hand, arrows
drawn as the characters `→` and `↑`, fills as `rgba()` over an assumed white
page. Meaning lived in the colour value, so a diagram could not follow the
reader's theme, could not be audited, and could not become a video frame.

This module draws a figure from its meaning instead.

```
note.md ──scene JSON──▶ tools/visuals ──▶ SVG (vars, for the reader)
                                       └─▶ SVG (static, for a still or a frame)
```

## Draw one

```bash
node tools/visuals/index.mjs --scene escena.json --html escena.html
node tools/visuals/index.mjs --scene escena.json --theme dark --mode static --out escena.svg
```

`--html` writes the same scene three times — light, dark, and a live copy that
switches theme on click — which is how a figure gets checked before it ships.

## In the reader

The same drawing is a reader component. A note carries the scene and
`<lk-figure>` draws it in the page's paper:

```html
<script src="../kit/visuals/draw.js" defer></script>
<script src="../kit/kit.js" defer></script>

<lk-figure>
<script type="application/json">
{"title":"El almacén","viewBox":"0 0 760 290",
 "grids":[{"x":16,"y":40,"cols":4,"rows":3,"w":82,"h":82,
           "cells":[{"c":0,"r":0,"kind":"robot"},{"c":3,"r":0,"kind":"exit","label":"+1"}]}]}
</script>
</lk-figure>
```

`draw.js` is the engine as one classic script: this CLI imports it through the
`theme.mjs`, `color.mjs`, `place.mjs` and `markup.mjs` wrappers beside this file,
and the reader loads it before `kit.js` (the bridge serves it at
`kit/visuals/draw.js`). The component injects the token block once per page and
draws in `vars` mode, so light and dark come from the page, never from the
figure. A scene that draws nothing is an error the reader can see, not an empty
box.

## A scene

```json
{
  "title": "El almacén, dibujado",
  "aria": "Una rejilla de cuatro por tres con el robot, la salida y el charco",
  "viewBox": "0 0 360 290",
  "grids": [
    { "x": 16, "y": 40, "cols": 4, "rows": 3, "w": 82, "h": 82,
      "cells": [
        { "c": 0, "r": 0, "kind": "robot" },
        { "c": 3, "r": 0, "kind": "exit", "label": "+1" },
        { "c": 3, "r": 1, "kind": "policy", "dir": "up" },
        { "c": 2, "r": 2, "kind": "hazard", "label": "−1" },
        { "c": 3, "r": 2, "kind": "wall" }
      ] }
  ],
  "arrows": [{ "x1": 20, "y1": 260, "x2": 320, "y2": 260, "tone": "blue", "label": "el robot sigue su política" }],
  "labels": [{ "x": 20, "y": 26, "text": "Política", "weight": 600 }]
}
```

| key | draws |
| --- | --- |
| `grids` | a field of cells, derived from `cols`/`rows` — never from typed coordinates |
| `sheets`, `panels`, `dashed` | a backing sheet, a labelled block, a dashed boundary |
| `bars`, `boxes`, `arrows`, `paths`, `labels` | a bar with its baseline, a labelled box, a real arrow, a curve, free text |

Cell kinds: `free`, `policy` (needs `dir`: `up`/`down`/`left`/`right`), `value`
(needs `value`, printed as `+0,73`), `exit`, `wall`, `hazard`, `robot`, `start`.

Tones: `ink`, `slate`, `line`, `soft`, `blue`, `green`, `amber`, `red`,
`muted`, `paper`. A tone is a name, never a colour: the theme decides.

## Two modes, one drawing

- `vars` writes `var(--v-blue)` and `color-mix(in srgb, var(--v-blue) 5%, var(--v-paper))`,
  so the drawing follows the page: light by `prefers-color-scheme`, or by
  `data-theme="dark"` on any ancestor.
- `static` bakes the hex values, for a still image or a video frame.

Fills are mixed against the paper, never layered with alpha over an unknown
background — that is what let an old diagram vanish on a black page.

## What the engine refuses

An unknown cell kind, a policy without a direction, a tone the theme does not
have, an unknown theme or mode, a grid without `cols`/`rows`/`w`/`h`, a path
without `d`. It refuses with the cell's place (`at (0,1)`) so the scene can be
fixed, and it never draws a guess.

## The gate

```bash
node tools/visuals/audit-note.mjs --note ruta/Parte 3 - Política, valor y modelo.md
```

It refuses a hand-written `<svg>` (an element with attributes, not the word in
prose or in a code span), a fill written as `rgba()`, a figure whose JSON does
not parse, a scene key the engine cannot draw, and meaning spelled as a
character (`→` in a cell label) or an unknown cell kind. Clean output:

```
note.md: 2 figure(s), all drawn by the engine
```

## Tests

```bash
node --test tools/visuals/test/
```

Two files: `markup.test.mjs` pins what the engine draws and refuses,
`gate.test.mjs` pins what the note gate refuses and leaves alone.
