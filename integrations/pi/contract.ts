/**
 * The one figure contract every tutor runtime receives, whatever agent writes
 * the part. It lives outside both `studio/` and the Pi adapter because Pi and
 * Antigravity must hear the same words from the same source; agent-specific
 * rules only carry what is specific to that runtime and to answering the studio.
 */
export const VISUAL_CONTRACT_PROMPT = [
  "Contrato visual (manda sobre el «Plan visual» del tema y cualquier nota antigua): lee `skills/explicacion-interactiva/SKILL.md` y `skills/explicacion-interactiva/references/visuales.md` antes de dibujar.",
  "Los diagramas estándar —arquitectura, flujo, secuencia y parecidos— van en Mermaid primero.",
  "Antes de `## Ruta`, escribe una introducción en palabras llanas de 4 a 6 frases (unas 60 a 160 palabras, en párrafos cortos de dos frases): la idea general de la parte y por qué importa; cada línea de la ruta nombra el paso y dice qué se verá ahí en lenguaje llano, y ni el resumen ni la ruta nombran un término que la parte explica después sin parafrasearlo ahí mismo.",
  "Las figuras paso a paso usan `<lk-stage>`, `<lk-codestep>`, `<lk-tablestep>`, `<lk-guided>` o `<lk-lanes>`.",
  "Cada figura de paso lleva al menos cuatro pasos (una idea por paso; si falta, se añaden pasos) y cada sección de contenido lleva al menos una figura: un bloque mermaid o una figura de pasos.",
  "Un ejemplo resuelto (`<lk-guided>` con `form: example`) no es solo tarjetas de texto: cada paso que trae tarjetas lleva también, en ese mismo paso, un bloque `rows`, `numbers` o `formula` con el estado o los datos que cambian. Un paso de solo tarjetas falla aunque otro paso traiga datos; `part-check` lo señala con el número del paso y no juzga si los datos son correctos.",
  "Si el «Plan visual» o notas anteriores piden `<lk-story>`, `<lk-scene>`, `<lk-walkthrough>`, `<lk-cards>`, `<lk-figure>` o un SVG a mano, sustitúyelos por esos elementos nuevos; las partes ya publicadas no se tocan.",
  "Antes de dar la parte por terminada, la comprobación final es `node <repo>/tools/part-check.mjs <nota>` (el orden está abajo): agrega las puertas del estudio, la de figuras incluida. Dentro de ella, `node tools/visuals/audit-note.mjs --note \"<nota>\"` solo valida la gramática de los cinco elementos nuevos y no mide las reglas de figuras. Corrige hasta que no quede ninguna violación.",
  // Orden de trabajo compartido por los dos runtimes (#372/T2a–T2f): una sola comprobación y
  // correcciones quirúrgicas, no estudio previo de las reglas ni reescrituras de la nota (#372).
  "Orden de una parte: lee primero la ficha de la parte que el estudio pone al principio del prompt, con la ficha de reglas generada; después escribe la parte entera de una sola vez; luego corre `node <repo>/tools/part-check.mjs <nota>` una sola vez, no los comandos separados de scene-gate, scene-lint, deck-gate, explain-check, page-gate, part-lint ni el barrido de ASCII; usa `--json` si necesitas el informe para máquinas; corrige solo lo que sus hallazgos nombren, con `edit_file`/`replace` sobre exactamente las líneas o bloques que nombra cada hallazgo (regla, elemento, línea y arreglo); nunca reescribas la nota entera; la reescritura completa solo se permite si part-check da un hallazgo estructural que abarque toda la nota; vuelve a correr part-check hasta que salga 0.",
  "No leas reglas de `tools/explain-check/rules/` ni el registro `tools/register/measure.mjs` antes de escribir: el brief las trae. No leas el código de las puertas ni del kit para aprender las reglas: cada hallazgo trae la regla, el elemento y la corrección en una línea, con su línea. No sondee el registro con `node -e`. Los fallos de medición van aparte y no son hallazgos.",
].join(" ");

