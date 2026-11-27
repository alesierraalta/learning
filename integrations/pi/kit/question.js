/* Question text (#332): the one renderer for what a question says, in the reader, the kit and the studio.
   A question is prose that may hold a fence (```lang) whose lines are kept and highlighted, `code` inline, $…$ or $$…$$
   that KaTeX draws, **bold**, *italic* or _italic_, and `- ` or `1. ` lists as real elements. Everything else is text.
   Nothing a question says reaches innerHTML: markup the tutor writes reads as written. A pieza (codigo, salida, katex)
   draws the same way. No side effects. */
window.lkQuestion = (() => {
  // The highlighter's families: each language a fence or a pieza may name reads the words of one family.
  const FAMILY = {
    sql: 'sql', plsql: 'sql', 'pl/sql': 'sql', 'pl-sql': 'sql', oracle: 'sql',
    python: 'python', py: 'python', rust: 'rust', rs: 'rust',
    js: 'js', javascript: 'js', ts: 'js', typescript: 'js', jsx: 'js',
  };
  const WORDS = {
    sql: 'select from where insert into values update set delete create replace drop alter table index join inner left right outer on group order by having union and or not null is in as between like distinct limit case when then else end begin declare exception loop for while if elsif return procedure function package body commit rollback',
    python: 'def class return if elif else for while in import from as with try except finally raise lambda pass break continue yield async await None True False and or not is',
    rust: 'fn let mut pub struct enum impl trait use mod match if else for while loop return self Self crate super where as ref move const static type unsafe async await dyn true false in',
    js: 'const let var function return if else for while do switch case break continue new class extends import export from async await try catch finally throw typeof instanceof this null undefined true false of in yield',
  };
  const KEYWORDS = Object.fromEntries(Object.entries(WORDS).map(([family, list]) => [family, new Set(list.split(' '))]));
  // Sticky patterns, tried in order at each position: a comment, a string, a number, then a word.
  const RULES = {
    sql: [['com', /--[^\n]*|\/\*[\s\S]*?\*\//y], ['str', /'(?:[^']|'')*'/y], ['num', /\d+(?:\.\d+)?/y], ['word', /[A-Za-z_][A-Za-z0-9_$]*/y]],
    python: [['com', /#[^\n]*/y], ['str', /'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/y], ['num', /\d+(?:\.\d+)?/y], ['word', /[A-Za-z_]\w*/y]],
    rust: [['com', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y], ['str', /"(?:\\.|[^"\\])*"/y], ['num', /\d+(?:\.\d+)?/y], ['word', /[A-Za-z_]\w*/y]],
    js: [['com', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y], ['str', /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/y], ['num', /\d+(?:\.\d+)?/y], ['word', /[A-Za-z_$][\w$]*/y]],
  };
  const SAFE_LANGUAGE = /^[\w+#./-]{1,20}$/;
  // Inline, read in the order written: `code`; \$ (a dollar that is only a dollar); $$display$$; $inline$; **bold**;
  // *italic* and _italic_. An asterisk or an underscore inside a word (PA_Reportes, 2*3) is text, not emphasis.
  const INLINE = /`([^`\n]+)`|\\\$|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\*\*(?=[^\s*])([^*\n]+?)\*\*|(?<![\p{L}\p{N}*])\*(?![\s*])([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?![\s_])([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}_])/gu;
  // A fence opens with three backticks or tildes. A backtick fence's info string holds no backtick: "```x```" is inline code.
  const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/;
  // A list item: a dash, or a number and a dot, indented by up to three spaces.
  const ITEM = /^[ \t]{0,3}(?:-|(\d{1,9})\.)[ \t]+(.*)$/;
  const KATEX = {
    css: ['https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css', 'sha384-5TcZemv2l/9On385z///+d7MSYlvIEw9FuZTIdZ14vJLqWphw7e7ZPuOiCHJcFCP'],
    js: ['https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js', 'sha384-cMkvdD8LoxVzGF/RPUKAcvmm49FQ0oxwDF3BGKtDXcEc+T1b2N+teh/OJfpU0jr6'],
  };

  /** The tokens of a piece of code: `{ text, kind }`, where kind is kw, str, com, num, or '' for plain text. */
  function highlight(code, lang) {
    const family = FAMILY[String(lang || '').trim().toLowerCase()];
    if (!family) return [{ text: code, kind: '' }];
    const tokens = [];
    let plain = '';
    let at = 0;
    while (at < code.length) {
      let hit = null;
      for (const [kind, pattern] of RULES[family]) {
        pattern.lastIndex = at;
        const match = pattern.exec(code);
        if (match && match[0].length) { hit = [kind, match[0]]; break; }
      }
      if (!hit) { plain += code[at]; at += 1; continue; }
      if (plain) { tokens.push({ text: plain, kind: '' }); plain = ''; }
      const [kind, text] = hit;
      const keyword = kind === 'word' && KEYWORDS[family].has(family === 'sql' ? text.toLowerCase() : text);
      tokens.push({ text, kind: keyword ? 'kw' : kind === 'word' ? '' : kind });
      at += text.length;
    }
    if (plain) tokens.push({ text: plain, kind: '' });
    return tokens;
  }

  // A fence that opens on line i: its block, and the index of the line that closes it. A fence left open runs to the end.
  function fenceAt(lines, i) {
    const open = FENCE.exec(lines[i]);
    if (!open || (open[1][0] === '`' && open[2].includes('`'))) return null;
    // A fence closes on a line of its own marker, at least as long.
    const close = new RegExp(`^[ \\t]*${open[1][0]}{${open[1].length},}[ \\t]*$`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end])) end += 1;
    const block = { kind: 'block', lang: open[2].trim().split(/\s+/)[0], value: lines.slice(i + 1, end).join('\n') };
    return { block, end };
  }

  /** The blocks of a question's text: `block` (a fence), `list` (its items) or `text` (prose). Never HTML. */
  function parse(text) {
    const lines = String(text ?? '').split('\n');
    const blocks = [];
    let prose = [];
    let list = null;
    const endProse = () => {
      if (prose.length) blocks.push({ kind: 'text', value: prose.join('\n') });
      prose = [];
    };
    const endList = () => {
      if (list) blocks.push(list);
      list = null;
    };
    for (let i = 0; i < lines.length; i += 1) {
      const fence = fenceAt(lines, i);
      if (fence) {
        endProse();
        endList();
        blocks.push(fence.block);
        i = fence.end;
        continue;
      }
      const item = ITEM.exec(lines[i]);
      if (item) {
        endProse();
        const ordered = item[1] !== undefined;
        if (!list || list.ordered !== ordered) {
          endList();
          list = { kind: 'list', ordered, start: ordered ? Number(item[1]) : 1, items: [] };
        }
        list.items.push(item[2]);
      } else if (!(list && lines[i].trim() === '')) {
        // A blank line between two items keeps one list; any other line ends it.
        endList();
        prose.push(lines[i]);
      }
    }
    endProse();
    endList();
    return blocks;
  }

  // The segment one INLINE match stands for: the escaped dollar, code, a formula, or emphasis around inner text.
  function segmentOf([whole, code, display, math, bold, starred, underscored]) {
    if (whole === '\\$') return { kind: 'text', value: '$' };
    if (code !== undefined) return { kind: 'code', value: code };
    if (display !== undefined) return { kind: 'math', tex: display, display: true };
    if (math !== undefined) return { kind: 'math', tex: math, display: false };
    if (bold !== undefined) return { kind: 'strong', children: inline(bold) };
    return { kind: 'em', children: inline(starred ?? underscored) };
  }

  function inline(text) {
    const segments = [];
    let last = 0;
    for (const match of text.matchAll(INLINE)) {
      if (match.index > last) segments.push({ kind: 'text', value: text.slice(last, match.index) });
      segments.push(segmentOf(match));
      last = match.index + match[0].length;
    }
    if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) });
    return segments;
  }

  // One KaTeX for the page: its own copy when it has one, else the pinned CDN build, or the saved copy's bytes.
  let katexRequest = null;
  function asset(url, integrity, css) {
    const saved = window.learningOffline?.[url];
    return new Promise((resolve, reject) => {
      if (saved !== undefined) {
        const inlined = document.createElement(css ? 'style' : 'script');
        inlined.textContent = saved;
        document.head.append(inlined);
        return resolve();
      }
      const node = document.createElement(css ? 'link' : 'script');
      if (css) { node.rel = 'stylesheet'; node.href = url; } else node.src = url;
      node.integrity = integrity;
      node.crossOrigin = 'anonymous';
      node.onload = () => resolve();
      node.onerror = () => reject(new Error('No se pudo cargar KaTeX'));
      document.head.append(node);
    });
  }
  function katex() {
    if (window.katex) return Promise.resolve(window.katex);
    katexRequest ??= Promise.all([asset(...KATEX.css, true), asset(...KATEX.js, false)]).then(() => window.katex);
    return katexRequest;
  }

  // The source stays on the page until KaTeX draws it: without KaTeX a formula reads as written.
  function formula(tex, display) {
    const host = document.createElement(display ? 'div' : 'span');
    host.className = display ? 'lk-q-math lk-q-display' : 'lk-q-math';
    host.textContent = display ? `$$${tex}$$` : `$${tex}$`;
    const draw = (lib) => {
      try { lib.render(tex, host, { displayMode: display, throwOnError: false }); } catch { /* the source stays */ }
    };
    if (window.katex) draw(window.katex);
    else katex().then(draw, () => {});
    return host;
  }

  function codeBlock(code, lang) {
    const pre = document.createElement('pre');
    pre.className = 'lk-q-pre';
    const node = document.createElement('code');
    const name = SAFE_LANGUAGE.test(String(lang || '')) ? String(lang).toLowerCase() : '';
    if (name) node.className = `language-${name}`;
    for (const token of highlight(code, name)) {
      if (!token.kind) { node.append(token.text); continue; }
      const span = document.createElement('span');
      span.className = `lk-tok-${token.kind}`;
      span.textContent = token.text;
      node.append(span);
    }
    pre.append(node);
    return pre;
  }

  // Prose keeps its line breaks as breaks: each line is a text node, never markup.
  function writeText(node, value) {
    value.split('\n').forEach((line, index) => {
      if (index) node.append(document.createElement('br'));
      if (line) node.append(line);
    });
  }

  function appendInline(node, segments) {
    for (const segment of segments) {
      if (segment.kind === 'text') writeText(node, segment.value);
      else if (segment.kind === 'code') {
        const code = document.createElement('code');
        code.className = 'lk-q-code';
        code.textContent = segment.value;
        node.append(code);
      } else if (segment.kind === 'math') node.append(formula(segment.tex, segment.display));
      else {
        const emphasis = document.createElement(segment.kind === 'strong' ? 'strong' : 'em');
        appendInline(emphasis, segment.children);
        node.append(emphasis);
      }
    }
  }

  function listBlock(block) {
    const list = document.createElement(block.ordered ? 'ol' : 'ul');
    list.className = 'lk-q-list';
    if (block.ordered && block.start !== 1) list.start = block.start;
    for (const item of block.items) {
      const li = document.createElement('li');
      appendInline(li, inline(item));
      list.append(li);
    }
    return list;
  }

  let styled = false;
  function ensureStyle() {
    if (styled) return;
    styled = true;
    const style = document.createElement('style');
    style.id = 'lk-question-style';
    style.textContent = STYLE;
    (document.head || document.documentElement).append(style);
  }

  /** Draws a question's text into `node`, after its existing children. */
  function render(node, value) {
    ensureStyle();
    for (const block of parse(value)) {
      if (block.kind === 'block') node.append(codeBlock(block.value, block.lang));
      else if (block.kind === 'list') node.append(listBlock(block));
      else appendInline(node, inline(block.value));
    }
    return node;
  }

  /** Draws a pieza the renderer knows (codigo, salida, katex). Any other tipo is left to its own drawing. */
  function pieza(node, piece) {
    if (!piece || typeof piece.contenido !== 'string') return false;
    ensureStyle();
    if (piece.tipo === 'codigo') node.append(codeBlock(piece.contenido, piece.lenguaje));
    else if (piece.tipo === 'salida') node.append(codeBlock(piece.contenido, ''));
    else if (piece.tipo === 'katex') node.append(formula(piece.contenido.trim(), true));
    else return false;
    return true;
  }

  const STYLE = `
.lk-q-pre { margin: .5em 0; padding: .6em .8em; overflow-x: auto; max-width: 100%; white-space: pre; text-align: left; font: .86em/1.5 ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace; color: #1f2328; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; }
.lk-q-pre code { font: inherit; white-space: inherit; background: none; padding: 0; }
.lk-q-code { font: .9em ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace; background: #f6f8fa; border-radius: 4px; padding: .05em .3em; }
.lk-q-display { display: block; overflow-x: auto; margin: .4em 0; }
.lk-q-list { margin: .3em 0 .3em 1.6em; padding: 0; }
.lk-q-list li { margin: .15em 0; }
.lk-open-verdict { margin: .6em 0; padding: .5em .7em; border-left: 3px solid #6e7781; background: #f6f8fa; border-radius: 4px; }
.lk-open-correct { border-color: #1a7f37; }
.lk-open-partial { border-color: #9a6700; }
.lk-open-incorrect, .lk-open-no-evidence { border-color: #cf222e; }
.lk-open-verdict blockquote { margin: .3em 0; padding-left: .6em; border-left: 2px solid currentColor; }
.lk-open-verdict .lk-open-criteria { margin: .2em 0 .2em 1.2em; padding: 0; }
.lk-open-verdict .lk-open-next { font-weight: 600; }
:root[data-theme="dark"] .lk-open-verdict, :root[data-theme="black"] .lk-open-verdict { background: #161b22; }
.lk-tok-kw { color: #cf222e; font-weight: 600; }
.lk-tok-str { color: #0a3069; }
.lk-tok-com { color: #6e7781; font-style: italic; }
.lk-tok-num { color: #0550ae; }
:root[data-theme="dark"] .lk-q-pre, :root[data-theme="dark"] .lk-q-code { color: #e6edf3; background: #161b22; border-color: #30363d; }
:root[data-theme="dark"] .lk-tok-kw { color: #ff7b72; }
:root[data-theme="dark"] .lk-tok-str { color: #a5d6ff; }
:root[data-theme="dark"] .lk-tok-com { color: #8b949e; }
:root[data-theme="dark"] .lk-tok-num { color: #79c0ff; }
:root[data-theme="black"] .lk-q-pre, :root[data-theme="black"] .lk-q-code { color: #e6e6e6; background: #000; border-color: #2f2f2f; }
:root[data-theme="black"] .lk-tok-kw { color: #ff7b72; }
:root[data-theme="black"] .lk-tok-str { color: #a5d6ff; }
:root[data-theme="black"] .lk-tok-com { color: #9a9a9a; }
:root[data-theme="black"] .lk-tok-num { color: #79c0ff; }`;

  const VERDICT_LABELS = { pending: 'Pendiente del veredicto', correct: 'Correcto', partial: 'Parcial', incorrect: 'Incorrecto', 'no-evidence': 'Sin evidencia' };
  /** One renderer for the tutor's verdict in the reader, the kit and the studio. Only quoted text is shown. */
  function feedback(node, item) {
    if (!item || typeof item !== 'object' || !node) return null;
    const box = document.createElement('div');
    box.className = `lk-open-verdict lk-open-${String(item.verdict || 'pending').replace(/[^a-z-]/g, '')}`;
    const label = document.createElement('p');
    label.className = 'lk-open-state';
    label.textContent = VERDICT_LABELS[item.verdict] || String(item.verdict || 'Pendiente del veredicto');
    box.append(label);
    if (item.evidence) {
      const quote = document.createElement('blockquote');
      quote.textContent = `«${item.evidence}»`;
      box.append(quote);
    }
    if (Array.isArray(item.criteria) && item.criteria.length) {
      const list = document.createElement('ul');
      list.className = 'lk-open-criteria';
      for (const criterion of item.criteria) {
        const row = document.createElement('li');
        row.textContent = `${criterion.met ? '✔' : '✘'} ${criterion.id}: ${criterion.evidence}`;
        list.append(row);
      }
      box.append(list);
    }
    if (item.explanation) {
      const line = document.createElement('p');
      line.textContent = `Explicación: ${VERDICT_LABELS[item.explanation.verdict] || item.explanation.verdict}${item.explanation.evidence ? ` · «${item.explanation.evidence}»` : ''}`;
      box.append(line);
    }
    if (item.executable) {
      const line = document.createElement('p');
      line.textContent = `Pruebas ${item.executable.aprobados}/${item.executable.total}${item.executable.aviso ? ` · ${item.executable.aviso}` : ''}`;
      box.append(line);
    }
    if (item.next) {
      const next = document.createElement('p');
      next.className = 'lk-open-next';
      next.textContent = item.next;
      box.append(next);
    }
    node.append(box);
    return box;
  }

  return { parse, highlight, render, pieza, katex, feedback };
})();
