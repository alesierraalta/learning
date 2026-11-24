/**
 * The panorama of a topic: its plan, its route of parts and its dependency map as one picture.
 *
 * The plan lives in `planificador.md` (prose sections plus a table of focus per subtema) and
 * `plan.json` (the parts of the route); the map lives in `mapa.mmd`, a Mermaid flowchart the
 * tutor writes as the topic grows. Both files are the tutor's own words, so this module only
 * reads them: it never invents a part, a dependency or a score.
 *
 * Everything here is pure (text in, structure out) so the shape the browser receives can be
 * tested without a browser, a vault or an engine.
 */

/** One row of the plan's focus table: what the diagnosis found for a subtema. */
export type PlanRow = { subtema: string; knows: string; depth: string; why: string };

/** One readable block of `planificador.md`, kept in the order the tutor wrote it. */
export type PlanSection = { id: string; title: string; markdown: string; diagrams: number };

/** The planning document, minus its dependency-map section (which has a view of its own). */
export type PlanDoc = { title: string; date: string; score: string | null; rows: PlanRow[]; sections: PlanSection[] };

/** A part as `plan.json` writes it. */
export type PlanPart = {
  id: string;
  title: string;
  slug: string;
  subtema: string;
  examplesPlanned: boolean;
  visualsPlanned: boolean;
};

/** A part as the route shows it: the plan's own row joined with what the topic says is written. */
export type RoutePart = PlanPart & { number: number; written: boolean; knows: string; depth: string; why: string };

/** A node of the dependency map, as the flowchart declares it. */
export type MapNode = { id: string; label: string; number: string | null; title: string; meta: string; status: string; group: string | null };

/** The map as the tutor drew it: nodes, directed edges, the subgraph each node belongs to and its classes. */
export type MapGraph = {
  direction: "TB" | "LR";
  nodes: MapNode[];
  edges: { from: string; to: string }[];
  groups: { id: string; title: string }[];
  classes: Record<string, { fill: string; stroke: string; color: string }>;
};

/**
 * A line of the label, already placed: the studio draws text exactly where the
 * layout put it, so the picture cannot drift when the browser measures fonts.
 */
export type PlacedLine = { text: string; y: number };

/** A node with a place on the picture and the part of the route that explains it. */
export type PlacedNode = MapNode & {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: PlacedLine[];
  /** Baseline of the status line, when the label has one. */
  metaY: number;
  part: { id: string; number: number; title: string; written: boolean } | null;
  /** The subtema a person would ask the tutor to write when no part covers this node yet. */
  request: string | null;
  evidence: string;
};

/** What the browser needs to draw the map without measuring anything itself. */
export type MapLayout = {
  width: number;
  height: number;
  groups: { id: string; title: string; x: number; y: number; w: number; h: number }[];
  nodes: PlacedNode[];
  edges: { from: string; to: string; path: string }[];
};

/** The topic summary the studio already holds, narrowed to what the panorama reads. */
export type PanoramaTopic = {
  id: string;
  title: string;
  status: string;
  stage: string;
  nextStage: string;
  part: string;
  parts: { id: string; title: string; written: boolean }[];
};

/** The three files of a topic, as read from disk (a missing file is `undefined`). */
export type PanoramaFiles = { planJson?: string; plan?: string; map?: string; diagnosis?: string; feedback?: Record<string, string | undefined> };

/** The whole panorama of one topic. */
export type Panorama = {
  topic: { id: string; title: string; status: string; stage: string; nextStage: string; part: string };
  sources: { plan: boolean; planJson: boolean; map: boolean };
  route: RoutePart[];
  plan: PlanDoc | null;
  map: { graph: MapGraph; layout: MapLayout } | null;
};

