// The promise gate: a beat may only say what its own frames draw.
//
// The lexicon is fixed and deliberately small. Each entry names a spoken term
// of the visual vocabulary — the words a viewer can point at on screen — the
// fact it requires, and how to read that fact from the very scene objects the
// stage paints: never from pixels, never from the narration.
//
// Subject nouns (robot, puerta, charco, salida) are deliberately NOT promises:
// they name the world the beat talks about, not the drawing, and a beat may
// discuss the robot over a chart without owing a picture of it. What a beat
// owes is every feature it says it is showing.
//
// A primitive the stage gains but this file does not know is surfaced instead
// of being treated as "nothing drawn", so the gate cannot silently pass a
// promise it is unable to verify.

// Exactly the scene keys src/page/stage.js knows how to paint.
export const KNOWN_SCENE_KEYS = new Set([
  "grids", "sheets", "dashed", "panels", "bars", "boxes", "nodes", "gears",
  "packets", "arrows", "curves", "paths", "lines", "badges", "formulas", "labels",
  "policy", "walls", "exits", "hazards",
]);

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const digit = /[0-9]/;

// The narration is matched folded, so a term carrying its accent as a separate
// code point makes the same promise as one carrying it precomposed. The map
// takes a folded index back to the raw string, so a violation still quotes the
// words the viewer heard.
const fold = (s) => {
  const chars = [];
  const raw = [];
  for (let i = 0; i < s.length; i++) {
    for (const ch of norm(s[i])) {
      chars.push(ch);
      raw.push(i);
    }
  }
  return { text: chars.join(""), raw };
};

// "todas las flechas" and phrases that bind one arrow to each cell. The
// stronger rule subsumes "at least one arrow", so a plain `flecha` match inside
// one of these phrases is not reported twice.
const ARROW_PER_CELL = /\btodas\s+las\s+flechas\b|\b(?:una|1)\s+flecha\s+por\s+(?:casilla|celda)\b|\bcada\s+(?:casilla|celda)\b[^.;]{0,60}?\bflechas?\b/gi;

export const LEXICON = [
  {
    id: "arrow",
    pattern: /\bflechas?\b/gi,
    requires: "at least one arrow is drawn",
    holds: (fact) => fact.arrows >= 1,
  },
  {
    id: "arrow-per-cell",
    pattern: ARROW_PER_CELL,
    last: true,
    requires:
      "the finished field says which of its tiles are walls, exits and hazards, and puts one arrow on every remaining cell",
    // "One arrow per cell" describes the finished figure, not every instant of
    // the assembly that builds it, so it is read on the beat's last state. A
    // wall, an exit and a hazard have no action to choose: the gate reads them
    // from the labels the figure already draws, or from an explicit
    // declaration, and refuses a field that does neither.
    holds: (fact) =>
      fact.policyDeclared &&
      fact.misdeclared === 0 &&
      (fact.declared || fact.unclassified === 0) &&
      fact.policyArrows === fact.cells - fact.walls - fact.exits - fact.hazards,
  },
  {
    id: "cell",
    pattern: /\b(?:casillas?|celdas?|rejilla)\b/gi,
    requires: "at least one grid cell is drawn",
    holds: (fact) => fact.cells >= 1,
  },
  {
    id: "table",
    pattern: /\btablas?\b/gi,
    requires: "a grid drawn with column headers",
    holds: (fact) => fact.tables >= 1,
  },
  {
    id: "numeral",
    pattern: /\b(?:numeros?|cifras?)\b/gi,
    requires: "a drawn label whose text contains a digit",
    holds: (fact) => fact.hasDigit,
  },
  {
    id: "bar",
    pattern: /\bbarras?\b/gi,
    requires: "at least one bar is drawn",
    holds: (fact) => fact.bars >= 1,
  },
  {
    id: "equation",
    pattern: /\b(?:formulas?|ecuacion(?:es)?)\b/gi,
    requires: "at least one equation is drawn",
    holds: (fact) => fact.equations >= 1,
  },
];

