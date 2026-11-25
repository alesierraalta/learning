// What a learner says about a part when it is over: a verdict, the reasons with their sign, and
// their own words. The point is the record: praise has to be storable, or the system can only
// subtract. Kept apart from `sugerencias.json` on purpose -- those lines drive corrections, and a
// correction fed with praise becomes noise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GUSTA, gustosBlock, MEJORA, listarValoraciones, loQueGusta, MOTIVOS, readValoraciones, recordValoracion, stripGustos, withGustos } from "./valoraciones.ts";

const root = () => mkdtempSync(join(tmpdir(), "valoraciones-"));
const bien = { tema: "redes", parte: "p1", valor: "gusta", motivos: ["ejemplo-claro"], texto: "El ejemplo del sobre me cerró la idea." };

test("a thumb up is stored with its reasons and reads back verbatim", () => {
  const dir = root();
  const { entrada } = recordValoracion(dir, bien);
  assert.equal(entrada.texto, "El ejemplo del sobre me cerró la idea.");
  assert.deepEqual(entrada.motivos, ["ejemplo-claro"]);
  assert.equal(entrada.valor, "gusta");
  assert.match(entrada.id, /^v-[a-f0-9]{12}$/);
  assert.deepEqual(listarValoraciones(dir, { tema: "redes", parte: "p1" }).entradas.map((cada) => cada.id), [entrada.id]);
});

test("a verdict never pulls the learner's preferences: that is what a suggestion is for", () => {
  const dir = root();
  mkdirSync(join(dir, "noop"), { recursive: true });
  const before = JSON.stringify({ version: 1, aspectos: [{ id: "sencillez", nivel: "medio" }] });
  writeFileSync(join(dir, "preferencias.json"), before);
  // "demasiado-texto" is a complaint motive with a preference effect in sugerencias; here it is
  // only a reason attached to a verdict.
  recordValoracion(dir, { ...bien, valor: "no-gusta", motivos: ["demasiado-texto", "faltan-visuales"], texto: "" });
  assert.equal(readFileSync(join(dir, "preferencias.json"), "utf8"), before);
});

test("what is not a verdict is refused and writes nothing", () => {
  const dir = root();
  const rechazos = [
    { ...bien, valor: "me-gusta-mucho" },
    { ...bien, motivos: ["porque-si"] },
    { ...bien, motivos: Array.from({ length: 9 }, () => "ejemplo-claro") },
    { ...bien, texto: "x".repeat(2001) },
    { ...bien, tema: "../fuera" },
    { ...bien, parte: "parte1" },
    { ...bien, motivos: "ejemplo-claro" },
  ];
  for (const cuerpo of rechazos) assert.throws(() => recordValoracion(dir, cuerpo), /invalid|unknown|too many/);
  assert.deepEqual(readValoraciones(dir).entradas, []);
});

test("one verdict per part: the second one replaces the first", () => {
  const dir = root();
  recordValoracion(dir, bien);
  const { entrada } = recordValoracion(dir, { ...bien, valor: "no-gusta", motivos: ["muy-abstracto"], texto: "Me perdí." });
  const guardadas = readValoraciones(dir).entradas;
  assert.equal(guardadas.length, 1);
  assert.equal(guardadas[0].id, entrada.id);
  assert.equal(guardadas[0].valor, "no-gusta");
});

test("the document is capped, and the oldest verdict falls out", () => {
  const dir = root();
  for (let index = 0; index < 501; index += 1) {
    recordValoracion(dir, { ...bien, tema: `tema-${index}`, parte: "p1" });
  }
  const entradas = readValoraciones(dir).entradas;
  assert.equal(entradas.length, 500);
  assert.equal(entradas.some((cada) => cada.tema === "tema-0"), false, "the first one is gone");
});

test("a damaged document does not block the studio", () => {
  const dir = root();
  writeFileSync(join(dir, "valoraciones.json"), "{ esto no es json");
  assert.deepEqual(readValoraciones(dir).entradas, []);
  recordValoracion(dir, bien);
  assert.equal(readValoraciones(dir).entradas.length, 1, "and the next save rewrites it");
});

