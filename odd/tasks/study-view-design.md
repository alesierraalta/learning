# Study view design system
Objective: one fixed visual system, the same as the Learnings videos, applied automatically by the HTML study view to every explanation note, so no page is planned or hand-built per learning; builders write content only.
Authorized by the request below; branch feat/concept-diagnosis (disjoint files from the engine work). Push and merge stay the user's decision.

## Specs
S1 — "para que no tengamos que rehacer una página por cada learning o sea por cada vez que yo lo invoque vamos a utilizar el mismo diseño de los videos para definir el formato de del visual de cómo van a ser las páginas para las explicaciones"
S2 — "de forma que no haya que estar planificando dos horas cómo se va a hacer cada página lo cual es demasiado tiempo"
S3 — "el tema de la planificación el mapa eso incluso no sé si poder no sé si se dejaría detrás en el sentido de que no se dibujen la página pero igual se haga en un punto MD o en donde sea o en el mismo opsidian igual" — planning and the map stay as Markdown notes in Obsidian; the view does not draw special pages for them.
S4 — "la idea no es estar tener un sistema y quitarse de encima la parte mecánica que es hacer la página para que eso sea la parte más fácil y centrarse mucho más en el contenido y en la forma aprendizaje"
S5 — "ve paralelizando para ir mas rapido"

## Tasks
D1 — S1,S2,S4 — view: adopt the video design tokens and components (typography, palette, spacing, section headings, callouts, tables, code, diagram blocks) from ~/Developer/learnings-video in integrations/pi/view/; render every note with it; a written guide of the Markdown conventions a builder uses (docs/study-view-format.md) — worker — done (4aa6804; first pass took html-poc serif, corrected to the rendered video: DejaVu Sans/Mono, PARTE N kicker, bold ruled headings, light table headers; comparison against a frame of Parte 3 video)
D2 — S2,S3,S4 — skill explicacion-interactiva: builders write content only in the documented Markdown conventions; no per-part page planning; the standalone pagina-interactiva HTML is only for a demo that truly needs interaction; planning and map stay Markdown — inline — done (skill v1.35 rule «La página es solo contenido», home repo, not committed)

## Log
L1 — "vAdemás para que no tengamos que rehacer una página por cada learning o sea por cada vez que yo lo invoque vamos a utilizar el mismo diseño de los videos para definir el formato de del visual de cómo van a ser las páginas para las explicaciones de forma que no haya que estar planificando dos horas cómo se va a hacer cada página lo cual es demasiado tiempo el tema de la planificación el mapa eso incluso no sé si poder no sé si se dejaría detrás en el sentido de que no se dibujen la página pero igual se haga en un punto MD o en donde sea o en el mismo opsidian igual pero pero la idea no es estar tener un sistema y quitarse de encima la parte mecánica que es hacer la página para que eso sea la parte más fácil y centrarse mucho más en el contenido y en la forma aprendizaje ve paralelizando para ir mas rapido"
