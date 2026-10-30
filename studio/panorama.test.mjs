// Panorama tests: the plan, the route and the map as the browser receives them.
// The fixtures keep the shapes the tutor really writes (`planificador.md`, `plan.json`, `mapa.mmd`).
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPanorama, layoutMap, parseMap, parsePlan, parsePlanJson, partFor, requestSubtema } from "./panorama.ts";

const PLAN = `---
tipo: planificador
tema: Paradigma Relacional
fecha: 2026-10-14
diagnostico_puntaje: 4/7
---

# Planificador de Estudio: Paradigma Relacional

## Resultado

- **Puntaje global**: **4/7** (57%).
- **Áreas de foco**: \`d1\` (subtema \`1.1\`): integridad referencial.

## Tabla de plan

| Subtema | Qué sabes | Profundidad | Por qué |
|---|---|---|---|
| \`P0.1\` | 1/1 | Puente consolidado | Domina la clave foránea |
| \`1.1\` | 0/1 | Desde su base | Falló \`d1\` |
| \`1.2.1\` | ⚪ No evaluado | Completo | No evaluado en diagnóstico |

## Mapa de dependencias

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

## Ruta

1. Integridad referencial.
2. Filtrado.
`;

const MAP = `flowchart TD
  subgraph M1_1 ["1.1 Arquitectura del Modelo Relacional"]
    N1_1_1["1.1.1 Relaciones, Tuplas y Atributos<br/>⚪ no evaluado"]:::neu --> N1_1_2["1.1.2 Integridad de Entidad (PK)<br/>⚪ no evaluado"]:::neu
    N1_1_2 --> N1_1_3["1.1.3 Integridad Referencial (FK)<br/>evaluado en d1"]:::neu
  end

  subgraph M1_2_1 ["1.2.1 Paradigma Declarativo Puro (SQL - DQL)"]
    N1_1_1 --> N1_2_1_1["1.2.1.1 Separación 'El Qué' vs 'El Cómo'<br/>⚪ no evaluado"]:::neu
    N1_2_1_1 --> N1_2_1_2["1.2.1.2 Proyección SELECT<br/>⚪ no evaluado"]:::neu
  end

  classDef ok fill:#d4edda,stroke:#28a745,color:#14532d;
  classDef neu fill:#eceef1,stroke:#8b95a7,color:#3d4451;
`;

const PLAN_JSON = JSON.stringify({
  topic: "Paradigma Relacional",
  parts: [
    { id: "p1", title: "Estructura Relacional", slug: "Arquitectura relacional", subtema: "1.1", examplesPlanned: true, visualsPlanned: true },
    { id: "p2", title: "Filtrado Booleano", slug: "Filtrado", subtema: "1.2.1a", examplesPlanned: true, visualsPlanned: false },
  ],
});

const TOPIC = {
  id: "paradigma",
  title: "Paradigma Relacional",
  status: "waiting",
  stage: "explanation",
  nextStage: "explanation",
  part: "p2",
  parts: [
    { id: "p1", title: "Estructura Relacional", written: true },
    { id: "p2", title: "Filtrado Booleano", written: false },
  ],
};

test("the plan keeps its prose and its table without the sections the panorama draws itself", () => {
  const plan = parsePlan(PLAN);
  assert.equal(plan.title, "Planificador de Estudio: Paradigma Relacional");
  assert.equal(plan.date, "2026-10-14");
  assert.equal(plan.score, "4/7");
  assert.deepEqual(
    plan.rows.map((row) => row.subtema),
    ["P0.1", "1.1", "1.2.1"],
  );
  assert.equal(plan.rows[1].why, "Falló d1");
  assert.deepEqual(
    plan.sections.map((section) => section.title),
    ["Resultado", "Ruta"],
    "the map has its own view and the table already is the route, so neither is prose here",
  );
  assert.ok(!JSON.stringify(plan.sections).includes("flowchart"), "no diagram survives in a prose section");
  assert.equal(plan.sections[0].id, "resultado");
});

test("a malformed plan degrades to an empty plan instead of throwing", () => {
  for (const broken of ["", "no headings at all", "---\n---\n# Tema\n"]) {
    const plan = parsePlan(broken);
    assert.deepEqual(plan.rows, []);
    assert.ok(Array.isArray(plan.sections));
  }
  assert.deepEqual(parsePlanJson("{"), []);
  assert.deepEqual(parsePlanJson(undefined), []);
});

