// Course storage tests: the JSON contract on disk, extraction, containment and the course lock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { addFuente, createMateria, deleteFuente, getMateria, linkTema, listMaterias, materiaForTopic, unlinkTema } from "./materias.ts";
import { listTopics } from "../integrations/pi/bridge.ts";
import { tinyDocx } from "./testdata/docx.mjs";
import { tinyPdf } from "./testdata/pdf.mjs";

const root = () => realpathSync(mkdtempSync(join(tmpdir(), "materias-")));
const topic = (vault, id, title = id) => {
  mkdirSync(join(vault, id));
  writeFileSync(join(vault, id, "plan.json"), JSON.stringify({ topic: title, parts: [] }));
};
const courseDir = (vault, id) => join(vault, ".materias", id);
const readText = (vault, id, fuente) => readFileSync(join(courseDir(vault, id), fuente.texto), "utf8");
const pdfTools = ["pdftotext", "pdftoppm", "pdfinfo"].every((tool) => !spawnSync(tool, ["-v"], { stdio: "ignore" }).error);
const EMPTY = { examen: 0, documento: 0, transcripcion: 0 };

test("a course is created with a generated id and keeps the documented JSON shape", () => {
  const vault = root();
  const materia = createMateria(vault, "  Análisis de redes  ");
  assert.match(materia.id, /^[a-f0-9]{32}$/);
  assert.equal(materia.nombre, "Análisis de redes");
  assert.match(materia.creada, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.deepEqual(materia.temas, []);
  assert.deepEqual(materia.fuentes, []);
  assert.deepEqual(JSON.parse(readFileSync(join(courseDir(vault, materia.id), "materia.json"), "utf8")), materia);
  assert.deepEqual(listMaterias(vault), [{
    id: materia.id, nombre: materia.nombre, temas: [], fuentes: 0, porTipo: { ...EMPTY },
  }]);
  assert.deepEqual(getMateria(vault, materia.id), materia);
  assert.throws(() => createMateria(vault, "   "), (error) => error.status === 400);
  assert.throws(() => getMateria(vault, "../escape"), (error) => error.status === 404);
  assert.throws(() => getMateria(vault, "f".repeat(32)), (error) => error.status === 404);
});

test("a course symlink to another folder is never read as a course", () => {
  const vault = root();
  const outside = root();
  const id = "a".repeat(32);
  mkdirSync(join(vault, ".materias"));
  writeFileSync(join(outside, "materia.json"), JSON.stringify({ id, nombre: "Ajena", creada: new Date().toISOString(), temas: [], fuentes: [] }));
  symlinkSync(outside, courseDir(vault, id));
  assert.deepEqual(listMaterias(vault), []);
  assert.throws(() => getMateria(vault, id), (error) => error.status === 500);
});

test("every accepted type is stored under its own source id with extracted UTF-8 text", async () => {
  const vault = root();
  const { id } = createMateria(vault, "Redes");
  const files = [
    { fileName: "apuntes.txt", contentType: "text/plain", tipo: "transcripcion", content: Buffer.from("El profesor dice que la capa es alta.\n"), phrase: "capa es alta" },
    { fileName: "clase.md", contentType: "text/markdown", tipo: "transcripcion", content: Buffer.from("# Clase\n\nPalabras del profesor.\n", "utf8"), phrase: "Palabras del profesor" },
    { fileName: "transcripcion.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", tipo: "transcripcion", content: tinyDocx("El profesor explica el <TCP> & sus puertos.\nSegunda línea."), phrase: "explica el <TCP> & sus puertos" },
    { fileName: "captura.png", contentType: "image/png", tipo: "documento", content: Buffer.from("89504e470d0a1a0a0d0a1a0a", "hex"), phrase: "" },
  ];
  if (pdfTools) {
    files.push({ fileName: "examen.pdf", contentType: "application/pdf", tipo: "examen", content: tinyPdf(), phrase: "Examen real de redes." });
  }
  for (const file of files) {
    const fuente = await addFuente(vault, id, file);
    assert.match(fuente.id, /^[a-f0-9]{32}$/);
    assert.equal(fuente.nombre, file.fileName);
    assert.equal(fuente.tipo, file.tipo);
    assert.equal(fuente.bytes, file.content.length);
    assert.match(fuente.subida, /^\d{4}-\d\d-\d\dT/);
    assert.match(fuente.archivo, new RegExp(`^fuentes/${fuente.id}/`));
    assert.match(fuente.texto, new RegExp(`^fuentes/${fuente.id}/.*\\.txt$`));
    assert.ok(existsSync(join(courseDir(vault, id), fuente.archivo)), "the original is kept next to its text");
    const extracted = readText(vault, id, fuente);
    if (file.phrase) assert.match(extracted, new RegExp(file.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(getMateria(vault, id).fuentes.at(-1).id, fuente.id, "the source is added to materia.json");
  }
  const materia = getMateria(vault, id);
  assert.equal(materia.fuentes.length, files.length);
  assert.deepEqual(listMaterias(vault)[0].porTipo, {
    examen: pdfTools ? 1 : 0,
    documento: 1,
    transcripcion: 3,
  });
  if (pdfTools) {
    const pdf = materia.fuentes.find((fuente) => fuente.tipo === "examen");
    assert.equal(pdf.paginas, 1);
    assert.ok(existsSync(join(courseDir(vault, id), pdf.archivo + ".p1.png")), "PDF pages stay rendered as page images");
  }
});

test("invalid uploads are refused before anything is written", async () => {
  const vault = root();
  const { id } = createMateria(vault, "Redes");
  const valid = { fileName: "clase.txt", contentType: "text/plain", tipo: "transcripcion", content: Buffer.from("texto") };
  const bad = [
    [{ ...valid, contentType: "application/octet-stream" }, 415],
    [{ ...valid, fileName: "clase.exe" }, 415],
    [{ ...valid, tipo: "otro" }, 400],
    [{ ...valid, fileName: "../../secreto.txt" }, 400],
    [{ ...valid, fileName: "..\\secreto.txt" }, 400],
    [{ ...valid, fileName: "/etc/passwd.txt" }, 400],
    [{ ...valid, content: Buffer.alloc(20 * 1024 * 1024 + 1) }, 413],
    [{ ...valid, content: Buffer.alloc(0) }, 400],
  ];
  for (const [input, status] of bad) {
    await assert.rejects(() => addFuente(vault, id, input), (error) => {
      assert.equal(error.status, status, JSON.stringify(input.fileName + " " + input.contentType));
      return true;
    });
  }
  await assert.rejects(() => addFuente(vault, "f".repeat(32), valid), (error) => error.status === 404);
  assert.deepEqual(getMateria(vault, id).fuentes, []);
  assert.equal(existsSync(join(courseDir(vault, id), "fuentes")), false, "no source directory is left by a refused upload");
});

test("deleting a source moves it to the course trash and removes it from the index", async () => {
  const vault = root();
  const { id } = createMateria(vault, "Redes");
  const fuente = await addFuente(vault, id, { fileName: "viejo.txt", contentType: "text/plain", tipo: "documento", content: Buffer.from("viejo") });
  await deleteFuente(vault, id, fuente.id);
  assert.deepEqual(getMateria(vault, id).fuentes, []);
  const trash = readdirSync(join(courseDir(vault, id), ".papelera"));
  assert.equal(trash.length, 1);
  assert.match(trash[0], new RegExp(`^${fuente.id}-`));
  assert.ok(existsSync(join(courseDir(vault, id), ".papelera", trash[0], fuente.archivo.split("/").at(-1))));
  assert.equal(existsSync(join(courseDir(vault, id), "fuentes", fuente.id)), false);
  await assert.rejects(() => deleteFuente(vault, id, fuente.id), (error) => error.status === 404);
});

test("two concurrent uploads both survive in materia.json", async () => {
  const vault = root();
  const { id } = createMateria(vault, "Redes");
  const [one, two] = await Promise.all([
    addFuente(vault, id, { fileName: "uno.txt", contentType: "text/plain", tipo: "documento", content: Buffer.from("uno") }),
    addFuente(vault, id, { fileName: "dos.md", contentType: "text/markdown", tipo: "transcripcion", content: Buffer.from("# dos") }),
  ]);
  assert.notEqual(one.id, two.id);
  assert.deepEqual(getMateria(vault, id).fuentes.map((fuente) => fuente.nombre), ["uno.txt", "dos.md"]);
  assert.equal(listMaterias(vault)[0].fuentes, 2);
});

test("two courses racing for one topic: exactly one owns it", async () => {
  const vault = root();
  topic(vault, "redes");
  const first = createMateria(vault, "Grado A");
  const second = createMateria(vault, "Grado B");
  const results = await Promise.allSettled([
    linkTema(vault, first.id, "redes"),
    linkTema(vault, second.id, "redes"),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.status, 409);
  assert.equal(listMaterias(vault).filter((materia) => materia.temas.includes("redes")).length, 1);
});

test("a topic belongs to one course and listTopics reports the course on each topic", async () => {
  const vault = root();
  topic(vault, "redes", "Redes");
  topic(vault, "soa", "SOA");
  const first = createMateria(vault, "Grado A");
  const second = createMateria(vault, "Grado B");
  assert.equal(materiaForTopic(vault, "redes"), null);
  await linkTema(vault, first.id, "redes");
  assert.deepEqual(materiaForTopic(vault, "redes"), { id: first.id, nombre: "Grado A" });
  assert.deepEqual(getMateria(vault, first.id).temas, ["redes"]);
  assert.equal(listTopics(vault).find((entry) => entry.id === "redes").materia.nombre, "Grado A");
  assert.equal(listTopics(vault).find((entry) => entry.id === "soa").materia, null);
  await linkTema(vault, first.id, "redes");
  assert.deepEqual(getMateria(vault, first.id).temas, ["redes"]);
  await assert.rejects(() => linkTema(vault, second.id, "redes"), (error) => error.status === 409);
  await assert.rejects(() => linkTema(vault, first.id, "desconocido"), (error) => error.status === 404);
  await assert.rejects(() => linkTema(vault, first.id, "../escape"), (error) => error.status === 400);
  await unlinkTema(vault, first.id, "redes");
  assert.equal(materiaForTopic(vault, "redes"), null);
  assert.equal(listTopics(vault).find((entry) => entry.id === "redes").materia, null);
  assert.deepEqual(getMateria(vault, first.id).temas, []);
});
