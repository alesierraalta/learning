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
].join(" ");

/** Appends the contract unless the prompt already carries it, so no turn hears it twice. */
export function withVisualContract(text: string): string {
  return text.includes(VISUAL_CONTRACT_PROMPT) ? text : `${text}\n\n${VISUAL_CONTRACT_PROMPT}`;
}
