// The mini-quiz writes code answers as code (#334): a code exercise's answer box and the reasoning of a question whose
// piece is code are code fields; every other answer stays a plain box. The answer reaches the tutor as it was written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import('playwright'));
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    attempts.push(async () => createRequire(`${root}/`)('playwright'));
  } catch {}
  for (const attempt of attempts) {
    try {
      const mod = await attempt();
      if (mod?.chromium || mod?.default?.chromium) return mod.chromium ? mod : mod.default;
    } catch {}
  }
  return null;
}

const PLAYWRIGHT = await loadPlaywright();
const SKIP = PLAYWRIGHT ? false : 'playwright not installed: the mini-quiz cannot be driven';

const ORIGIN = 'http://code-answers.test/';

// A kit file that does not exist yet is a 404: the test then fails on what it asserts, not inside the harness.
const asset = (name, contentType) => (existsSync(join(KIT, name))
  ? { status: 200, contentType, body: readFileSync(join(KIT, name), 'utf8') }
  : { status: 404, contentType: 'text/plain', body: 'missing' });
const OPTIONS = { A: 'a', B: 'b', C: 'c', D: 'd', E: 'No sé' };
const PLSQL = 'SELECT nombre\nFROM clientes;';
const QUESTIONS = [
  { id: 'q1', enunciado: 'Pregunta uno', options: OPTIONS, pieza: { tipo: 'codigo', lenguaje: 'plsql', contenido: PLSQL } },
  { id: 'q2', enunciado: 'Pregunta dos', options: OPTIONS },
];
const ECO = { id: 'eco', enunciado: 'Repite la entrada', lenguaje: 'python' };
const MODELO = { id: 'modelo', enunciado: 'Diseña un modelo', entregable: 'Un diagrama con sus claves' };
const GRADED = {
  results: [{ id: 'q1', chosen: 'B', correct: 'B', ok: true }, { id: 'q2', chosen: 'B', correct: 'B', ok: true }],
  score: '2/2',
  saved: 'mini-quiz/p1.answers.json',
};

// The page a note embeds: kit.js reads the bridge's config, fetches the quiz and posts the answers to the bridge.
async function open(t, quiz) {
  const browser = await PLAYWRIGHT.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const submitted = [];
  await page.route(`${ORIGIN}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/quiz') return route.fulfill({ json: quiz });
    if (path === '/submit') {
      submitted.push(route.request().postDataJSON());
      return route.fulfill({ json: GRADED });
    }
    if (path === '/kit.js') return route.fulfill(asset('kit.js', 'text/javascript; charset=utf-8'));
    if (path === '/dictate.js') return route.fulfill(asset('dictate.js', 'text/javascript; charset=utf-8'));
    if (path === '/question.js') return route.fulfill(asset('question.js', 'text/javascript; charset=utf-8'));
    if (path === '/code-field.js') return route.fulfill(asset('code-field.js', 'text/javascript; charset=utf-8'));
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body><main><lk-quiz></lk-quiz></main>'
        + '<script>window.LEARNING_BRIDGE={quizUrl:"/quiz",submitUrl:"/submit",topic:"sql-demo",part:"p1"}</script>'
        + '<script src="/question.js"></script><script src="/code-field.js"></script><script src="/dictate.js"></script><script src="/kit.js"></script></body></html>',
    });
  });
  await page.goto(ORIGIN);
  await page.waitForSelector('lk-quiz form');
  return { page, submitted };
}

async function answerAll(page) {
  await page.locator('input[name="q1"][value="B"]').check();
  await page.locator('input[name="q2"][value="B"]').check();
  await page.locator('input[name="q1-confianza"][value="seguro"]').check();
  await page.locator('input[name="q2-confianza"][value="seguro"]').check();
}

test('a code exercise answers in a code field and a practical exercise stays a plain box', { skip: SKIP }, async (t) => {
  const { page } = await open(t, { questions: QUESTIONS, exercises: [ECO, MODELO] });
  const code = page.locator('textarea[name="exercise-eco"]');
  const plain = page.locator('textarea[name="exercise-modelo"]');
  assert.match(await code.getAttribute('class') ?? '', /\blk-code\b/, 'the code exercise is a code field');
  assert.doesNotMatch(await plain.getAttribute('class') ?? '', /\blk-code\b/, 'the practical exercise stays plain');
});

test('a question whose piece is code gets a code field for its reasoning, and the others stay plain', { skip: SKIP }, async (t) => {
  const { page } = await open(t, { questions: QUESTIONS });
  assert.match(await page.locator('textarea[name="q1-razonamiento"]').getAttribute('class') ?? '', /\blk-code\b/, 'the code question reasons in code');
  assert.doesNotMatch(await page.locator('textarea[name="q2-razonamiento"]').getAttribute('class') ?? '', /\blk-code\b/, 'the plain question stays plain');
});

test('Tab in a code exercise answer indents it and keeps the focus in the box', { skip: SKIP }, async (t) => {
  const { page } = await open(t, { questions: QUESTIONS, exercises: [ECO] });
  const code = page.locator('textarea[name="exercise-eco"]');
  await code.fill('for i in x:');
  await code.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.press('Tab');
  assert.equal(await code.inputValue(), 'for i in x:  ');
  assert.equal(await page.evaluate(() => document.activeElement?.name), 'exercise-eco', 'Tab stays in the answer');
});

test('a code exercise answer reaches the tutor with its line breaks and inner indentation', { skip: SKIP }, async (t) => {
  const { page, submitted } = await open(t, { questions: QUESTIONS, exercises: [ECO] });
  await page.locator('textarea[name="exercise-eco"]').fill('SELECT 1;\n  FROM dual;\n');
  await answerAll(page);
  await page.getByRole('button', { name: 'Enviar al tutor' }).click();
  await page.waitForResponse((r) => r.url().endsWith('/submit'));
  assert.equal(submitted[0].exercises.eco, 'SELECT 1;\n  FROM dual;', 'the line breaks and the indentation inside the answer survive');
});
