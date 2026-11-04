# Book reading mode — paginate the lesson and turn the page

Add a third reading mode to the studio reader: the part is paginated into
columns and moves sideways like a book, with the article layout as the default.

## Specs

S1 — The reader offers three modes, and the article layout stays the default.
The learner asked, verbatim: «Otra muy buena opción podría ser agregar un modo
Para mobile, que sea como un EPUP. Punto E-P En el cual tu lo veas como en
formato libro donde solamente le tengas que dar clic y vaya deslizándose hacía la
derecha con la animación de pasar página. forma que no sé se vería chulo que sea
un modo, no sea a juro el estándar. Pero que tú puedas cambiar entre modo ancho.
Modo Epu, Sam modo Libro. Y modo artículo como está actualmente.»

S2 — Book mode really paginates: one page shows the content that fits the
viewport, and the next page continues where the previous one ended. A page is
not a fixed slice of markup and no text is lost or duplicated at a boundary.

S3 — Turning a page is an animation that slides horizontally in the direction of
travel. With `prefers-reduced-motion: reduce` the page changes without
animation, and the content is identical either way.

S4 — The mode is a reading preference of this device, kept where the wide
reading mode is kept (`learnings.wide-reading` style storage), so opening a part
again keeps the chosen mode.

S5 — Keyboard and touch both turn pages: `ArrowRight`/`ArrowLeft`, and a
horizontal swipe. The first and last page stop at the ends instead of wrapping.

## Tasks

T1 — Pagination engine and the three-mode control. `studio/ui/studio.js`,
`studio/ui/studio.css`. Commit: `feat(studio): paginate a lesson into book pages`.
T2 — Page-turn animation, reduced motion, keyboard and swipe. Same surfaces.
Commit: `feat(studio): turn a book page sideways`.
T3 — Layout tests for both, and the README line that names the mode.
`studio/layout.test.mjs`, `studio/README.md`. Commit: `test(studio): pin the book mode`.

## Log

L1 — Verbatim request (2026-11-03): «agregar un modo Para mobile, que sea como un
EPUP … en formato libro … clic y vaya deslizándose hacía la derecha con la
animación de pasar página … que tú puedas cambiar entre modo ancho. Modo Epu, Sam
modo Libro. Y modo artículo como está actualmente.»

L2 — Decision (2026-11-03): real column pagination with an animated horizontal
slide, and `prefers-reduced-motion` respected. Not a fixed slice of markup.

L3 — Done (2026-11-04): T1-T3 landed in `3ed144e` and `c0c9300`. The document
paginates itself (`integrations/pi/view/app.css` columns + `app.js` gestures) and
reports `{page, pages}` to the studio, which only says the mode and asks for a
turn. Measured at 390x320: 4 pages, `scrollLeft` exactly one page per turn. On a
phone the three modes moved into the overflow menu (the row belongs to the
title); the row's contract test was updated to say so.
