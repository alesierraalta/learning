// Offline snapshot tests: a part becomes one HTML file that needs nothing from the
// network, keeps nothing of the bridge's address or token, and refuses a library
// whose bytes do not match the hash pinned in the code that loads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { snapshotPage } from "./offline.ts";

const BRIDGE = "http://127.0.0.1:9999";
const TOKEN = "a".repeat(64);
const PAGE = `${BRIDGE}/${TOKEN}/redes/p1`;
const sri = (text) => `sha384-${createHash("sha384").update(text).digest("base64")}`;

const MARKED = "/* marked */ window.marked = { parse: (t) => t };";
const KATEX_JS = "/* katex */ window.katex = { render() {} };";
const KATEX_CSS = ".katex { font: 1em KaTeX_Main; } @font-face { src: url(fonts/KaTeX_Main-Regular.woff2) format('woff2'), url(fonts/KaTeX_Main-Regular.woff) format('woff'); }";
const MERMAID = "/* mermaid */ window.mermaid = {};";
const CDN = "https://cdn.jsdelivr.net/npm";

const KIT_JS = [
  "(() => {",
  `  const katex = () => Promise.all([library('katex-css', '${CDN}/katex@0.16.22/dist/katex.min.css', '${sri(KATEX_CSS)}', true),`,
  `    library('katex', '${CDN}/katex@0.16.22/dist/katex.min.js', '${sri(KATEX_JS)}')]);`,
  `  const draw = () => library('mermaid', '${CDN}/mermaid@11.6.0/dist/mermaid.min.js', '${sri(MERMAID)}');`,
  "})();",
].join("\n");

function bridge(overrides = {}) {
  const files = {
    [PAGE]: [
      "<!doctype html><html><head>",
      `<link rel="stylesheet" href="/${TOKEN}/kit/kit.css?v=1">`,
      `<script src="${CDN}/marked@15.0.12/marked.min.js" integrity="${sri(MARKED)}" crossorigin="anonymous"></script>`,
      "</head><body><main id=\"app\"></main>",
      `<script type="application/json" id="view-data">${JSON.stringify({
        kind: "part",
        topic: "redes",
        part: "p1",
        title: "Capas",
        markdown: "# Parte 1 — Capas\n\n![red](file/explicaciones/red.png)\n\nUna fórmula: $a^2$\n\n<video controls preload=\"metadata\" src=\"file/explicaciones/adjuntos/Parte%201%20-%20Capas.mp4\"></video>\n",
        submitUrl: `/${TOKEN}/submit`,
        home: `/${TOKEN}/`,
        topicBase: `/${TOKEN}/redes/`,
        transcribeUrl: `/${TOKEN}/api/transcribe`,
        app: `/${TOKEN}/redes/p1/app`,
        demos: ["file/explicaciones/demos/p1-capas.html"],
        quiz: { questions: [{ id: "q1", enunciado: "¿?", options: { A: "a" } }] },
      })}</script>`,
      `<script src="/${TOKEN}/kit/kit.js?v=1"></script>`,
      `<img src="/${TOKEN}/redes/file/explicaciones/logo.svg" alt="logo">`,
      "</body></html>",
    ].join("\n"),
    [`${BRIDGE}/${TOKEN}/kit/kit.css?v=1`]: "body { background: url(fonts/paper.woff2); }",
    [`${BRIDGE}/${TOKEN}/kit/fonts/paper.woff2`]: Buffer.from([1, 2, 3]),
    [`${BRIDGE}/${TOKEN}/kit/kit.js?v=1`]: KIT_JS,
    [`${BRIDGE}/${TOKEN}/redes/file/explicaciones/red.png`]: Buffer.from([137, 80, 78, 71]),
    [`${BRIDGE}/${TOKEN}/redes/file/explicaciones/logo.svg`]: "<svg xmlns='http://www.w3.org/2000/svg'/>",
    [`${BRIDGE}/${TOKEN}/redes/file/explicaciones/demos/p1-capas.html`]: "<html><body><script>document.title = 'demo';</script></body></html>",
    [`${CDN}/marked@15.0.12/marked.min.js`]: MARKED,
    [`${CDN}/katex@0.16.22/dist/katex.min.js`]: KATEX_JS,
    [`${CDN}/katex@0.16.22/dist/katex.min.css`]: KATEX_CSS,
    [`${CDN}/katex@0.16.22/dist/fonts/KaTeX_Main-Regular.woff2`]: Buffer.from([9, 9, 9]),
    [`${CDN}/mermaid@11.6.0/dist/mermaid.min.js`]: MERMAID,
    ...overrides,
  };
  const asked = [];
  const load = async (url) => {
    asked.push(url);
    if (!(url in files)) throw new Error(`404 ${url}`);
    const body = files[url];
    const type = /\.png$/.test(url) ? "image/png" : /\.svg$/.test(url) ? "image/svg+xml" : /\.woff2$/.test(url) ? "font/woff2" : /\.css/.test(url) ? "text/css" : /\.js/.test(url) ? "text/javascript" : "text/html";
    return { bytes: Buffer.isBuffer(body) ? body : Buffer.from(body), type };
  };
  return { load, asked };
}

