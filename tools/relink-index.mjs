#!/usr/bin/env node
// One-time migration for indexes copied from the Obsidian vault: a link that reached a
// part through the vault path ([[.../<tema>/explicaciones/Parte N - x]]) becomes the
// topic-relative link the engine expects ([[explicaciones/Parte N - x]]).
// Dry run by default; --write applies it.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const USAGE = 'Uso: node tools/relink-index.mjs <raíz> [--write]\n';
const [root, ...rest] = process.argv.slice(2);
const write = rest.length === 1 && rest[0] === '--write';
if (!root || (rest.length && !write) || !existsSync(root) || !statSync(root).isDirectory()) {
  process.stderr.write(USAGE);
  process.exit(2);
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let files = 0;
let links = 0;
for (const entry of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const file = join(root, entry.name, 'explicacion.md');
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  const vaultLink = new RegExp(`\\[\\[[^\\]|]*/${escape(entry.name)}/(explicaciones/)`, 'g');
  let count = 0;
  const next = text.replace(vaultLink, (_m, folder) => { count++; return `[[${folder}`; });
  if (!count) continue;
  files++;
  links += count;
  console.log(`${entry.name}/explicacion.md: ${count} enlaces`);
  if (write) writeFileSync(file, next);
}
console.log(write
  ? `${files} índice(s), ${links} enlace(s) reescritos`
  : `${files} índice(s), ${links} enlace(s) por reescribir (sin --write no se cambia nada)`);
