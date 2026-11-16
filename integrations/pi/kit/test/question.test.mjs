// Question text (#332): one renderer draws every question's stem, options, pieza and exercise statement.
// A fence keeps its lines and gets highlighted spans, HTML in a string stays text, and $…$ is KaTeX.
// Driven in a real page with the kit itself, as the other kit tests are.
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
const SKIP = PLAYWRIGHT ? false : 'playwright not installed: the question renderer cannot be driven';

const ORIGIN = 'http://question.test/';
const PLSQL = 'CREATE OR REPLACE PACKAGE PA_Reportes AS\n  PROCEDURE mostrar_cliente(p_id NUMBER);\nEND PA_Reportes;';

// The reader loads the renderer before the kit; a page that loads only the kit fetches it beside the kit.
async function kitPage(t, { renderer = true } = {}) {
  const browser = await PLAYWRIGHT.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const served = {
    '/kit.js': 'kit.js',
    '/dictate.js': 'dictate.js',
    '/question.js': 'question.js',
  };
  await page.route(`${ORIGIN}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (served[path]) return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: readFileSync(join(KIT, served[path]), 'utf8') });
    const shell = renderer ? '<script src="/question.js"></script>' : '';
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><main id="host"></main><script src="/dictate.js"></script>${shell}<script src="/kit.js"></script>` });
  });
  await page.goto(ORIGIN);
  await page.waitForFunction(() => typeof window.lkQuestion === 'object', null, { timeout: 5000 });
  return page;
}

test('a fenced PL/SQL stem keeps its lines and gets highlighted spans', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  const stem = `¿Qué imprime?\n\`\`\`plsql\n${PLSQL}\n\`\`\``;
  const seen = await page.evaluate((text) => {
    const host = document.getElementById('host');
    lkQuestion.render(host, text);
    const code = host.querySelector('pre > code.language-plsql');
    return { code: code?.textContent ?? null, keywords: code ? code.querySelectorAll('.lk-tok-kw').length : 0, prose: host.textContent.startsWith('¿Qué imprime?') };
  }, stem);
  assert.equal(seen.code, PLSQL, 'the block keeps every line and its indentation');
  assert.ok(seen.keywords >= 5, `keywords are highlighted, got ${seen.keywords}`);
  assert.equal(seen.prose, true, 'the prose before the fence stays text');
});

test('the highlighter names keywords, strings, comments and numbers in SQL, Python, Rust and JS', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  const source = {
    plsql: "SELECT 'x', 2 FROM dual; -- nota",
    python: 'def f(x):\n    return x  # ok',
    rust: 'fn main() { let x = "a"; }',
    js: 'const y = 1; // nota',
  };
  const kinds = await page.evaluate((code) => Object.fromEntries(Object.entries(code).map(([lang, text]) => [lang, lkQuestion.highlight(text, lang)])), source);
  const pick = (tokens, kind) => tokens.filter((tok) => tok.kind === kind).map((tok) => tok.text);
  assert.deepEqual(pick(kinds.plsql, 'kw'), ['SELECT', 'FROM']);
  assert.deepEqual(pick(kinds.plsql, 'str'), ["'x'"]);
  assert.deepEqual(pick(kinds.plsql, 'num'), ['2']);
  assert.deepEqual(pick(kinds.plsql, 'com'), ['-- nota']);
  assert.deepEqual(pick(kinds.python, 'kw'), ['def', 'return']);
  assert.deepEqual(pick(kinds.python, 'com'), ['# ok']);
  assert.deepEqual(pick(kinds.rust, 'kw'), ['fn', 'let']);
  assert.deepEqual(pick(kinds.rust, 'str'), ['"a"']);
  assert.deepEqual(pick(kinds.js, 'kw'), ['const']);
  assert.deepEqual(pick(kinds.js, 'com'), ['// nota']);
  for (const [lang, tokens] of Object.entries(kinds)) assert.equal(tokens.map((tok) => tok.text).join(''), source[lang], `${lang}: the tokens cover the code exactly`);
});

test('HTML inside a question stays text: nothing it names is drawn or run', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  const text = 'Compara <img src=x onerror="window.__pwned=1"> con <b>negrita</b>\n```html\n<script>window.__pwned=2</script>\n```';
  const seen = await page.evaluate((input) => {
    const host = document.getElementById('host');
    lkQuestion.render(host, input);
    return { drawn: host.querySelectorAll('img, b, script').length, text: host.textContent, pwned: window.__pwned ?? null };
  }, text);
  assert.equal(seen.drawn, 0, 'no element is created from the markup');
  assert.equal(seen.pwned, null, 'no script runs');
  assert.match(seen.text, /<img src=x onerror="window\.__pwned=1">/, 'the markup reads as written');
  assert.match(seen.text, /<script>window\.__pwned=2<\/script>/, 'the markup inside a fence reads as written');
});