// Every promise the narration makes, in the order it is spoken. Each keeps the
// phrase verbatim so a violation can quote the words the viewer heard.
export function promisesOf(narration) {
  const spoken = String(narration ?? "");
  const folded = fold(spoken);
  const found = [];
  for (const entry of LEXICON) {
    for (const match of folded.text.matchAll(entry.pattern)) {
      const start = folded.raw[match.index];
      const end = folded.raw[match.index + match[0].length - 1] + 1;
      const phrase = spoken.slice(start, end);
      found.push({
        id: entry.id,
        phrase,
        term: phrase,
        index: start,
        last: !!entry.last,
        requires: entry.requires,
        holds: entry.holds,
      });
    }
  }
  const bound = found.filter((p) => p.id === "arrow-per-cell");
  const kept = found.filter((p) => {
    if (p.id !== "arrow") return true;
    return !bound.some((b) => p.index >= b.index && p.index + p.phrase.length <= b.index + b.phrase.length);
  });
  return kept.sort((a, b) => a.index - b.index || a.phrase.length - b.phrase.length);
}

// What the beat's own frames draw, from the scene objects the stage renders.
// Facts stay per-frame because "one arrow per cell" is a claim about a single
// instant; the union answers the "at least one" claims.
export function drawnBy(beat, decks = []) {
  const collected = framesOf(beat, decks).map((frame) =>
    collect(frame.scene, frame.text, frame.title),
  );
  const union = unionOf(collected);
  const frames = collected.map((c) => ({ ...counts(c), texts: [...c.texts], unknown: [...c.unknown] }));
  return { frames, last: frames[frames.length - 1], union, unknown: union.unknown };
}

// Every claim the spec makes that its drawings do not answer, all of them.
export function audit(spec, decks = []) {
  const violations = [];
  (spec.sections || []).forEach((section, si) => {
    (section.beats || []).forEach((beat, bi) => {
      const promises = promisesOf(beat.narration);
      if (!promises.length) return;
      const drawn = drawnBy(beat, decks);
      const seen = new Set();
      const report = (promise, missing) => {
        const key = `${promise.id}|${norm(promise.phrase)}|${missing}`;
        if (seen.has(key)) return;
        seen.add(key);
        violations.push(violation(si, bi, beat.title, promise.phrase, missing));
      };
      for (const promise of promises) {
        const ok = promise.holds(promise.last ? drawn.last : drawn.union, promise);
        if (!ok) report(promise, requiresOf(promise));
      }
      if (drawn.unknown.length) {
        report(promises[0], `a drawing key this gate cannot read: ${drawn.unknown.map((key) => `"${key}"`).join(", ")}`);
      }
    });
  });
  return violations;
}

export function formatViolation(v) {
  return `section ${v.section} · beat "${v.title}" · says "${v.phrase}" · draws nothing that answers it: ${v.missing}`;
}

function violation(section, beat, title, phrase, missing) {
  return { section, beat, title, phrase, missing };
}

function requiresOf(promise) {
  return typeof promise.requires === "function" ? promise.requires(promise) : promise.requires;
}

// Resolve a beat through the note's decks exactly like lib/timeline.mjs does.
function framesOf(beat, decks) {
  const v = beat.visual || {};
  if (v.deck) {
    const deck = (decks || []).find((d) => d.title === v.deck);
    if (!deck) throw new Error(`deck "${v.deck}" is not in the note`);
    const steps = v.steps && v.steps.length ? v.steps : deck.steps.map((_, i) => i);
    return steps.map((i) => {
      const step = deck.steps[i];
      if (!step) throw new Error(`beat "${beat.title}" picks deck step ${i} but deck "${deck.title}" has ${deck.steps.length} steps`);
      return { scene: step.scene || {}, text: step.text || "", title: step.title || "" };
    });
  }
  const scenes = v.scenes || (v.scene ? [v.scene] : []);
  if (!scenes.length) throw new Error(`beat "${beat.title}" has no visual`);
  return scenes.map((s) => (s.scene
    ? { scene: s.scene || {}, text: s.text || "", title: s.title || "" }
    : { scene: s, text: v.text || "", title: "" }));
}

