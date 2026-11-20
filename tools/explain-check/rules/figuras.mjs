// 8. Las figuras conviven: se delega en scene-lint, que abre un navegador.
// S29: además, una parte del contrato nuevo lleva al menos cuatro pasos por
// figura de paso y una figura en cada sección de contenido. El motor mide lo
// mismo en `figurasFindings` (`internal/engine/standard_figuras.go`).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HINTS } from '../hints.mjs';

const STEP_ELEMENTS = ['lk-stage', 'lk-codestep', 'lk-tablestep', 'lk-guided', 'lk-lanes'];
const MIN_STEPS = 4;
const MERMAID = /^[ \t]*```mermaid\b/m;
const FENCE = /```[\s\S]*?```/g;
const sinCercas = (texto) => texto.replace(FENCE, ' ');
const tieneEtiqueta = (texto, tag) => new RegExp(`<${tag}(?=[ \\t\\n/>\\r])`, 'i').test(texto);

const problemasDePasos = (src) => {
  const problemas = [];
  const plain = sinCercas(src);
  for (const tag of STEP_ELEMENTS) {
    const bloques = [...plain.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))];
    bloques.forEach((bloque, i) => {
      const payload = bloque[1].match(/<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!payload) return;
      let spec;
      try { spec = JSON.parse(payload[1]); } catch { return; }
      const pasos = Array.isArray(spec?.steps) ? spec.steps.length : 0;
      if (pasos < MIN_STEPS) problemas.push(`${tag} ${i + 1} has ${pasos} steps (minimum ${MIN_STEPS}) — split the idea into one step per idea so the figure carries the explanation`);
    });
  }
  return problemas;
};

const problemasDeSecciones = (src) => {
  const headings = [...src.matchAll(/^##[ \t]+(.+)$/gm)];
  const problemas = [];
  headings.forEach((heading, i) => {
    const title = heading[1].trim();
    if (/^Ruta$/i.test(title) || /mini-quiz/i.test(title)) return;
    const end = i + 1 < headings.length ? headings[i + 1].index : src.length;
    const body = src.slice(heading.index + heading[0].length, end);
    const plain = sinCercas(body);
    if (!MERMAID.test(body) && !STEP_ELEMENTS.some((tag) => tieneEtiqueta(plain, tag))) {
      problemas.push(`la sección «${title}» no trae ninguna figura — añade un bloque mermaid o una figura de pasos`);
    }
  });
  return problemas;
};

export default {
  id: 'figuras',
  hint: HINTS['figuras'],
  check({ src, escenas, recorridos, usaFigurasDePaso }, { file, tools }) {
    let figuras = { ok: true, detail: 'sin figuras' };
    if (escenas || recorridos) {  // `escenas` ya incluye las piezas
      const r = spawnSync(process.execPath, [join(tools, 'scene-lint.mjs'), file], { encoding: 'utf8' });
      if (/playwright no está disponible/.test(r.stderr + r.stdout)) figuras = { ok: true, detail: 'sin navegador: no se pudo medir' };
      else if (r.status === 0) figuras = { ok: true, detail: '' };
      else {
        const hits = (r.stdout.match(/^ {2}[a-z-]+:/gm) || []).length;
        figuras = { ok: false, detail: `${hits} hallazgo(s) de convivencia` };
      }
    }
    if (usaFigurasDePaso) {
      const problemas = [...problemasDePasos(src), ...problemasDeSecciones(src)];
      if (problemas.length) {
        figuras = { ok: false, detail: [figuras.ok ? '' : figuras.detail, problemas.join(' · ')].filter(Boolean).join(' · ') };
      }
    }
    return figuras;
  },
};
