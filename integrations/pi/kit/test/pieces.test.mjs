// Piezas visuales del lector (#218 tarjetas de veredicto, #219 memoria, #220 tablas
// unidas, #221 conjuntos): lo que el aprendiz ve, medido en el navegador.
//
// Cada pieza es JSON declarativo anclado por ids. Estos casos comprueban lo que
// un `assert` sobre el JSON no puede ver: el veredicto que pinta de rojo la
// tarjeta que falla, la pila de tarjetas en una columna estrecha, un conector que
// no termina en su celda, una palabra que se sale del lienzo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { measurePiece } from '../piece-measure.mjs';

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
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se pueden medir las piezas';
const THEMES = ['light', 'dark', 'black'];

function pageFor(tag, spec) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-piece-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="kit/kit.css"><script src="kit/scene.js" defer></script><script src="kit/kit.js" defer></script>
<style>/* La regla del lector que se filtraba a las piezas (view/app.css): el texto de
   una pieza no se justifica aunque viva dentro de la prosa. */
.prose p { text-align: justify; hyphens: auto; }</style>
</head><body><main style="max-width:700px;margin:0 auto"><div class="prose"><${tag}><script type="application/json">${JSON.stringify(spec)}</script></${tag}></div></main></body></html>`);
  return 'file://' + join(dir, 'p.html');
}

async function open(tag, spec, { width = 1000, theme = 'light', ready = '.lk-p' } = {}) {
  const browser = await PLAYWRIGHT.chromium.launch();
  const view = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  view.on('pageerror', (error) => errors.push(String(error.message)));
  try {
    await view.goto(pageFor(tag, spec));
    await view.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await view.waitForSelector(ready, { timeout: 5000 });
    await view.evaluate(() => document.fonts.ready);
    await view.waitForTimeout(150);
  } catch (error) { await browser.close(); throw error; }
  return { browser, view, errors };
}

// ── #218 verdict cards ──────────────────────────────────────────────────────
const CARDS = {
  title: 'Préstamos en Rust',
  cards: [
    { id: 'many', verdict: 'ok', pill: 'COMPILA', title: 'Muchas «&»', draw: { refs: [{ text: '&s' }, { text: '&s' }, { text: '&s' }], target: { text: 's' } }, reason: 'Todos leen a la vez' },
    { id: 'one', verdict: 'ok', pill: 'COMPILA', title: 'Una sola «&mut»', draw: { refs: [{ text: '&mut s', tone: 'amber' }], target: { text: 's' } }, reason: 'Solo uno lee y escribe' },
    { id: 'both', verdict: 'no', pill: 'NO COMPILA', title: '«&» y «&mut» a la vez', draw: { refs: [{ text: '&s' }, { text: '&mut s', tone: 'amber' }], target: { text: 's' } }, reason: 'Uno escribiría mientras otro lee' },
  ],
};

test('verdict cards draw pill, title, drawing and reason, and tint the failing card red', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open('lk-cards', CARDS);
  try {
    const seen = await view.evaluate(() => [...document.querySelectorAll('.lk-card')].map((card) => {
      const pill = card.querySelector('.lk-pill');
      const style = getComputedStyle(card);
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(style.borderTopColor);
      return {
        verdict: card.dataset.verdict,
        pill: pill?.textContent,
        title: card.querySelector('.lk-card-title')?.textContent,
        chips: card.querySelectorAll('.lk-card-draw .lk-pchip').length,
        reason: card.querySelector('.lk-card-reason')?.textContent,
        redBorder: m ? +m[1] > +m[2] + 40 && +m[1] > +m[3] : false,
        codeChips: card.querySelectorAll('.lk-card-title .lk-chip').length,
      };
    }));
    assert.deepEqual(errors, []);
    assert.equal(seen.length, 3);
    assert.deepEqual(seen.map((c) => c.pill), ['COMPILA', 'COMPILA', 'NO COMPILA']);
    assert.deepEqual(seen.map((c) => c.chips), [4, 2, 3], 'each card draws its references and its target');
    assert.deepEqual(seen.map((c) => c.redBorder), [false, false, true], 'only the failing card is tinted red');
    assert.ok(seen.every((c) => c.title && c.reason), 'every card has a title and one line of reason');
    assert.ok(seen[0].codeChips >= 1, 'a «code» span in a title is drawn as a chip');
  } finally { await browser.close(); }
});

test('verdict cards sit side by side on a wide column and stack on a narrow one', { skip: SKIP }, async () => {
  for (const [width, stacked] of [[1000, false], [380, true]]) {
    const { browser, view } = await open('lk-cards', CARDS, { width });
    try {
      const tops = await view.evaluate(() => [...document.querySelectorAll('.lk-card')].map((c) => Math.round(c.getBoundingClientRect().top)));
      assert.equal(new Set(tops).size === tops.length, stacked, `${width}px: tops ${tops}`);
    } finally { await browser.close(); }
  }
});

test('verdict cards pass the measure in every theme and width', { skip: SKIP }, async () => {
  for (const theme of THEMES) for (const width of [380, 1000]) {
    const { browser, view } = await open('lk-cards', CARDS, { width, theme });
    try {
      const { problems } = await view.locator('lk-cards').evaluate(measurePiece);
      assert.deepEqual(problems, [], `${theme} ${width}px`);
    } finally { await browser.close(); }
  }
});

test('a verdict-cards payload with one card says so instead of drawing a lone card', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-cards', { cards: [CARDS.cards[0]] }, { ready: '[role=alert]' });
  try {
    assert.match(await view.locator('[role=alert]').textContent(), /2 a 4/);
  } finally { await browser.close(); }
});

test('verdict cards work as a story step under the code header', { skip: SKIP }, async () => {
  const spec = {
    kind: 'derivation', title: 'Préstamos', steps: CARDS.cards.map((c, i) => ({
      title: c.title, narrator: c.reason, equation: { size: 22, atoms: [{ t: 'let r = &s;', id: 'r' }] }, focus: ['r'],
      stage: { cards: { cards: CARDS.cards.slice(0, i + 1).length >= 2 ? CARDS.cards.slice(0, i + 1) : CARDS.cards.slice(0, 2) } },
    })),
  };
  const { browser, view, errors } = await open('lk-story', spec, { ready: '.lk-story-stage .lk-p' });
  try {
    assert.deepEqual(errors, []);
    assert.equal(await view.locator('.lk-story-stage > svg').count(), 0, 'a story of pieces draws no empty scene canvas');
    await view.getByRole('button', { name: 'Paso siguiente' }).click();
    await view.getByRole('button', { name: 'Paso siguiente' }).click();
    assert.equal(await view.locator('.lk-story-stage .lk-p:visible .lk-card').count(), 3);
    const { problems } = await view.locator('lk-story').evaluate(measurePiece);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});

// ── #219 memory and state diagrams in numbered steps ────────────────────────
const MEMORY = {
  title: 'Mover un String',
  columns: [{ id: 'stack', label: 'STACK' }, { id: 'heap', label: 'HEAP' }],
  steps: [
    { code: 'let s1 = String::from("hola");', rows: [
      { stack: { id: 's1', name: 's1', pill: { text: 'dueña', tone: 'green' }, cells: ['ptr', 'len 4', 'cap 4'], tone: 'green', points: 'h1' }, heap: { id: 'h1', cells: ['h', 'o', 'l', 'a'], tone: 'amber' } },
    ] },
    { code: 'let s2 = s1;', rows: [
      { stack: { id: 's1b', name: 's1', pill: { text: 'movida', tone: 'red' }, cells: ['ptr', 'len 4', 'cap 4'], state: 'invalid' } },
      { stack: { id: 's2', name: 's2', pill: { text: 'dueña', tone: 'green' }, cells: ['ptr', 'len 4', 'cap 4'], tone: 'green', points: 'h2' }, heap: { id: 'h2', cells: ['h', 'o', 'l', 'a'], tone: 'amber' } },
    ] },
  ],
};

test('a memory diagram repeats the code line of each numbered step, with its columns, segmented cells and status pills', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open('lk-memory', MEMORY);
  try {
    const seen = await view.evaluate(() => [...document.querySelectorAll('.lk-mstep')].map((step) => ({
      badge: step.querySelector('.lk-mbadge')?.textContent,
      code: step.querySelector('.lk-mcode')?.textContent,
      columns: [...step.querySelectorAll('.lk-mcolhead')].map((c) => c.textContent),
      groups: [...step.querySelectorAll('.lk-mgroup')].map((g) => ({
        name: g.querySelector('.lk-mname')?.textContent,
        pill: g.querySelector('.lk-pill')?.textContent,
        cells: [...g.querySelectorAll('.lk-mcell')].map((c) => c.textContent),
        invalid: g.dataset.state === 'invalid',
        dashed: getComputedStyle(g.querySelector('.lk-mcells')).borderTopStyle,
        struck: getComputedStyle(g.querySelector('.lk-mcell')).textDecorationLine,
      })),
    })));
    assert.deepEqual(errors, []);
    assert.deepEqual(seen.map((s) => s.badge), ['1', '2']);
    assert.deepEqual(seen.map((s) => s.code), ['let s1 = String::from("hola");', 'let s2 = s1;']);
    assert.ok(seen.every((s) => s.columns.join() === 'STACK,HEAP'), 'every step repeats its column headers');
    assert.deepEqual(seen[0].groups.map((g) => g.cells), [['ptr', 'len 4', 'cap 4'], ['h', 'o', 'l', 'a']]);
    assert.deepEqual(seen[1].groups.filter((g) => g.name).map((g) => g.pill), ['movida', 'dueña']);
    const dead = seen[1].groups.find((g) => g.invalid);
    assert.equal(dead.dashed, 'dashed', 'an invalid cell strip is dashed');
    assert.match(dead.struck, /line-through/, 'an invalid cell is struck through');
  } finally { await browser.close(); }
});

test('memory pointers start on their cells and end on their target, a dead pointer ends in a ✗, and they follow a resize', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-memory', MEMORY);
  try {
    for (const width of [1000, 420]) {
      await view.setViewportSize({ width, height: 900 });
      await view.waitForTimeout(250);
      const seen = await view.evaluate(() => [...document.querySelectorAll('.lk-mstep')].map((step) => ({
        live: step.querySelectorAll('svg path[data-from][data-to]').length,
        dead: step.querySelectorAll('svg path[data-from]:not([data-to])').length,
        crosses: [...step.querySelectorAll('svg .lk-mcross')].map((c) => c.textContent),
      })));
      assert.deepEqual(seen.map((s) => s.live), [1, 1], `${width}px: each step draws its live pointer`);
      assert.deepEqual(seen.map((s) => s.dead), [0, 1], `${width}px: the moved owner draws a dead pointer`);
      assert.deepEqual(seen[1].crosses, ['✗']);
      const { problems } = await view.locator('lk-memory').evaluate(measurePiece);
      assert.deepEqual(problems, [], `${width}px`);
    }
  } finally { await browser.close(); }
});

test('memory diagrams pass the measure in every theme and width', { skip: SKIP }, async () => {
  for (const theme of THEMES) for (const width of [390, 1000]) {
    const { browser, view } = await open('lk-memory', MEMORY, { width, theme });
    try {
      const { problems } = await view.locator('lk-memory').evaluate(measurePiece);
      assert.deepEqual(problems, [], `${theme} ${width}px`);
    } finally { await browser.close(); }
  }
});

test('a memory diagram that names a pointer target it does not have says so', { skip: SKIP }, async () => {
  const bad = { ...MEMORY, steps: [{ code: 'let s = 1;', rows: [{ stack: { id: 's', name: 's', cells: ['ptr'], points: 'nada' } }] }] };
  const { browser, view } = await open('lk-memory', bad, { ready: '[role=alert]' });
  try {
    assert.match(await view.locator('[role=alert]').textContent(), /nada/);
  } finally { await browser.close(); }
});

test('a memory diagram works as a story step: no code line, the story header carries it', { skip: SKIP }, async () => {
  const spec = {
    kind: 'derivation', title: 'Mover', memory: { columns: MEMORY.columns },
    steps: MEMORY.steps.map((s) => ({ title: s.code, narrator: 'Se mueve la dueña.', equation: { size: 22, atoms: [{ t: s.code, id: 'c' }] }, focus: ['c'], stage: { memory: { rows: s.rows } } })),
  };
  for (const width of [1000, 390]) {
    const { browser, view, errors } = await open('lk-story', spec, { ready: '.lk-story-stage .lk-p', width });
    try {
      assert.deepEqual(errors, []);
      assert.equal(await view.locator('.lk-story-stage .lk-mcode').count(), 0, 'the story header already carries the code');
      assert.deepEqual((await view.locator('lk-story').evaluate(measurePiece)).problems, [], `${width}px step 1`);
      await view.getByRole('button', { name: 'Paso siguiente' }).click();
      assert.equal(await view.locator('.lk-story-piece:visible path[data-from]:not([data-to])').count(), 1);
      assert.deepEqual((await view.locator('lk-story').evaluate(measurePiece)).problems, [], `${width}px step 2`);
    } finally { await browser.close(); }
  }
});

test('a piece draws its caption under itself, as its own reading guide', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-cards', { ...CARDS, caption: 'Cada caso con su veredicto.' });
  try {
    assert.equal(await view.locator('lk-cards > .lk-piece-caption').textContent(), 'Cada caso con su veredicto.');
    const { problems } = await view.locator('lk-cards').evaluate(measurePiece);
    assert.deepEqual(problems, []);
  } finally { await browser.close(); }
});

// ── #220 tables joined by connectors, and the GROUP BY transform ────────────
const TABLES = {
  title: 'videogames JOIN developers',
  tables: [
    { id: 'games', name: 'videogames', columns: ['title', 'developer_id'], rows: [['Zelda', '1'], ['Mario', '1'], ['GTA V', '5'], ['Portal 2', '7'], ['RDR 2', '5']] },
    { id: 'devs', name: 'developers', columns: ['id', 'name'], rows: [['1', 'Nintendo'], ['5', 'Rockstar'], ['7', 'Valve']] },
  ],
  join: { from: 'games.developer_id', to: 'devs.id', on: 'developer_id = id', highlight: ['5'] },
  result: { label: 'RESULTADO', select: ['games.title', 'devs.name'] },
};
const GROUP = {
  title: 'GROUP BY developer',
  group: {
    by: 'developer', columns: ['title', 'developer'], highlight: ['Rockstar'],
    rows: [['Zelda', 'Nintendo'], ['Mario', 'Nintendo'], ['GTA V', 'Rockstar'], ['RDR 2', 'Rockstar'], ['FF VII', 'Square'], ['Minecraft', 'Mojang']],
  },
};

test('joined tables draw real tables, one coloured connector per match, the ON pill and the derived result', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open('lk-tables', TABLES);
  try {
    const seen = await view.evaluate(() => {
      const tables = [...document.querySelectorAll('.lk-ttable')].map((t) => ({
        name: t.querySelector('.lk-tname')?.textContent,
        head: [...t.querySelectorAll('thead th')].map((h) => h.textContent),
        rows: [...t.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent)),
        mono: getComputedStyle(t.querySelector('td')).fontFamily.toLowerCase().includes('mono'),
      }));
      const links = [...document.querySelectorAll('.lk-tjoin svg path[data-from][data-to]')].map((p) => ({ from: p.dataset.from, to: p.dataset.to, color: getComputedStyle(p).stroke }));
      const tinted = (t) => [...document.querySelectorAll(`.lk-ttable[data-table="${t}"] tbody tr`)].map((r) => r.dataset.tone || '');
      return { tables, links, on: document.querySelector('.lk-ton')?.textContent, label: document.querySelector('.lk-tlabel')?.textContent, games: tinted('games'), devs: tinted('devs'), result: tinted('result') };
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(seen.tables.map((t) => t.name), ['videogames', 'developers', undefined]);
    assert.deepEqual(seen.tables[0].head, ['title', 'developer_id']);
    assert.equal(seen.tables[0].rows.length, 5);
    assert.ok(seen.tables.every((t) => t.mono), 'cells are monospace');
    assert.equal(seen.links.length, 5, 'one connector per matched row');
    const byTarget = new Map();
    for (const l of seen.links) byTarget.set(l.to, new Set([...(byTarget.get(l.to) ?? []), l.color]));
    assert.ok([...byTarget.values()].every((c) => c.size === 1), 'the connectors of one match share a colour');
    assert.equal(new Set(seen.links.map((l) => l.color)).size, 3, 'one colour per match');
    assert.match(seen.on, /ON\s*developer_id = id/);
    assert.equal(seen.label, 'RESULTADO');
    assert.deepEqual(seen.tables[2].rows, [['Zelda', 'Nintendo'], ['Mario', 'Nintendo'], ['GTA V', 'Rockstar'], ['Portal 2', 'Valve'], ['RDR 2', 'Rockstar']]);
    assert.deepEqual(seen.games.map(Boolean), [false, false, true, false, true], 'rows of the highlighted group are coloured');
    assert.deepEqual(seen.devs.map(Boolean), [false, true, false]);
    assert.deepEqual(seen.result.map(Boolean), [false, false, true, false, true]);
  } finally { await browser.close(); }
});

test('connectors land on their cells and rows at every width and follow a resize', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-tables', TABLES);
  try {
    for (const width of [1000, 390, 700]) {
      await view.setViewportSize({ width, height: 900 });
      await view.waitForTimeout(250);
      const { problems } = await view.locator('lk-tables').evaluate(measurePiece);
      assert.deepEqual(problems, [], `${width}px`);
    }
  } finally { await browser.close(); }
});

test('a left join keeps the unmatched row with NULL and draws no connector for it', { skip: SKIP }, async () => {
  const left = { ...TABLES, tables: [{ ...TABLES.tables[0], rows: [...TABLES.tables[0].rows, ['Halo', '9']] }, TABLES.tables[1]], join: { ...TABLES.join, kind: 'left' } };
  const { browser, view } = await open('lk-tables', left);
  try {
    const seen = await view.evaluate(() => ({
      links: document.querySelectorAll('.lk-tjoin svg path[data-from][data-to]').length,
      last: [...document.querySelectorAll('.lk-ttable[data-table="result"] tbody tr')].at(-1)?.textContent,
    }));
    assert.equal(seen.links, 5);
    assert.match(seen.last, /HaloNULL/);
    assert.deepEqual((await view.locator('lk-tables').evaluate(measurePiece)).problems, []);
  } finally { await browser.close(); }
});

test('GROUP BY turns rows into groups with value chips and a count badge', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open('lk-tables', GROUP);
  try {
    const seen = await view.evaluate(() => ({
      rows: [...document.querySelectorAll('.lk-grow')].map((r) => r.textContent),
      titles: [...document.querySelectorAll('.lk-gtitle')].map((t) => t.textContent),
      mid: document.querySelector('.lk-gmid')?.textContent,
      groups: [...document.querySelectorAll('.lk-ggroup')].map((el) => ({ name: el.querySelector('.lk-gname')?.textContent, chips: [...el.querySelectorAll('.lk-pchip')].map((c) => c.textContent), count: el.querySelector('.lk-gcount')?.textContent, tinted: Boolean(el.dataset.tone) })),
    }));
    assert.deepEqual(errors, []);
    assert.equal(seen.rows.length, 6);
    assert.deepEqual(seen.titles, ['FILAS ORIGINALES', 'GRUPOS + COUNT']);
    assert.match(seen.mid, /GROUP BY\s*developer/);
    assert.deepEqual(seen.groups.map((x) => x.name), ['Nintendo', 'Rockstar', 'Square', 'Mojang']);
    assert.deepEqual(seen.groups.map((x) => x.chips), [['Zelda', 'Mario'], ['GTA V', 'RDR 2'], ['FF VII'], ['Minecraft']]);
    assert.deepEqual(seen.groups.map((x) => x.count), ['2', '2', '1', '1']);
    assert.deepEqual(seen.groups.map((x) => x.tinted), [false, true, false, false]);
  } finally { await browser.close(); }
});

test('tables and GROUP BY pass the measure in every theme and width', { skip: SKIP }, async () => {
  for (const theme of THEMES) for (const width of [390, 1000]) for (const spec of [TABLES, GROUP]) {
    const { browser, view } = await open('lk-tables', spec, { width, theme });
    try {
      const { problems } = await view.locator('lk-tables').evaluate(measurePiece);
      assert.deepEqual(problems, [], `${spec.group ? 'group' : 'join'} ${theme} ${width}px`);
    } finally { await browser.close(); }
  }
});

test('a join that names a table or column the note does not have says so', { skip: SKIP }, async () => {
  const bad = { ...TABLES, join: { ...TABLES.join, from: 'games.nada' } };
  const { browser, view } = await open('lk-tables', bad, { ready: '[role=alert]' });
  try {
    assert.match(await view.locator('[role=alert]').textContent(), /games\.nada/);
  } finally { await browser.close(); }
});

test('a tables story reveals the pieces step by step: tables, then the connectors and the ON pill, then the result', { skip: SKIP }, async () => {
  const spec = {
    kind: 'derivation', title: 'JOIN', tables: TABLES,
    steps: [['tables'], ['tables', 'links', 'on'], ['tables', 'links', 'on', 'result']].map((show, i) => ({
      title: `Paso ${i + 1}`, narrator: 'Se unen.', equation: { size: 22, atoms: [{ t: 'JOIN', id: 'j' }] }, focus: ['j'], stage: { tables: { show } },
    })),
  };
  for (const width of [1000, 390]) {
    const { browser, view, errors } = await open('lk-story', spec, { ready: '.lk-story-stage .lk-p', width });
    try {
      assert.deepEqual(errors, []);
      const counts = [];
      for (let s = 0; s < 3; s++) {
        if (s) await view.getByRole('button', { name: 'Paso siguiente' }).click();
        counts.push(await view.evaluate(() => {
          const panel = document.querySelector('.lk-story-piece:not([hidden])');
          return [panel.querySelectorAll('svg path[data-from][data-to]').length, panel.querySelectorAll('.lk-ton').length, panel.querySelectorAll('.lk-ttable[data-table="result"]').length];
        }));
        assert.deepEqual((await view.locator('lk-story').evaluate(measurePiece)).problems, [], `${width}px step ${s + 1}`);
      }
      assert.deepEqual(counts, [[0, 0, 0], [5, 1, 0], [5, 1, 1]]);
    } finally { await browser.close(); }
  }
});

// ── #221 Venn: two or three labelled sets, the answering region filled ──────
const VENN = {
  title: 'INNER JOIN',
  sets: [{ id: 'a', label: 'A', note: 'videogames' }, { id: 'b', label: 'B', note: 'developers' }],
  fill: ['a+b'], op: 'INNER JOIN', says: 'Solo coincidencias',
};
const VENN3 = {
  sets: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
  fill: ['a+b+c'], op: 'Intersección', says: 'Lo que está en los tres',
};

// A tiny PNG reader (8-bit RGB/RGBA, no interlace): enough to ask the screenshot
// what colour a region really has, which no DOM query can say about a mask.
import { inflateSync } from 'node:zlib';
function readPng(buffer) {
  let at = 8, width = 0, height = 0, type = 0; const data = [];
  while (at < buffer.length) {
    const len = buffer.readUInt32BE(at), kind = buffer.toString('ascii', at + 4, at + 8);
    if (kind === 'IHDR') { width = buffer.readUInt32BE(at + 8); height = buffer.readUInt32BE(at + 12); type = buffer[at + 17]; }
    if (kind === 'IDAT') data.push(buffer.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(data)), out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : (() => { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })();
      out[y * stride + x] = (line[x] + p) & 255;
    }
  }
  return { width, height, at: (x, y) => [out[y * stride + x * bpp], out[y * stride + x * bpp + 1], out[y * stride + x * bpp + 2]] };
}

// Which of the sample points (in the drawing's own units) are painted differently
// from the paper around the sets, read off a real screenshot of the drawing.
async function paintedAt(view, points) {
  const svg = view.locator('.lk-vsvg');
  const png = readPng(await svg.screenshot());
  const box = await svg.evaluate((node) => { const r = node.getBoundingClientRect(), vb = node.viewBox.baseVal; return { w: r.width, h: r.height, vw: vb.width, vh: vb.height }; });
  const paper = png.at(2, 2);
  return points.map(([x, y]) => {
    const px = png.at(Math.round(x / box.vw * box.w), Math.round(y / box.vh * box.h));
    return Math.abs(px[0] - paper[0]) + Math.abs(px[1] - paper[1]) + Math.abs(px[2] - paper[2]) > 40;
  });
}

test('a Venn draws two labelled sets, fills only the answering region and names the operation', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open('lk-venn', VENN);
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => ({
      labels: [...document.querySelectorAll('.lk-vlabel')].map((t) => t.textContent),
      notes: [...document.querySelectorAll('.lk-vnote')].map((t) => t.textContent),
      op: document.querySelector('.lk-vop')?.textContent,
      says: document.querySelector('.lk-vtext')?.textContent,
      fills: document.querySelectorAll('.lk-vfill').length,
      circles: [...document.querySelectorAll('.lk-vcircle')].map((c) => ({ cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r') })),
    }));
    assert.deepEqual(seen.labels, ['A', 'B']);
    assert.deepEqual(seen.notes, ['videogames', 'developers']);
    assert.equal(seen.op, 'INNER JOIN');
    assert.equal(seen.says, 'Solo coincidencias');
    assert.equal(seen.fills, 1);
    const [a, b] = seen.circles;
    const lens = [(a.cx + b.cx) / 2, a.cy], onlyA = [a.cx - a.r * 0.7, a.cy], onlyB = [b.cx + b.r * 0.7, b.cy];
    assert.deepEqual(await paintedAt(view, [lens, onlyA, onlyB]), [true, false, false], 'INNER JOIN paints only the intersection');
  } finally { await browser.close(); }
});

test('a Venn region is exact: the left join paints A and the lens, never B alone', { skip: SKIP }, async () => {
  const left = { ...VENN, fill: ['a', 'a+b'], op: 'LEFT JOIN', says: 'Todo A, con B donde haya' };
  const { browser, view } = await open('lk-venn', left);
  try {
    const [a, b] = await view.evaluate(() => [...document.querySelectorAll('.lk-vcircle')].map((c) => ({ cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r') })));
    assert.deepEqual(await paintedAt(view, [[(a.cx + b.cx) / 2, a.cy], [a.cx - a.r * 0.7, a.cy], [b.cx + b.r * 0.7, b.cy]]), [true, true, false]);
  } finally { await browser.close(); }
});

test('a three-set Venn paints the region the key names', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-venn', VENN3);
  try {
    const circles = await view.evaluate(() => [...document.querySelectorAll('.lk-vcircle')].map((c) => ({ cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r') })));
    assert.equal(circles.length, 3);
    const mid = [(circles[0].cx + circles[1].cx + circles[2].cx) / 3, (circles[0].cy + circles[1].cy + circles[2].cy) / 3];
    const onlyA = [circles[0].cx - circles[0].r * 0.5, circles[0].cy - circles[0].r * 0.5];
    assert.deepEqual(await paintedAt(view, [mid, onlyA]), [true, false]);
    assert.deepEqual((await view.locator('lk-venn').evaluate(measurePiece)).problems, []);
  } finally { await browser.close(); }
});

test('Venn diagrams pass the measure in every theme and width', { skip: SKIP }, async () => {
  for (const theme of THEMES) for (const width of [390, 1000]) for (const spec of [VENN, VENN3]) {
    const { browser, view } = await open('lk-venn', spec, { width, theme });
    try {
      const { problems } = await view.locator('lk-venn').evaluate(measurePiece);
      assert.deepEqual(problems, [], `${spec.sets.length} sets ${theme} ${width}px`);
    } finally { await browser.close(); }
  }
});

test('a Venn region that names a set the diagram does not have says so', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-venn', { ...VENN, fill: ['a+z'] }, { ready: '[role=alert]' });
  try {
    assert.match(await view.locator('[role=alert]').textContent(), /a\+z/);
  } finally { await browser.close(); }
});

test('a Venn story shows one region per step and inherits the sets', { skip: SKIP }, async () => {
  const regions = [['a+b', 'INNER JOIN'], [['a', 'a+b'], 'LEFT JOIN'], [['a', 'a+b', 'b'], 'FULL JOIN']];
  const spec = {
    kind: 'derivation', title: 'JOIN', venn: { sets: VENN.sets },
    steps: regions.map(([fill, op]) => ({ title: op, narrator: 'Una región.', equation: { size: 22, atoms: [{ t: op, id: 'j' }] }, focus: ['j'], stage: { venn: { fill: [].concat(fill), op, says: 'La región que responde' } } })),
  };
  for (const width of [1000, 390]) {
    const { browser, view, errors } = await open('lk-story', spec, { ready: '.lk-story-stage .lk-p', width });
    try {
      assert.deepEqual(errors, []);
      const fills = [];
      for (let s = 0; s < 3; s++) {
        if (s) await view.getByRole('button', { name: 'Paso siguiente' }).click();
        fills.push(await view.evaluate(() => [document.querySelector('.lk-story-piece:not([hidden]) .lk-vop')?.textContent, document.querySelectorAll('.lk-story-piece:not([hidden]) .lk-vfill').length]));
        assert.deepEqual((await view.locator('lk-story').evaluate(measurePiece)).problems, [], `${width}px step ${s + 1}`);
      }
      assert.deepEqual(fills, [['INNER JOIN', 1], ['LEFT JOIN', 2], ['FULL JOIN', 3]]);
    } finally { await browser.close(); }
  }
});

test('the measure flags a word that sits across the outline of a set', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-venn', VENN);
  try {
    await view.evaluate(() => {
      const circle = document.querySelector('.lk-vcircle');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'lk-vnote');
      text.setAttribute('x', circle.getAttribute('cx') - circle.getAttribute('r'));
      text.setAttribute('y', circle.getAttribute('cy'));
      text.setAttribute('text-anchor', 'middle');
      text.textContent = 'videogames';
      document.querySelector('.lk-vsvg').append(text);
    });
    const { problems } = await view.locator('lk-venn').evaluate(measurePiece);
    assert.ok(problems.some((p) => p.kind === 'outline-over-text'), JSON.stringify(problems));
  } finally { await browser.close(); }
});

// ── El texto de una pieza nunca se justifica ────────────────────────────────
// La prosa del lector se justifica (`.prose p { text-align: justify }`), y esa
// regla se filtraba a la razón de una tarjeta: «Uno            escribiría /
// mientras otro lee». El texto de una pieza y el de un recorrido se alinean al
// inicio o al centro, nunca justificados, y la medida lo llama
// `texto-justificado` para que la puerta lo vea antes que el aprendiz.
const JUSTIFIED = (host) => [...host.querySelectorAll('*')].filter((el) => {
  if (!el.textContent.trim() || el.closest('script, style')) return false;
  if (el.querySelector('*')) return false;
  return getComputedStyle(el).textAlign === 'justify';
}).map((el) => `${el.tagName.toLowerCase()}.${el.className}`);

test('no text inside a piece or a story is justified, even inside the reader prose', { skip: SKIP }, async () => {
  const story = {
    kind: 'derivation', title: 'Préstamos', steps: [0, 1, 2].map((i) => ({
      title: `Paso ${i + 1}`, narrator: 'El *borrow checker* cuenta quién lee y quién escribe, y no deja que uno escriba mientras otro lee el mismo valor.', equation: { size: 22, atoms: [{ t: 'let r = &s;', id: 'c' }] }, focus: ['c'],
      stage: { cards: { cards: CARDS.cards } },
    })),
  };
  const cases = [['lk-cards', CARDS], ['lk-memory', MEMORY], ['lk-tables', TABLES], ['lk-tables', GROUP], ['lk-venn', VENN], ['lk-story', story]];
  for (const [tag, spec] of cases) {
    const { browser, view } = await open(tag, spec, { ready: tag === 'lk-story' ? '.lk-story-stage .lk-p' : '.lk-p' });
    try {
      for (const size of [1000, 390]) {
        await view.setViewportSize({ width: size, height: 900 });
        await view.waitForTimeout(200);
        assert.deepEqual(await view.evaluate(JUSTIFIED, await view.locator(tag).first().elementHandle()), [], `${tag} · ${size}px`);
      }
    } finally { await browser.close(); }
  }
});

test('the measure reports justified text as texto-justificado', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-cards', CARDS);
  try {
    await view.evaluate(() => { document.querySelector('.lk-card-reason').style.textAlign = 'justify'; });
    const { problems } = await view.locator('lk-cards').evaluate(measurePiece);
    assert.ok(problems.some((p) => p.kind === 'texto-justificado'), JSON.stringify(problems));
  } finally { await browser.close(); }
});
