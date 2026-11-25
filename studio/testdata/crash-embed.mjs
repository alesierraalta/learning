// The T4 restart test: the first copy dies without answering; the restart behaves
// exactly like the deterministic fake. The marker is unique to one test's vault.
import { existsSync, writeFileSync } from "node:fs";
import { serve } from "./fake-embed.mjs";

const marker = process.argv[2];
if (!marker) throw new Error("crash-embed needs a marker path");
if (!existsSync(marker)) {
  writeFileSync(marker, "crashed once\n");
  process.stdout.write(`${JSON.stringify({ ready: true, model: "multilingual-e5-small-q8", dim: 384 })}\n`);
  process.exit(7);
}
serve();
