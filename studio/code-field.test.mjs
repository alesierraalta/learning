// #334: the studio serves the code field beside its other kit scripts, and its shell loads it after question.js.
import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { startStudio as startStudioChecked } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

/**
 * These tests read the served files, not the tutor's instructions: the context check is off so the links a machine
 * happens to have cannot decide a shell assertion.
 */
const startStudio = (options) => startStudioChecked({ skipContextCheck: true, ...options });

const open = [];
// A studio is this file's handle: `afterEach` belongs to the test that opened it, so it always runs (#231).
afterEach(async () => {
  for (const studio of open.splice(0)) await studio.close();
});
after(async () => {
  for (const studio of open.splice(0)) await studio.close();
});

test("the studio serves the code field and its shell loads it after question.js", async () => {
  const { root, engine } = makeRoot();
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine, offlineCacheDir: join(root, ".cdn") });
  open.push(studio);
  const shell = await (await fetch(studio.url)).text();
  const question = shell.indexOf("/kit/question.js\"");
  const field = shell.indexOf("/kit/code-field.js\"");
  assert.ok(field > -1, "the shell loads the code field");
  assert.ok(question > -1 && question < field, "the code field loads after question.js, as the other kit scripts do");
  const asset = await fetch(`${studio.url}kit/code-field.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.match(await asset.text(), /lkCodeField/);
});
