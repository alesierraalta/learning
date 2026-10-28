/* Formulas in the notes.
 *
 * The tutor writes LaTeX between dollars, and marked would mangle it (`_` and `*`
 * become emphasis). So a formula is lifted out before the markdown is parsed and
 * put back afterwards, rendered by KaTeX.
 *
 * A classic script for the reader page and a CommonJS module for the tests: it
 * touches the DOM only inside `render`, so `extract` and `source` are pure.
 */
(() => {
  "use strict";
  const KATEX_VERSION = "0.19.1";
  const KATEX_JS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;
  const KATEX_JS_INTEGRITY = "sha384-a1WQdjRj162i159OYq041X6I4K8NenkrI09LlPmiHg0YOb7CR+wJOraXwK9abpnE";
  const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
  const KATEX_CSS_INTEGRITY = "sha384-WwGtaC6ywCHxA5cstpj/3+xIZvTez8dq2IcBQaXRkenHZ7FVVq1ZROtURwfbtTlG";
  const TOKEN = /LKMATHD(\d+)LKEND|LKMATHS(\d+)LKEND/g;

  const token = (display, index) => `${display ? "LKMATHD" : "LKMATHS"}${index}LKEND`;

  /** Where an inline formula ends, or -1 when these dollars are not a formula. */
  const inlineEnd = (text, from) => {
    if (from >= text.length || /\s/.test(text[from])) return -1;
    for (let i = from; i < text.length; i += 1) {
      const char = text[i];
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === "\n") return -1;
      if (char === "$") return i === from || /\s/.test(text[i - 1]) ? -1 : i;
    }
    return -1;
  };

  /** The note's text with every formula replaced by a token marked can survive. */
  const extract = (text) => {
    const blocks = [];
    let out = "";
    let i = 0;
    while (i < text.length) {
      const char = text[i];
      if (char === "\\") {
        out += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (char === "$") {
        if (text.startsWith("$$", i)) {
          const end = text.indexOf("$$", i + 2);
          if (end !== -1) {
            const tex = text.slice(i + 2, end).trim();
            if (tex) {
              out += token(true, blocks.length);
              blocks.push({ display: true, tex });
              i = end + 2;
              continue;
            }
          }
        } else {
          const end = inlineEnd(text, i + 1);
          if (end !== -1) {
            const tex = text.slice(i + 1, end);
            if (tex.trim()) {
              out += token(false, blocks.length);
              blocks.push({ display: false, tex });
              i = end + 1;
              continue;
            }
          }
        }
      }
      out += char;
      i += 1;
    }
    return { text: out, blocks };
  };

  /** The formula exactly as the note wrote it, for when there is no renderer. */
  const source = (block) => `${block.display ? "$$" : "$"}${block.tex}${block.display ? "$$" : "$"}`;

  let katexRequest;
  const loadKatex = () => {
    katexRequest ??= new Promise((resolve, reject) => {
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = KATEX_CSS;
      style.integrity = KATEX_CSS_INTEGRITY;
      style.crossOrigin = "anonymous";
      const script = document.createElement("script");
      script.src = KATEX_JS;
      script.integrity = KATEX_JS_INTEGRITY;
      script.crossOrigin = "anonymous";
      script.addEventListener("load", () => resolve(globalThis.katex));
      script.addEventListener("error", () => reject(new Error("katex unavailable")));
      document.head.append(style, script);
    });
    return katexRequest;
  };

  const formula = (block, katex) => {
    if (!katex) return document.createTextNode(source(block));
    try {
      const host = document.createElement(block.display ? "div" : "span");
      host.className = block.display ? "math-display" : "math-inline";
      // KaTeX escapes the formula and `trust: false` refuses \href and \htmlClass,
      // so the markup is its own; it is parsed in an inert document instead of
      // handed to innerHTML, where a future KaTeX change could smuggle a script in.
      const parsed = new DOMParser().parseFromString(katex.renderToString(block.tex, {
        displayMode: block.display,
        throwOnError: false,
        strict: "ignore",
        trust: false,
      }), "text/html");
      host.append(...parsed.body.childNodes);
      return host;
    } catch {
      return document.createTextNode(source(block));
    }
  };

  const rewrite = (node, blocks, katex) => {
    const carriers = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      TOKEN.lastIndex = 0;
      if (TOKEN.test(walker.currentNode.nodeValue)) carriers.push(walker.currentNode);
    }
    TOKEN.lastIndex = 0;
    for (const carrier of carriers) {
      const fragment = document.createDocumentFragment();
      let end = 0;
      for (const match of carrier.nodeValue.matchAll(TOKEN)) {
        fragment.append(document.createTextNode(carrier.nodeValue.slice(end, match.index)));
        fragment.append(formula(blocks[Number(match[1] ?? match[2])], katex));
        end = match.index + match[0].length;
      }
      fragment.append(document.createTextNode(carrier.nodeValue.slice(end)));
      carrier.replaceWith(fragment);
    }
  };

  /** Render the formulas of `blocks` inside `node`; without KaTeX they stay as written. */
  const render = (node, blocks) => {
    if (!blocks.length || typeof document === "undefined") return;
    loadKatex().then(
      (katex) => rewrite(node, blocks, katex),
      () => rewrite(node, blocks, null),
    );
  };

  const api = { extract, render, source };
  globalThis.lkMath = api;
  if (typeof module === "object" && module?.exports) module.exports = api;
})();
