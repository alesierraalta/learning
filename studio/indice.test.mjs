// Course-index tests (issue #373/T4): chunking, incremental updates, hybrid retrieval
// and the JSONL embedder client driven by the deterministic testdata fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE = join(HERE, "testdata", "fake-embed.mjs");
const indicio = await import("./indice.ts");
const {
  buscar,
  cerrarIndice,
  configurarIndice,
  desindizarFuente,
  estadoIndice,
  fusionarRRF,
  indicePath,
  indizarFuente,
  normalizar,
  segmentarTexto,
  esperarIndice,
} = indicio;

const root = () => mkdtempSync(join(tmpdir(), "indice-"));
const fake = () => configurarIndice({ embedCommand: [process.execPath, FAKE] });
const sinEmbed = () => configurarIndice({ embedCommand: null });
const words = (texto) => texto.split(/\s+/).filter(Boolean);

/** Writes the on-disk contract T3 created, so the index can read a source from files alone. */
function fuenteDe(vault, id, nombre, tipo, texto, sourceId = randomBytes(16).toString("hex")) {
  const curso = join(vault, ".materias", id);
  mkdirSync(join(curso, "fuentes", sourceId), { recursive: true });
  const archivo = `fuentes/${sourceId}/${nombre}`;
  writeFileSync(join(curso, `${archivo}.txt`), texto, "utf8");
  return { id: sourceId, tipo, nombre, archivo, bytes: Buffer.byteLength(texto), subida: new Date().toISOString(), texto: `${archivo}.txt` };
}

function cursoDe(vault, nombre, fuentes = [], id = randomBytes(16).toString("hex")) {
  mkdirSync(join(vault, ".materias", id), { recursive: true });
  writeFileSync(join(vault, ".materias", id, "materia.json"), JSON.stringify({
    id, nombre, creada: new Date().toISOString(), temas: [], fuentes,
  }) + "\n");
  return id;
}

test("chunking keeps word boundaries and reports PDF pages", () => {
  const tokens = Array.from({ length: 510 }, (_, index) => `palabra${index}`);
  const texto = `${tokens.slice(0, 260).join(" ")}\f${tokens.slice(260).join(" ")}`;
  const segmentos = segmentarTexto(texto, { nombre: "examen.pdf", tipo: "examen" });
  assert.ok(segmentos.length >= 4);
  assert.deepEqual([...new Set(segmentos.map((segmento) => segmento.ubicacion))].sort(), ["página 1", "página 2"]);
  for (const segmento of segmentos) {
    assert.ok(words(segmento.texto).every((word) => tokens.includes(word)), `no word was cut: ${segmento.texto.slice(0, 80)}`);
    assert.ok(words(segmento.texto).length <= 240, `target 220 words with a little slack: ${words(segmento.texto).length}`);
  }
  assert.ok(words(segmentos[0].texto).length >= 200);
  assert.equal(words(segmentos[1].texto).slice(0, 40).join(" "), words(segmentos[0].texto).slice(-40).join(" "), "40-word overlap");
});

test("chunking reports paragraphs, lines and speaker turns according to the source", () => {
  const dos = segmentarTexto("primera frase\n\nsegunda frase\n\ntercera frase", { nombre: "apuntes.txt", tipo: "documento" });
  assert.ok(dos.length > 0);
  assert.ok(dos.at(-1).ubicacion.includes("párrafo"), dos.at(-1).ubicacion);

  const lineas = segmentarTexto("uno\ndos\ntres", { nombre: "apuntes.md", tipo: "documento" });
  assert.match(lineas[0].ubicacion, /^líneas 1–\d+$/);

  const docx = segmentarTexto("primer párrafo\nsegundo párrafo", { nombre: "clase.docx", tipo: "transcripcion" });
  assert.match(docx[0].ubicacion, /párrafos?|líneas/);

  const transcripcion = segmentarTexto(
    "[00:01:10] Profesor: hablamos de memoria.\n[00:01:30] Alumna: ¿y la evalución?\n[00:01:40] Profesor: la dejamos para luego.",
    { nombre: "clase.txt", tipo: "transcripcion" },
  );
  assert.ok(transcripcion.length > 0);
  assert.match(transcripcion[0].texto, /Profesor:/);
  assert.match(transcripcion[0].texto, /\[00:01:\d\d\]/);
  for (const segmento of transcripcion) {
    for (const linea of segmento.texto.split("\n")) {
      if (linea.trim()) assert.match(linea, /^(?:\[\d{1,2}:\d{2}(?::\d{2})?\]|[\p{L}\p{N}]+\s*:)/u, `speaker line kept whole: ${linea}`);
    }
  }
});

