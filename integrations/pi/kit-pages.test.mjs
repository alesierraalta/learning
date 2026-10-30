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
  await page.route('http://localhost:45678/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/audio') {
      bodies.push(route.request().postDataBuffer());
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
  return { page, mic, bodies };
}

test('a dictation sent to an expired page says to reload instead of «not found»', { skip: !playwright && 'playwright not installed' }, async t => {
  const { page, mic } = await dictateAgainst(t, [[404, { error: 'not found' }]]);
  const note = await page.locator('.lk-mic-note').textContent();
  assert.match(note, /recárgala/);
  assert.doesNotMatch(note, /not found/);
  assert.equal(await mic.textContent(), 'Dictar', 'resending to an expired page cannot work');
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
