// La lista de archivos del kit que la puerta copia y carga sale de un único sitio: el manifiesto del
// kit (`integrations/pi/kit/manifest.json`), que dice qué carga el kit en tiempo de ejecución.
//   head    lo carga la página, en este orden: kit.css antes que scene.js, y scene.js antes que kit.js.
//   beside  lo carga kit.js a su lado con `beside()`: la pregunta (question.js) y el dictado.
//   assets  lo pide kit.css por ruta relativa: las fuentes.
// Una lista escrita a mano dejó fuera question.js (#336). Si un archivo del manifiesto falta, la puerta
// no mide nada: la página no sería la que ve el alumno. `tools/test/scene-gate-kit.test.mjs` compara el
// manifiesto con lo que kit.js y kit.css piden de verdad.

import { cpSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

const KEYS = ['head', 'beside', 'assets'];

// Lee y valida el manifiesto. Lanza un Error con el motivo si no es una lista de rutas relativas al kit.
export function readKitManifest(kit) {
  const path = join(kit, 'manifest.json');
  let json;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`no se pudo leer ${path}: ${error.message}`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(`${path} no es un objeto`);
  for (const key of Object.keys(json)) {
    if (!KEYS.includes(key)) throw new Error(`${path}: clave desconocida «${key}»`);
  }
  const manifest = {};
  for (const key of KEYS) {
    const list = json[key];
    const relative = (file) => typeof file === 'string' && file !== '' && !isAbsolute(file) && !file.split('/').includes('..');
    if (!Array.isArray(list) || !list.every(relative)) throw new Error(`${path}: «${key}» debe ser una lista de rutas relativas al kit`);
    manifest[key] = list;
  }
  const badHead = manifest.head.find((file) => !/\.(css|js)$/.test(file));
  if (badHead) throw new Error(`${path}: «head» solo lleva .css o .js, y «${badHead}» no lo es`);
  return manifest;
}

// Todos los archivos que la puerta copia, sin repetir.
export function kitFiles(manifest) {
  return [...new Set([...manifest.head, ...manifest.beside, ...manifest.assets])];
}

// Los archivos del manifiesto que no están en el kit.
export function missingKitFiles(kit, manifest) {
  return kitFiles(manifest).filter((file) => {
    try {
      return !statSync(join(kit, file)).isFile();
    } catch {
      return true;
    }
  });
}

// Copia el kit a `target` con su misma estructura: `fonts/…` queda donde lo pide kit.css.
export function stageKit(kit, target, manifest) {
  for (const file of kitFiles(manifest)) {
    mkdirSync(dirname(join(target, file)), { recursive: true });
    cpSync(join(kit, file), join(target, file));
  }
}

// La página que mide: el CSS y los scripts de `head`, en su orden, y el cuerpo que se le da.
export function gatePage(manifest, body) {
  const head = manifest.head.map((file) => (file.endsWith('.css')
    ? `<link rel="stylesheet" href="./kit/${file}">`
    : `<script src="./kit/${file}" defer></script>`)).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">\n${head}\n</head><body><main style="max-width:720px;margin:0 auto">${body}</main></body></html>`;
}
