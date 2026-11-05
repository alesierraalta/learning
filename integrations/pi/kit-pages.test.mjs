// The example pages are the template the tutor copies: a broken walkthrough block or a missing
// scene.js would ship silently, because the page still renders everything else.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const KIT = join(import.meta.dirname, "kit");

let playwright;
for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/home/alesierraalta/.npm-global/lib/node_modules/playwright/index.mjs'].filter(Boolean)) {
  try { playwright = await import(id); break; } catch {}
}
test('recorded dictation uploads audio and appends the transcript', { skip: !playwright && 'playwright not installed' }, async t => {
  const browser = await playwright.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let uploaded;
  await page.route('http://localhost:45678/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/audio') {
      uploaded = route.request();
      return route.fulfill({ json: { text: 'hola mundo' } });
    }
    if (path === '/quiz') return route.fulfill({ json: { questions: [{ id: 'q1', stem: 'Pregunta', options: { a: 'A' } }] } });
    if (path === '/dictate.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: readFileSync(join(KIT, 'dictate.js'), 'utf8') });
    if (path === '/kit.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(KIT, 'kit.js'), 'utf8') });
    return route.fulfill({ contentType: 'text/html', body: '<script>window.LEARNING_BRIDGE={quizUrl:"/quiz",transcribeUrl:"/audio"}</script><script src="/dictate.js"></script><script src="/kit.js"></script><lk-quiz></lk-quiz>' });
  });
  await page.goto('http://localhost:45678/');
  const mic = page.getByRole('button', { name: 'Dictar el razonamiento' });
  await mic.click();
  await page.waitForFunction(() => document.querySelector('.lk-mic')?.textContent === 'Detener');
  await page.waitForTimeout(400);
  await mic.click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value.endsWith('hola mundo'));
  assert.equal(await mic.textContent(), 'Dictar');
  assert.match(uploaded.headers()['content-type'], /^audio\//);
  assert.ok(uploaded.postDataBuffer().length > 0);
});

// The transcriber answers each upload in turn; returns the page and every body it received.
async function dictateAgainst(t, answers) {
  const browser = await playwright.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const bodies = [];
  const types = [];
  await page.route('http://localhost:45678/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/audio') {
      bodies.push(route.request().postDataBuffer());
      types.push(route.request().headers()['content-type']);
      const [status, json] = answers[bodies.length - 1];
      return route.fulfill({ status, json });
    }
    if (path === '/quiz') return route.fulfill({ json: { questions: [{ id: 'q1', stem: 'Pregunta', options: { a: 'A' } }] } });
    if (path === '/dictate.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: readFileSync(join(KIT, 'dictate.js'), 'utf8') });
    if (path === '/kit.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(KIT, 'kit.js'), 'utf8') });
    return route.fulfill({ contentType: 'text/html', body: '<script>window.LEARNING_BRIDGE={quizUrl:"/quiz",transcribeUrl:"/audio"}</script><script src="/dictate.js"></script><script src="/kit.js"></script><lk-quiz></lk-quiz>' });
  });
  await page.goto('http://localhost:45678/');
  const mic = page.locator('.lk-mic');
  await mic.click();
  await page.waitForFunction(() => document.querySelector('.lk-mic')?.textContent === 'Detener');
  await page.waitForTimeout(400);
  await mic.click();
  await page.waitForFunction(() => ['Dictar', 'Reenviar audio'].includes(document.querySelector('.lk-mic')?.textContent) && !document.querySelector('.lk-mic').disabled);
  return { page, mic, bodies, types };
}

test('a dictation sent to an expired page says to reload and keeps the recording for the reloaded page', { skip: !playwright && 'playwright not installed' }, async t => {
  const { page, bodies, types } = await dictateAgainst(t, [[404, { error: 'not found' }], [200, { text: 'tras recargar' }]]);
  const note = await page.locator('.lk-mic-note').textContent();
  assert.match(note, /recárgala/);
  assert.doesNotMatch(note, /not found/);

  await page.reload();
  const mic = page.locator('.lk-mic');
  await page.waitForFunction(() => document.querySelector('.lk-mic')?.textContent === 'Reenviar audio');
  assert.match(await page.locator('.lk-mic-note').textContent(), /grabación sin transcribir/);
  await mic.click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value.endsWith('tras recargar'));
  assert.equal(bodies.length, 2);
  assert.ok(bodies[1].equals(bodies[0]), 'the reloaded page sent the same recording');
  assert.equal(types[1], types[0], 'with the same audio type, codecs included');
  assert.equal(await mic.textContent(), 'Dictar');

  await page.reload();
  await page.waitForFunction(() => document.querySelector('.lk-mic')?.textContent === 'Dictar');
  assert.equal(await page.locator('.lk-mic-note').textContent(), '', 'a sent recording is not offered again');
});

