# Explicación visual v2 — tono canónico, escenas de verdad, skill adelgazada

Reconstruir la explicación alrededor del estándar aprobado (texto continuo, `Ruta`, escenas
intercaladas, quiz que obliga a pensar) y mover la geometría de `plain text` a un renderizador
de escenas que supere visualmente el bloque ASCII de ChatGPT.

## Specs

- **S1 — El quiz se queda, intercalado y corto.** El usuario: «Esas partes de tener el quiz sí
  están bien», «La parte de los quizzes yo sí lo dejaría, estaría bueno, así sea uno cortico que
  simplemente vaya obligándome a pensar a medida que voy respondiendo», «eso de la skill de no
  tener quizzes entre medio era porque para mí era imposible responder dentro de ChatGPT todos
  los quizzes».
- **S2 — Fuera «Resumen para guardar» y fuera el gancho final.** «ese resumen para guardar eso te
  lo puedes saltar, la verdad es que me parece meh», «gancho de continuación, profundiza
  conceptos clave, comparar, eso tampoco, eso tampoco es necesario, porque en teoría ya tenemos
  un sistema de ruta que ya no hace falta».
- **S3 — `## Ruta` al inicio de cada parte.** «Restaurar ruta al inicio de cada parte también
  estaría bueno».
- **S4 — Una parte es un texto continuo.** «Restaurar la unidad de explicación: una parte, un
  texto continuo, como el ejemplo».
- **S5 — Los visuales se vuelven escenas sofisticadas; no se vuelve al ASCII.** «obviamente no
  vamos a volver al formato ASCII, evidentemente», «quiero algo más sofisticado», «Claro, el
  tema es que el bloque text, a no ser de que se vea visualmente muy atractivo, más que el plain
  text de aquí de ChatGPT. No me sirve», «los visuals que tenemos ahorita no me están gustando
  porque están muy mal hechos».
- **S6 — El motor absorbe la parte mecánica.** «la idea es que nuestro motor se encargue de esas
  partes mecánicas para que tú (...) no tengas que estar pendiente de esa parte mecánica, sino
  que simplemente se ejecute un script de Python o de lo que sea con los parámetros exactos de
  lo que se tenga que hacer».
- **S7 — Skill adelgazada, método puro como espina dorsal.** «también adelgazar la skills, sacar
  el estándar audiovisual pipeline de video y el detalle del motor de referencia dejar el método
  puro como espina dorsal también. Me parece eso maravilloso y bueno ir modulando las skills
  para mejorar cada formato en particular».
- **S8 — El ejemplo aprobado sube a contrato canónico.** «subir el ejemplo a contrato, tu texto
  pegado como referencia canónica de tono, no como anexo. Está bien, me parece también bien.»

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
|---|---|---|---|---|
| T1 | Documento de feature y rama | S1-S8 | — | `docs(odd): plan the visual v2 rework` |
| T2 | `lk-scene`: componente de escena con el vocabulario de `scene.js` | S5 | inline | `feat(kit): render real scenes, not grey box grids` |
| T3 | `tools/scene.mjs`: valida y previsualiza un spec de escena | S6 | inline | `feat(tools): validate and preview scene specs` |
| T4 | `references/estandar-explicacion.md`: contrato canónico de tono | S2,S3,S4,S8 | inline | `docs(skill): make the approved explanation the tone contract` |
| T5 | `references/visuales.md`: mapa ASCII → escena y barra de calidad | S5,S6 | inline | `docs(skill): replace the ASCII ban with a scene standard` |
| T6 | `SKILL.md` adelgazado con el método puro como espina dorsal | S7 | inline | `docs(skill): thin the skill to the pure method` |
| T7 | `docs/kit.md` y `docs/study-view-format.md` al día | S5,S7 | inline | `docs: document lk-scene and the new part structure` |
| T8 | Verificación: una parte real renderizada, gate y captura | S1-S8 | inline | `test: pin the visual v2 rendering` |

## Log

- **L1 (2026-11-04, solicitud original).** «Necesito generar, o sea, que veas cómo está escrito
  todo esto, que me parece impecable y veas por qué no podemos tener estos resultados en las
  explicaciones que estoy intentando conseguir.» Pegó cuatro explicaciones de ChatGPT como
  referencia: introducción al RL, EXL3/Trellis/K2-K3-K5, unidad 2 de RL tabular y máquina de
  estados finita. Diagnóstico del usuario: la prosa es impecable, las partes de `plain text` «se
  ven genuinamente mal».
- **L2 (2026-11-04, correcciones).** El quiz no era el problema: la regla de «sin quiz entre
  medio» existía porque en ChatGPT no podía responderlos. «Resumen para guardar» y el gancho
  final sobran. La `Ruta` vuelve. El texto continuo vuelve. El ASCII no vuelve: la geometría se
  transpone a visuales, y los visuales actuales «están muy mal hechos». La parte mecánica la
  resuelve el motor con scripts parametrizados. La skill se adelgaza. El ejemplo aprobado sube a
  contrato. Elige la ruta arquitectónica.
- **L3 (2026-11-04, evidencia).** El kit tiene dos lenguajes visuales: `integrations/pi/kit/scene.js`
  (papel blanco, tinta `#0F2E3D`, tabla real, `fit` calculado, viewBox 1728x740) que alimenta los
  videos y el tutorial, y `lk-diagram` (`kit.js:101-135`, rejilla de cajas `190x70` gris `#475569`)
  que es lo que la página renderiza. La página usa el renderizador pobre; de ahí «están muy mal
  hechos».
