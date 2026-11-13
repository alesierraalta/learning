// El paso de las piezas visuales (tarjetas, memoria, tablas, conjuntos, el
// explorador de un escenario) para `scene-gate` y `scene-lint`: abre cada pieza en
// el navegador a un ancho de escritorio y a uno de teléfono, recorre los pasos de un
// recorrido que la dibuja (cada paso muestra su panel, los demás se ocultan) y mide
// con `measurePiece`.
import { measurePiece } from './piece-measure.mjs';

export const PIECE_TAGS = ['cards', 'memory', 'tables', 'venn', 'explorer', 'tree'];
export const PIECE_HOSTS = PIECE_TAGS.map((t) => `lk-${t}`).join(', ');
export const WIDTHS = [1440, 390];
// Las tres tintas de la página: la clara, la oscura y la negra. Una pieza se mide en las tres.
export const THEMES = ['light', 'dark', 'black'];

// `page` ya tiene la nota abierta; los anfitriones llevan id `sN`. Devuelve, por
// anfitrión con piezas, { id, tag, title, problems } con el ancho y el paso en cada
// hallazgo.
export async function measurePieces(page, { scope = 'all' } = {}) {
  await page.addScriptTag({ content: `window.__measurePiece = ${measurePiece.toString()};` });
  const out = new Map();
  const note = (id, tag, title, where, problems) => {
    const entry = out.get(id) ?? { id, tag, title, problems: [] };
    for (const p of problems) {
      if (!entry.problems.some((q) => q.kind === p.kind && q.text === p.text && q.detail === p.detail)) entry.problems.push({ ...p, detail: `${p.detail} · ${where}` });
    }
    out.set(id, entry);
  };
  for (const width of WIDTHS) for (const theme of THEMES) {
    await page.setViewportSize({ width, height: 1000 });
    // La misma pieza se mide en las tres tintas: la oscura y la negra cambian el papel
    // bajo las letras, y un fondo blanco que se cuela solo se ve en ellas.
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(250);
    const found = await page.evaluate(({ scope }) => {
      const measure = window.__measurePiece;
      const result = [];
      for (const host of document.querySelectorAll('main > *')) {
        const panels = [...host.querySelectorAll('.lk-story-piece')];
        const title = host.getAttribute('title') || host.querySelector('.lk-title')?.textContent || host.tagName.toLowerCase();
        if (panels.length) {
          // Se recorre con los botones del propio recorrido: cada paso se dibuja y se
          // coloca como lo ve el lector.
          const press = (label) => host.querySelector(`button[aria-label="${label}"]`);
          while (press('Paso anterior') && !press('Paso anterior').disabled) press('Paso anterior').click();
          const steps = host.querySelectorAll('.lk-story-seg').length;
          for (let k = 0; k < steps; k++) {
            const panel = panels.find((p) => !p.hidden);
            if (panel) result.push({ id: host.id, tag: host.tagName.toLowerCase(), title, label: `paso ${Number(panel.dataset.pieceStep)}`, problems: measure(host, { scope }).problems });
            press('Paso siguiente')?.click();
          }
          while (press('Paso anterior') && !press('Paso anterior').disabled) press('Paso anterior').click();
        } else if (host.querySelector('.lk-xstep')) {
          // El explorador de un escenario: cada paso mueve el mapa, y la segunda vista
          // (la secuencia) se mide una vez.
          const press = (label) => host.querySelector(`button[aria-label="${label}"]`);
          const steps = host.querySelectorAll('.lk-xstep').length;
          for (let k = 0; k < steps; k++) {
            if (k) press('Paso siguiente')?.click();
            result.push({ id: host.id, tag: host.tagName.toLowerCase(), title, label: `paso ${k + 1}`, problems: measure(host, { scope }).problems });
          }
          const view = press('Ver la secuencia');
          if (view) {
            view.click();
            result.push({ id: host.id, tag: host.tagName.toLowerCase(), title, label: 'secuencia', problems: measure(host, { scope }).problems });
            view.click();
          }
          while (press('Paso anterior') && !press('Paso anterior').disabled) press('Paso anterior').click();
        } else if (host.querySelector('.lk-p')) {
          result.push({ id: host.id, tag: host.tagName.toLowerCase(), title, label: '', problems: measure(host, { scope }).problems });
        }
      }
      return result;
    }, { scope });
    for (const r of found) note(r.id, r.tag, r.title, `${theme} · ${width}px${r.label ? ` · ${r.label}` : ''}`, r.problems);
  }
  return [...out.values()];
}