test("the map reads its subgraphs, its own node labels and its status classes", () => {
  const graph = parseMap(MAP);
  assert.equal(graph.direction, "TB");
  assert.deepEqual(
    graph.groups.map((group) => group.title),
    ["1.1 Arquitectura del Modelo Relacional", "1.2.1 Paradigma Declarativo Puro (SQL - DQL)"],
  );
  assert.equal(graph.nodes.length, 5, "a node referenced twice is still one node");
  const first = graph.nodes.find((node) => node.id === "N1_1_1");
  assert.ok(first, "the first concept of the map exists");
  assert.equal(first.number, "1.1.1");
  assert.equal(first.title, "Relaciones, Tuplas y Atributos");
  assert.equal(first.meta, "⚪ no evaluado");
  assert.equal(first.group, "M1_1");
  assert.equal(
    graph.nodes.find((node) => node.id === "N1_2_1_1")?.group,
    "M1_2_1",
    "a node belongs where it is defined, not where an edge lands",
  );
  assert.equal(graph.edges.length, 4);
  assert.deepEqual(graph.classes.neu, { fill: "#eceef1", stroke: "#8b95a7", color: "#3d4451" });
});

test("a concept the tutor declares without an edge still belongs to the map", () => {
  const graph = parseMap(`flowchart LR
  subgraph M1_3 ["1.3 Puertos"]
    N1_3_1["1.3.1 Qué es un puerto<br/>⚪ no evaluado"]:::neu
  end
  N1_3_1 --> N1_3_2["1.3.2 Puerto efímero<br/>⚪ no evaluado"]:::neu
  N1_3_9["1.3.9 Puerto reservado<br/>⚪ no evaluado"]:::neu
  classDef neu fill:#eceef1,stroke:#8b95a7,color:#3d4451;
`);
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["N1_3_1", "N1_3_2", "N1_3_9"],
    "a concept with no arrows is still a concept to open and read",
  );
  const loner = graph.nodes[2];
  assert.equal(loner.number, "1.3.9");
  assert.equal(loner.title, "Puerto reservado");
  assert.equal(loner.status, "neu");
  assert.equal(graph.edges.length, 1);
});

test("the map lays its subgraphs out as columns the route can be read through", () => {
  const route = [
    { id: "p1", title: "Estructura", slug: "e", subtema: "1.1", examplesPlanned: false, visualsPlanned: false, number: 1, written: true, knows: "", depth: "", why: "" },
    { id: "p2", title: "Filtrado", slug: "f", subtema: "1.2.1a", examplesPlanned: false, visualsPlanned: false, number: 2, written: false, knows: "", depth: "", why: "" },
  ];
  const layout = layoutMap(parseMap(MAP), route);
  const column = (title) => layout.groups.find((group) => group.title.startsWith(title));
  const left = column("1.1");
  const right = column("1.2.1");
  assert.ok(left && right, "every subgraph becomes a column of the picture");
  assert.ok(left.x + left.w <= right.x, "the first subtema sits left of the second");
  for (const node of layout.nodes) {
    const box = node.group === "M1_1" ? left : right;
    assert.ok(node.y >= box.y && node.y + node.h <= box.y + box.h, `${node.id} stays inside its own column`);
    assert.ok(node.x >= box.x && node.x + node.w <= box.x + box.w, `${node.id} stays inside its own column horizontally`);
  }
  assert.ok(layout.width > 400 && layout.height > 200, "the picture is wide and tall enough to be read");
  assert.equal(layout.edges.length, 4);
  const crossing = layout.edges.find((edge) => edge.from === "N1_1_1" && edge.to === "N1_2_1_1");
  assert.ok(crossing, "the dependency that leaves its subgraph is drawn");
  assert.match(crossing.path, /^M .* C /, "a dependency between subtemas is drawn as a curve");
  assert.deepEqual(layoutMap(parseMap(MAP), route), layout, "the same map always lands in the same place");
});

test("a numbered concept belongs to the part the tutor wrote for its branch", () => {
  const parts = parsePlanJson(PLAN_JSON);
  assert.equal(partFor("1.1.1", parts)?.id, "p1", "a child number belongs to its subtema's part");
  assert.equal(partFor("1.2.1.2", parts)?.id, "p2", "a letter suffix covers the numbers below it");
  assert.equal(partFor("1.1.2", parts)?.id, "p1");
  assert.equal(partFor("9.9", parts), null, "a concept without a part stays without one");
  assert.equal(requestSubtema("1.2.2.1"), "1.2.2", "a fine concept asks for the branch it lives in");
  assert.equal(requestSubtema("1.3.5"), "1.3.5", "a concept at the depth a part is written for asks for itself");
  assert.equal(requestSubtema("1.1"), "1.1");
  assert.equal(requestSubtema(null), null, "an unnumbered concept names no subtema to ask for");
});

