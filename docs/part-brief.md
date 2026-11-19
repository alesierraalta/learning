# PART BRIEF: the facts a write-part prompt already carries

When the learner asks the studio to write one part, the studio appends a compact
`[PART BRIEF · …]` block to the prompt. The tutor reads the target, the plan entry
and the sibling list as facts instead of spending its first tool calls on
`ls`/`find`/`grep` and repeated reads of `plan.json`, `state.json`, `tutor.json`
and `registro.jsonl`. The prompt the learner wrote is kept verbatim; the brief is
an addition at the end, after any standing lessons.

## When it is added

`studio/server.ts` adds the brief in `startTurn`, the single path every runtime
uses, so Pi and Antigravity both receive it. It is added only when the text is
actually a request to write a part:

- the composer's canonical form `Escribe la Parte N «title» de … (carpeta <topic>)`,
  produced by `writePromptOf` in `studio/ui/studio.js`; or
- a hosted-view part submission (`[Vista HTML · <topic> · <part> · …]`) whose text
  explicitly asks to write that part.

A general chat prompt, a plan prompt, a diagnosis prompt, and a question inside a
part chat are all unchanged. A topic with no readable `plan.json` gets no brief:
the studio never guesses a part number, slug or title.

## What is in it

| Field | Source |
| --- | --- |
| Absolute topic directory | `resolve(LEARNING_ROOT, <topic>)` |
| Exact destination | `explicaciones/Parte N - <slug>.md`, from the plan entry's index and slug — the same name the bridge's `partNote` reads |
| Plan entry | The stored `title`, `subtema`/`objetivos` and planning flags from `plan.json`, quoted as stored |
| Method | `method` from `<topic>/.learning/state.json`, or `sin elegir`; the studio does not choose one |
| Siblings | Number, stored title, absolute note path and `escrita`/`pendiente` from the bridge's `listTopics` |
| State files | `state.json`, `tutor.json` and `registro.jsonl` at their usual paths, listed only when they exist |
| Check command | The one line `node <repo>/tools/part-check.mjs <destination>` (`tools/part-check.mjs` is added by the companion task) |

No note content is inlined. Titles and optional values are clipped; the exact
destination path and the check command are always complete. The block is built
with a hard byte bound (`MAX_PART_BRIEF_BYTES` in `studio/brief.ts`, 4096 bytes,
with headroom below it). For a topic with 20 parts the builder shortens sibling
titles first, then only the displayed sibling paths, and keeps the destination
and the check command in every case.

Example (paths shortened here for readability):

```text
Escribe la Parte 2 «TCP» de Redes (carpeta redes): con sus visuales, sus ejemplos y su mini-quiz.

[PART BRIEF · tema redes · dir /home/ale/Learnings/redes]
Destino: /home/ale/Learnings/redes/explicaciones/Parte 2 - TCP.md
Plan: title="TCP" subtema="1.2.1" examplesPlanned=true visualsPlanned=true
Método: pareto
Partes:
1. Capas | escrita | /home/ale/Learnings/redes/explicaciones/Parte 1 - Capas.md
2. TCP | pendiente | /home/ale/Learnings/redes/explicaciones/Parte 2 - TCP.md
Archivos: state.json=/home/ale/Learnings/redes/.learning/state.json | tutor.json=/home/ale/Learnings/tutor.json
Comprobación: node /home/ale/documents/learning-studio/tools/part-check.mjs /home/ale/Learnings/redes/explicaciones/Parte 2 - TCP.md
```

The studio still runs every gate after the turn (`comprobaciones`). The brief
removes discovery, not verification: no gate rule is changed or skipped. Tests
in `studio/brief.test.mjs` use the fake Pi and Antigravity runtimes to assert the
prompt contents, that non-part prompts stay unchanged, and the 20-part bound.