test("accents are folded both when indexing and when querying", async () => {
  sinEmbed();
  const vault = root();
  const id = cursoDe(vault, "Lengua");
  indizarFuente(vault, id, fuenteDe(vault, id, "apuntes.txt", "documento", "La funcion es continua en todo el dominio."));
  assert.equal(normalizar("La función"), "la funcion");
  const resultado = await buscar(vault, id, "función", { k: 3 });
  assert.equal(resultado.length, 1);
  assert.match(resultado[0].texto, /funcion/);
  assert.deepEqual(resultado[0].senales, ["keyword"]);
});

test("upload, rehash and deletion update the index incrementally", async () => {
  sinEmbed();
  const vault = root();
  const id = cursoDe(vault, "Redes");
  const fuente = fuenteDe(vault, id, "clase.txt", "transcripcion", "el profesor habla de enrutamiento");
  indizarFuente(vault, id, fuente);
  assert.equal(estadoIndice(vault, id).chunks, 1);
  assert.ok((await buscar(vault, id, "enrutamiento")).some((item) => item.fuente === fuente.id));

  const change = indizarFuente(vault, id, fuente);
  assert.equal(change.reindexado, false, "the same text hash changes nothing");
  assert.equal(estadoIndice(vault, id).chunks, 1);

  writeFileSync(join(vault, ".materias", id, fuente.texto), "el profesor habla de conmutación");
  const reindexed = indizarFuente(vault, id, fuente);
  assert.equal(reindexed.reindexado, true);
  assert.equal(estadoIndice(vault, id).chunks, 1);
  assert.equal((await buscar(vault, id, "enrutamiento")).length, 0);
  assert.equal((await buscar(vault, id, "conmutacion")).length, 1);

  assert.equal(desindizarFuente(vault, id, fuente.id), 1);
  assert.equal(estadoIndice(vault, id).chunks, 0);
  assert.equal((await buscar(vault, id, "conmutacion")).length, 0);
});

test("a rebuild from files reproduces the incremental index, including its CLI", async () => {
  sinEmbed();
  const incremental = root();
  const rebuilt = root();
  const id = randomBytes(16).toString("hex");
  const texts = ["primera clase sobre colas", "segunda clase sobre árboles"];
  for (const vault of [incremental, rebuilt]) {
    cursoDe(vault, "Estructuras", [], id);
    const fuentes = texts.map((text, index) => fuenteDe(vault, id, `clase${index}.txt`, "documento", text, index.toString().repeat(32)));
    writeFileSync(join(vault, ".materias", id, "materia.json"), JSON.stringify({
      id, nombre: "Estructuras", creada: new Date().toISOString(), temas: [], fuentes,
    }) + "\n");
    for (const fuente of fuentes) indizarFuente(vault, id, fuente);
    if (vault === rebuilt) {
      const cli = spawnSync(process.execPath, [join(HERE, "indice.ts"), "--rebuild", vault], { encoding: "utf8", timeout: 60_000 });
      assert.equal(cli.status, 0, `${cli.stdout}\n${cli.error ?? ""}`);
      assert.match(cli.stdout, /reconstruido/);
    }
  }
  const rows = (vault) => {
    const db = new DatabaseSync(indicePath(vault));
    const result = db.prepare("SELECT id, pos, ubicacion, texto, texto_norm FROM chunks ORDER BY id").all();
    db.close();
    return result;
  };
  assert.deepEqual(rows(rebuilt), rows(incremental));
});