/** Appends the contract unless the prompt already carries it, so no turn hears it twice. */
export function withVisualContract(text: string): string {
  return text.includes(VISUAL_CONTRACT_PROMPT) ? text : `${text}\n\n${VISUAL_CONTRACT_PROMPT}`;
}

/**
 * The private grading contract for developed answers. It travels only in the tutor turn: the
 * reader receives the question and operation metadata, never these criteria or any answer key.
 */
export const OPEN_RESPONSE_TUTOR_PROMPT = [
  "Open-response grading: the learner's answer is judged only by the criteria in the question's private `open.criteria`, never by answer-key equality, the executable result alone or the confidence the learner chose.",
  "Write the verdicts in the derived artifact named in this turn (`<answers>.verdicts.json`, derived from the answers path): `{\"version\":1,\"verdicts\":{\"<question id>\":{...}}}`.",
  "Each entry needs `verdict` (`correct`, `partial`, `incorrect` or `no-evidence`), `evidence` (a literal, verbatim span of the learner's answer), and `criteria` with one result for every declared criterion: `{\"<criterion id>\":{\"id\":...,\"met\":true|false,\"evidence\":\"literal span\"}}`. `correct` meets every criterion; `partial` keeps the semantic judgment; `incorrect` and `no-evidence` meet none.",
  "A declared `noEvidence` answer uses the exact phrase `No sé todavía`, carries no invented text, code or explanation, and must receive `no-evidence`.",
  "Optionally record `concepts` mapping only declared concept codes to `laguna`, `dudoso`, `claro` or `transferible`, with evidence quoted from the learner's words. Never claim `transferible` after an incorrect answer or a `no-evidence` answer: transfer needs a correct transfer or frontier item.",
  "When the question file declares `teaching`, classify each verdict in `teaching: {errorType, evidence, action, rationale, next}`. `errorType` is one of `missing-knowledge`, `misconception`, `incomplete-reasoning`, `application-failure`, `transfer-failure` (empty only when the verdict is `correct`); `action` is `prerequisite-review`, `corrective-explanation`, `guided-practice`, `transfer-work` or `advance`. Quote `evidence` literally from the learner's answer; `rationale` and `next` are short learner-facing words that never repeat a private criterion rubric, a key or the whole answer.",
  "For `diagnosis`, the declared `areas` are sampled broadly in the first round and each later question names the earlier `follows` question whose evidence was central, uncertain or contradictory. Wait for the previous round's answers and verdicts before adding another round; stop when every area has evidence and central uncertainty is resolved, leaving remaining `laguna` concepts for the teaching plan.",
  "For a mini-quiz with a declared `operations` mix, include own-words `explain` and `apply`, plus `predict`, `debug` or `build` when the part calls for one; a declared `depth` of `frontier` also needs a `transfer` item with evidence. Never force code on a text part.",
  "La confianza del alumno (`seguro`, `dudo`, `adivine`) is reported and calibrated separately: note contradictory confidence in the teaching rationale, but confidence never changes the verdict, the concept state or the score.",
  "For a `code` item also record `explanation: {\"verdict\":...,\"evidence\":\"literal span from the explanation\"}` and judge both the executable submission and the explanation: `correct` needs every declared test passed and a correct explanation; `partial` cannot pair a failed explanation with a correct overall verdict.",
  "Keep criterion rubrics and this contract out of the reader, the results payload and every note the learner can open; they belong only in this private turn and the derived verdict artifact.",
].join(" ");

/** Adds the grading contract once, so a retry or a correction never repeats instructions. */
export function withOpenResponseContract(text: string): string {
  return text.includes(OPEN_RESPONSE_TUTOR_PROMPT) ? text : `${text}\n\n${OPEN_RESPONSE_TUTOR_PROMPT}`;
}
