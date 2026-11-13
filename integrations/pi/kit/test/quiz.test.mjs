// The mini-quiz asks for an exercise only when the part has one: each statement sits above its
// own answer box, and each answer reaches the tutor labelled with its exercise (#253).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    attempts.push(async () => createRequire(root + '/')('playwright'));
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

const ORIGIN = 'http://quiz.test/';
const OPTIONS = { A: 'a', B: 'b', C: 'c', D: 'd', E: 'No sé' };
const QUESTIONS = [
  { id: 'q1', enunciado: 'Pregunta uno', options: OPTIONS },
  { id: 'q2', enunciado: 'Pregunta dos', options: OPTIONS },
];
const ECO = { id: 'eco', titulo: 'Eco', enunciado: 'Repite la entrada' };
const SUMA = { id: 'suma', titulo: 'Suma', enunciado: 'Suma dos enteros' };
const GRADED = {
  results: [{ id: 'q1', chosen: 'B', correct: 'B', ok: true }, { id: 'q2', chosen: 'B', correct: 'B', ok: true }],
  score: '2/2',
  saved: 'mini-quiz/p1.answers.json',
};

// The page is the one a note embeds: kit.js reads the bridge's config and posts to it.
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
    if (path === '/kit.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: readFileSync(join(KIT, 'kit.js'), 'utf8') });
    if (path === '/dictate.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: readFileSync(join(KIT, 'dictate.js'), 'utf8') });
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body><main><lk-quiz></lk-quiz></main>'
        + '<script>window.LEARNING_BRIDGE={quizUrl:"/quiz",submitUrl:"/submit",topic:"sql-demo",part:"p1"}</script>'
        + '<script src="/dictate.js"></script><script src="/kit.js"></script></body></html>',
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

async function send(page) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/submit')),
    page.getByRole('button', { name: 'Enviar al tutor' }).click(),
  ]);
  assert.equal(response.status(), 200);
}

test('a part without exercises draws no exercise box and sends no exercises field', { skip: SKIP }, async (t) => {
  const { page, submitted } = await open(t, { questions: QUESTIONS });
  assert.equal(await page.locator('fieldset.lk-exercise').count(), 0);
  assert.equal(await page.locator('textarea[name^="exercise-"]').count(), 0);
  assert.equal(await page.getByText('Ejercicios (opcional)').count(), 0);
  assert.equal(await page.locator('textarea[name="ownWords"]').count(), 1, 'the own-words box stays');
  await answerAll(page);
  await send(page);
  assert.equal('exercises' in submitted[0], false);
});

test('each exercise statement is numbered above its own answer box', { skip: SKIP }, async (t) => {
  const { page } = await open(t, { questions: QUESTIONS, exercises: [ECO, SUMA] });
  assert.deepEqual(await page.locator('fieldset.lk-exercise legend').allTextContents(), ['1. Repite la entrada', '2. Suma dos enteros']);
  assert.equal(await page.locator('fieldset.lk-exercise textarea').count(), 2);
  // The statement and its answer share one box: the legend is the box's own heading.
  assert.equal(await page.locator('fieldset:has(textarea[name="exercise-eco"]) legend').textContent(), '1. Repite la entrada');
  assert.equal(await page.locator('fieldset:has(textarea[name="exercise-suma"]) legend').textContent(), '2. Suma dos enteros');
});

test('the exercise answers reach the tutor labelled by their exercise', { skip: SKIP }, async (t) => {
  const { page, submitted } = await open(t, { questions: QUESTIONS, exercises: [ECO, SUMA] });
  await answerAll(page);
  await page.locator('textarea[name="exercise-suma"]').fill('print(1 + 2)');
  await send(page);
  assert.deepEqual(submitted[0].exercises, { suma: 'print(1 + 2)' });
});

test('a blank exercise box sends nothing', { skip: SKIP }, async (t) => {
  const { page, submitted } = await open(t, { questions: QUESTIONS, exercises: [ECO, SUMA] });
  await answerAll(page);
  await send(page);
  assert.equal('exercises' in submitted[0], false);
});

// #272: the bridge serves each question's options in the learner's order («No sé» last) and reads back the letter picked.
const SHOWN = { A: 'c', B: 'a', C: 'b', D: 'd', E: 'No sé' };
const SERVED = [{ id: 'q1', enunciado: 'Pregunta uno', options: SHOWN }, { id: 'q2', enunciado: 'Pregunta dos', options: SHOWN }];

test('the mini-quiz draws the options in the order served and sends the letter each one shows (#272)', { skip: SKIP }, async (t) => {
  const { page, submitted } = await open(t, { questions: SERVED });
  assert.deepEqual(await page.locator('fieldset.lk-question').first().locator('label.lk-option').allTextContents(), ['A. c', 'B. a', 'C. b', 'D. d', 'E. No sé']);
  await answerAll(page);
  await send(page);
  assert.equal(submitted[0].answers.q1, 'B', 'the kit sends the letter the learner picked: B shows «a»');
  assert.equal(submitted[0].answers.q2, 'B');
});

test('a reload checks the letter the learner picked and grades it in that letter (#272)', { skip: SKIP }, async (t) => {
  const answered = [{ id: 'q1', chosen: 'B', correct: 'C', ok: false }, { id: 'q2', chosen: 'A', correct: 'A', ok: true }];
  const { page } = await open(t, { questions: SERVED, answered });
  assert.equal(await page.locator('input[name="q1"][value="B"]').isChecked(), true);
  assert.equal(await page.locator('input[name="q1"][value="B"]').isDisabled(), true);
  assert.match(await page.locator('fieldset.lk-question').first().textContent(), /Elegiste B; correcta: C/);
});
