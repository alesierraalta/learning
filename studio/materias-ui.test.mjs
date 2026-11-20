// T3 / S3 (#371): the Materias area in a real browser, against stubbed routes.
// The server writer owns the real endpoints; what is pinned here is what the
// learner can see and do: create, group uploads by type, read errors, remove
// with a confirmation, link topics and keep one materia per topic.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { startStudio as startStudioChecked } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

const startStudio = (options) => startStudioChecked({ skipContextCheck: true, ...options });
const CANDIDATES = [process.env.PLAYWRIGHT_MODULE, "playwright"].filter(Boolean);
async function playwright() {
  for (const id of CANDIDATES) {
    try { return await import(id.startsWith("/") ? pathToFileURL(id).href : id); } catch { /* another candidate */ }
  }
  return null;
}
const browser = await playwright();
const open = [];
afterEach(async () => {
  for (const studio of open.splice(0)) await studio.close();
});

function fakeEvents() {
  class FakeEventSource {
    constructor() { this.readyState = 1; window.__fuentes ||= []; window.__fuentes.push(this); }
    addEventListener() {}
    removeEventListener() {}
    close() { this.readyState = 2; }
  }
  FakeEventSource.CONNECTING = 0;
  FakeEventSource.OPEN = 1;
  FakeEventSource.CLOSED = 2;
  window.EventSource = FakeEventSource;
}

function state({ courses, topics }) {
  return {
    courses: courses ?? [
      {
        id: "m1",
        nombre: "Teoría de la computación",
        creada: "2026-11-20T10:00:00.000Z",
        temas: [],
        fuentes: [{ id: "f1", tipo: "documento", nombre: "apunte.pdf", archivo: "fuentes/f1/apunte.pdf", bytes: 2048, subida: "2026-11-20T10:05:00.000Z", texto: "fuentes/f1/apunte.txt" }],
      },
      { id: "m2", nombre: "Historia del arte", creada: "2026-11-21T10:00:00.000Z", temas: [], fuentes: [] },
    ],
    topics: topics ?? [{ id: "redes", title: "Redes", materia: null }],
    uploads: [],
    deletes: [],
    topicLinks: [],
    uploadStatus: null,
    uploadError: "",
  };
}

const listOf = (data) => data.courses.map((course) => {
  const porTipo = { examen: 0, documento: 0, transcripcion: 0 };
  for (const fuente of course.fuentes) porTipo[fuente.tipo] = (porTipo[fuente.tipo] || 0) + 1;
  return { id: course.id, nombre: course.nombre, temas: course.temas.length, fuentes: course.fuentes.length, porTipo };
});