// A tile that already carries a fixed label says what it is. These are the
// words the warehouse deck draws on its own cells, not an inference: the gate
// reads the figure the viewer reads.
const ACTION_GLYPH = /^[\u2191\u2193\u2190\u2192]$/;
const NUMBERISH = /^\d+(?:[.,]\d+)?$/;

function labelKind(label) {
  const word = String(label ?? "").trim();
  // An unlabelled tile makes no claim: it is a plain cell. A label the gate
  // cannot read does make one, and it is refused rather than ignored.
  if (!word) return "cell";
  if (word === "\u00d7" || word === "x" || word === "X") return "wall";
  if (word === "+1") return "exit";
  if (word === "\u22121" || word === "-1") return "hazard";
  if (word === "R" || word === "robot") return "robot";
  if (ACTION_GLYPH.test(word)) return "action";
  if (NUMBERISH.test(word) || word === "?") return "cell";
  return "unknown";
}

function collect(scene, text, title) {
  const sets = { arrows: new Set(), policyArrows: new Set(), cells: new Set(), tables: new Set(), bars: new Set(), equations: new Set(), walls: new Set(), exits: new Set(), hazards: new Set(), misdeclared: new Set(), unclassified: new Set() };
  const texts = new Set();
  const unknown = new Set();
  const addText = (value) => {
    if (value === undefined || value === null) return;
    if (String(value).trim()) texts.add(String(value));
  };

  for (const [key, value] of Object.entries(scene || {})) {
    if (!KNOWN_SCENE_KEYS.has(key) && used(value)) unknown.add(key);
  }

  // The stage paints an arrowhead on arrows, curves, paths and on lines unless
  // the line opts out, so all four are drawn arrows.
  const arrowed = [
    ...(scene.arrows || []).map((a) => ["arrow", a]),
    ...(scene.curves || []).map((c) => ["curve", c]),
    ...(scene.paths || []).map((p) => ["path", p]),
    ...(scene.lines || []).filter((l) => l.arrow !== false).map((l) => ["line", l]),
  ];
  for (const [kind, item] of arrowed) sets.arrows.add(`${kind}|${JSON.stringify(item)}`);

  // A box is a drawn tile, a grid cell is a drawn cell: both count as cells.
  // A tile that already says what it is says it with its label, so a field that
  // names its walls, exits and hazards that way needs no declaration in the
  // spec. An explicit declaration wins: the author's statement is the figure.
  const declared = Array.isArray(scene.walls) && Array.isArray(scene.exits);
  const hasPolicy = (scene.policy || []).length > 0;
  for (const box of scene.boxes || []) {
    // The label is read whichever way the field states its walls, so both
    // paths certify the same figure the same way. A tile the robot occupies is
    // a cell like any other: the actor standing there does not remove the
    // cell's action, and the arrow drawn on it is that action.
    const kind = labelKind(box.label);
    sets.cells.add(`box|${JSON.stringify(box)}`);
    const at = `${box.x},${box.y}`;
    if (kind === "wall") sets.walls.add(`at|${at}`);
    else if (kind === "exit") sets.exits.add(`at|${at}`);
    else if (kind === "hazard") sets.hazards.add(`at|${at}`);
    else if (kind === "action") sets.policyArrows.add(`glyph|${at}`);
    else if (kind === "unknown" && hasPolicy) sets.unclassified.add(`at|${at}:${String(box.label ?? "")}`);
  }
  // A policy field is arrows drawn inside cells: both facts, from one object.
  for (const [pi, item] of (scene.policy || []).entries()) {
    sets.arrows.add(`policy|${pi}|${JSON.stringify(item)}`);
    sets.policyArrows.add(`policy|${pi}|${JSON.stringify(item)}`);
  }

  // A declaration is only honest if the cell it names is drawn, so a wall or an
  // exit that lands on nothing counts as misdeclared and fails the promise.
  const drawn = new Set((scene.boxes || []).map((b) => `${b.x},${b.y}`));
  for (const kind of ["walls", "exits", "hazards"]) {
    for (const [i, cell] of (scene[kind] || []).entries()) {
      sets[kind].add(`at|${cell.x},${cell.y}`);
      if (!drawn.has(`${cell.x},${cell.y}`)) sets.misdeclared.add(`${kind}|${i}`);
    }
  }  for (const [gi, grid] of (scene.grids || []).entries()) {
    for (const [ri, row] of (grid.rows || []).entries()) {
      for (const [ci, cell] of (row || []).entries()) sets.cells.add(`cell|${gi}|${ri},${ci}|${JSON.stringify(cell)}`);
    }
    const cols = grid.cols || [];
    if (grid.header !== false && cols.length) sets.tables.add(`grid|${gi}|${JSON.stringify(cols)}`);
    for (const col of cols) addText(col);
    for (const row of grid.rows || []) for (const cell of row || []) addText(cell);
  }

  for (const [bi, bar] of (scene.bars || []).entries()) {
    for (const [ii, item] of (bar.items || []).entries()) sets.bars.add(`bar|${bi}|${ii}|${JSON.stringify(item)}`);
    addText(bar.caption);
    for (const item of bar.items || []) {
      addText(item.note !== undefined ? item.note : item.value);
      addText(item.label);
    }
  }

  for (const [fi, formula] of (scene.formulas || []).entries()) {
    sets.equations.add(`formula|${fi}|${JSON.stringify(formula)}`);
    addText(formula.text);
  }

  // Text the stage paints: the frame's own title/text (the note pane) and every
  // labelled primitive of the scene.
  addText(title);
  addText(text);
  for (const box of scene.boxes || []) { addText(box.label); addText(box.sub); }
  for (const node of scene.nodes || []) addText(node.label);
  for (const label of scene.labels || []) addText(label.text);
  for (const arrow of scene.arrows || []) addText(arrow.label);
  for (const dashed of scene.dashed || []) addText(dashed.label);
  for (const panel of scene.panels || []) {
    addText(panel.title);
    for (const line of panel.lines || []) addText(line);
  }
  for (const sheet of scene.sheets || []) addText(sheet.title);
  for (const badge of scene.badges || []) addText(badge.n);

  // An equation the stage paints as ordinary text is still drawn: the state
  // title of a deck step ("V(2,0) = +1,00") is on screen.
  for (const text of texts) if (text.includes("=")) sets.equations.add(`text|${text}`);

  const policyDeclared = !hasPolicy || declared || sets.unclassified.size === 0;
  return { sets, texts, unknown, policyDeclared, declared };
}