test('a dictation that failed can be sent again without recording it again', { skip: !playwright && 'playwright not installed' }, async t => {
  const { page, mic, bodies } = await dictateAgainst(t, [[502, { error: 'No se pudo transcribir el audio.' }], [200, { text: 'segunda vez' }]]);
  assert.equal(await mic.textContent(), 'Reenviar audio');
  assert.match(await page.locator('.lk-mic-note').textContent(), /No se pudo transcribir/);
  await mic.click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value.endsWith('segunda vez'));
  assert.equal(bodies.length, 2);
  assert.ok(bodies[1].equals(bodies[0]), 'the same recording was sent again');
  assert.equal(await mic.textContent(), 'Dictar');
});
const pages = ["sql-parte-1.html", "sql-parte-2.html", "sql-parte-3.html"];

const read = (name) => readFileSync(join(KIT, "examples", name), "utf8");

const walkthroughs = (html) => [...html.matchAll(/<lk-walkthrough>\s*<script type="application\/json">([\s\S]*?)<\/script>/g)];

test("every page ships at least one walkthrough", () => {
  for (const name of pages) {
    assert.ok(walkthroughs(read(name)).length > 0, `${name} has no lk-walkthrough block`);
  }
});

test("every walkthrough is a well-formed list of one-scene steps", () => {
  for (const name of pages) {
    const blocks = walkthroughs(read(name));
    assert.ok(blocks.length > 0, `${name} has no lk-walkthrough block`);
    for (const [n, block] of blocks.entries()) {
      const spec = JSON.parse(block[1]);
      const where = `${name} figura ${n + 1}`;
      assert.ok(Array.isArray(spec.steps) && spec.steps.length > 0, `${where}: empty walkthrough`);
      const viewBox = (spec.viewBox ?? "").trim().split(/\s+/).map(Number);
      assert.equal(viewBox.length, 4, `${where}: viewBox needs four numbers`);
      assert.ok(viewBox.every(Number.isFinite), `${where}: viewBox is not numeric`);
      assert.ok(viewBox[2] > 0 && viewBox[3] > 0, `${where}: empty viewBox`);
      for (const [i, step] of spec.steps.entries()) {
        assert.ok(step.title && step.text, `${where}: step ${i + 1} needs a title and a text`);
        assert.ok(step.scene && typeof step.scene === "object", `${where}: step ${i + 1} needs a scene`);
        assert.ok(Object.keys(step.scene).length > 0, `${where}: step ${i + 1} draws nothing`);
      }
    }
  }
});

// The user's rule: the reading is visual section by section, so a section without a figure is a
// gap, not a style choice. The validation quiz is the only section allowed to have none.
test("every reading section has its own figure", () => {
  for (const name of pages) {
    const html = read(name);
    const sections = [...html.matchAll(/<section>([\s\S]*?)<\/section>/g)].map((m) => m[1]);
    for (const body of sections) {
      const heading = body.match(/<h2>(.*?)<\/h2>/);
      if (!heading) continue;
      const title = heading[1].replace(/<[^>]+>/g, "").trim();
      if (/^(?:\d+\.\s*)?cuestionario/i.test(title)) continue;
      // Sections 8 and 9 of part 1 can share one section block; both headings still count.
      for (const each of body.split(/<h2>/).slice(1)) {
        const name2 = each.replace(/<[^>]+>/g, "").trim().split("\n")[0];
        if (/^(?:\d+\.\s*)?cuestionario/i.test(name2)) continue;
        const own = "<h2>" + each;
        assert.ok(own.includes("<lk-walkthrough>"), `${name}: la sección «${name2.slice(0, 60)}» no tiene figura`);
      }
    }
  }
});

test("figure text stays inside the canvas and never runs off a sheet", () => {
  for (const name of pages) {
    for (const block of walkthroughs(read(name))) {
      const spec = JSON.parse(block[1]);
      const [vx, vy, vw, vh] = spec.viewBox.trim().split(/\s+/).map(Number);
      for (const [i, step] of spec.steps.entries()) {
        const scene = step.scene;
        for (const label of scene.labels ?? []) {
          const half = label.text.length * (label.size ?? 26) * 0.40;
          assert.ok(label.x - half >= vx - 2 && label.x + half <= vx + vw + 2,
            `${name} figura «${spec.title}» paso ${i + 1}: la etiqueta «${label.text}» se sale del lienzo`);
        }
        for (const box of [...(scene.boxes ?? []), ...(scene.sheets ?? [])]) {
          const w = box.w, h = box.h;
          assert.ok(box.x >= vx - 2 && box.x + w <= vx + vw + 2, `${name} figura «${spec.title}» paso ${i + 1}: una caja se sale a lo ancho`);
          assert.ok(box.y >= vy - 2 && box.y + h <= vy + vh + 2, `${name} figura «${spec.title}» paso ${i + 1}: una caja se sale a lo alto`);
        }
      }
    }
  }
});

