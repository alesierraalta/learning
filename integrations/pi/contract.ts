/**
 * The one figure contract every tutor runtime receives, whatever agent writes
 * the part. It lives outside both `studio/` and the Pi adapter because Pi and
 * Antigravity must hear the same words from the same source; agent-specific
 * rules only carry what is specific to that runtime and to answering the studio.
 */
export const VISUAL_CONTRACT_PROMPT = [
  "Contrato visual (manda sobre el «Plan visual» del tema y cualquier nota antigua): lee `skills/explicacion-interactiva/SKILL.md` y `skills/explicacion-interactiva/references/visuales.md` antes de dibujar.",
  "Los diagramas estándar —arquitectura, flujo, secuencia y parecidos— van en Mermaid primero.",
  "Las figuras paso a paso usan `<lk-stage>`, `<lk-codestep>`, `<lk-tablestep>`, `<lk-guided>` o `<lk-lanes>`.",
  "Si el «Plan visual» o notas anteriores piden `<lk-story>`, `<lk-scene>`, `<lk-walkthrough>`, `<lk-cards>`, `<lk-figure>` o un SVG a mano, sustitúyelos por esos elementos nuevos; las partes ya publicadas no se tocan.",
  "Antes de dar la parte por terminada ejecuta `node tools/visuals/audit-note.mjs --note \"<nota>\"` y corrige hasta que no quede ninguna violación.",
  // Orden de trabajo compartido por los dos runtimes (#372/T2a–T2f): una sola comprobación y
  // correcciones quirúrgicas, no estudio previo de las reglas ni reescrituras de la nota (#372).
  "Orden de una parte: lee primero la ficha de la parte que el estudio pone al principio del prompt, con la ficha de reglas generada; después escribe la parte entera de una sola vez; luego corre `node <repo>/tools/part-check.mjs <nota>` una sola vez, no los comandos separados de scene-gate, scene-lint, deck-gate, explain-check, page-gate, part-lint ni el barrido de ASCII; usa `--json` si necesitas el informe para máquinas; corrige solo lo que sus hallazgos nombren, con `edit_file`/`replace` sobre exactamente las líneas o bloques que nombra cada hallazgo (regla, elemento, línea y arreglo); nunca reescribas la nota entera; la reescritura completa solo se permite si part-check da un hallazgo estructural que abarque toda la nota; vuelve a correr part-check hasta que salga 0.",
  "No leas reglas de `tools/explain-check/rules/` ni el registro `tools/register/measure.mjs` antes de escribir: el brief las trae. No leas el código de las puertas ni del kit para aprender las reglas: cada hallazgo trae la regla, el elemento y la corrección en una línea, con su línea. No sondee el registro con `node -e`. Los fallos de medición van aparte y no son hallazgos.",
].join(" ");

/** Appends the contract unless the prompt already carries it, so no turn hears it twice. */
export function withVisualContract(text: string): string {
  return text.includes(VISUAL_CONTRACT_PROMPT) ? text : `${text}\n\n${VISUAL_CONTRACT_PROMPT}`;
}