async function stubMaterias(page, data) {
  await page.route(/\/api\/materias(?:\/|$)/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split("/api/materias")[1] || "/";
    const parts = path.split("/").filter(Boolean);
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (parts.length === 0 && request.method() === "GET") {
      // The topic card re-renders after a link changes; a slow course list must
      // not leave it showing a course whose selector is still empty.
      if (data.materiasDelay) await new Promise((resolve) => setTimeout(resolve, data.materiasDelay));
      return json(200, listOf(data));
    }
    if (parts.length === 0 && request.method() === "POST") {
      const { nombre } = JSON.parse(request.postData() || "{}");
      const course = { id: `m${data.courses.length + 1}`, nombre: String(nombre ?? ""), creada: new Date().toISOString(), temas: [], fuentes: [] };
      data.courses.push(course);
      return json(201, course);
    }
    const course = data.courses.find((c) => c.id === parts[0]);
    if (!course) return json(404, { error: "No encontré esa materia." });
    if (parts.length === 1 && request.method() === "GET") return json(200, course);
    if (parts[1] === "fuentes" && parts.length === 2 && request.method() === "POST") {
      const headers = Object.fromEntries(Object.entries(request.headers()).map(([key, value]) => [key.toLowerCase(), value]));
      let nombre = headers["x-file-name"] || "archivo.txt";
      try { nombre = decodeURIComponent(nombre); } catch { /* the name is used as sent */ }
      data.uploads.push({ id: course.id, nombre, tipo: headers["x-tipo"], mime: headers["content-type"], origin: headers.origin, bytes: request.postDataBuffer()?.byteLength ?? 0 });
      if (data.uploadStatus) return json(data.uploadStatus, { error: data.uploadError });
      const id = `f${course.fuentes.length + 1}`;
      const fuente = { id, tipo: headers["x-tipo"] || "documento", nombre, archivo: `fuentes/${id}/${nombre}`, bytes: data.uploads.at(-1).bytes, subida: new Date().toISOString(), texto: `fuentes/${id}/texto.txt` };
      course.fuentes.push(fuente);
      return json(201, fuente);
    }
    if (parts[1] === "fuentes" && parts.length === 3 && request.method() === "DELETE") {
      const at = course.fuentes.findIndex((f) => f.id === parts[2]);
      if (at < 0) return json(404, { error: "No encontré ese archivo." });
      data.deletes.push({ id: course.id, fuente: parts[2] });
      course.fuentes.splice(at, 1);
      return route.fulfill({ status: 204, body: "" });
    }
    if (parts[1] === "temas" && parts.length === 2 && request.method() === "POST") {
      const { tema } = JSON.parse(request.postData() || "{}");
      data.topicLinks.push({ action: "link", id: course.id, tema });
      if (!course.temas.includes(tema)) course.temas.push(tema);
      const topic = data.topics.find((t) => t.id === tema);
      if (topic) topic.materia = { id: course.id, nombre: course.nombre };
      return json(201, { ok: true });
    }
    if (parts[1] === "temas" && parts.length === 3 && request.method() === "DELETE") {
      data.topicLinks.push({ action: "unlink", id: course.id, tema: parts[2] });
      course.temas = course.temas.filter((id) => id !== parts[2]);
      const topic = data.topics.find((t) => t.id === parts[2]);
      if (topic) topic.materia = null;
      return route.fulfill({ status: 204, body: "" });
    }
    return json(405, { error: "Ruta no prevista en esta prueba." });
  });
  await page.route(/\/api\/library(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      topics: data.topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        parts: [{ id: "p1", title: "Capas", written: false }],
        status: "sin inscribir",
        stage: "",
        gaps: { missing: [], noVisuals: [], noQuiz: [] },
        materia: topic.materia ?? null,
      })),
      quick: [],
    }),
  }));
  await page.route(/\/api\/runners(?:\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

async function fixture(t, options = {}, viewport = { width: 1280, height: 900 }) {
  const { root, engine } = makeRoot();
  const studio = await startStudio({
    root,
    enginePath: engine,
    piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")],
  });
  open.push(studio);
  const context = await (browser.chromium ?? browser.default).launch().then((b) => b.newContext({ viewport, serviceWorkers: "block" }));
  const page = await context.newPage();
  t.after(() => context.browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));
  await page.addInitScript(fakeEvents);
  const data = state(options);
  await stubMaterias(page, data);
  return { studio, page, data };
}

test("the learner creates a materia and opens it", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page, data } = await fixture(t, { courses: [] });
  await page.goto(`${studio.url}#/materias`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Materias", level: 1 }).waitFor();
  await page.getByLabel("Nombre de la materia").fill("Teoría de la computación");
  await page.getByRole("button", { name: "Crear materia" }).click();
  const link = page.getByRole("link", { name: /Teoría de la computación/ });
  await link.waitFor();
  assert.equal(data.courses.length, 1);
  await link.click();
  await page.getByRole("heading", { name: "Teoría de la computación", level: 1 }).waitFor();
  assert.match(page.url(), /#\/materias\/m1$/);
});

test("a TXT uploads as a transcript, a 415 is readable, and a source is removed after confirmation", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page, data } = await fixture(t);
  await page.goto(`${studio.url}#/materias/m1`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Teoría de la computación", level: 1 }).waitFor();
  const upload = page.locator(".materia-upload");
  await upload.getByLabel("Tipo de archivo").selectOption("transcripcion");
  await upload.getByLabel("Archivos de la materia").setInputFiles({
    name: "clase-1.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("El profesor dice que la pila crece hacia abajo."),
  });
  const transcript = page.locator(".source-group").filter({ has: page.getByRole("heading", { name: "Transcripciones de clase" }) });
  await transcript.getByText("clase-1.txt").waitFor();
  assert.deepEqual(data.uploads.map((u) => [u.nombre, u.tipo, u.mime]), [["clase-1.txt", "transcripcion", "text/plain"]]);
  assert.equal(data.uploads[0].origin, new URL(studio.url).origin, "POSTs keep the studio's origin");
  assert.equal(await upload.locator(".upload-status").getAttribute("aria-live"), "polite");

  data.uploadStatus = 415;
  data.uploadError = "Formato no admitido: usa PDF, imagen, DOCX, TXT o MD.";
  await upload.getByLabel("Archivos de la materia").setInputFiles({ name: "otra.txt", mimeType: "text/plain", buffer: Buffer.from("otra clase") });
  await upload.locator(".upload-status").getByText(data.uploadError).waitFor();

  const remove = page.getByRole("button", { name: "Quitar apunte.pdf" });
  await remove.click();
  await page.getByRole("dialog").getByText("¿Quitar «apunte.pdf» de la materia?").waitFor();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByText("apunte.pdf").first().waitFor();
  assert.equal(data.deletes.length, 0, "cancelling deletes nothing");
  await remove.click();
  await page.getByRole("dialog").getByRole("button", { name: "Mover a la papelera" }).click();
  await page.waitForFunction(() => !document.querySelector(".materia-page")?.textContent.includes("apunte.pdf"));
  assert.deepEqual(data.deletes, [{ id: "m1", fuente: "f1" }]);
});

