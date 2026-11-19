// S6 (#376): the study section is a living page, not a template. These tests stub only
// the two inputs the UI consumes — api/espera and the studio's SSE stream — and read
// what the learner actually sees and can operate in a real browser.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
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

/** The studio owns one EventSource for the chat; a second one serves background tasks. */
function fakeEvents() {
  class FakeEventSource {
    constructor() {
      this.readyState = 1;
      this.listeners = {};
      (window.__fuentes ||= []).push(this);
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
    close() { this.readyState = 2; }
  }
  FakeEventSource.CONNECTING = 0;
  FakeEventSource.OPEN = 1;
  FakeEventSource.CLOSED = 2;
  window.EventSource = FakeEventSource;
  window.__emit = (type, data) => {
    for (const source of window.__fuentes || []) {
      for (const fn of source.listeners[type] || []) fn({ data: JSON.stringify(data) });
    }
  };
}

const THREE_PARTS = [
  { id: "p1", title: "Capas", slug: "Capas", subtema: "1.1" },
  { id: "p2", title: "TCP", slug: "TCP", subtema: "1.2.1" },
  { id: "p3", title: "Enrutamiento", slug: "Enrutamiento", subtema: "1.3" },
];

const mapa = {
  aprende: ["Explicar el encapsulamiento", "Distinguir capas y protocolos"],
  subtemas: ["1.1 Capas", "1.2 Direcciones"],
  dependeDe: [{ number: 1, title: "Capas", written: true }, { number: 2, title: "TCP", written: false }],
};

const antes = {
  tipo: "antes",
  items: [
    { id: "a1", enunciado: "¿Qué hace una capa?", opciones: { A: "Oculta los detalles de la inferior", B: "Cifra todo el tráfico", C: "No hace nada" }, origen: "diagnóstico" },
    { id: "a2", enunciado: "¿Qué va en cada capa?", opciones: { A: "Solo colores", B: "Un servicio y su interfaz", C: "Solo datos" }, origen: "glosario" },
  ],
};
const antesReveladas = {
  ...antes,
  items: antes.items.map((item, i) => ({ ...item, respuesta: i === 0 ? "A" : "B", explicacion: i === 0 ? "Cada capa esconde su funcionamiento." : "Cada capa ofrece un servicio." })),
};
const repaso = {
  tipo: "repaso",
  items: [
    { id: "r1", enunciado: "¿Qué capa recibe los datos?", opciones: { A: "La aplicación", B: "La capa de enlace", C: "Ninguna" }, respuesta: "B", explicacion: "La capa de enlace recibe el cuadro de la red.", origen: "mini-quiz p1" },
    { id: "r2", enunciado: "¿Qué define una interfaz?", opciones: { A: "Un servicio", B: "Un color", C: "Un archivo" }, respuesta: "A", explicacion: "La interfaz dice qué servicio ofrece la capa.", origen: "mini-quiz p2" },
  ],
};

function payload(overrides = {}) {
  return {
    part: { id: "p1", number: 1, title: "Capas" },
    mapa,
    preguntas: antes,
    glosario: { estado: "listo", terminos: [{ termino: "Capa", definicion: "Nivel con un servicio propio", ejemplo: "TCP sobre IP" }], preliminar: true },
    profesor: null,
    ...overrides,
  };
}

async function fixture(t, { parts = THREE_PARTS, writeLaterParts = true } = {}) {
  const { root, engine } = makeRoot({ parts, status: { status: "waiting", stage: "explanation" } });
  // Parts 2 and 3 are already written in the vault: earlier quizzes exist for review.
  if (writeLaterParts) {
    for (const [file, title] of [["Parte 2 - TCP.md", "TCP"], ["Parte 3 - Enrutamiento.md", "Enrutamiento"]]) {
      writeFileSync(join(root, "redes", "explicaciones", file), `# ${title}\n`);
    }
  }
  mkdirSync(join(root, "redes", "mini-quiz"), { recursive: true });
  for (const id of ["p1", "p2"]) writeFileSync(join(root, "redes", "mini-quiz", `${id}.json`), JSON.stringify({ questions: [] }));
  const studio = await startStudio({ root, enginePath: engine, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")] });
  open.push(studio);
  // The studio's service worker claims the page on install; a claimed page's fetches
  // are not routable from Playwright, so these tests keep it out of the way.
  const context = await (browser.chromium ?? browser.default).launch().then((b) => b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" }));
  const page = await context.newPage();
  t.after(() => context.browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));
  await page.addInitScript(fakeEvents);
  return { studio, page };
}

async function stubEspera(page, initial, revealed = initial) {
  const requests = [];
  await page.route(/\/api\/espera(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    requests.push({ part: url.searchParams.get("part"), revelar: url.searchParams.get("revelar") });
    const body = url.searchParams.get("revelar") === "1" ? revealed : initial;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return requests;
}

async function writeTurn(page, number, title, id) {
  await page.evaluate(({ number, title, id }) => {
    window.__emit("state", { busy: true, alive: true, tema: "redes" });
    window.__emit("user", { text: `Escribe la Parte ${number} «${title}» de Redes (carpeta redes)` });
    return id;
  }, { number, title, id });
}

const fase = (page, value, extra = {}) => page.evaluate((data) => window.__emit("fase", { type: "fase", topic: "redes", ...data }), { part: "p1", fase: value, t: 1000, ...extra });

test("Part 1 waiting section: map and ungraded questions, live phases, answers on lista", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await fixture(t);
  const requests = await stubEspera(page, payload(), payload({ preguntas: antesReveladas }));
  const reveal = page.waitForResponse((response) => response.url().includes("api/espera") && response.url().includes("revelar=1"));
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  await writeTurn(page, 1, "Capas", "p1");

  const section = page.locator(".espera");
  await section.getByRole("heading", { name: "Mientras se escribe la Parte 1" }).waitFor();
  const text = await section.innerText();
  assert.match(text, /Aprenderás/);
  assert.match(text, /Explicar el encapsulamiento/);
  assert.match(text, /Subtemas/);
  assert.match(text, /Necesitas antes/);
  assert.match(text, /TCP/);
  assert.match(text, /Antes de leer/i);
  assert.match(text, /¿Qué hace una capa\?/);
  assert.equal(await section.getByRole("heading", { name: "Repaso" }).count(), 0, "no review before earlier quizzes");
  assert.match(text, /Glosario/i);
  assert.match(text, /preliminar/i);
  assert.match(text, /Capa/);
  assert.equal(await section.locator(".espera-profesor").count(), 0, "reserved professor block stays hidden");
  assert.doesNotMatch(text, /Respuesta:/, "answers are withheld until the part is written");

  await section.getByRole("radio", { name: /Oculta los detalles/ }).check();
  assert.doesNotMatch(await section.innerText(), /Correcto|Incorrecto/, "nothing is graded before reading");

  await fase(page, "escribiendo");
  assert.match(await section.locator(".espera-progreso").innerText(), /Escribiendo/);
  await fase(page, "comprobando");
  await page.waitForFunction(() => document.querySelector(".espera-progreso")?.textContent.includes("Comprobando"));
  await fase(page, "corrigiendo", { hallazgos: 3 });
  await page.waitForFunction(() => document.querySelector(".espera-progreso")?.textContent.includes("3 hallazgos"));
  assert.match(await section.innerText(), /\d+:\d\d/, "elapsed time is visible");

  await fase(page, "lista");
  await reveal;
  const open = section.getByRole("button", { name: "Abrir la Parte 1" });
  await open.waitFor();
  await page.waitForFunction(() => document.querySelector(".espera")?.textContent.includes("Respuesta: A"));
  assert.match(await section.locator(".espera-progreso").innerText(), /Lista/);
  assert.ok(requests.some((r) => r.part === "p1" && r.revelar === null), "initial call has no revelar");
  assert.ok(requests.some((r) => r.part === "p1" && r.revelar === "1"), "answers are fetched with revelar=1");
  await open.click();
  assert.equal(new URL(page.url()).hash, "#/leer/redes/p1");
});

test("Part 3 review answers are graded at once and a generating glossary stays quiet", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await fixture(t);
  await stubEspera(page, payload({
    part: { id: "p3", number: 3, title: "Enrutamiento" },
    preguntas: repaso,
    glosario: { estado: "generando", terminos: [], preliminar: true },
  }));
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  await writeTurn(page, 3, "Enrutamiento", "p3");

  const section = page.locator(".espera");
  await section.getByRole("heading", { name: "Mientras se escribe la Parte 3" }).waitFor();
  assert.equal(await section.getByText("Antes de leer", { exact: true }).count(), 0);
  await section.getByRole("heading", { name: "Repaso" }).waitFor();
  assert.match(await section.innerText(), /preparando glosario…/);
  const first = section.locator(".espera-q").filter({ hasText: "¿Qué capa recibe los datos?" });
  await first.getByRole("radio", { name: /La aplicación/ }).check();
  await first.locator(".espera-feedback").filter({ hasText: /^Incorrecto/ }).waitFor();
  assert.match(await first.innerText(), /capa de enlace recibe el cuadro/);
  const second = section.locator(".espera-q").filter({ hasText: "¿Qué define una interfaz?" });
  await second.getByRole("radio", { name: /Un servicio/ }).check();
  await second.locator(".espera-feedback").filter({ hasText: /^Correcto/ }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await section.evaluate((el) => el.getBoundingClientRect().width <= innerWidth), "section fits a phone");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal scroll on a phone");
});

test("an unavailable glossary leaves no gap in the waiting section", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await fixture(t);
  await stubEspera(page, payload({ glosario: { estado: "no-disponible", terminos: [], preliminar: false } }));
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  await writeTurn(page, 1, "Capas", "p1");
  const section = page.locator(".espera");
  await section.getByRole("heading", { name: "Mientras se escribe la Parte 1" }).waitFor();
  assert.match(await section.innerText(), /Aprenderás/);
  assert.doesNotMatch(await section.innerText(), /glosario/i);
});

test("empty map sections are not shown where the plan has nothing", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await fixture(t);
  await stubEspera(page, payload({ mapa: { aprende: ["El objetivo"], subtemas: [], dependeDe: [] } }));
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  await writeTurn(page, 1, "Capas", "p1");
  const section = page.locator(".espera");
  await section.getByRole("heading", { name: "Mientras se escribe la Parte 1" }).waitFor();
  await section.getByText("El objetivo").waitFor();
  assert.equal(await section.getByRole("heading", { name: "Subtemas" }).count(), 0, "no empty subtemas block");
  assert.equal(await section.getByRole("heading", { name: "Necesitas antes" }).count(), 0, "Part 1 has no previous parts");
});

test("the waiting questions can be answered from the keyboard", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await fixture(t);
  await stubEspera(page, payload());
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  await writeTurn(page, 1, "Capas", "p1");
  const option = page.locator(".espera").getByRole("radio", { name: /Oculta los detalles/ });
  await option.waitFor();
  await option.focus();
  await page.keyboard.press("Space");
  assert.equal(await option.isChecked(), true);
  assert.match(await page.locator(".espera").innerText(), /Anotado\. Podrás comparar cuando la parte esté lista\./);
});

test("clicking «Escribir esta parte» starts the section for that part", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await fixture(t, { writeLaterParts: false });
  const requests = await stubEspera(page, payload({ part: { id: "p2", number: 2, title: "TCP" }, preguntas: null }));
  // The turn itself is not under test here: accept it without starting the tutor.
  await page.route(/\/prompt(?:\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${studio.url}#/panorama/redes`, { waitUntil: "networkidle" });
  const row = page.locator(".pano-block .part-row").filter({ hasText: "TCP" });
  await row.getByRole("button", { name: "Escribir esta parte" }).click();
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  const section = page.locator(".espera");
  await section.getByRole("heading", { name: "Mientras se escribe la Parte 2" }).waitFor();
  await page.waitForFunction(() => Boolean(document.querySelector(".espera")));
  assert.ok(requests.some((r) => r.part === "p2"), "the request names the part the learner chose");
  assert.match(await section.innerText(), /Escribiendo/);
});