test("scene.js loads before kit.js", () => {
  for (const name of pages) {
    const html = read(name);
    if (!html.includes("<lk-walkthrough>")) continue;
    const scene = html.indexOf('<script src="../kit/scene.js" defer></script>');
    const kit = html.indexOf('<script src="../kit/kit.js" defer></script>');
    assert.ok(scene > -1, `${name} never loads scene.js`);
    assert.ok(scene < kit, `${name} loads scene.js after kit.js`);
  }
});

// A note figure is the visual engine's scene: the note names meaning, the reader
// draws it, and the paper decides the colours. These two tests pin the reader
// contract: the component draws, and it follows light and dark.
const VISUALS = join(import.meta.dirname, "../../tools/visuals");

async function figurePage(t, html, port) {
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route(`http://localhost:${port}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/draw.js") return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(VISUALS, "draw.js"), "utf8") });
    if (path === "/kit.js") return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(KIT, "kit.js"), "utf8") });
    if (path === "/dictate.js") return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(KIT, "dictate.js"), "utf8") });
    return route.fulfill({ contentType: "text/html", body: html });
  });
  await page.goto(`http://localhost:${port}/`);
  return page;
}

const SCENE = JSON.stringify({
  title: "El almacén",
  aria: "Una rejilla con el robot en la esquina y la salida al otro lado",
  viewBox: "0 0 360 290",
  grids: [{ x: 16, y: 40, cols: 4, rows: 3, w: 82, h: 82, cells: [{ c: 0, r: 0, kind: "robot" }, { c: 3, r: 0, kind: "exit", label: "+1" }] }],
  arrows: [{ x1: 20, y1: 260, x2: 320, y2: 260, tone: "blue", label: "el robot sigue su política" }],
});

test("lk-figure draws a scene and its tones follow the reader's paper", { skip: !playwright && 'playwright not installed' }, async t => {
  const figure = `<lk-figure>\n<script type="application/json">${SCENE}</script>\n</lk-figure>`;
  const page = await figurePage(t, `<script src="/draw.js"></script><script src="/kit.js"></script>${figure}${figure}`, 45680);
  await page.locator("lk-figure svg").first().waitFor();
  // One token block serves every figure on the page, instead of one style per drawing.
  assert.equal(await page.locator("head style#lk-visuals-theme").count(), 1);
  const tokens = (theme) => page.evaluate(async theme => {
    document.documentElement.dataset.theme = theme;
    const svg = document.querySelector("lk-figure svg");
    const style = getComputedStyle(svg);
    return { ink: style.getPropertyValue("--v-ink").trim(), blue: style.getPropertyValue("--v-blue").trim(), fill: svg.querySelector("rect").getAttribute("fill") };
  }, theme);
  const light = await tokens("light");
  const dark = await tokens("dark");
  assert.equal(light.ink, "#0F2E3D");
  assert.equal(dark.ink, "#F1EFE8", "the same figure on the black paper uses light ink");
  assert.notEqual(light.blue, dark.blue);
  assert.match(light.fill, /^color-mix\(in srgb, var\(--v-[a-z]+\)/);
  assert.equal(await page.locator('lk-figure svg [fill*="rgba("], lk-figure svg [stroke*="rgba("]').count(), 0, "nothing is layered with alpha");
  // A page that carries no choice follows the system, through the token media query.
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.emulateMedia({ colorScheme: "dark" });
  const system = await page.evaluate(() => getComputedStyle(document.querySelector("lk-figure svg")).getPropertyValue("--v-ink").trim());
  assert.equal(system, "#F1EFE8", "prefers-color-scheme alone selects the dark paper");
});

test("an lk-figure that draws nothing says so instead of showing a blank box", { skip: !playwright && 'playwright not installed' }, async t => {
  const scenes = [
    { title: "Solo un título" },
    { grids: [{ cols: 2, rows: 1, w: 40, h: 40, cells: [] }] },
    { bars: {} },
    { arrows: [{}] },
    { labels: [{ x: 1, y: 1, text: "a", tone: "purple" }] },
    { labels: [{ x: 1, y: 1, text: "a", anchor: "middle-ish" }] },
    { arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1, width: "wide" }] },
    { viewBox: "0 0 360", arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1 }] },
  ];
  const html = scenes.map((scene) => `<lk-figure>\n<script type="application/json">${JSON.stringify(scene)}</script>\n</lk-figure>`).join("");
  const page = await figurePage(t, `<script src="/draw.js"></script><script src="/kit.js"></script>${html}`, 45681);
  await page.waitForFunction((count) => document.querySelectorAll("lk-figure [role=alert]").length === count, scenes.length);
  assert.equal(await page.locator("lk-figure svg").count(), 0, "a blank scene never becomes an empty drawing");
  const alerts = await page.locator("lk-figure [role=alert]").allTextContents();
  assert.ok(alerts.some((text) => /no dibuja nada/.test(text)), "a grid without cells says the scene draws nothing");
  assert.ok(alerts.some((text) => /tone/.test(text)), "an unknown tone is named");
  assert.ok(alerts.some((text) => /anchor/.test(text)), "an unknown anchor is named");
  assert.ok(alerts.some((text) => /width/.test(text)), "a non-numeric width is named");
  assert.ok(alerts.some((text) => /viewBox/.test(text)), "a viewBox without four numbers is named");
  assert.ok(alerts.some((text) => /no se pudo dibujar/.test(text)), "an entry the engine refuses says why");
});

