// 8. Las figuras conviven: se delega en scene-lint, que abre un navegador.
// S29: además, una parte del contrato nuevo lleva al menos cuatro pasos por
// figura de paso y una figura en cada sección de contenido. El motor mide lo
// mismo en `figurasFindings` (`internal/engine/standard_figuras.go`).
// #484: una figura de paso es una figura: se cuenta aunque no haya escena ni recorrido
// antiguo, y si su JSON no se lee se reporta —la puerta no la da por ausente. Cuántas
// figuras hay lo dice `nota.mjs` (`figurasDePaso`), no este archivo.
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

// #399 (L8): un ejemplo resuelto (`form: "example"`) de solo tarjetas de texto no muestra el estado
// ni los datos que cambian. Cada paso con `cards` lleva en ese mismo paso un bloque `rows`, `numbers`
// o `formula`; el gate mira que el bloque exista, no si los datos son correctos.
const DATOS_DEL_EJEMPLO = ['rows', 'numbers', 'formula'];
// Los pasos (desde 1) que traen tarjetas y ningún bloque de datos en ese mismo paso.
const pasosSoloTarjetas = (spec) => spec.steps.flatMap((paso, i) => {
  const tipos = (Array.isArray(paso?.blocks) ? paso.blocks : []).map((b) => b?.kind);
  return tipos.includes('cards') && !tipos.some((tipo) => DATOS_DEL_EJEMPLO.includes(tipo)) ? [i + 1] : [];
});
const problemasDeEjemplo = (src) => {
  const problemas = [];
  const plain = sinCercas(src);
  [...plain.matchAll(/<lk-guided\b[^>]*>([\s\S]*?)<\/lk-guided>/gi)].forEach((bloque, i) => {
    const payload = bloque[1].match(/<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!payload) return;
    let spec;
    try { spec = JSON.parse(payload[1]); } catch { return; }
    if (spec?.form !== 'example' || !Array.isArray(spec.steps)) return;
    const pasos = pasosSoloTarjetas(spec);
    if (pasos.length) {
      const palabra = pasos.length > 1 ? 'pasos' : 'paso';
      problemas.push(`lk-guided ${i + 1}: ${palabra} ${pasos.join(', ')} solo con tarjetas de texto (sin rows, numbers ni formula en ese paso); añade en ese mismo paso el estado o los datos que cambian`);
    }
  });
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
  check({ src, escenas, recorridos, usaFigurasDePaso, figurasDePaso }, { file, tools }) {
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
    // Una figura de paso es una figura (#484): se cuenta y, si su JSON no se lee, se reporta. La
    // regla no puede medir lo que no entiende, así que no lo da por ausente.
    if (figurasDePaso.length) {
      const ilegibles = figurasDePaso.filter((figura) => figura.ilegible).length;
      figuras = {
        ok: ilegibles === 0 && figuras.ok,
        detail: [
          `${figurasDePaso.length} figura(s) de paso`,
          figuras.detail === 'sin figuras' ? '' : figuras.detail,
          ilegibles ? `${ilegibles} con JSON ilegible: arréglalo antes de darla por buena` : '',
        ].filter(Boolean).join(' · '),
      };
    }
    if (usaFigurasDePaso) {
      const problemas = [...problemasDePasos(src), ...problemasDeEjemplo(src), ...problemasDeSecciones(src)];
      if (problemas.length) {
        figuras = { ok: false, detail: [figuras.ok ? '' : figuras.detail, problemas.join(' · ')].filter(Boolean).join(' · ') };
      }
    }
    return figuras;
  },
};
