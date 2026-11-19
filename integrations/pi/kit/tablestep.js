/* lk-tablestep — a declared table transform. Plain browser JavaScript: the
   evaluator owns every operation, row, colour and connector; the spec never
   carries coordinates or expressions. */
(function (global) {
  'use strict';

  const OPS = ['filter', 'join', 'derive', 'select', 'group', 'sort'];
  const COMPARE = ['==', '!=', '>', '>=', '<', '<=', 'contains'];
  const DERIVE = ['+', '-', '×', '÷', 'days_between', 'concat'];
  const TONES = ['good', 'bad', 'warn', 'info', 'neutral'];
  const TOP_KEYS = ['title', 'subtitle', 'tables', 'steps'];
  const STEP_KEYS = {
    filter: ['op', 'table', 'condition', 'narrator', 'focus'],
    join: ['op', 'left', 'right', 'on', 'as', 'project', 'narrator', 'focus'],
    derive: ['op', 'table', 'column', 'narrator', 'focus'],
    select: ['op', 'table', 'columns', 'narrator', 'focus'],
    group: ['op', 'table', 'as', 'by', 'count', 'narrator', 'focus'],
    sort: ['op', 'table', 'by', 'direction', 'narrator', 'focus']
  };
  const PALETTE = 5;
  const DAY = 86400000;

  class TableStepSpecError extends Error {
    constructor(message) { super(message); this.name = 'TableStepSpecError'; }
  }
  const shown = (value) => {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  };
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = (value) => structuredClone(value);
  const colId = (column) => typeof column === 'string' ? column : column.id;
  const colLabel = (column) => typeof column === 'string' ? column : (column.label || column.id);
  const isKey = (column) => Boolean(column && typeof column === 'object' && column.key);
  const fkOf = (column) => column && typeof column === 'object' && column.fk ? column.fk : null;
  const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const fail = (path, value, reason) => { throw new TableStepSpecError(`${path} = ${shown(value)} — ${reason}`); };
  const liveRows = (rows) => rows.filter((row) => !row.dim);
  const columnIds = (columns) => columns.map(colId);

  function objectAt(value, path, key) {
    if (!object(value)) fail(path, value, 'expected an object');
    if (!(key in value)) fail(path, value, `missing ${key}`);
    return value[key];
  }
  function knownKeys(value, allowed, path) {
    if (!object(value)) fail(path, value, 'expected an object');
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fail(`${path}.${key}`, value[key], 'unknown key');
    }
  }
  function chipsOf(line, path) {
    for (const match of String(line).matchAll(/\[([^\]|]+)\|([^\]]+)\]/g)) {
      if (!TONES.includes(match[2])) fail(path, match[0], 'unknown tone');
    }
  }

  function compareValues(a, b) {
    const na = Number(a), nb = Number(b);
    if (String(a) !== '' && String(b) !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b), 'es');
  }
  function testCondition(cell, condition, path) {
    const value = condition.value;
    switch (condition.op) {
      case '==': return String(cell) === String(value);
      case '!=': return String(cell) !== String(value);
      case '>': return compareValues(cell, value) > 0;
      case '>=': return compareValues(cell, value) >= 0;
      case '<': return compareValues(cell, value) < 0;
      case '<=': return compareValues(cell, value) <= 0;
      case 'contains': return String(cell).includes(String(value));
      default: return fail(`${path}.op`, condition.op, 'unknown comparison');
    }
  }
  function compute(computeSpec, cells, path) {
    if (!DERIVE.includes(computeSpec && computeSpec.op)) fail(path, computeSpec && computeSpec.op, 'unknown operation');
    const args = (computeSpec.args || []).map((arg) => {
      if (arg && typeof arg === 'object' && 'value' in arg) return arg.value;
      if (typeof arg === 'string' && Object.prototype.hasOwnProperty.call(cells, arg)) return cells[arg];
      return fail(`${path}.args`, arg, 'unknown column');
    });
    switch (computeSpec.op) {
      case '+': return Number(args[0]) + Number(args[1]);
      case '-': return Number(args[0]) - Number(args[1]);
      case '×': return Number(args[0]) * Number(args[1]);
      case '÷': return Number(args[1]) === 0 ? '—' : Number(args[0]) / Number(args[1]);
      case 'days_between': return Math.round((Date.parse(args[1]) - Date.parse(args[0])) / DAY);
      case 'concat': return args.map(String).join('');
      default: return fail(path, computeSpec.op, 'unknown operation');
    }
  }

  /** Pure evaluator: one immutable snapshot per step, or a located SpecError. */
  function evaluate(spec) {
    if (!object(spec)) fail('spec', spec, 'expected an object');
    knownKeys(spec, TOP_KEYS, 'spec');
    const tablesIn = objectAt(spec, 'spec', 'tables');
    const steps = objectAt(spec, 'spec', 'steps');
    if (!Array.isArray(steps) || !steps.length) fail('spec.steps', steps, 'expected a non-empty array');
    if (spec.title !== undefined && typeof spec.title !== 'string') fail('spec.title', spec.title, 'expected a string');
    if (spec.subtitle !== undefined && typeof spec.subtitle !== 'string') fail('spec.subtitle', spec.subtitle, 'expected a string');

    const tables = {};
    for (const [name, raw] of Object.entries(tablesIn)) {
      const at = `spec.tables.${name}`;
      knownKeys(raw, ['label', 'columns', 'rows'], at);
      const columns = objectAt(raw, at, 'columns');
      const rows = objectAt(raw, at, 'rows');
      if (!Array.isArray(columns) || !Array.isArray(rows)) fail(at, raw, 'columns and rows must be arrays');
      const ids = columnIds(columns);
      const seen = new Set();
      rows.forEach((row, i) => {
        const rowAt = `${at}.rows[${i}]`;
        knownKeys(row, ['id', 'cells'], rowAt);
        if (!row.id) fail(`${rowAt}.id`, row.id, 'missing stable row id');
        if (seen.has(row.id)) fail(`${at}.rows`, row.id, 'duplicate row id');
        seen.add(row.id);
        const cells = objectAt(row, rowAt, 'cells');
        for (const [key, value] of Object.entries(cells)) {
          if (!ids.includes(key)) fail(`${rowAt}.cells.${key}`, value, 'unknown column');
        }
      });
      tables[name] = {
        name, label: raw.label || name, columns: clone(columns),
        rows: rows.map((row) => ({ id: row.id, cells: clone(row.cells), dim: false, color: null, group: null }))
      };
    }

    const snapshots = [];
    steps.forEach((step, index) => {
      const at = `spec.steps[${index}]`;
      const op = objectAt(step, at, 'op');
      if (!OPS.includes(op)) fail(`${at}.op`, op, 'unknown operation');
      knownKeys(step, STEP_KEYS[op], at);
      if (step.focus !== undefined && (typeof step.focus !== 'string' || !step.focus.trim()) &&
          !(Array.isArray(step.focus) && step.focus.length && step.focus.every((v) => typeof v === 'string' && v.trim()))) {
        fail(`${at}.focus`, step.focus, 'expected a non-empty string or array of strings');
      }
      const narrator = step.narrator === undefined ? [] : step.narrator;
      if (!Array.isArray(narrator) || narrator.some((line) => typeof line !== 'string')) {
        fail(`${at}.narrator`, narrator, 'expected an array of strings');
      }
      narrator.forEach((line, j) => chipsOf(line, `${at}.narrator[${j}]`));
      const view = { index, op, narrator, pill: '', tables: [], groups: null, connectors: [],
        unmatchedFk: [], result: null, live: 0, meta: {} };

      if (op === 'filter') {
        const name = objectAt(step, at, 'table');
        if (!tables[name]) fail(`${at}.table`, name, 'unknown table');
        const condition = objectAt(step, at, 'condition');
        knownKeys(condition, ['column', 'op', 'value'], `${at}.condition`);
        const column = objectAt(condition, `${at}.condition`, 'column');
        if (!columnIds(tables[name].columns).includes(column)) fail(`${at}.condition.column`, column, 'unknown column');
        if (!COMPARE.includes(condition.op)) fail(`${at}.condition.op`, condition.op, 'unknown comparison');
        const table = tables[name];
        table.rows = table.rows.map((row) => ({ ...row, dim: !testCondition(row.cells[column], condition, `${at}.condition`) }));
        tables[name] = table;
        const symbols = { '==': '=', '!=': '≠', '>': '>', '>=': '≥', '<': '<', '<=': '≤', contains: '∋' };
        view.pill = `${column} ${symbols[condition.op]} ${condition.value}`;
        view.tables = [table];
        view.result = table;
      }

      if (op === 'join') {
        const leftName = objectAt(step, at, 'left');
        const rightName = objectAt(step, at, 'right');
        if (!tables[leftName]) fail(`${at}.left`, leftName, 'unknown table');
        if (!tables[rightName]) fail(`${at}.right`, rightName, 'unknown table');
        const on = objectAt(step, at, 'on');
        knownKeys(on, ['fk', 'key'], `${at}.on`);
        const fk = objectAt(on, `${at}.on`, 'fk');
        const key = objectAt(on, `${at}.on`, 'key');
        if (!columnIds(tables[leftName].columns).includes(fk)) fail(`${at}.on.fk`, fk, 'unknown column in left table');
        if (!columnIds(tables[rightName].columns).includes(key)) fail(`${at}.on.key`, key, 'missing key in right table');
        const project = objectAt(step, at, 'project');
        if (!Array.isArray(project)) fail(`${at}.project`, project, 'expected an array');
        const refs = project.map((ref, i) => {
          knownKeys(ref, ['from', 'column'], `${at}.project[${i}]`);
          const from = objectAt(ref, `${at}.project[${i}]`, 'from');
          const column = objectAt(ref, `${at}.project[${i}]`, 'column');
          if (!tables[from]) fail(`${at}.project[${i}].from`, from, 'unknown table');
          if (!columnIds(tables[from].columns).includes(column)) fail(`${at}.project[${i}].column`, column, 'unknown column');
          return { from, column };
        });
        const leftIds = columnIds(tables[leftName].columns);
        const rightIds = columnIds(tables[rightName].columns);
        const leftId = leftIds.find((id) => id === 'id' && id !== fk)
          || leftIds.find((id) => id !== fk && isKey(tables[leftName].columns.find((c) => colId(c) === id)))
          || leftIds.find((id) => id !== fk) || fk;
        const descriptive = refs.find((ref) => ref.from === rightName && ref.column !== key)?.column
          || rightIds.find((id) => id !== key);
        view.joinColumns = {
          left: [...new Set([leftId, fk])],
          right: [...new Set([key, descriptive].filter(Boolean))]
        };
        const left = clone(tables[leftName]);
        const right = clone(tables[rightName]);
        const byKey = new Map();
        right.rows.forEach((row, i) => {
          const value = String(row.cells[key]);
          if (!byKey.has(value)) byKey.set(value, []);
          byKey.get(value).push({ row, i });
        });
        const used = new Set();
        const outRows = [];
        left.rows.forEach((row) => {
          const candidates = (byKey.get(String(row.cells[fk])) || []).filter((entry) => !entry.row.dim);
          if (row.dim || candidates.length === 0) {
            if (!row.dim && candidates.length === 0) view.unmatchedFk.push(row.id);
            row.dim = true;
            return;
          }
          const { row: rightRow, i } = candidates[0];
          used.add(rightRow.id);
          const color = i % PALETTE;
          row.color = color;
          rightRow.color = color;
          const cells = {};
          for (const ref of refs) {
            cells[ref.column] = tables[ref.from].rows.find((candidate) => candidate.id === row.id)?.cells[ref.column]
              ?? tables[ref.from].rows.find((candidate) => candidate.cells[key] === rightRow.cells[key])?.cells[ref.column];
          }
          outRows.push({ id: `${row.id}~${rightRow.id}`, cells, dim: false, color, group: null });
          view.connectors.push({ fkRow: row.id, keyRow: rightRow.id, color });
        });
        right.rows.forEach((row) => { if (!used.has(row.id)) row.dim = true; });
        const as = step.as || 'resultado';
        const columns = refs.map((ref) => clone(tables[ref.from].columns.find((c) => colId(c) === ref.column) || ref.column));
        tables[as] = { name: as, label: as, columns, rows: outRows };
        tables[leftName] = left;
        tables[rightName] = right;
        view.pill = `${leftName}.${fk} → ${rightName}.${key}`;
        view.tables = [left, right];
        view.connectorsMeta = { fkTable: leftName, fkColumn: fk, keyTable: rightName, keyColumn: key };
        view.result = tables[as];
      }

      if (op === 'derive') {
        const name = objectAt(step, at, 'table');
        if (!tables[name]) fail(`${at}.table`, name, 'unknown table');
        const columnSpec = objectAt(step, at, 'column');
        knownKeys(columnSpec, ['id', 'label', 'compute'], `${at}.column`);
        const id = objectAt(columnSpec, `${at}.column`, 'id');
        const computeSpec = objectAt(columnSpec, `${at}.column`, 'compute');
        if (columnIds(tables[name].columns).includes(id)) fail(`${at}.column.id`, id, 'column already exists');
        const table = clone(tables[name]);
        table.rows = table.rows.map((row) => ({ ...row, cells: { ...row.cells, [id]: compute(computeSpec, row.cells, `${at}.column.compute`) } }));
        table.columns = [...table.columns, columnSpec];
        tables[name] = table;
        const label = columnSpec.label || id;
        const args = (computeSpec.args || []).map((arg) => typeof arg === 'object' && 'value' in arg ? arg.value : arg).join(', ');
        view.pill = `${label} = ${computeSpec.op}(${args})`;
        view.tables = [table];
        view.result = table;
      }

      if (op === 'select') {
        const name = objectAt(step, at, 'table');
        if (!tables[name]) fail(`${at}.table`, name, 'unknown table');
        const wanted = objectAt(step, at, 'columns');
        if (!Array.isArray(wanted)) fail(`${at}.columns`, wanted, 'expected an array');
        const ids = columnIds(tables[name].columns);
        wanted.forEach((column, i) => {
          if (!ids.includes(column)) fail(`${at}.columns[${i}]`, column, 'unknown column');
        });
        const table = clone(tables[name]);
        table.columns = wanted.map((id) => clone(table.columns.find((c) => colId(c) === id)));
        table.rows = table.rows.map((row) => {
          const cells = {};
          wanted.forEach((id) => { cells[id] = row.cells[id]; });
          return { ...row, cells };
        });
        tables[name] = table;
        view.pill = `SELECT ${wanted.join(', ')}`;
        view.tables = [table];
        view.result = table;
      }

      if (op === 'group') {
        const name = objectAt(step, at, 'table');
        if (!tables[name]) fail(`${at}.table`, name, 'unknown table');
        const by = objectAt(step, at, 'by');
        const count = step.count || 'n';
        const ids = columnIds(tables[name].columns);
        if (!ids.includes(by)) fail(`${at}.by`, by, 'unknown column');
        if (ids.includes(count)) fail(`${at}.count`, count, 'count column already exists');
        const table = clone(tables[name]);
        const buckets = new Map();
        table.rows.forEach((row) => {
          if (row.dim) return;
          const key = String(row.cells[by]);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(row);
        });
        const groups = [], flat = [];
        buckets.forEach((rows, key) => {
          const color = groups.length % PALETTE;
          const members = rows.map((row) => ({ ...row, color, group: key, cells: { ...row.cells, [count]: rows.length } }));
          groups.push({ key, rows: members, count: rows.length, color });
          flat.push(...members);
        });
        table.rows = flat;
        table.columns = [...table.columns, { id: count, label: count }];
        const as = step.as || 'agrupado';
        tables[as] = table;
        view.groups = groups;
        view.pill = `GROUP BY ${by} · COUNT → ${count}`;
        view.result = table;
      }

      if (op === 'sort') {
        const name = objectAt(step, at, 'table');
        if (!tables[name]) fail(`${at}.table`, name, 'unknown table');
        const by = objectAt(step, at, 'by');
        const direction = step.direction || 'asc';
        const ids = columnIds(tables[name].columns);
        if (!ids.includes(by)) fail(`${at}.by`, by, 'unknown column');
        if (!['asc', 'desc'].includes(direction)) fail(`${at}.direction`, direction, 'unknown direction');
        const table = clone(tables[name]);
        table.rows.sort((a, b) => compareValues(a.cells[by], b.cells[by]) * (direction === 'desc' ? -1 : 1));
        tables[name] = table;
        if (table.rows.some((row) => row.group !== null && row.group !== undefined)) {
          const order = [];
          table.rows.forEach((row) => { if (!order.includes(row.group)) order.push(row.group); });
          view.groups = order.map((key) => {
            const rows = table.rows.filter((row) => row.group === key);
            return { key, rows, count: rows.length, color: rows[0].color };
          });
        }
        view.pill = `ORDER BY ${by} ${direction === 'desc' ? '↓' : '↑'}`;
        view.tables = view.groups ? [] : [table];
        view.result = table;
      }

      view.live = liveRows(view.result.rows).length;
      view.meta.title = spec.title || 'Transformación de tablas';
      view.meta.subtitle = spec.subtitle || '';
      snapshots.push(view);
    });
    return { snapshots, tables };
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /* Every interpolated value in the template below passes through esc(), so the
     markup is static plus escaped text. Parse it into a detached document and
     import the nodes rather than writing to innerHTML. */
  function fillFromMarkup(node, markup) {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    node.replaceChildren(...[...parsed.body.childNodes].map((child) => document.importNode(child, true)));
  }

  const focusHints = (step) => step && step.focus !== undefined
    ? (Array.isArray(step.focus) ? step.focus : [step.focus]).filter((v) => typeof v === 'string' && v.trim())
    : [];

  function markRow(mount, id, tone) {
    const row = [...mount.querySelectorAll('tr[data-row-id]')].find((node) => node.dataset.rowId === String(id));
    if (row) row.dataset.tone = tone;
  }
  function markHeader(mount, column) {
    if (!column) return;
    for (const cell of mount.querySelectorAll(`thead th[data-col="${CSS.escape(String(column))}"]`)) {
      cell.dataset.headerFocus = column;
    }
  }

  function applyFocus(mount, view, spec) {
    const step = spec.steps[view.index];
    if (view.op === 'filter' || view.op === 'join') {
      const rows = view.op === 'filter' ? view.tables[0].rows : view.tables.flatMap((table) => table.rows);
      rows.forEach((row) => { if (row.dim !== undefined) markRow(mount, row.id, row.dim ? 'red' : 'green'); });
      if (view.op === 'join' && view.connectorsMeta) {
        const panes = mount.querySelectorAll('.lk-ts-join-grid .lk-ts-tablewrap');
        const fk = view.connectorsMeta.fkColumn, key = view.connectorsMeta.keyColumn;
        const left = panes[0]?.querySelector(`thead th[data-col="${CSS.escape(String(fk))}"]`);
        const right = panes[1]?.querySelector(`thead th[data-col="${CSS.escape(String(key))}"]`);
        if (left) left.dataset.headerFocus = fk;
        if (right) right.dataset.headerFocus = key;
      }
    } else if (view.op === 'derive') markHeader(mount, colId(view.result.columns.at(-1)));
    else if (view.op === 'select') view.result.columns.forEach((column) => markHeader(mount, colId(column)));
    else if (view.op === 'group') markHeader(mount, step.count || 'n');
    else if (view.op === 'sort') markHeader(mount, step.by);

    for (const hint of focusHints(step)) {
      const row = [...mount.querySelectorAll('tr[data-row-id]')].find((node) =>
        node.dataset.rowId === hint || node.textContent.includes(hint));
      if (row) { if (!row.dataset.tone) row.dataset.tone = 'blue'; continue; }
      for (const cell of mount.querySelectorAll('[data-col], [data-group]')) {
        if (cell.dataset.col === hint || cell.dataset.group === hint || cell.textContent.trim() === hint) {
          cell.dataset.headerFocus = hint;
        }
      }
    }
  }

  function drawFocusBlocks(view, host) {
    host.querySelectorAll('.lk-ts-focus-block').forEach((node) => node.remove());
    const blockAt = (pane, nodes, tone, key, value, padX = 3, padY = 4) => {
      if (!pane || !nodes.length) return;
      const box = pane.getBoundingClientRect();
      const rects = nodes.map((node) => node.getBoundingClientRect());
      const top = Math.max(2, Math.min(...rects.map((r) => r.top)) - box.top - padY);
      const bottom = Math.min(box.height - 2, Math.max(...rects.map((r) => r.bottom)) - box.top + padY);
      const left = Math.max(2, Math.min(...rects.map((r) => r.left)) - box.left - padX);
      const right = Math.min(box.width - 2, Math.max(...rects.map((r) => r.right)) - box.left + padX);
      if (bottom <= top || right <= left) return;
      const block = el('div', 'lk-ts-focus-block');
      block.dataset.focus = tone;
      block.dataset[key] = value;
      block.style.left = `${left.toFixed(2)}px`;
      block.style.top = `${top.toFixed(2)}px`;
      block.style.width = `${(right - left).toFixed(2)}px`;
      block.style.height = `${(bottom - top).toFixed(2)}px`;
      pane.append(block);
    };
    if (view.op === 'filter') {
      host.querySelectorAll('.lk-ts-tablewrap').forEach((pane) => {
        let run = [];
        const flush = () => {
          if (run.length) blockAt(pane, run, 'green', 'rows', run.map((row) => row.dataset.rowId).join(','));
          run = [];
        };
        pane.querySelectorAll('tbody tr[data-tone="green"]').forEach((row) => {
          if (run.length && row.previousElementSibling !== run.at(-1)) flush();
          run.push(row);
        });
        flush();
      });
      return;
    }
    let headers = [...host.querySelectorAll('[data-header-focus]')];
    if (!headers.length) return;
    if (view.op === 'join') {
      headers.forEach((cell) => blockAt(cell.closest('.lk-ts-tablewrap'), [cell], 'blue', 'cols', cell.dataset.headerFocus, 1, 2));
      return;
    }
    if (view.op === 'group' || view.op === 'sort') headers = headers.slice(0, 1);
    blockAt(host.querySelector('.lk-ts-stage-area'), headers, 'blue', 'cols',
      [...new Set(headers.map((cell) => cell.dataset.headerFocus))].join(','), 1);
  }

  function captionHTML(lines) {
    return lines.map((line) => {
      const parts = String(line).split(/(\[[^\]]+\])/g);
      return `<p class="lk-ts-line" data-check-text>${parts.map((part) => {
        const chip = /^\[([^\]|]+)\|([a-z]+)\]$/.exec(part);
        if (chip) return `<span class="lk-ts-chip tone-${chip[2]}">${esc(chip[1])}</span>`;
        return esc(part);
      }).join('')}</p>`;
    }).join('');
  }
  const formatCell = (value) => value === null || value === undefined ? '—'
    : typeof value === 'number' ? String(value) : esc(value);

  function tableHTML(table, role, isResult, fkLast, only) {
    const source = only ? table.columns.filter((column) => only.includes(colId(column))) : table.columns;
    const displayed = fkLast
      ? source.slice().sort((a, b) => Number(colId(a) === fkLast) - Number(colId(b) === fkLast))
      : source;
    const cells = displayed.map(colId);
    const head = displayed.map((column) => {
      const marks = isKey(column) ? ' <span class="lk-ts-mark">KEY</span>' : '';
      const fk = fkOf(column) ? ` <span class="lk-ts-mark" title="${esc(fkOf(column))}">FK</span>` : '';
      return `<th scope="col" data-col="${esc(colId(column))}" data-check-text>${esc(colLabel(column))}${marks}${fk}</th>`;
    }).join('');
    const body = table.rows.map((row, i) => {
      const attrs = [
        `data-row-id="${esc(row.id)}"`, `data-dim="${row.dim ? 'true' : 'false'}"`,
        `data-result-row="${isResult ? 'true' : 'false'}"`,
        row.color === null ? '' : `data-color="${row.color % PALETTE}"`
      ].filter(Boolean).join(' ');
      const tds = cells.map((column) => {
        const address = role ? `data-cell="${esc(table.name)}:${esc(row.id)}:${esc(column)}"` : '';
        return `<td ${address} data-col="${esc(column)}" data-check-text>${formatCell(row.cells[column])}</td>`;
      }).join('');
      return `<tr ${attrs}><th class="lk-ts-rownum" scope="row">${i + 1}</th>${tds}</tr>`;
    }).join('');
    return `<div class="lk-ts-tablewrap" data-table="${esc(table.name)}">
      <div class="lk-ts-tablecap" data-check-text>${esc(table.label)}<span>${isResult ? `${liveRows(table.rows).length} filas · ` : ''}${cells.length} col.</span></div>
      <table class="lk-ts-grid"><thead><tr><th class="lk-ts-rownum"></th>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>`;
  }

  function groupsHTML(groups, columns, countName) {
    return `<div class="lk-ts-groups">${groups.map((group) => `
      <section class="lk-ts-group lk-ts-pair-${group.color % PALETTE}" data-group="${esc(group.key)}" data-color="${group.color % PALETTE}">
        <header class="lk-ts-group-head">
          <span class="lk-ts-group-swatch"></span>
          <strong data-check-text>${esc(group.key)}</strong>
          <span class="lk-ts-group-count" data-check-text>${group.count} ${esc(group.count === 1 ? countName.replace(/s$/, '') : countName)}</span>
        </header>
        ${tableHTML({ name: `g${group.color}`, label: '', columns, rows: group.rows }, null, true)}
      </section>`).join('')}</div>`;
  }
  function resultHTML(view) {
    const rows = liveRows(view.result.rows);
    const first = view.result.columns[0] ? colId(view.result.columns[0]) : '';
    const sample = rows.slice(0, 8).map((row) => {
      const value = row.cells[first] ?? row.group ?? row.id;
      return `<span class="lk-ts-result-item${row.color === null ? '' : ` lk-ts-pair-${row.color % PALETTE}`}" data-check-text>${esc(value)}</span>`;
    }).join('');
    return `<div class="lk-ts-result">
      <div class="lk-ts-result-head"><span class="lk-ts-kicker">Resultado</span>
        <span class="lk-ts-rowbadge" data-check-text>«${view.live} filas»</span></div>
      <div class="lk-ts-result-items">${sample}${rows.length > 8 ? `<span class="lk-ts-result-more" data-check-text>+${rows.length - 8}</span>` : ''}</div>
    </div>`;
  }
  function bodyHTML(view, total) {
    let stage;
    if (view.op === 'join') {
      stage = `<div class="lk-ts-join" data-fk-table="${esc(view.connectorsMeta.fkTable)}" data-fk-column="${esc(view.connectorsMeta.fkColumn)}" data-key-table="${esc(view.connectorsMeta.keyTable)}" data-key-column="${esc(view.connectorsMeta.keyColumn)}">
        <div class="lk-ts-join-grid">${view.tables.map((table, i) => tableHTML(table, 'connector', false,
          i === 0 ? view.connectorsMeta.fkColumn : null,
          i === 0 ? view.joinColumns.left : view.joinColumns.right)).join('')}</div>
        <svg class="lk-ts-connectors" aria-hidden="true"></svg>
        <div class="lk-ts-join-result">${tableHTML(view.result, null, true)}</div>
      </div>`;
    } else if (view.groups) {
      const columns = view.result.columns.length ? view.result.columns : [];
      stage = groupsHTML(view.groups, columns, 'filas');
    } else {
      stage = `<div class="lk-ts-tables">${view.tables.map((table) => tableHTML(table, null, view.op !== 'join')).join('')}</div>`;
    }
    return `<header class="lk-ts-head">
        <div class="lk-ts-head-top"><span class="lk-ts-led"></span><span>${esc(view.meta.title)}</span>
          <span class="lk-ts-head-right">${esc(view.op)} · ${view.index + 1}/${total}</span></div>
        <div class="lk-ts-pillrow"><span class="lk-ts-pill" data-check-text>${esc(view.pill)}</span></div>
      </header>
      <div class="lk-ts-stage-area">${stage}${resultHTML(view)}</div>
      <div class="lk-ts-caption"><div class="lk-ts-lines">${captionHTML(view.narrator)}</div></div>
      <div class="lk-ts-player">
        <div class="lk-ts-buttons">
          <button class="lk-ts-btn" type="button" data-action="prev" aria-label="Paso anterior" ${view.index === 0 ? 'disabled' : ''}>‹</button>
          <button class="lk-ts-btn is-play" type="button" data-action="next" aria-label="Paso siguiente" ${view.index === total - 1 ? 'disabled' : ''}>SIGUIENTE</button>
        </div>
        <div class="lk-ts-segments" role="tablist" aria-label="Pasos">${Array.from({ length: total }, (_, i) =>
          `<button class="lk-ts-segment${i === view.index ? ' is-current' : ''}${i < view.index ? ' is-past' : ''}" type="button" role="tab" aria-label="Paso ${i + 1}" aria-selected="${i === view.index}" data-index="${i}"></button>`).join('')}</div>
        <span class="lk-ts-count">${view.index + 1}/${total}</span>
      </div>`;
  }

  /** Mount one validated spec into one element, with its own player state. */
  function mount(host, spec) {
    const evaluated = evaluate(spec);
    const state = { host, spec: clone(spec), evaluated, index: 0 };
    const scripts = [...host.querySelectorAll(':scope > script')];
    host.dataset.error = 'false';
    host.dataset.settled = 'true';
    if (!host.hasAttribute('tabindex')) host.tabIndex = 0;

    function connectors() {
      const wrap = host.querySelector('.lk-ts-join');
      if (!wrap) return;
      const svg = wrap.querySelector('.lk-ts-connectors');
      const view = evaluated.snapshots[state.index];
      svg.replaceChildren();
      const rect = svg.getBoundingClientRect();
      const tables = [...wrap.querySelectorAll('.lk-ts-join-grid .lk-ts-tablewrap')];
      if (!tables.length) return;
      const leftEdge = tables[0].getBoundingClientRect().right - rect.left;
      const rightEdge = tables[1].getBoundingClientRect().left - rect.left;
      const rowY = (cell) => {
        const r = cell.closest('tr').getBoundingClientRect();
        return r.top + r.height / 2 - rect.top;
      };
      const meta = view.connectorsMeta;
      for (const connector of view.connectors) {
        const fkCell = host.querySelector(`[data-cell="${meta.fkTable}:${connector.fkRow}:${meta.fkColumn}"]`);
        const keyCell = host.querySelector(`[data-cell="${meta.keyTable}:${connector.keyRow}:${meta.keyColumn}"]`);
        if (!fkCell || !keyCell) continue;
        const y0 = rowY(fkCell), y1 = rowY(keyCell);
        const bend = Math.max(8, (rightEdge - leftEdge) * 0.42);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', `lk-ts-connector-dot lk-ts-pair-${connector.color % PALETTE}`);
        circle.setAttribute('cx', (fkCell.getBoundingClientRect().right - 5 - rect.left).toFixed(2));
        circle.setAttribute('cy', y0.toFixed(2));
        circle.setAttribute('r', '3');
        svg.append(circle);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', `lk-ts-connector lk-ts-pair-${connector.color % PALETTE}`);
        path.setAttribute('d', `M ${leftEdge.toFixed(2)} ${y0.toFixed(2)} C ${(leftEdge + bend).toFixed(2)} ${y0.toFixed(2)}, ${(rightEdge - bend).toFixed(2)} ${y1.toFixed(2)}, ${rightEdge.toFixed(2)} ${y1.toFixed(2)}`);
        path.dataset.fkRow = connector.fkRow;
        path.dataset.keyRow = connector.keyRow;
        svg.append(path);
      }
      for (const rowId of view.unmatchedFk) {
        const cell = host.querySelector(`[data-cell="${meta.fkTable}:${rowId}:${meta.fkColumn}"]`);
        if (!cell) continue;
        const y = rowY(cell);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'lk-ts-stub');
        path.setAttribute('d', `M ${leftEdge.toFixed(2)} ${y.toFixed(2)} C ${(leftEdge + 6).toFixed(2)} ${y.toFixed(2)}, ${(leftEdge + 12).toFixed(2)} ${y.toFixed(2)}, ${(leftEdge + 18).toFixed(2)} ${y.toFixed(2)}`);
        svg.append(path);
        const cross = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        cross.setAttribute('class', 'lk-ts-stub-cross');
        cross.setAttribute('x', (leftEdge + 24).toFixed(2));
        cross.setAttribute('y', (y + 4).toFixed(2));
        cross.textContent = '✗';
        svg.append(cross);
      }
    }

    function draw() {
      const view = evaluated.snapshots[state.index];
      host.innerHTML = '';
      const wrapper = el('div', 'lk-ts-figure');
      fillFromMarkup(wrapper, bodyHTML(view, evaluated.snapshots.length));
      host.append(...scripts, wrapper);
      host.dataset.step = String(state.index + 1);
      applyFocus(wrapper, view, spec);
      drawFocusBlocks(view, wrapper);
      connectors();
      wrapper.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', () => api.goTo(state.index + (button.dataset.action === 'prev' ? -1 : 1)));
      });
      wrapper.querySelectorAll('[data-index]').forEach((button) => {
        button.addEventListener('click', () => api.goTo(Number(button.dataset.index)));
      });
      host.dataset.settled = 'false';
      requestAnimationFrame(() => {
        connectors();
        drawFocusBlocks(view, wrapper);
        host.dataset.settled = 'true';
      });
    }

    const api = {
      goTo(index) {
        const target = Math.max(0, Math.min(evaluated.snapshots.length - 1, index));
        if (target === state.index) return;
        state.index = target;
        draw();
      },
      get index() { return state.index; },
      state() {
        const view = evaluated.snapshots[state.index];
        return { index: state.index, op: view.op, pill: view.pill, live: view.live, connectors: clone(view.connectors) };
      }
    };
    host.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); api.goTo(state.index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); api.goTo(state.index - 1); }
    });
    draw();
    return api;
  }

  const api = { evaluate, mount, TableStepSpecError, OPS, COMPARE, DERIVE };
  global.lkTableStep = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (global.customElements && !global.customElements.get('lk-tablestep')) {
    global.customElements.define('lk-tablestep', class extends HTMLElement {
      connectedCallback() {
        if (this.ready) return;
        this.ready = true;
        Promise.resolve().then(() => {
          const script = this.querySelector(':scope > script[type="application/json"]');
          if (!script) throw new TableStepSpecError('spec = undefined — expected an inline JSON script');
          let raw;
          try { raw = JSON.parse(script.textContent); }
          catch (error) { throw new TableStepSpecError(`spec = ${shown(script.textContent)} — invalid JSON: ${error.message}`); }
          mount(this, raw);
          this.dataset.ready = 'true';
        }).catch((error) => {
          const message = error instanceof TableStepSpecError ? error.message
            : `spec = undefined — ${String(error && error.message || error)}`;
          const panel = el('div', 'lk-ts-error');
          panel.setAttribute('role', 'alert');
          panel.append(el('strong', '', 'Error de spec'), el('code', '', message));
          this.replaceChildren(panel);
          this.dataset.error = 'true';
          this.dataset.ready = 'error';
        });
      }
    });
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
