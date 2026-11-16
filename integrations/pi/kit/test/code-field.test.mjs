// A code answer box (#334): Tab and Shift+Tab indent a code field instead of leaving it, the value is what was
// typed, and the field draws in the reader's code face and the theme's colours. Driven in a real page with the
// component itself, as the other kit tests are.
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
const SKIP = PLAYWRIGHT ? false : 'playwright not installed: the code field cannot be driven';

const ORIGIN = 'http://code-field.test/';

// A kit file that does not exist yet is a 404: the test then fails on what it asserts, not inside the harness.
const asset = (name, contentType) => (existsSync(join(KIT, name))
  ? { status: 200, contentType, body: readFileSync(join(KIT, name), 'utf8') }
  : { status: 404, contentType: 'text/plain', body: 'missing' });

// One code field in a form, and a button after it: Tab from the field lands on the button only when the field lets go.
async function fieldPage(t) {
  const browser = await PLAYWRIGHT.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route(`${ORIGIN}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/code-field.js') return route.fulfill(asset('code-field.js', 'text/javascript; charset=utf-8'));
    if (path === '/kit.css') return route.fulfill(asset('kit.css', 'text/css; charset=utf-8'));
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="/kit.css"><script src="/code-field.js"></script></head>'
        + '<body><form id="form"><label>Respuesta <textarea id="field" name="answer" rows="3"></textarea></label><button id="after" type="button">Después</button></form>'
        + '<script>if (window.lkCodeField) lkCodeField.enhance(document.getElementById("field"));</script></body></html>',
    });
  });
  await page.goto(ORIGIN);
  assert.equal(await page.evaluate(() => typeof window.lkCodeField), 'object', 'the code field module is loaded');
  return page;
}

const field = (page) => page.locator('#field');
const focused = (page) => page.evaluate(() => document.activeElement?.id);
const caretAt = (page, at) => field(page).evaluate((el, n) => el.setSelectionRange(n, n), at);

// What the learner sees: rows actually shown and whether the box has its own vertical scrollbar.
const sizeOf = (page) => field(page).evaluate((el) => {
  const s = getComputedStyle(el);
  const line = parseFloat(s.lineHeight);
  const pad = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom);
  return {
    rows: Math.round(((el.clientHeight - pad) / line) * 10) / 10,
    scrolls: el.scrollHeight > el.clientHeight + 1,
    authored: el.rows,
  };
});

test('Tab inserts two spaces at the caret and keeps the focus in the field', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).fill('SELECT 1');
  await caretAt(page, 8);
  await page.keyboard.press('Tab');
  assert.equal(await field(page).inputValue(), 'SELECT 1  ');
  assert.equal(await focused(page), 'field', 'Tab stays in the code field');
});

test('Tab with an empty code field still moves the focus to the next control', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).focus();
  await page.keyboard.press('Tab');
  assert.equal(await focused(page), 'after', 'an empty field lets Tab move on, for keyboard users');
  assert.equal(await field(page).inputValue(), '');
});

test("Shift+Tab removes the two spaces that start the caret's line and keeps the focus", { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).fill('BEGIN\n  SELECT 1;\nEND;');
  await caretAt(page, 12);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await field(page).inputValue(), 'BEGIN\nSELECT 1;\nEND;');
  assert.equal(await focused(page), 'field');
});

test('Shift+Tab removes one space or a tab, and leaves an unindented line alone but keeps the focus', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).fill('x\n\tSELECT');
  await caretAt(page, 3);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await field(page).inputValue(), 'x\nSELECT', 'a tab is one indent');
  await field(page).fill(' SELECT');
  await caretAt(page, 7);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await field(page).inputValue(), 'SELECT', 'a single space is removed');
  await field(page).fill('SELECT');
  await caretAt(page, 3);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await field(page).inputValue(), 'SELECT', 'nothing to remove, nothing changes');
  assert.equal(await focused(page), 'field', 'the field keeps Shift+Tab while it has text');
});

test('Tab and Shift+Tab indent and outdent every line of a selection and delete no text', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).fill('A\nB\nC');
  await field(page).evaluate((el) => el.setSelectionRange(0, el.value.length));
  await page.keyboard.press('Tab');
  assert.equal(await field(page).inputValue(), '  A\n  B\n  C', 'a selection is indented, not replaced');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await field(page).inputValue(), 'A\nB\nC');
});

test('the value keeps its line breaks and indentation exactly as typed, also after the field loses focus', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  const typed = 'SELECT *\n  FROM dual\n\n  WHERE 1 = 1;\n';
  await field(page).fill(typed);
  await page.getByRole('button', { name: 'Después' }).focus();
  assert.equal(await field(page).inputValue(), typed, 'nothing is added or trimmed on blur');
  assert.equal(await page.evaluate(() => new FormData(document.getElementById('form')).get('answer')), typed, 'the form reads what was typed');
});

test('a value written by dictation, with no input event, is kept and Tab indents from its caret', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  // Dictation (kit/dictate.js) assigns the value directly; the field must not need an input event to know it.
  await field(page).evaluate((el) => { el.value = 'SELECT 1'; el.focus(); el.setSelectionRange(8, 8); });
  await page.keyboard.press('Tab');
  assert.equal(await field(page).inputValue(), 'SELECT 1  ', 'the spaces go at the caret, after the dictated text');
  assert.equal(await focused(page), 'field');
});

test('Tab inserts its spaces as one undoable edit', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).focus();
  await page.keyboard.type('SELECT');
  await page.keyboard.press('Tab');
  assert.equal(await field(page).inputValue(), 'SELECT  ');
  await page.keyboard.press('Control+z');
  assert.equal(await field(page).inputValue(), 'SELECT', 'Ctrl+Z takes back the indent, not the text');
});

test('Ctrl+Tab, Alt+Tab and Meta+Tab are left to the browser', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).fill('SELECT 1');
  const prevented = await field(page).evaluate((el) => Object.fromEntries(['ctrlKey', 'altKey', 'metaKey'].map((modifier) => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, [modifier]: true });
    el.dispatchEvent(event);
    return [modifier, event.defaultPrevented];
  })));
  assert.deepEqual(prevented, { ctrlKey: false, altKey: false, metaKey: false });
});

test('the code field is monospace at the reader size and its lines do not wrap', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  const style = await field(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return { family: s.fontFamily, size: s.fontSize, whiteSpace: s.whiteSpace };
  });
  assert.match(style.family, /monospace/, 'the face is monospace');
  assert.equal(style.size, '15px', "the reader's own code blocks (kit.css pre) are 15px");
  assert.equal(style.whiteSpace, 'pre', 'the lines keep their breaks and do not wrap');
  assert.equal(await field(page).getAttribute('wrap'), 'off');
  assert.equal(await field(page).getAttribute('spellcheck'), 'false');
});

test('the code field keeps the theme paper and ink in light, dark and black, and its value across a switch', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).fill('SELECT 1');
  const expected = {
    light: { background: 'rgb(255, 255, 255)', color: 'rgb(15, 46, 61)' },
    dark: { background: 'rgb(14, 26, 32)', color: 'rgb(227, 235, 239)' },
    black: { background: 'rgb(0, 0, 0)', color: 'rgb(227, 235, 239)' },
  };
  for (const [theme, colours] of Object.entries(expected)) {
    await page.evaluate((name) => { document.documentElement.dataset.theme = name; }, theme);
    const drawn = await field(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    assert.deepEqual(drawn, colours, `${theme} theme`);
  }
  assert.equal(await field(page).inputValue(), 'SELECT 1', 'a theme switch keeps what was typed');
});

test('enhancing a field twice keeps one Tab handler: Tab adds two spaces, not four', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await page.evaluate(() => {
    const area = document.getElementById('field');
    window.lkCodeField.enhance(area);
    window.lkCodeField.enhance(area);
  });
  await field(page).fill('SELECT 1');
  await caretAt(page, 8);
  await page.keyboard.press('Tab');
  assert.equal(await field(page).inputValue(), 'SELECT 1  ');
});

test('Escape blurs the code field, so a keyboard user is never trapped; Tab with text still indents', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).fill('SELECT 1');
  await field(page).focus();
  assert.equal(await focused(page), 'field');
  await page.keyboard.press('Escape');
  assert.notEqual(await focused(page), 'field', 'Escape leaves the field');
  assert.equal(await field(page).inputValue(), 'SELECT 1', 'leaving does not change what was typed');
  await field(page).focus();
  await page.keyboard.press('Tab');
  assert.equal(await focused(page), 'field', 'Tab with text still indents instead of leaving');
});

test('the field grows with its content to 18 rows and never below the authored 3', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  assert.equal((await sizeOf(page)).rows, 3, 'it starts at the authored rows');
  await field(page).fill('uno\ndos\ntres\ncuatro\ncinco');
  let size = await sizeOf(page);
  assert.equal(size.rows, 5, 'a five-line answer shows five rows');
  assert.equal(size.scrolls, false, 'no inner scrollbar while it fits');
  await field(page).fill(Array.from({ length: 25 }, (_, i) => `linea ${i + 1}`).join('\n'));
  size = await sizeOf(page);
  assert.equal(size.rows, 18, 'a 25-line answer stops at 18 rows');
  assert.equal(size.scrolls, true, 'and scrolls inside past the cap');
  assert.equal(size.authored, 3, 'the rows attribute is untouched');
  await field(page).fill('una');
  size = await sizeOf(page);
  assert.equal(size.rows, 3, 'it never shrinks below the authored rows');
  assert.equal(size.scrolls, false);
});

test('a paste grows the field even without an input event', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).evaluate((el) => {
    // setRangeText changes the value the way a paste does, but without the input event Chromium fires on a real paste.
    el.setRangeText(Array.from({ length: 6 }, (_, i) => `linea ${i}`).join('\n'), 0, el.value.length, 'end');
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }));
  });
  await page.waitForFunction(() => {
    const el = document.getElementById('field');
    const s = getComputedStyle(el);
    const shown = (el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / parseFloat(s.lineHeight);
    return Math.abs(shown - 6) < 0.2;
  }, null, { timeout: 2000 });
  const size = await sizeOf(page);
  assert.equal(size.scrolls, false, 'six pasted lines fit without a scrollbar');
});

test('a dictation assignment grows the field without an input event', { skip: SKIP }, async (t) => {
  const page = await fieldPage(t);
  await field(page).evaluate((el) => { el.value = Array.from({ length: 5 }, (_, i) => `dictada ${i}`).join('\n'); });
  const size = await sizeOf(page);
  assert.equal(size.rows, 5, 'the field follows the dictated lines');
  assert.equal(size.scrolls, false);
});
