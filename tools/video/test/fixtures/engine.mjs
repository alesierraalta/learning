// A copy of the engine, so a test can change one part of it without touching the
// repository it runs in. `render.mjs` resolves the repo from its own location, so
// the copy draws with the copy's stage, keys the cache on the copy's sources and
// starts the copy's gate.
//
// `stub` replaces the craft gate in the copy. The gate is a child process of the
// renderer, so the only way to watch it from the inside — or to hold it open on
// purpose — is to put another one where the renderer will find it.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = new URL("../../../..", import.meta.url).pathname;

export function copiedEngine({ stub = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "video-engine-"));
  for (const rel of ["tools/video/src", "tools/video/lib", "integrations/pi/kit"]) cpSync(join(REPO, rel), join(root, rel), { recursive: true });
  for (const rel of ["tools/video/render.mjs", "tools/video/audit.mjs", "tools/video/migrate.mjs"]) cpSync(join(REPO, rel), join(root, rel));
  writeFileSync(join(root, "tools/video/legibility.mjs"), stub ?? readFileSync(join(REPO, "tools/video/legibility.mjs"), "utf8"));
  return root;
}
