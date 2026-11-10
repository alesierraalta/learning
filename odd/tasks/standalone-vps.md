# Standalone app on the VPS

Milestone 5 "Standalone app on the VPS". The VPS holds the studio, the data and the learner
feedback; no code path depends on the Obsidian vault. Branch `feat/166-standalone-vps`.

## Specs

- S1: "que en la BPS esté todo, tanto el backend como la base de datos, el feedback, todo se vaya guardando en [...] ya desligarse totalmente del Obsidian"
- S2: No hardcoded vault path remains; `LEARNING_ROOT` (or `--root` for the code CLI) is required and its absence is refused with a message naming the variable.
- S3: The engine no longer resolves links through a `.obsidian` ancestor; existing notes with Obsidian syntax keep rendering.
- S4: Learner data (suggestions, preferences, telemetry) is stored in SQLite on the VPS via built-in `node:sqlite`; existing JSON files are imported once, idempotently; backup covers the database.
- S5: "en leer hay un botón de sugerir y regenerar [...] esto es parte de lo que debes quitar de Obsidian [...] te traigas todo lo que ya yo he hablado, todos los feedbacks o las sugerencias"
- S6: A studio page lists suggestions by topic, part and reason, with counts and the free text.

## Tasks

- T1 (#166) S1-S3: drop vault paths, require the root, drop `.obsidian` link prefix — route inline
- T2 (#167) S1, S4-S5: SQLite store and one-time import of the VPS JSON files — route inline
- T3 (#168) S5-S6: feedback page in the studio — route inline

## Log

- L1: "No, de la forma súper más normal posible, sencillito. La idea es que en la BPS esté todo, tanto el backend como la base de datos, el feedback, todo se vaya guardando en, o sea, ya desligarse totalmente del Obsidian, porque es bastante pesado tener que estar constantemente gestionar esa parte dual. Entonces quiero hacerlo aplicación, o sea, ya quiero desligarme y que bueno, que estén los mecanismos de backend. Si quieres construimos todo en Rust para que sea lo más rápido posible y listo."
- L2: User chose Go/TypeScript over a Rust rewrite ("si, vayamos con go entonces").
- L3: "No sé si tanto de feedback, pero fíjate que en la página de estudios hay un botón, o sea, en leer hay un botón de sugerir y regenerar [...] te traigas todo lo que ya yo he hablado o sea, todos los feedbacks o las sugerencias o como le quieras decir que les he dejado a la aplicación."
- L4: Evidence: the feedback already lives on the VPS at `~/Learnings/sugerencias.json` (14 entries), with `preferencias.json`, `telemetria.json`, `tutor.json`; the studio there runs with `LEARNING_ROOT=/home/ale/Learnings`.
