// 8. Las figuras conviven: se delega en scene-lint, que abre un navegador.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export default {
  id: 'figuras',
  check({ escenas, recorridos }, { file, tools }) {
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
    return figuras;
  },
};
