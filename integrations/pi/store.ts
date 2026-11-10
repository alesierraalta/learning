/**
 * The learner's data -- preferences, suggestions, telemetry -- in one SQLite file.
 * Each store keeps the JSON document it always kept, under a key, and validates
 * it on read as before; only where the bytes live changed. The studio and Pi's
 * bridge write from different processes, so WAL and a busy timeout keep them apart.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const open = new Map<string, DatabaseSync>();

/** `STUDIO_DB` when set; otherwise `learning.db` beside the topics. */
export function dbPath(root: string): string {
  return process.env.STUDIO_DB?.trim() || join(root, "learning.db");
}

/** The JSON files the studio wrote before the database, and the key each one becomes. */
function legacyFiles(root: string): [string, string][] {
  const files: [string, string][] = [
    ["preferencias", join(root, "preferencias.json")],
    ["sugerencias", join(root, "sugerencias.json")],
    ["telemetria", join(root, "telemetria.json")],
  ];
  let entries: import("node:fs").Dirent[] = [];
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { /* an empty root imports nothing */ }
  for (const entry of entries) {
    if (entry.isDirectory()) files.push([`telemetria/${entry.name}`, join(root, entry.name, "telemetria.json")]);
  }
  return files.filter(([, file]) => existsSync(file));
}

/** Once per database: the old files are copied in as they are and never touched again. */
function importLegacy(db: DatabaseSync, root: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT 1 FROM meta WHERE clave = 'importado_v1'").get()) {
      const insert = db.prepare("INSERT OR IGNORE INTO documentos (clave, json, actualizado) VALUES (?, ?, ?)");
      const now = new Date().toISOString();
      for (const [key, file] of legacyFiles(root)) insert.run(key, readFileSync(file, "utf8"), now);
      db.prepare("INSERT INTO meta (clave, valor) VALUES ('importado_v1', ?)").run(now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function database(root: string): DatabaseSync {
  const file = dbPath(root);
  let db = open.get(file);
  if (db) return db;
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS documentos (clave TEXT PRIMARY KEY, json TEXT NOT NULL, actualizado TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `);
  importLegacy(db, root);
  open.set(file, db);
  return db;
}

/** The stored JSON text, or undefined when nothing was ever saved under the key. */
export function readDoc(root: string, key: string): string | undefined {
  const row = database(root).prepare("SELECT json FROM documentos WHERE clave = ?").get(key) as { json: string } | undefined;
  return row?.json;
}

export function writeDoc(root: string, key: string, json: string): void {
  database(root)
    .prepare("INSERT INTO documentos (clave, json, actualizado) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET json = excluded.json, actualizado = excluded.actualizado")
    .run(key, json, new Date().toISOString());
}