test("keyword-only fallback keeps search working with semantica false", async () => {
  sinEmbed();
  const vault = root();
  const id = cursoDe(vault, "Física");
  indizarFuente(vault, id, fuenteDe(vault, id, "temario.md", "documento", "La inercia depende de la masa."));
  await esperarIndice();
  const estado = estadoIndice(vault, id);
  assert.equal(estado.semantica, false);
  assert.equal(estado.pendiente, estado.chunks);
  const resultado = await buscar(vault, id, "inercia", { k: 5 });
  assert.equal(resultado.length, 1);
  assert.deepEqual(resultado[0].senales, ["keyword"]);
  assert.equal(resultado[0].score > 0, true);
  for (const campo of ["fuente", "tipo", "nombre", "ubicacion", "texto", "score", "senales"]) assert.ok(campo in resultado[0], campo);
});

test("RRF combines rank lists and reports the signals that matched", async () => {
  assert.deepEqual(
    fusionarRRF([["a", "b", "c"], ["b", "a", "d"]]).map((entry) => entry.id),
    ["a", "b", "c", "d"],
  );
  fake();
  const vault = root();
  const id = cursoDe(vault, "Biología");
  indizarFuente(vault, id, fuenteDe(vault, id, "clase.txt", "documento", "La mitosis produce dos células hijas idénticas."));
  await esperarIndice();
  const estado = estadoIndice(vault, id);
  assert.equal(estado.semantica, true);
  assert.equal(estado.pendiente, 0);
  const resultado = await buscar(vault, id, "mitosis", { k: 3 });
  assert.equal(resultado.length, 1);
  assert.deepEqual(resultado[0].senales, ["keyword", "semantic"]);
  assert.deepEqual(resultado[0].signals, ["keyword", "semantic"]);
  assert.equal((await buscar(vault, id, "mitosis", { modo: "claves" }))[0].senales.length, 1);
  assert.equal((await buscar(vault, id, "mitosis", { modo: "semantico" }))[0].senales.length, 1);
});

test("concurrent uploads queue every embedding job without losing a vector", async () => {
  fake();
  const vault = root();
  const id = cursoDe(vault, "Historia");
  const total = 24;
  for (let index = 0; index < total; index++) {
    indizarFuente(vault, id, fuenteDe(vault, id, `clase${index}.txt`, "documento", `hecho numero ${index} en la clase`));
  }
  await esperarIndice();
  const db = new DatabaseSync(indicePath(vault));
  const chunks = db.prepare("SELECT COUNT(*) n FROM chunks WHERE materia = ?").get(id).n;
  const vectors = db.prepare("SELECT COUNT(*) n FROM vectors v JOIN chunks c ON c.id = v.chunk_id WHERE c.materia = ?").get(id).n;
  db.close();
  assert.equal(chunks, total);
  assert.equal(vectors, total, "every queued source got its vectors");
  assert.equal(estadoIndice(vault, id).pendiente, 0);
});

test("the embedder is launched lazily and restarted once after a crash", async () => {
  const crash = join(HERE, "testdata", "crash-embed.mjs");
  const vault = root();
  const marker = join(vault, "embed-crash.once");
  configurarIndice({ embedCommand: [process.execPath, crash, marker] });
  const id = cursoDe(vault, "Química");
  indizarFuente(vault, id, fuenteDe(vault, id, "apuntes.txt", "documento", "el enlace iónico"));
  await esperarIndice();
  const db = new DatabaseSync(indicePath(vault));
  const vectors = db.prepare("SELECT COUNT(*) n FROM vectors").get().n;
  db.close();
  assert.equal(vectors, 1, "the single permitted restart delivered the batch");
  await cerrarIndice();
});
