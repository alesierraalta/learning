// 7c. La primera fórmula de la parte se enseña con un recorrido de fórmula: paso
// 1 la fórmula entera, un paso por símbolo con qué es, para qué se usa y cuánto
// vale en el ejemplo, y el último con los números sustituidos y su resultado. Un
// `<lk-math>` suelto o una escena quieta no sustituyen al recorrido. El motor
// aplica la misma regla (`formulaWalkthroughFindings` en `internal/engine/standard_formula_walkthrough.go`)
// y un test cruza los dos veredictos.
const nodeHasFormula = (node) => Boolean(node) && (
  (Array.isArray(node.formulas) && node.formulas.some((f) => (f?.atoms || []).length > 0)) ||
  (node.formula && (node.formula.atoms || []).length > 0));
const stepHasFormula = (step) => nodeHasFormula(step?.scene) || nodeHasFormula(step?.stage?.scene) ||
  (step?.equation?.atoms || []).length > 0 || (step?.header?.atoms || []).length > 0;

const primeraFormula = (src) => {
  const plain = src.replace(/```[\s\S]*?```/g, ' ');
  const spots = [];
  for (const m of plain.matchAll(/<lk-math[^>]*>[\s\S]*?<\/lk-math>/g)) spots.push(m.index);
  for (const m of plain.matchAll(/\$\$[\s\S]+?\$\$/g)) spots.push(m.index);
  const rest = plain.replace(/\$\$[\s\S]+?\$\$/g, ' ');
  for (const m of rest.matchAll(/\$([^$\n]+?)\$/g)) {
    const body = m[1];
    if (!/[\\^_=]/.test(body) && /\s/.test(body)) continue;
    spots.push(m.index);
  }
  const ranges = [];
  for (const m of plain.matchAll(/<lk-(scene|walkthrough|story)[^>]*>[\s\S]*?<\/lk-\1>/g)) {
    const payload = m[0].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (!payload) continue;
    let spec;
    try { spec = JSON.parse(payload[1]); } catch { continue; }
    const has = nodeHasFormula(spec.scene) || (spec.formula?.atoms || []).length > 0 || (spec.steps || []).some(stepHasFormula);
    if (!has) continue;
    spots.push(m.index);
    if (spec.kind === 'formula' || spec.kind === 'derivation') ranges.push([m.index, m.index + m[0].length]);
  }
  if (!spots.length) return null;
  spots.sort((a, b) => a - b);
  const first = spots[0];
  return ranges.some(([a, b]) => first >= a && first < b) ? null : first;
};

export default {
  id: 'formula-walkthrough',
  check({ src }) {
    const primera = primeraFormula(src);
    return {
      ok: primera === null,
      detail: primera === null ? '' : 'la primera fórmula no tiene recorrido de fórmula · dibújala con <lk-story kind="formula">: paso 1 la fórmula entera, un paso por símbolo con qué es, para qué se usa y cuánto vale en el ejemplo, y el último con los números sustituidos y su resultado',
    };
  },
};