const viewData = (html) => JSON.parse(/<script type="application\/json" id="view-data">([\s\S]*?)<\/script>/.exec(html)[1]);
const offlineMap = (html) => JSON.parse(/<script>window\.learningOffline = (\{[\s\S]*?\});<\/script>/.exec(html)[1]);

test("a saved part needs nothing from the network", async () => {
  const { load } = bridge();
  const html = await snapshotPage(PAGE, load);
  const external = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]).filter((url) => !url.startsWith("data:") && !url.startsWith("#"));
  assert.deepEqual(external, [], "every stylesheet, script, image and frame is inside the file");
  assert.match(html, /<style>[\s\S]*data:font\/woff2;base64,AQID/, "the kit's own fonts travel inside its stylesheet");
  assert.match(html, /window\.marked = /, "a library the page loads by tag is inlined");
  assert.match(html, /<img src="data:image\/svg\+xml;base64,/, "an image in the page is inlined");
});

test("a saved part keeps no address or token of the bridge", async () => {
  const { load } = bridge();
  const html = await snapshotPage(PAGE, load);
  assert.equal(html.includes(TOKEN), false, "the run token never reaches the device");
  assert.equal(html.includes("127.0.0.1"), false);
  const data = viewData(html);
  assert.equal(data.offline, true, "the reader knows it is reading a saved copy");
  for (const key of ["submitUrl", "home", "topicBase", "transcribeUrl", "app"]) assert.equal(key in data, false, `${key} is dropped`);
  assert.equal(data.quiz.questions.length, 1, "the questions stay to be read");
  assert.match(data.demos[0], /^data:text\/html;base64,/, "a demo becomes a frame of its own bytes");
  assert.match(data.markdown, /!\[red\]\(data:image\/png;base64,iVBORw==\)/, "a picture in the note is inlined");
  assert.equal(data.markdown.includes("<video"), false, "a video cannot travel");
  assert.match(data.markdown, /El video de esta parte necesita conexión/, "and the note says so where the video was");
});

test("a library the kit loads on demand is shipped only when the part uses it", async () => {
  const { load, asked } = bridge();
  const html = await snapshotPage(PAGE, load);
  const map = offlineMap(html);
  assert.ok(map[`${CDN}/katex@0.16.22/dist/katex.min.js`], "a part with a formula carries KaTeX");
  assert.match(map[`${CDN}/katex@0.16.22/dist/katex.min.css`], /data:font\/woff2;base64,CQkJ/, "with its fonts inside");
  assert.equal(`${CDN}/mermaid@11.6.0/dist/mermaid.min.js` in map, false, "a part without diagrams does not carry Mermaid");
  assert.equal(asked.includes(`${CDN}/mermaid@11.6.0/dist/mermaid.min.js`), false, "and never downloads it");
});

test("a library whose bytes do not match its pinned hash is refused", async () => {
  const { load } = bridge({ [`${CDN}/marked@15.0.12/marked.min.js`]: "/* tampered */ fetch('https://evil.example');" });
  await assert.rejects(() => snapshotPage(PAGE, load), /marked@15\.0\.12.*does not match/);
});

test("only the bridge and the pinned CDN are ever asked for anything", async () => {
  const page = `<!doctype html><html><head><script src="https://evil.example/x.js"></script></head><body></body></html>`;
  const { load } = bridge({ [PAGE]: page });
  await assert.rejects(() => snapshotPage(PAGE, load), /evil\.example/);
});

