// Gate de arquitectura: qué capa puede importar a cuál, medido sobre el árbol real.
//
// La sonda de arquitectura de `tsp` solo juzga importaciones de Go. En este
// repositorio no hay una sola línea de Go, así que su respuesta honesta es
// «the change touched no Go file, so no import edge was judged»: un silencio,
// no un aprobado. Y un `.tsp-arch.json` aquí solo cambiaría ese silencio por
// otro. Este gate cubre la dimensión que sí existe.
//
// Cada regla salió de una verdad medida en el árbol, no de una arquitectura
// ideal:
//
//   plugin → tools   prohibido  el plugin corre dentro de Pi; no puede depender
//                               de los comandos de este repositorio.
//   tools → plugin   permitido  `tools/deck-gate.mjs` importa el puente para
//                               registrar el componente; es su único trabajo.
//   tools → kit      prohibido  el kit es de navegador: espera `document` y se
//                               carga como script suelto, no como módulo.
//   kit → nada       prohibido  los recursos del kit no importan nada — ni
//                               builtins, ni paquetes, ni parientes. Sus tests
//                               son de Node y viven en `kit/test/`.
//
// Además reporta dos defectos que ninguna otra herramienta mira aquí: una
// importación relativa que no lleva a ningún archivo, y un ciclo entre módulos
// (la sonda de `tsp` lo declara explícitamente fuera de su alcance).
//
// Uso: node tools/arch-gate.mjs [directorio] [--json]
// Sale 1 si encuentra algo, 0 si el árbol respeta sus capas, 2 si no puede mirar.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.learning', '.cache']);
const EXTENSIONS = ['', '.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx'];
const INDEX = ['index.mjs', 'index.js', 'index.cjs', 'index.ts', 'index.tsx'];

// Una sola pasada por archivo, sin recorrer dos veces el mismo subárbol.
function sources(root) {
  const found = [];
  const queue = [root];
  while (queue.length) {
    const dir = queue.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.isFile() && SOURCE.has(extname(entry.name))) found.push(full);
    }
  }
  return found.sort();
}

// Los comentarios se borran conservando los saltos de línea para que los
// números de línea sigan siendo los del archivo.
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, head) => head + ' '.repeat(m.length - head.length));
}

const PATTERNS = [
  /(?:^|[\s;{(])import\s+(?:[^'"();]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /(?:^|[\s;}])export\s+[^'";]*?\s+from\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function specifiers(text) {
  const clean = withoutComments(text);
  const hits = [];
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(clean))) {
      const at = clean.slice(0, match.index + match[0].indexOf(match[1])).split('\n').length;
      hits.push({ spec: match[1], line: at });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

function isRelative(spec) {
  return spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..';
}

// Un `.js` que en realidad se publica como `.ts` — el estilo ESM de TypeScript —
// tiene que resolver igual, o el gate inventaría enlaces rotos.
function resolveFile(base) {
  for (const extension of EXTENSIONS) {
    const candidate = extension ? base.replace(/\.(mjs|cjs|js|jsx|ts|tsx)$/, extension) : base;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  for (const index of INDEX) {
    try {
      const candidate = join(base, index);
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function layerOf(path) {
  if (path.startsWith('integrations/pi/kit/test/')) return 'kit-test';
  if (path.startsWith('integrations/pi/kit/')) return 'kit';
  if (path.startsWith('integrations/pi/')) return 'plugin';
  if (path.startsWith('tools/')) return 'tools';
  return 'other';
}

const FORBIDDEN = {
  'plugin>tools': 'el plugin corre dentro de Pi y no puede depender de los comandos de este repositorio',
  'tools>kit': 'el kit es de navegador: espera `document` y se carga como script suelto',
};

export function scan({ root = '.' } = {}) {
  const base = resolve(root);
  try {
    if (!statSync(base).isDirectory()) throw new Error('no es un directorio');
  } catch (error) {
    throw new Error(`no se pudo mirar ${base}: ${error.code || error.message}`);
  }

  const files = sources(base);
  const violations = [];
  const graph = new Map();

  for (const full of files) {
    const file = relative(base, full).split(sep).join('/');
    const layer = layerOf(file);
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    const edges = [];
    for (const { spec, line } of specifiers(text)) {
      if (!isRelative(spec)) {
        if (layer === 'kit') {
          violations.push({
            kind: 'kit-not-standalone',
            file,
            line,
            target: spec,
            why: 'un recurso del kit no importa nada: se carga como script suelto',
          });
        }
        continue;
      }

      const resolved = resolveFile(resolve(dirname(full), spec));
      if (!resolved) {
        violations.push({
          kind: 'broken-import',
          file,
          line,
          target: spec,
          why: 'la importación relativa no lleva a ningún archivo',
        });
        continue;
      }

      const target = relative(base, resolved).split(sep).join('/');
      edges.push({ line, target });

      if (layer === 'kit') {
        violations.push({
          kind: 'kit-not-standalone',
          file,
          line,
          target,
          why: 'un recurso del kit no importa nada: se carga como script suelto',
        });
        continue;
      }

      const forbidden = FORBIDDEN[`${layer}>${layerOf(target)}`];
      if (forbidden) {
        violations.push({ kind: 'forbidden-edge', file, line, target, why: forbidden });
      }
    }
    graph.set(file, edges);
  }

  for (const cycle of cycles(graph)) {
    violations.push({
      kind: 'cycle',
      file: cycle[0],
      line: cycle.line,
      target: cycle[0],
      why: `ciclo de importaciones: ${cycle.join(' → ')}`,
    });
  }

  violations.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });
  const edges = [...graph.values()].reduce((sum, list) => sum + list.length, 0);
  return { root: base, files: files.length, edges, violations };
}

// Un ciclo se reporta una vez, nombrado por su archivo más pequeño, para que
// dos ejecuciones no cuenten el mismo defecto dos veces.
function cycles(graph) {
  const found = [];
  const seen = new Set();
  const color = new Map();
  const stack = [];

  const visit = (node) => {
    color.set(node, 'gris');
    stack.push(node);
    for (const edge of graph.get(node) || []) {
      if (!graph.has(edge.target)) continue;
      const state = color.get(edge.target);
      if (state === 'gris') {
        const start = stack.indexOf(edge.target);
        const ring = stack.slice(start);
        const key = [...ring].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          const first = [...ring].sort()[0];
          const closes = (graph.get(first) || []).find((e) => ring.includes(e.target));
          found.push(Object.assign([first, ...ring.filter((f) => f !== first)], { line: closes?.line || 1 }));
        }
      } else if (!state) {
        visit(edge.target);
      }
    }
    stack.pop();
    color.set(node, 'negro');
  };

  for (const node of [...graph.keys()].sort()) if (!color.has(node)) visit(node);
  return found;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const targets = argv.filter((a) => !a.startsWith('-'));
  const root = targets[0] || '.';

  let report;
  try {
    report = scan({ root });
  } catch (error) {
    console.log(error.message);
    process.exit(2);
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.violations.length) {
    for (const v of report.violations) {
      console.log(`${v.file}:${v.line}  ${v.kind}  ${v.target}\n    ${v.why}`);
    }
    console.log(`\n${report.violations.length} hallazgo(s) en ${report.files} archivo(s)`);
  } else {
    console.log(`arquitectura limpia: ${report.files} archivo(s), ${report.edges} importación(es) relativa(s), 0 hallazgo(s)`);
  }
  process.exit(report.violations.length ? 1 : 0);
}