// A scene is note data, not code. A quote inside it must never close an
// attribute: the component refuses the fields it cannot read, and free-form
// path data keeps its quote as an entity.
test("a scene string can never become an attribute or an event handler", { skip: !playwright && 'playwright not installed' }, async t => {
  const figure = (scene) => `<lk-figure>\n<script type="application/json">${JSON.stringify(scene)}</script>\n</lk-figure>`;
  const cards = [
    { viewBox: '0 0 360 290" onload="window.__pwned=1', labels: [{ x: 1, y: 1, text: "a" }] },
    { labels: [{ x: 10, y: 10, text: "hola", anchor: 'middle" onmouseover="window.__pwned=2' }] },
    { arrows: [{ x1: 1, y1: 1, x2: 9, y2: 9, width: '2" onload="window.__pwned=3' }] },
    { paths: [{ d: 'M0 0 L9 9" onload="window.__pwned=4' }] },
  ];
  const page = await figurePage(t, `<script src="/draw.js"></script><script src="/kit.js"></script>${cards.map(figure).join("")}`, 45682);
  await page.waitForFunction(() => document.querySelectorAll("lk-figure [role=alert]").length === 3);
  assert.equal(await page.evaluate(() => window.__pwned), undefined, "no scene ran as code");
  assert.equal(await page.locator("[onload], [onmouseover]").count(), 0, "no attribute became an event handler");
  // The path is data the engine can draw: the quote stays inside the attribute.
  const path = page.locator("lk-figure svg > path").first();
  await path.waitFor();
  assert.equal(await path.getAttribute("onload"), null);
  assert.equal(await path.getAttribute("d"), 'M0 0 L9 9" onload="window.__pwned=4');
});

// A deck can promise a policy field in words ("la fila de arriba apunta a la
// derecha"). Without this the note drew nothing where the video drew nine arrows,
// and the reader had to take the sentence on faith.
test('a walkthrough deck draws one arrow per policy cell', { skip: !playwright && 'playwright not installed' }, async t => {
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const cells = [[20, 20], [120, 20], [20, 120], [120, 120]];
  const spec = {
    title: 'Campo de política',
    viewBox: '0 0 320 200',
    steps: [{
      title: 'La política completa',
      text: 'Cada casilla tiene su flecha fija.',
      scene: {
        boxes: cells.map(([x, y]) => ({ x, y, w: 80, h: 60, label: '', tone: 'slate' })),
        policy: cells.map(([x, y], i) => ({ x, y, w: 80, h: 60, dir: i < 2 ? 'right' : 'up' })),
      },
    }],
  };
  await page.route('http://localhost:45679/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/kit.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(KIT, 'kit.js'), 'utf8') });
    if (path === '/scene.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(KIT, 'scene.js'), 'utf8') });
    return route.fulfill({ contentType: 'text/html', body: `<script src="/scene.js"></script><script src="/kit.js"></script><lk-walkthrough><script type="application/json">${JSON.stringify(spec)}</script></lk-walkthrough>` });
  });
  await page.goto('http://localhost:45679/');
  const heads = await page.locator('svg path[marker-end]').count();
  assert.equal(heads, 4, 'one arrow per cell, no more');
});