test('a $…$ formula becomes KaTeX and a $$…$$ one a display formula', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  await page.evaluate(() => lkQuestion.render(document.getElementById('host'), 'La forma $x^2$ y luego $$\\sum_{i=1}^{n} i$$ fin'));
  await page.waitForSelector('#host .katex', { timeout: 15000 });
  const drawn = await page.evaluate(() => ({ inline: document.querySelectorAll('#host .katex').length, display: document.querySelectorAll('#host .katex-display').length, raw: document.getElementById('host').textContent.includes('$x^2$') }));
  assert.ok(drawn.inline >= 2, 'both formulas are drawn by KaTeX');
  assert.equal(drawn.display, 1, 'the double-dollar formula is a display formula');
  assert.equal(drawn.raw, false, 'the dollars do not stay as text');
});

test('inline code, line breaks in prose, and an escaped dollar stay as written', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  const seen = await page.evaluate(() => {
    const host = document.getElementById('host');
    lkQuestion.render(host, 'Usa `SELECT` aquí\ny \\$5 cuesta');
    return { code: host.querySelector('code')?.textContent ?? null, breaks: host.querySelectorAll('br').length, text: host.textContent, math: host.querySelectorAll('.katex').length };
  });
  assert.equal(seen.code, 'SELECT');
  assert.equal(seen.breaks, 1, 'a newline in prose becomes a line break');
  assert.match(seen.text, /\$5 cuesta/, 'an escaped dollar is a dollar');
  assert.equal(seen.math, 0, 'an escaped dollar opens no formula');
});

test('a pieza codigo draws as a code block in its language', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  const seen = await page.evaluate((contenido) => {
    const host = document.getElementById('host');
    const drawn = lkQuestion.pieza(host, { tipo: 'codigo', lenguaje: 'plsql', contenido });
    return { drawn, code: host.querySelector('pre > code.language-plsql')?.textContent ?? null };
  }, PLSQL);
  assert.equal(seen.drawn, true);
  assert.equal(seen.code, PLSQL);
});

test('a page that loads only the kit fetches the renderer beside it', { skip: SKIP }, async (t) => {
  const page = await kitPage(t, { renderer: false });
  const code = await page.evaluate((text) => {
    const host = document.getElementById('host');
    lkQuestion.render(host, text);
    return host.querySelector('pre > code')?.textContent ?? null;
  }, `\`\`\`sql\n${PLSQL}\n\`\`\``);
  assert.equal(code, PLSQL, 'the renderer drew the block after the kit fetched it');
});

// The learner must not see literal markers: a question's emphasis and lists are elements, and an identifier's underscore is text.
test('bold, italic and lists are real elements, never literal markers', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  const seen = await page.evaluate(() => {
    const host = document.getElementById('host');
    lkQuestion.render(host, 'Un **dato** con *énfasis* y _otro_ aparte\n- uno\n- dos\n\n3. tres\n4. cuatro');
    return {
      strong: [...host.querySelectorAll('strong')].map((n) => n.textContent),
      em: [...host.querySelectorAll('em')].map((n) => n.textContent),
      bullets: [...host.querySelectorAll('ul > li')].map((n) => n.textContent),
      numbered: [...host.querySelectorAll('ol')].map((n) => ({ start: n.start, items: [...n.querySelectorAll('li')].map((li) => li.textContent) })),
      text: host.textContent,
    };
  });
  assert.deepEqual(seen.strong, ['dato'], 'bold is a strong element');
  assert.deepEqual(seen.em, ['énfasis', 'otro'], 'both italic forms are em elements');
  assert.deepEqual(seen.bullets, ['uno', 'dos'], 'a dash line is a bullet item');
  assert.deepEqual(seen.numbered, [{ start: 3, items: ['tres', 'cuatro'] }], 'a numbered line is an item of an ordered list that keeps its start');
  assert.doesNotMatch(seen.text, /[*_]/, 'no literal asterisk or underscore reaches the learner');
});

test('an underscore or asterisk inside a word is text, not emphasis', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  const seen = await page.evaluate(() => {
    const host = document.getElementById('host');
    lkQuestion.render(host, 'Invoca PA_Reportes.mostrar_cliente con p_id, 2*3 y mostrar_cliente_2');
    return { em: host.querySelectorAll('em').length, text: host.textContent };
  });
  assert.equal(seen.em, 0, 'no emphasis opens inside an identifier or a product');
  assert.equal(seen.text, 'Invoca PA_Reportes.mostrar_cliente con p_id, 2*3 y mostrar_cliente_2');
});

test('a line that closes its own backticks is inline code, not a fence', { skip: SKIP }, async (t) => {
  const page = await kitPage(t);
  const seen = await page.evaluate(() => {
    const host = document.getElementById('host');
    lkQuestion.render(host, '```sql SELECT 1``` aquí');
    return { pre: host.querySelectorAll('pre').length };
  });
  assert.equal(seen.pre, 0, 'a backtick fence cannot carry a backtick in its info string');
});