test("the panorama shows the route and the map together with what explains each concept", () => {
  const panorama = buildPanorama(TOPIC, { plan: PLAN, planJson: PLAN_JSON, map: MAP });
  assert.deepEqual(panorama.sources, { plan: true, planJson: true, map: true });
  assert.deepEqual(
    panorama.route.map((part) => [part.number, part.subtema, part.written, part.depth, part.why]),
    [
      [1, "1.1", true, "Desde su base", "Falló d1"],
      [2, "1.2.1a", false, "Completo", "No evaluado en diagnóstico"],
    ],
    "each step of the route carries what the diagnosis found for it",
  );
  const explained = panorama.map.layout.nodes.find((node) => node.id === "N1_2_1_2");
  assert.ok(explained, "the concept of the second subgraph is on the map");
  assert.deepEqual(explained.part, { id: "p2", number: 2, title: "Filtrado Booleano", written: false });
  assert.equal(explained.request, null, "a covered concept offers no new part");
  const loose = panorama.map.layout.nodes.find((node) => node.id === "N1_1_3");
  assert.equal(loose?.part?.id, "p1");
});

test("a topic still being planned shows its route and says what the tutor has not written yet", () => {
  const bare = {
    id: "llms",
    title: "LLMs desde la matemática",
    status: "sin inscribir",
    stage: "",
    nextStage: "",
    part: "",
    parts: [
      { id: "p1", title: "Tokens y vocabulario", written: false },
      { id: "p2", title: "Modelo de lenguaje", written: false },
    ],
  };
  const panorama = buildPanorama(bare, {});
  assert.deepEqual(panorama.sources, { plan: false, planJson: false, map: false });
  assert.equal(panorama.plan, null);
  assert.equal(panorama.map, null);
  assert.deepEqual(
    panorama.route.map((part) => [part.number, part.title, part.written]),
    [
      [1, "Tokens y vocabulario", false],
      [2, "Modelo de lenguaje", false],
    ],
    "without a plan.json the route still lists the parts the topic declares",
  );
  const empty = buildPanorama(bare, { map: "flowchart TD\n  classDef neu fill:#eee;\n" });
  assert.equal(empty.map, null, "a map without nodes is no map");
  assert.equal(empty.sources.map, false);
});

// The tutor also writes flat maps whose labels carry the subtema after a dot:
// `Frase base · 1.1 · pregunta 1 · verde`. The concept is numbered all the same.
const DOTTED = `flowchart LR
  A["Frase base · 1.1 · pregunta 1 · verde"] --> B["Tiempos para hablar · 1.2 · preguntas 2–3 · verde"]
  A --> C["Preguntar y conectar · 1.3 · pregunta 4 · verde"]
  A --> D["Negación estándar · P0.5 · R5 · rojo"]
  A --> E["Phrasal verbs · 2.1 · preguntas 5–6 · ámbar"]
  D --> F["Respuestas conversacionales claras"]
  E --> F
  classDef ok fill:#d4edda,stroke:#28a745,color:#14532d
  classDef gap fill:#f8d7da,stroke:#dc3545,color:#58151c
  class A,B,C ok
  class D gap
  class E frag
  class F ext
`;

test("a map that writes its subtema after a dot still links every concept to its part", () => {
  const graph = parseMap(DOTTED);
  assert.deepEqual(
    graph.nodes.map((node) => node.number),
    ["1.1", "1.2", "1.3", "P0.5", "2.1", null],
    "the dot-separated subtema is the concept's number",
  );
  assert.equal(graph.nodes[0].title, "Frase base", "the name stays the name");
  assert.equal(graph.nodes[0].meta, "pregunta 1 · verde", "the rest of the line is the note under it");
  assert.equal(graph.nodes[5].title, "Respuestas conversacionales claras", "an unnumbered concept keeps its whole name");
  assert.equal(graph.nodes[5].meta, "");
  assert.equal(graph.groups.length, 0, "a flat map has no frames");

  const parts = [
    { id: "p1", title: "Frase base", slug: "Frase base", subtema: "1.1" },
    { id: "p2", title: "Tiempos para hablar", slug: "Tiempos", subtema: "1.2" },
    { id: "p3", title: "Preguntar y conectar", slug: "Preguntar", subtema: "1.3" },
    { id: "p4", title: "Phrasal verbs", slug: "Phrasal", subtema: "2.1" },
  ];
  const pano = buildPanorama({ id: "g", title: "Gramática", status: "waiting", stage: "diagnosis", nextStage: "diagnosis", part: null, parts: [] }, { planJson: JSON.stringify({ parts }), map: DOTTED });
  const linked = (pano.map?.layout.nodes ?? []).filter((node) => node.part);
  assert.deepEqual(
    linked.map((node) => `${node.number}->${node.part?.id}`),
    ["1.1->p1", "1.2->p2", "1.3->p3", "2.1->p4"],
    "four concepts open the part that explains them",
  );
  assert.equal(pano.map?.layout.nodes[3].request, "P0.5", "the prerequisite names itself when no part covers it");
});
