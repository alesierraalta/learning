# Preference discovery — let telemetry grow the aspects

The preferences file is a closed list of seven aspects. Telemetry already
notices which quiz categories the learner fails and anchors. Let the second
teach the first: a category with strong evidence becomes a preference aspect,
marked as discovered, and the learner can undo it.

## Specs

S1 — Preferences expand from telemetry. The learner asked, verbatim: «las
preferencias tienen que irse no solo adaptando a el feedback que vaya dando el
usuario o el que aprende. sino que además se deben ir expandiendo en el sentido
de yo a primeras no sabría decirte cuáles son unas posibles categorías Pero a
medida de que el usuario vaya dando feedback y vaya el la El sistema de
telemetría entendiendo cómo va funcionando el usuario. puede que diría ah bueno
esta categoría no se me había ocurrido vamos a ponerla Y hagamos que ahora el
usuario y hagamos que ahora una preferencia de usuario sea. Y bueno que se vayan
auto adaptando y vayan creciendo. a medida que el usuario va interactuando con la
herramienta.»

S2 — Strong evidence, not a guess. A telemetry category becomes an aspect only
with at least 3 answers in it and an accuracy at or below 0.6. The numbers come
from `estadisticas_globales.por_categoria` (`total`, `aciertos`), the only place
that keeps them, and are recorded with the aspect, so the reason is auditable.

S3 — A discovered aspect is marked and reversible: it carries its origin and its
evidence, the reader sees it as discovered rather than chosen, and removing it
restores the seven defaults without touching the learner's own levels.

S4 — Discovery never rewrites a default aspect: the seven shipped aspects keep
their id, title and description, and a discovered one is appended with its own id.

S5 — The preferences file still validates strictly. A hand-edited file with an
unknown origin, a missing evidence block, or a level outside
`menos|medio|más` is refused with the existing 400 instead of being trusted.

## Tasks

T1 — Open the schema for discovered aspects (append-only, with origin and
evidence) and keep the defaults closed. `studio/preferences.ts`, and a new
`studio/preferences.test.mjs`. Commit: `feat(studio): let preferences grow from evidence`.
T2 — Bridge telemetry to preferences: compute candidates from the trends, apply
the S2 threshold, and expose them. `studio/descubrir.ts` (new),
`integrations/pi/telemetry.ts`, `studio/descubrir.test.mjs` (new). Commit:
`feat(studio): discover an aspect from what the learner fails`.
T3 — Show the discovered aspect as discovered and offer to remove it.
`studio/ui/studio.js`, `studio/ui/studio.css`, `studio/layout.test.mjs`.
Depends on T1 and T2. Commit: `feat(studio): mark a discovered aspect and let it go`.

## Log

L1 — Verbatim request (2026-11-03): «las preferencias tienen que irse no solo
adaptando a el feedback … sino que además se deben ir expandiendo … a medida de
que el usuario vaya dando feedback y vaya … el sistema de telemetría entendiendo
cómo va funcionando el usuario … esta categoría no se me había ocurrido vamos a
ponerla … que se vayan auto adaptando y vayan creciendo.»

L2 — Decision (2026-11-03): propose and activate with strong evidence (≥3
answers, accuracy ≤0.6), shown as «descubierto por tu uso» and reversible.

L3 — Correction (2026-11-04): S2 named `perfil_alumno.tendencias` as the source
of the counts. It is not: a trend entry carries only `observacion`,
`nivel_dificultad` and `accion_tutor`. The counts live in
`estadisticas_globales.por_categoria`; S2 was rewritten to say so.

L4 — Done (2026-11-04): T1-T3 landed. `studio/descubrir.ts` derives candidates
from `estadisticas_globales.por_categoria`; `studio/preferences.ts` accepts an
appended aspect only with `origen: "telemetria"` and its evidence, and keeps the
seven shipped ones pinned; `olvidar` records the id in `rechazados`, so the same
counts do not offer it again. The preferences page shows the callout, the badge
and the evidence, and removes it. Tests: `studio/descubrir.test.mjs` 8 pass,
`studio/layout.test.mjs` "a discovered aspect is marked and reversible (S3)".
