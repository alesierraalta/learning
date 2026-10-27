// Trash tests: deleting a note from the studio never destroys it, it moves it to
// `.papelera/` with a manifest that says what it was, where it came from and when.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deleteNote } from "./bridge.ts";

const TOPIC = "sql-demo";

function vault() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "learnings-trash-")));
  const topic = join(root, TOPIC);
  for (const dir of ["explicaciones/adjuntos", "explicaciones/demos", "explicaciones/apps", "mini-quiz"]) mkdirSync(join(topic, dir), { recursive: true });
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({
      topic: "SQL demo",
      parts: [
        { id: "p1", title: "Claves", slug: "Claves" },
        { id: "p2", title: "Joins", slug: "Joins" },
      ],
    }, null, 2) + "\n",
  );
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Claves.md"), "# Parte 1 — Claves\n\nUna clave identifica.\n");
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Claves.html"), "<p>rico</p>");
  writeFileSync(join(topic, "explicaciones", "Parte 2 - Joins.md"), "# Parte 2 — Joins\n");
  writeFileSync(join(topic, "explicaciones", "adjuntos", "Parte 1 - Claves.mp4"), Buffer.from("video"));
  writeFileSync(join(topic, "explicaciones", "demos", "p1-claves.html"), "<p>demo</p>");
  writeFileSync(join(topic, "explicaciones", "apps", "p1.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(topic, "mini-quiz", "p1.json"), JSON.stringify({ questions: [] }));
  writeFileSync(join(topic, "mini-quiz", "p2.json"), JSON.stringify({ questions: [] }));
  mkdirSync(join(root, "rapidos"), { recursive: true });
  writeFileSync(join(root, "rapidos", "idea-suelta.md"), "# Idea suelta\n");
  return { root, topic };
}

const trashOf = (root, result) => join(root, result.trash);

test("a quick note moves to the trash with a manifest and leaves the library", () => {
  const { root } = vault();
  const result = deleteNote(root, { kind: "quick", quick: "idea-suelta" });

  assert.equal(existsSync(join(root, "rapidos", "idea-suelta.md")), false);
  assert.deepEqual(result.moved, [join("rapidos", "idea-suelta.md")]);
  const trash = trashOf(root, result);
  assert.equal(existsSync(join(trash, "rapidos", "idea-suelta.md")), true);
  const manifest = JSON.parse(readFileSync(join(trash, "papelera.json"), "utf8"));
  assert.equal(manifest.kind, "quick");
  assert.equal(manifest.quick, "idea-suelta");
  assert.deepEqual(manifest.moved, [join("rapidos", "idea-suelta.md")]);
  assert.match(manifest.at, /^\d{4}-\d\d-\d\dT/);
});

test("a deleted part takes its note, rich page, app, demos, video and mini-quiz, and drops its plan entry", () => {
  const { root, topic } = vault();
  const result = deleteNote(root, { kind: "part", topic: TOPIC, part: "p1" });

  for (const gone of ["Parte 1 - Claves.md", "Parte 1 - Claves.html"]) assert.equal(existsSync(join(topic, "explicaciones", gone)), false, gone);
  assert.equal(existsSync(join(topic, "explicaciones", "apps", "p1.html")), false);
  assert.equal(existsSync(join(topic, "explicaciones", "demos", "p1-claves.html")), false);
  assert.equal(existsSync(join(topic, "explicaciones", "adjuntos", "Parte 1 - Claves.mp4")), false);
  assert.equal(existsSync(join(topic, "mini-quiz", "p1.json")), false);
  // The other part is untouched.
  assert.equal(existsSync(join(topic, "explicaciones", "Parte 2 - Joins.md")), true);
  assert.equal(existsSync(join(topic, "mini-quiz", "p2.json")), true);

  const plan = JSON.parse(readFileSync(join(topic, "plan.json"), "utf8"));
  assert.deepEqual(plan.parts.map((p) => p.id), ["p2"]);
  assert.equal(plan.topic, "SQL demo");

  const manifest = JSON.parse(readFileSync(join(trashOf(root, result), "papelera.json"), "utf8"));
  assert.equal(manifest.kind, "part");
  assert.equal(manifest.part, "p1");
  assert.deepEqual(manifest.planPart, { id: "p1", title: "Claves", slug: "Claves" });
  assert.equal(result.removedPart, "p1");
  // Everything that left can be put back where it was.
  for (const rel of manifest.moved) assert.equal(existsSync(join(trashOf(root, result), rel)), true, rel);
});

test("a deleted topic moves its whole folder", () => {
  const { root } = vault();
  const result = deleteNote(root, { kind: "topic", topic: TOPIC });

  assert.equal(existsSync(join(root, TOPIC)), false);
  assert.deepEqual(result.moved, [TOPIC]);
  assert.equal(existsSync(join(trashOf(root, result), TOPIC, "plan.json")), true);
  assert.equal(existsSync(join(trashOf(root, result), TOPIC, "explicaciones", "Parte 1 - Claves.md")), true);
  const manifest = JSON.parse(readFileSync(join(trashOf(root, result), "papelera.json"), "utf8"));
  assert.equal(manifest.topic, TOPIC);
});

test("a part with nothing written still leaves the plan, and a part that does not exist is refused", () => {
  const { root, topic } = vault();
  writeFileSync(join(topic, "plan.json"), JSON.stringify({ topic: "SQL demo", parts: [{ id: "p1", title: "Claves", slug: "Claves" }, { id: "p3", title: "Índices", slug: "Indices" }] }));
  const result = deleteNote(root, { kind: "part", topic: TOPIC, part: "p3" });

  assert.deepEqual(result.moved, []);
  assert.equal(result.removedPart, "p3");
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "plan.json"), "utf8")).parts.map((p) => p.id), ["p1"]);
  const manifest = JSON.parse(readFileSync(join(trashOf(root, result), "papelera.json"), "utf8"));
  assert.deepEqual(manifest.planPart, { id: "p3", title: "Índices", slug: "Indices" });

  assert.throws(() => deleteNote(root, { kind: "part", topic: TOPIC, part: "p9" }), /nothing to delete/);
  assert.throws(() => deleteNote(root, { kind: "part", topic: "no-existe", part: "p1" }), /no plan/);
});

test("only notes inside the vault are deletable: no traversal, no reserved folders, no escaping symlinks", () => {
  const { root } = vault();
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "learnings-outside-")));
  writeFileSync(join(outside, "keep.md"), "# keep\n");
  symlinkSync(outside, join(root, "linked"));
  const before = readdirSync(root).sort();

  for (const target of [
    { kind: "topic", topic: ".." },
    { kind: "topic", topic: "../etc" },
    { kind: "topic", topic: ".papelera" },
    { kind: "topic", topic: "rapidos" },
    { kind: "part", topic: TOPIC, part: "../p1" },
    { kind: "part", topic: TOPIC, part: "p1/../../x" },
    { kind: "quick", quick: "../idea" },
    { kind: "topic", topic: "linked" },
    { kind: "topic", topic: "no-existe" },
  ]) {
    assert.throws(() => deleteNote(root, target), (err) => err.status === 400 || err.status === 404, JSON.stringify(target));
  }

  // Nothing moved and no trash folder was left behind by the refusals.
  assert.deepEqual(readdirSync(root).sort(), before);
  assert.equal(existsSync(join(outside, "keep.md")), true);
  assert.equal(existsSync(join(root, "rapidos", "idea-suelta.md")), true);
});

test("an unknown kind is refused", () => {
  const { root } = vault();
  assert.throws(() => deleteNote(root, { kind: "folder", topic: TOPIC }), (err) => err.status === 400);
});
