# Migración del tema SQL a páginas HTML

Tema: `paradigma-relacional-sql-transacciones` (3 partes escritas de 10). Fuente: notas Markdown.
Rama: `feat/learning-studio`. Sin commits en el vault (no es un repositorio Git); el registro es este documento.

## Specs

S1. Cada nota `explicaciones/Parte N - <slug>.md` de este tema tiene su página `explicaciones/Parte N - <slug>.html` con el mismo nombre base.
S2. La página conserva la explicación completa de la nota: todas sus secciones, en el mismo orden y sin recortar contenido, con el método de explicación (definición formal primero, «1. Por qué existe», piezas, pasos T0/T1 con NUEVO/BLOQUEO, intuición → tabla de decisión → formalismo, distinciones, dónde se rompe la analogía, mapa mental, cierre, quiz y ejercicios).
S3. Se escribe con el kit de `integrations/pi/kit`: `kit.css` y `kit.js` relativos (`../kit/kit.css`), índice y progreso automáticos, y los componentes `lk-video`, `lk-quiz`, `lk-ask`, `lk-diagram`, `lk-callout`, `lk-steps`, `lk-math` y `lk-widget` con una demo propia de la parte.
S4. Los videos existentes de las Partes 2 y 3 (`explicaciones/adjuntos/Parte N - <slug>.mp4`) se ven dentro de la página con `lk-video`; la Parte 1 muestra «Generar video» porque no tiene.
S5. Sin claves de respuesta en la página, sin fuentes externas, sin red salvo los endpoints del bridge y KaTeX/Mermaid fijados con SRI. Se ve en escritorio y en móvil, y la demo funciona con teclado.

## Tasks

| ID | Specs | Ruta | Estado |
| --- | --- | --- | --- |
| T1 | — | documento y tablero | hecho |
| T2 | S1-S5 | Parte 1: página | hecho (integrations/pi/kit/examples/sql-parte-1.html, copiada al vault) |
| T3 | S1-S5 | Parte 2: página + video | hecho (sql-parte-2.html; video existente 2:10 se reproduce) |
| T4 | S1-S5 | Parte 3: página + video | hecho (sql-parte-3.html; video existente 19.9M se reproduce) |
| T5 | S1-S5 | verificación en Chromium (escritorio y móvil) | hecho (1.280 y 390 px sin desborde; demos ejercitadas; quizzes 5/5 en p2, estático en p3) |
| T6 | S1-S5 | Parte 1: video propio (guion, specs, voz, render, entrega) | hecho — `Developer/learnings-video-html-renderer/sql-p1-html`, build OK (crosscheck OK, qa OK), entregado como `explicaciones/adjuntos/Parte 1 - Arquitectura relacional.mp4` (9.6 MB, 4:45, md5 3868c945) |

Las tres páginas se sirven en vivo en el tema real y se copiaron al vault con el slug de su .md.
Resuelto por L3: la Parte 3 ya tiene `mini-quiz/p3.json` (5 preguntas, 3 conceptos), así que la página registra respuestas y puntaje como las otras dos.
La Parte 3 no necesita regenerarse: su MP4 en el vault tiene md5 `dce7507b…` y la duración 10:39 del final documentado (`Capitulos.md`), es decir ya es la entrega vigente.
T6 abierto por L3: la Parte 1 no tiene video y la página ya está migrada con su demo de clave foránea.

## Log

L1 (usuario, m01209): «si» — autoriza la migración propuesta: «¿Empiezo por la migración de tu tema de SQL y transacciones, que es el que más partes tiene?».
L2 (usuario, m01169): «que mas nos faltaria para nuestro objetivo? de todo lo que te he comentado, ademas si escribo learning web en la terminal debe abrir esa pagina» — el objetivo incluye videos, demos interactivos y quizzes vivos dentro del HTML.
L3 (usuario, m01568): «si, go» — autoriza el quiz de la Parte 3 (5 preguntas integradoras con razonamiento) y el video de la Parte 1.