function used(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function counts(collected) {
  return {
    arrows: collected.sets.arrows.size,
    policyArrows: collected.sets.policyArrows.size,
    cells: collected.sets.cells.size,
    tables: collected.sets.tables.size,
    bars: collected.sets.bars.size,
    equations: collected.sets.equations.size,
    walls: collected.sets.walls.size,
    exits: collected.sets.exits.size,
    hazards: collected.sets.hazards.size,
    misdeclared: collected.sets.misdeclared.size,
    unclassified: collected.sets.unclassified.size,
    declared: collected.declared === true,
    policyDeclared: collected.policyDeclared !== false,
    hasDigit: [...collected.texts].some((text) => digit.test(text)),
  };
}

function unionOf(collected) {
  const sets = { arrows: new Set(), policyArrows: new Set(), cells: new Set(), tables: new Set(), bars: new Set(), equations: new Set(), walls: new Set(), exits: new Set(), hazards: new Set(), misdeclared: new Set(), unclassified: new Set() };
  const texts = new Set();
  const unknown = new Set();
  for (const c of collected) {
    for (const key of Object.keys(sets)) for (const item of c.sets[key]) sets[key].add(item);
    for (const text of c.texts) texts.add(text);
    for (const key of c.unknown) unknown.add(key);
  }
  const merged = {
    sets,
    texts,
    unknown,
    policyDeclared: collected.every((c) => c.policyDeclared !== false),
    declared: collected.every((c) => c.declared === true),
  };
  return { ...counts(merged), texts: [...texts], unknown: [...unknown] };
}