test("several files upload at once with the chosen type, including DOCX and MD", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page, data } = await fixture(t);
  await page.goto(`${studio.url}#/materias/m1`, { waitUntil: "networkidle" });
  const upload = page.locator(".materia-upload");
  await upload.getByLabel("Tipo de archivo").selectOption("documento");
  await upload.getByLabel("Archivos de la materia").setInputFiles([
    { name: "guia.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("docx") },
    { name: "temario.md", mimeType: "text/markdown", buffer: Buffer.from("# Temario") },
  ]);
  const documents = page.locator(".source-group").filter({ has: page.getByRole("heading", { name: "Documentos" }) });
  await documents.getByText("guia.docx").waitFor();
  await documents.getByText("temario.md").waitFor();
  assert.deepEqual(data.uploads.map((u) => [u.nombre, u.tipo]), [["guia.docx", "documento"], ["temario.md", "documento"]]);
  assert.match(await upload.locator(".upload-status").innerText(), /2 archivos subidos/);
});

test("linking a topic from a materia shows its course on the topic page, where it can be changed", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page, data } = await fixture(t);
  data.materiasDelay = 1000;
  await page.goto(`${studio.url}#/materias/m1`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Vincular Redes" }).click();
  await page.waitForFunction(() => document.querySelector(".materia-topics")?.textContent.includes("Redes"));
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  const card = page.locator(".topic-materia");
  await card.locator(".topic-materia-current").getByText("Teoría de la computación").waitFor();
  assert.equal(data.topics[0].materia.id, "m1");
  await card.getByLabel("Materia del tema").selectOption("m2");
  await card.getByRole("button", { name: "Guardar materia" }).click();
  await page.waitForFunction(() => document.querySelector(".topic-materia-current")?.textContent.includes("Historia del arte"));
  assert.equal(await card.getByLabel("Materia del tema").inputValue(), "m2");
  assert.deepEqual(data.topicLinks.map((l) => l.action).sort(), ["link", "link", "unlink"]);
});

test("the native file input stays behind the custom picker but still accepts files", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await fixture(t);
  await page.goto(`${studio.url}#/materias/m1`, { waitUntil: "networkidle" });
  const input = page.locator(".materia-file-input");
  const nativeControl = await input.boundingBox();
  assert.ok(nativeControl && nativeControl.width <= 2 && nativeControl.height <= 2, `only the custom Elegir archivos control should be painted; native picker was ${JSON.stringify(nativeControl)}`);
  assert.equal(await page.getByText("Elegir archivos").isVisible(), true);
  await input.setInputFiles({ name: "clase.txt", mimeType: "text/plain", buffer: Buffer.from("texto de clase") });
  await page.locator(".source-row", { hasText: "clase.txt" }).waitFor();
});

test("the materias pages fit a 390 px phone", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page, data } = await fixture(t, {
    courses: [{
      id: "m1",
      nombre: "Teoría de la computación y de los lenguajes formales",
      creada: "2026-11-20T10:00:00.000Z",
      temas: ["redes"],
      fuentes: [{
        id: "f1",
        tipo: "transcripcion",
        nombre: "transcripcion-muy-larga-de-la-clase-de-teoria-de-la-computacion.txt",
        archivo: "fuentes/f1/texto.txt",
        bytes: 12_345_678,
        subida: "2026-11-20T10:05:00.000Z",
        texto: "fuentes/f1/texto-extraido.txt",
      }],
    }],
  }, { width: 390, height: 844 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.goto(`${studio.url}#/materias`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Materias", level: 1 }).waitFor();
  assert.ok(await overflow() <= 1, `list overflows by ${await overflow()}px`);
  await page.goto(`${studio.url}#/materias/m1`, { waitUntil: "networkidle" });
  await page.getByText("transcripcion-muy-larga-de-la-clase-de-teoria-de-la-computacion.txt").waitFor();
  assert.ok(await overflow() <= 1, `detail overflows by ${await overflow()}px`);
  assert.equal(data.courses.length, 1);
});