test("the digest keeps what repeats and drops what was said once", () => {
  const entradas = [
    { tema: "a", motivos: ["ejemplo-claro", "demasiado-texto"] },
    { tema: "b", motivos: ["ejemplo-claro"] },
    { tema: "c", motivos: ["ejemplo-claro", "faltan-visuales"] },
    { tema: "d", motivos: ["muy-abstracto"] },
  ].map((cada) => ({ ...bien, tema: cada.tema, motivos: cada.motivos }));
  const { gusta, mejora } = loQueGusta(entradas);
  assert.deepEqual(gusta, [{ motivo: "ejemplo-claro", texto: "El ejemplo fue claro", veces: 3 }]);
  assert.deepEqual(mejora.map((cada) => [cada.motivo, cada.veces]), [["demasiado-texto", 1], ["faltan-visuales", 1], ["muy-abstracto", 1]]);
  // Nothing reaches the tutor with a single mention: one learner's bad day is not a rule.
  assert.deepEqual(loQueGusta(entradas, { minimo: 2 }).mejora, []);
});

test("the motive table has both signs and no repeated id", () => {
  const ids = MOTIVOS.map((motivo) => motivo.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(MOTIVOS.filter((motivo) => motivo.signo === "gusta").map((motivo) => motivo.id), [...GUSTA]);
  assert.deepEqual(MOTIVOS.filter((motivo) => motivo.signo === "mejora").map((motivo) => motivo.id), [...MEJORA]);
  assert.ok(GUSTA.length >= 4 && MEJORA.length >= 6, "both sides of a verdict are worth saying");
});

test("the block the tutor reads says both sides with their counts, inside its budget", () => {
  const dir = root();
  recordValoracion(dir, { ...bien, parte: "p1", motivos: ["ejemplo-claro", "demasiado-texto"] });
  recordValoracion(dir, { ...bien, parte: "p2", motivos: ["ejemplo-claro", "demasiado-texto"] });
  recordValoracion(dir, { ...bien, parte: "p3", motivos: ["ejemplo-claro"] });
  const block = gustosBlock(dir);
  assert.match(block, /Lo que le funcionó: El ejemplo fue claro \(3 partes\)\./);
  assert.match(block, /Lo que le resta: Demasiado texto \(2 partes\)\./);
  assert.ok(block.length <= 900, `the block is bounded, got ${block.length}`);
  assert.equal(withGustos("hola", dir), `hola\n\n${block}`);
});

test("nothing repeated means no block at all", () => {
  const dir = root();
  assert.equal(gustosBlock(dir), "");
  recordValoracion(dir, { ...bien, motivos: ["ejemplo-claro"] });
  assert.equal(gustosBlock(dir), "", "one mention is a day, not a preference");
  assert.equal(withGustos("hola", dir), "hola");
});

test("the learner never sees the block as their own words or as the answer", () => {
  const dir = root();
  recordValoracion(dir, { ...bien, parte: "p1", motivos: ["ejemplo-claro"] });
  recordValoracion(dir, { ...bien, parte: "p2", motivos: ["ejemplo-claro"] });
  const prompt = withGustos("Escribe la parte 3", dir);
  assert.match(prompt, /Lo que esta persona valora/);
  const limpio = stripGustos(prompt);
  assert.equal(limpio, "Escribe la parte 3");
  assert.equal(stripGustos("una respuesta normal"), "una respuesta normal");
});

test("a message that quotes the block's title is the learner's, and is not cut", () => {
  // The studio appends its block at the end of a prompt; a learner asking *about* that block types
  // the same title in the middle of a sentence. Stripping by marker alone ate their words (#413).
  const dicho = "Oye, ¿qué significa «[Lo que esta persona valora]» en lo que me mandas?";
  assert.equal(stripGustos(dicho), dicho);
  const prompt = `${dicho}\n\n[Lo que esta persona valora]\nLo que le funcionó: El ejemplo fue claro (2 partes). Repítelo.`;
  assert.equal(stripGustos(prompt), dicho, "the appended block still goes, and only it");
});
