// What the learner database holds under a key, read the way a second process would.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function stored(root, key) {
  const file = join(root, "learning.db");
  if (!existsSync(file)) return undefined;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare("SELECT json FROM documentos WHERE clave = ?").get(key)?.json;
  } finally {
    db.close();
  }
}

export { writeDoc } from "../../integrations/pi/store.ts";