test("a rich page keeps its own scripts and drops the bridge config", async () => {
  const rich = [
    "<!doctype html><html><head>",
    `<script>window.LEARNING_BRIDGE = ${JSON.stringify({ submitUrl: `/${TOKEN}/submit`, quizUrl: `/${TOKEN}/api/quiz?topic=redes&part=p1`, topic: "redes", part: "p1", video: "file/explicaciones/adjuntos/Parte 1 - Capas.mp4" })};</script>`,
    `<link rel="stylesheet" href="../kit/kit.css?v=1">`,
    "</head><body><main><h1>Capas</h1><pre class=\"mermaid\">flowchart TD\n A --> B</pre>",
    `<iframe src="file/explicaciones/demos/p1-capas.html" title="demo"></iframe>`,
    "<script>document.querySelector('h1').dataset.ready = '1';</script>",
    `<script src="../kit/kit.js?v=1"></script>`,
    "</main></body></html>",
  ].join("\n");
  const { load } = bridge({ [PAGE]: rich, [`${BRIDGE}/${TOKEN}/kit/kit.css?v=1`]: "main { margin: 0 }" });
  const html = await snapshotPage(PAGE, load);
  const config = JSON.parse(/window\.LEARNING_BRIDGE = (\{[\s\S]*?\});<\/script>/.exec(html)[1]);
  assert.deepEqual(config, { topic: "redes", part: "p1", offline: true }, "the page keeps who it is and loses where it came from");
  assert.match(html, /dataset\.ready = '1'/, "the author's own script stays");
  assert.match(html, /<iframe src="data:text\/html;base64,[^"]+" title="demo">/, "a demo frame carries its own bytes");
  assert.ok(offlineMap(html)[`${CDN}/mermaid@11.6.0/dist/mermaid.min.js`], "a page with a diagram carries Mermaid");
});

test("code inside a script is never read as markup", async () => {
  const code = "const card = (src) => `<img src=\"${src}\"><iframe src=\"${src}\"></iframe>`;";
  const page = [
    "<!doctype html><html><head>",
    `<script src="/${TOKEN}/kit/kit.js?v=1"></script>`,
    `<script>${code}</script>`,
    "<style>.x { content: '<img src=\"nope.png\">'; }</style>",
    "</head><body></body></html>",
  ].join("\n");
  const { load, asked } = bridge({ [PAGE]: page, [`${BRIDGE}/${TOKEN}/kit/kit.js?v=1`]: code });
  const html = await snapshotPage(PAGE, load);
  assert.equal(asked.some((url) => url.includes("${") || url.includes("%7B") || url.endsWith("nope.png")), false, `asked: ${asked.join(", ")}`);
  assert.equal(html.split(code).length - 1, 2, "both copies of the code stay byte for byte");
});

test("a demo that uses the kit carries its own libraries, and none is shipped twice", async () => {
  const demo = [
    "<!doctype html><html><head>",
    `<script src="/${TOKEN}/kit/kit.js?v=1"></script>`,
    "</head><body><pre class=\"mermaid\">flowchart TD\n A --> B</pre></body></html>",
  ].join("\n");
  const page = [
    "<!doctype html><html><head>",
    `<script src="${CDN}/mermaid@11.6.0/dist/mermaid.min.js" integrity="${sri(MERMAID)}" crossorigin="anonymous"></script>`,
    `<script src="/${TOKEN}/kit/kit.js?v=1"></script>`,
    "</head><body><pre class=\"mermaid\">flowchart TD\n X --> Y</pre>",
    `<iframe src="file/explicaciones/demos/p1-capas.html"></iframe>`,
    "</body></html>",
  ].join("\n");
  const { load } = bridge({ [PAGE]: page, [`${BRIDGE}/${TOKEN}/redes/file/explicaciones/demos/p1-capas.html`]: demo });
  const html = await snapshotPage(PAGE, load);
  assert.equal(html.split(MERMAID).length - 1, 1, "the page carries Mermaid once: the tag, not the kit's map too");
  const frame = Buffer.from(/<iframe src="data:text\/html;base64,([^"]+)"/.exec(html)[1], "base64").toString("utf8");
  const frameMap = offlineMap(frame);
  assert.equal(frameMap[`${CDN}/mermaid@11.6.0/dist/mermaid.min.js`], MERMAID, "the demo is its own document and carries the Mermaid it draws with");
  assert.equal(`${CDN}/katex@0.16.22/dist/katex.min.js` in frameMap, false, "and nothing it does not use");
});