const FLOWCHART = /^\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/;
const SUBGRAPH = /^\s*subgraph\s+([\w-]+)\s*(?:\[\s*"([^"]*)"\s*\])?/;
const CLASSDEF = /^\s*classDef\s+([\w-]+)\s+(.+)$/;
const CLASS = /^\s*class\s+([\w,-]+)\s+([\w-]+)\s*$/;
const NODE_REF = /^([\w-]+)\s*(?:\[\s*"((?:[^"\\]|\\.)*)"\s*\])?\s*(?:[:]{3}([\w-]+))?/;
/** `1.1.1 Algo`, `P0.1 Algo`, `1.2.1a Algo`: a numbered concept of the map. */
const NUMBERED = /^((?:P\d+(?:\.\d+)*)|\d+(?:\.\d+)*[a-z]?)\s+(.+)$/;
/** Some maps write the subtema after a dot, not before the name: `Frase base · 1.1 · verde`. */
const SEGMENT = /\s*[·|—]\s*/;
const NUMBER_ONLY = /^(?:P\d+(?:\.\d+)*|\d+(?:\.\d+)*[a-z]?)$/;
const FENCE_MERMAID = /```mermaid[^\n]*\n([\s\S]*?)```/g;
const HEADING = /^\s*(#{1,6})\s+(.+?)\s*$/;

/** Fold a heading into a stable anchor, so a section keeps its place between reloads. */
export const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The frontmatter of a Markdown note, as plain `key: value` pairs. */
const frontmatter = (markdown: string): Record<string, string> => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!block) return {};
  const found: Record<string, string> = {};
  for (const line of block[1].split(/\r?\n/)) {
    const pair = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (pair) found[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return found;
};

/** A Markdown table's data rows, cells trimmed and backticks removed. */
const tableRows = (block: string): string[][] =>
  block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|") && !/^\|[-:\s|]+\|$/.test(line))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim().replace(/`/g, "")))
    // The first row of a Markdown table names its columns.
    .slice(1)
    .filter((cells) => cells.length > 1);

/** Split a plan's prose into H2 sections, keeping the text each one owns. */
const splitSections = (markdown: string): { title: string; markdown: string }[] => {
  const lines = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").split(/\r?\n/);
  const sections: { title: string; markdown: string }[] = [];
  let current: { title: string; body: string[] } | undefined;
  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading && heading[1].length <= 2) {
      if (current) sections.push({ title: current.title, markdown: current.body.join("\n") });
      // A third-level heading inside a section stays with it; only `#` and `##` open a block.
      current = heading[1].length === 2 ? { title: heading[2], body: [] } : undefined;
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push({ title: current.title, markdown: current.body.join("\n") });
  return sections;
};

/**
 * Read `planificador.md`: its title, its diagnosis score, the focus table and its prose.
 *
 * The dependency-map section is left out on purpose: the panorama shows that as a map, so
 * repeating it as text would be the same content twice. Any diagram of a kept section is
 * removed too, and only its count survives, so the browser never has to render Mermaid here.
 */
/** A section heading without its numbering: `11. Bitácora` reads as `Bitácora`. */
const heading = (title: string) => title.replace(/^\d+\.\s*/, "").trim();

/** Sections the panorama draws itself: the map has its own view, the table is the route. */
const SELF_RENDERED = /^(?:mapa\s+de\s+dependencias|tabla\s+de\s+plan)$/i;

export function parsePlan(markdown: string): PlanDoc {
  const meta = frontmatter(markdown);
  const title = /^\s*#\s+(.+)$/m.exec(markdown)?.[1]?.trim() || meta.tema || "";
  const raw = splitSections(markdown);
  const table = raw.find((section) => /tabla\s+de\s+plan/i.test(section.title));
  const rows: PlanRow[] = table
    ? tableRows(table.markdown)
        .filter((cells) => cells.length >= 4 && cells[0])
        .map(([subtema, knows, depth, why]) => ({ subtema, knows, depth, why }))
    : [];
  const sections: PlanSection[] = [];
  for (const section of raw) {
    // The map has its own view and the table already is the route: neither is
    // prose the reader needs to read twice.
    if (SELF_RENDERED.test(heading(section.title))) continue;
    const diagrams = [...section.markdown.matchAll(FENCE_MERMAID)].length;
    const text = section.markdown.replace(FENCE_MERMAID, "").trim();
    if (!text) continue;
    sections.push({ id: slug(section.title), title: section.title, markdown: text, diagrams });
  }
  return { title, date: meta.fecha ?? "", score: meta.diagnostico_puntaje ?? null, rows, sections };
}

/** The parts `plan.json` declares, or nothing when the file is missing or unreadable. */
export function parsePlanJson(source: string | undefined): PlanPart[] {
  if (!source) return [];
  try {
    const parsed = JSON.parse(source) as { parts?: unknown };
    if (!Array.isArray(parsed.parts)) return [];
    return parsed.parts.flatMap((raw) => {
      const part = raw as Record<string, unknown>;
      if (typeof part?.id !== "string" || typeof part?.title !== "string") return [];
      return [
        {
          id: part.id,
          title: part.title,
          slug: typeof part.slug === "string" ? part.slug : part.title,
          subtema: typeof part.subtema === "string" ? part.subtema : "",
          examplesPlanned: part.examplesPlanned === true,
          visualsPlanned: part.visualsPlanned === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** The numeric part of a subtema: `1.2.1a` covers the same ground as `1.2.1`. */
const baseSubtema = (subtema: string) => subtema.replace(/[a-z]+$/i, "");

/**
 * Join the plan's parts with the focus table, so each step of the route says what the
 * diagnosis found for it. A subtema that the table does not mention simply brings no note.
 */
export function planRoute(plan: PlanPart[], doc: PlanDoc | null, written: (id: string) => boolean): RoutePart[] {
  return plan.map((part, index) => {
    const row =
      doc?.rows.find((candidate) => candidate.subtema === part.subtema) ??
      doc?.rows.find((candidate) => baseSubtema(candidate.subtema) === baseSubtema(part.subtema));
    return {
      ...part,
      number: index + 1,
      written: written(part.id),
      knows: row?.knows ?? "",
      depth: row?.depth ?? "",
      why: row?.why ?? "",
    };
  });
}

/**
 * The part of the route that explains a numbered concept.
 *
 * A part covers a number when it names it exactly, or when the number lives below it
 * (`1.2.2` covers `1.2.2.1`). A letter suffix is a whole subtema in itself (`1.2.1a` covers
 * `1.2.1.3`, because the tutor wrote that part for the `1.2.1` branch). The most specific
 * part wins, so `1.1.2` goes to the part written for it and not to the `1.1` overview.
 */
export function partFor<T extends PlanPart>(number: string, parts: T[]): T | null {
  const covers = (subtema: string) => {
    if (!subtema) return false;
    const base = baseSubtema(subtema);
    return [subtema, base].some((scope) => Boolean(scope) && (number === scope || number.startsWith(`${scope}.`)));
  };
  return (
    parts
      .filter((part) => covers(part.subtema))
      .sort((a, b) => baseSubtema(b.subtema).length - baseSubtema(a.subtema).length || a.subtema.length - b.subtema.length)[0] ?? null
  );
}

/**
 * Read a Mermaid flowchart: `subgraph` blocks, nodes with their own labels, the edges between
 * them and the classes that colour them.
 *
 * A node belongs to the subgraph where it is defined, not to the one an edge crosses into, so
 * a dependency that leaves a group does not drag the group with it.
 */
export function parseMap(source: string): MapGraph {
  const graph: MapGraph = { direction: "TB", nodes: [], edges: [], groups: [], classes: {} };
  const byId = new Map<string, MapNode>();
  const pending: { id: string; status: string }[] = [];
  let group: string | null = null;
  let direction: MapGraph["direction"] | null = null;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    const flow = FLOWCHART.exec(line);
    if (flow && direction === null) {
      direction = flow[1] === "LR" || flow[1] === "RL" ? "LR" : "TB";
      continue;
    }
    const sub = SUBGRAPH.exec(line);
    if (sub) {
      group = sub[1];
      graph.groups.push({ id: sub[1], title: sub[2]?.trim() || sub[1] });
      continue;
    }
    if (/^end\b/.test(line)) {
      group = null;
      continue;
    }
    const def = CLASSDEF.exec(line);
    if (def) {
      const style: Record<string, string> = {};
      for (const [, key, value] of def[2].matchAll(/(fill|stroke|color)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) style[key] = value;
      graph.classes[def[1]] = { fill: style.fill ?? "", stroke: style.stroke ?? "", color: style.color ?? "" };
      continue;
    }
    const assign = CLASS.exec(line);
    if (assign) {
      for (const id of assign[1].split(",")) pending.push({ id: id.trim(), status: assign[2] });
      continue;
    }
    if (!line.includes("-->")) {
      // A concept can be declared on its own line: no arrow, but still a box the
      // learner can open, so the map keeps it. A line that names neither a label nor
      // a class is another Mermaid directive and stays out.
      const alone = NODE_REF.exec(line);
      if (!alone || (alone[2] === undefined && alone[3] === undefined)) continue;
    }
    const refs: { id: string; label?: string; status?: string }[] = [];
    for (const chunk of line.split("-->")) {
      for (const segment of chunk.split("&")) {
        const ref = NODE_REF.exec(segment.trim());
        if (!ref) continue;
        refs.push({ id: ref[1], ...(ref[2] === undefined ? {} : { label: ref[2].replace(/\\"/g, '"') }), ...(ref[3] === undefined ? {} : { status: ref[3] }) });
      }
    }
    for (const [index, ref] of refs.entries()) {
      let node = byId.get(ref.id);
      if (!node) {
        node = { id: ref.id, label: ref.label ?? ref.id, number: null, title: ref.label ?? ref.id, meta: "", status: "", group };
        byId.set(ref.id, node);
        graph.nodes.push(node);
      }
      if (ref.label !== undefined) {
        node.label = ref.label;
        node.title = ref.label;
      }
      if (ref.status !== undefined) node.status = ref.status;
      const next = refs[index + 1];
      if (next && !graph.edges.some((edge) => edge.from === ref.id && edge.to === next.id)) graph.edges.push({ from: ref.id, to: next.id });
    }
  }
  for (const { id, status } of pending) {
    const node = byId.get(id);
    if (node && !node.status) node.status = status;
  }
  graph.direction = direction ?? (graph.groups.length > 1 ? "TB" : "LR");
  for (const node of graph.nodes) {
    const [first = "", ...rest] = node.label.split(/<br\s*\/?>/i).map((piece) => piece.trim()).filter(Boolean);
    const atStart = NUMBERED.exec(first);
    if (atStart) {
      node.number = atStart[1] ?? null;
      node.title = atStart[2] ?? (first || node.id);
      node.meta = rest.join(" · ");
      continue;
    }
    const pieces = first.split(SEGMENT).map((piece) => piece.trim()).filter(Boolean);
    const number = pieces.find((piece) => NUMBER_ONLY.test(piece)) ?? null;
    const words = pieces.filter((piece) => piece !== number);
    node.number = number;
    node.title = words[0] ?? (first || node.id);
    node.meta = [...words.slice(1), ...rest].join(" · ");
  }
  return graph;
}

/**
 * The subtema a person should ask the tutor for when the map has a concept no part explains.
 *
 * A part is written for a subtema, and the tutor's own parts go three segments deep (`1.3.5`,
 * `1.2.1a`), so a concept at that depth asks for itself. A finer concept (`1.2.1.3`) asks for
 * the branch it lives in (`1.2.1`), which is the scope a part would cover.
 */
export const requestSubtema = (number: string | null) => {
  if (!number) return null;
  const cut = number.replace(/[a-z]+$/i, "").split(".");
  return cut.length > 3 ? cut.slice(0, -1).join(".") : cut.join(".");
};

const NODE_W = 236;
const NODE_H_MIN = 56;
const LINE_H = 17;
const META_H = 18;
const PAD_Y = 20;
const GROUP_TITLE = 24;
const GROUP_PAD = 16;
const GAP_Y = 14;
const GAP_X = 46;
const MARGIN = 18;
const WRAP = 30;

/** Greedy word wrap, capped so one long title cannot push the picture out of shape. */
const wrap = (text: string, width: number, max = 3): string[] => {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let limit = width;
    while (word.length > limit) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, limit));
      limit = WRAP;
    }
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = `${kept[max - 1].slice(0, width - 1)}…`;
  return kept;
};

/** The longest-path depth of every node inside one set of edges, tolerant of cycles. */
const depths = (ids: string[], edges: { from: string; to: string }[]): Map<string, number> => {
  const inside = new Set(ids);
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) {
    if (inside.has(edge.from) && inside.has(edge.to) && edge.from !== edge.to) incoming.get(edge.to)!.push(edge.from);
  }
  const depth = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length ? Math.max(...parents.map((parent) => visit(parent, seen) + 1)) : 0;
    seen.delete(id);
    depth.set(id, value);
    return value;
  };
  for (const id of ids) visit(id, new Set());
  return depth;
};

/**
 * Lay the map out as columns that read left to right, the way a route is read.
 *
 * The subgraphs are the route's own organization, so each one becomes a column; a flowchart
 * without subgraphs is split by dependency depth instead. Nodes inside a column are ordered by
 * their own dependencies, so an arrow only ever points to a lower or neighbouring column.
 */
export function layoutMap(graph: MapGraph, route: RoutePart[]): MapLayout {
  const columns: Column[] = [];
  const grouped = graph.groups.filter((group) => graph.nodes.some((node) => node.group === group.id));
  if (grouped.length > 1) {
    for (const group of grouped) columns.push(columnOf(group.id, group.title, graph.nodes.filter((node) => node.group === group.id)));
    const loose = graph.nodes.filter((node) => !grouped.some((group) => group.id === node.group));
    if (loose.length) columns.push(columnOf(null, "", loose));
  } else {
    const level = depths(
      graph.nodes.map((node) => node.id),
      graph.edges,
    );
    const byLevel = new Map<number, MapNode[]>();
    for (const node of graph.nodes) {
      const key = level.get(node.id) ?? 0;
      byLevel.set(key, [...(byLevel.get(key) ?? []), node]);
    }
    for (const key of [...byLevel.keys()].sort((a, b) => a - b)) columns.push(columnOf(null, "", byLevel.get(key) ?? []));
  }
  const placed = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const column of columns) {
    const local = depths(
      column.nodes.map((node) => node.id),
      graph.edges,
    );
    column.nodes.sort((a, b) => (local.get(a.id) ?? 0) - (local.get(b.id) ?? 0) || graph.nodes.indexOf(a) - graph.nodes.indexOf(b));
    const sizes = column.nodes.map((node) => nodeHeight(node));
    const offsets: number[] = [];
    let running = 0;
    for (const size of sizes) {
      offsets.push(running);
      running += size + GAP_Y;
    }
    column.total = Math.max(0, running - GAP_Y);
    for (const [index, node] of column.nodes.entries()) placed.set(node.id, { x: 0, y: offsets[index], w: NODE_W, h: sizes[index] });
  }
  const header = columns.some((column) => column.title) ? GROUP_TITLE + GROUP_PAD : 0;
  const tallest = Math.max(...columns.map((column) => column.total), NODE_H_MIN);
  let x = MARGIN;
  for (const column of columns) {
    const box = column.title ? NODE_W + GROUP_PAD * 2 : NODE_W;
    const top = MARGIN + header + (tallest - column.total) / 2;
    column.x = x;
    column.y = top;
    column.box = box;
    x += box + GAP_X;
  }
  const width = Math.max(...columns.map((column) => column.x + column.box), NODE_W) + MARGIN;
  const height = MARGIN * 2 + header + tallest;

  const nodes: PlacedNode[] = [];
  for (const column of columns) {
    for (const node of column.nodes) {
      const spot = placed.get(node.id)!;
      const lines = wrap(node.title, WRAP).map((text, row) => ({ text, y: PAD_Y + 12 + row * LINE_H }));
      const part = node.number ? partFor(node.number, route) : null;
      nodes.push({
        ...node,
        x: column.x + (column.box - NODE_W) / 2,
        y: column.y + spot.y,
        w: NODE_W,
        h: spot.h,
        lines,
        metaY: PAD_Y + 12 + lines.length * LINE_H,
        part: part ? { id: part.id, number: part.number, title: part.title, written: part.written } : null,
        request: part ? null : requestSubtema(node.number),
        evidence: "",
      });
    }
  }
  const at = new Map(nodes.map((node) => [node.id, node]));
  const edges: { from: string; to: string; path: string }[] = [];
  for (const edge of graph.edges) {
    const from = at.get(edge.from);
    const to = at.get(edge.to);
    if (!from || !to) continue;
    edges.push({ from: edge.from, to: edge.to, path: pathBetween(from, to) });
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
    groups: columns
      .filter((column) => column.title)
      .map((column) => ({
        id: column.id ?? "",
        title: column.title,
        x: Math.round(column.x),
        y: Math.round(column.y - GROUP_TITLE),
        w: Math.round(column.box),
        h: Math.round(column.total + GROUP_TITLE + GROUP_PAD),
      })),
    nodes,
    edges,
  };
}

/** A column of the picture: one subgraph, or one dependency level, with its own geometry. */
type Column = { id: string | null; title: string; nodes: MapNode[]; x: number; y: number; box: number; total: number };

/** A column starts without a place: the second pass measures it and writes its geometry. */
const columnOf = (id: string | null, title: string, nodes: MapNode[]): Column => ({ id, title, nodes, x: 0, y: 0, box: title ? NODE_W + GROUP_PAD * 2 : NODE_W, total: 0 });

/** A node's height follows how much text it has to show. */
const nodeHeight = (node: MapNode) => {
  const lines = wrap(node.title, WRAP).length;
  return Math.max(NODE_H_MIN, PAD_Y + lines * LINE_H + (node.meta ? META_H : 0) + PAD_Y / 2);
};

/** Same column: a short vertical curve. Different column: a curve from one side to the other. */
const pathBetween = (from: PlacedNode, to: PlacedNode) => {
  const sameColumn = Math.abs(from.x - to.x) < 1;
  if (sameColumn) {
    const x = from.x + from.w / 2;
    if (to.y >= from.y) {
      const y1 = from.y + from.h;
      const y2 = to.y;
      const mid = (y1 + y2) / 2;
      return `M ${x} ${y1} C ${x + 12} ${mid}, ${x + 12} ${mid}, ${x} ${y2}`;
    }
    const y1 = from.y;
    const y2 = to.y + to.h;
    const mid = (y1 + y2) / 2;
    return `M ${x} ${y1} C ${x - 12} ${mid}, ${x - 12} ${mid}, ${x} ${y2}`;
  }
  const right = to.x > from.x;
  const x1 = right ? from.x + from.w : from.x;
  const x2 = right ? to.x : to.x + to.w;
  const y1 = from.y + from.h / 2;
  const y2 = to.y + to.h / 2;
  const bend = Math.max(24, Math.abs(x2 - x1) / 2);
  const direction = right ? 1 : -1;
  return `M ${x1} ${y1} C ${x1 + bend * direction} ${y1}, ${x2 - bend * direction} ${y2}, ${x2} ${y2}`;
};

/**
 * Assemble the panorama of one topic from what the studio already knows about it plus the
 * three files the tutor writes. A topic without a plan or a map still gets its route, so the
 * view can say what is missing instead of showing nothing.
 */
export function buildPanorama(topic: PanoramaTopic, files: PanoramaFiles): Panorama {
  const plan = files.plan === undefined ? null : parsePlan(files.plan);
  const declared = parsePlanJson(files.planJson);
  const written = (id: string) => topic.parts.some((part) => part.id === id && part.written);
  const fromPlan = declared.length
    ? declared
    : topic.parts.map((part) => ({ id: part.id, title: part.title, slug: part.title, subtema: "", examplesPlanned: false, visualsPlanned: false }));
  const route = planRoute(fromPlan, plan, written);
  const graph = files.map === undefined ? null : parseMap(files.map);
  const map = graph && graph.nodes.length ? { graph, layout: layoutMap(graph, route) } : null;
  if (map) {
    const verdicts = new Map<string, { estado: string; evidencia: string }>();
    const consume = (text?: string) => {
      if (!text) return;
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed.conceptos)) return;
        for (const item of parsed.conceptos) {
          if (typeof item?.codigo === "string" && ["claro", "dudoso", "laguna"].includes(item.estado)) {
            verdicts.set(item.codigo, { estado: item.estado, evidencia: typeof item.evidencia === "string" ? item.evidencia : "" });
          }
        }
      } catch { /* A missing or malformed verdict contributes no state. */ }
    };
    consume(files.diagnosis);
    for (const part of route) consume(files.feedback?.[part.id]);
    for (const node of map.layout.nodes) {
      const verdict = node.number ? verdicts.get(node.number) : undefined;
      node.status = verdict?.estado ?? "no_visto";
      node.evidence = verdict?.evidencia ?? "";
    }
  }
  return {
    topic: { id: topic.id, title: topic.title, status: topic.status, stage: topic.stage, nextStage: topic.nextStage, part: topic.part },
    sources: { plan: files.plan !== undefined, planJson: files.planJson !== undefined, map: Boolean(map) },
    route,
    plan,
    map,
  };
}
