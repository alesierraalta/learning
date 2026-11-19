/* Mermaid in the kit's own ink (T9, S16/S23/S26).
 *
 * Classic script, no import: the reader loads this file in <head> and calls
 * `LkMermaidTheme.initialize();` in place of mermaid.initialize({...}).
 * The two variants are complete themeVariables/themeCSS pairs. The night
 * variant takes its paper and accents from the kit's CSS tokens, so the black
 * paper stays neutral black instead of a navy island; the init reads
 * document.documentElement.dataset.theme at call time, so a page that changes
 * paper without reloading gets the right set on its next mermaid.run().
 */
(() => {
  "use strict";

  const identity = {
    ink: "#0F2E3D",
    slate: "#3F5B69",
    blue: "#004276",
    green: "#21594F",
    amber: "#8A6B3F",
    red: "#DD4A68",
    gold: "#a67f59",
  };

  const font = '"Atkinson Hyperlegible", "DejaVu Sans", Arial, sans-serif';

  // The remaining diagram families (pie, class, ER, mindmap, quadrant, git,
  // journey, XY, sankey, block) take their accents from the same kit colours.
  const paletteExtras = (night) => {
    const p = night
      ? ["#8FBEE8", "#7FCBAE", "#D3AE86", "#EE93A4", "#B9A7D6", "#8BC5C1", "#DFBFA4", "#AFC2CB"]
      : ["#004276", "#21594F", "#8A6B3F", "#C93A5A", "#70518F", "#2F7D79", "#a67f59", "#3F5B69"];
    const scale = Object.fromEntries(p.flatMap((color, i) => [[
      `cScale${i}`, color], [`cScaleLabel${i}`, night ? "#0E1A20" : "#FFFFFF"], [`fillType${i}`, color]]));
    return {
      ...scale,
      pie1: p[0], pie2: p[1], pie3: p[2], pie4: p[3], pie5: p[4],
      pie6: p[5], pie7: p[6], pie8: p[7], pie9: p[0], pie10: p[1],
      pie11: p[2], pie12: p[3],
      pieTitleTextSize: "15px",
      pieSectionTextSize: "14px",
      pieLegendTextSize: "14px",
      pieSectionTextColor: night ? "#0E1A20" : "#FFFFFF",
      pieLegendTextColor: night ? "#E3EBEF" : identity.ink,
      pieTitleTextColor: night ? "#E3EBEF" : identity.ink,
      branchLabelColor: night ? "#0E1A20" : "#FFFFFF",
      classText: night ? "#E3EBEF" : identity.ink,
      classBorder: night ? "#8FBEE8" : identity.blue,
      classBackground: night ? "#1B3039" : "#F2F7F9",
      entityBkg: night ? "#1B3039" : "#F2F7F9",
      entityBorder: night ? "#8FBEE8" : identity.blue,
      entityTextColor: night ? "#E3EBEF" : identity.ink,
      attributeBackgroundColorOdd: night ? "#15252C" : "#FFFFFF",
      attributeBackgroundColorEven: night ? "#1B3039" : "#F7FAFB",
      relationshipColor: night ? "#AFC2CB" : identity.slate,
      quadrant1Fill: p[0], quadrant2Fill: p[1], quadrant3Fill: p[2], quadrant4Fill: p[3],
      quadrant1TextFill: night ? "#0E1A20" : "#FFFFFF",
      quadrant2TextFill: night ? "#0E1A20" : "#FFFFFF",
      quadrant3TextFill: night ? "#0E1A20" : "#FFFFFF",
      quadrant4TextFill: night ? "#0E1A20" : "#FFFFFF",
      quadrantPointFill: night ? "#E3EBEF" : identity.ink,
      quadrantPointTextFill: night ? "#0E1A20" : "#FFFFFF",
      quadrantXAxisTextFill: night ? "#E3EBEF" : identity.ink,
      quadrantYAxisTextFill: night ? "#E3EBEF" : identity.ink,
      quadrantTitleFill: night ? "#E3EBEF" : identity.ink,
      git0: p[0], git1: p[1], git2: p[2], git3: p[3], git4: p[4],
      gitInv0: p[0], gitInv1: p[1], gitInv2: p[2], gitInv3: p[3], gitInv4: p[4],
      commitLabelColor: night ? "#E3EBEF" : identity.ink,
      commitLabelBackground: night ? "#0E1A20" : "#FFFFFF",
      tagLabelColor: night ? "#0E1A20" : "#FFFFFF",
      tagLabelBackground: p[2],
      tagLabelBorder: night ? "#D3AE86" : identity.amber,
      xyChartBackgroundColor: night ? "#0E1A20" : "#FFFFFF",
      xyChartTitleColor: night ? "#E3EBEF" : identity.ink,
      xyChartAxisColor: night ? "#AFC2CB" : identity.slate,
      xyChartLabelColor: night ? "#E3EBEF" : identity.ink,
      xyChartLineColor: p[0],
      xyChartBarColor: p[1],
      sankeyNodeColor: p[0],
      sankeyLinkColor: p[5],
      sankeyTextColor: night ? "#E3EBEF" : identity.ink,
      blockBkg: night ? "#1B3039" : "#F2F7F9",
      blockBorder: night ? "#8FBEE8" : identity.blue,
      blockText: night ? "#E3EBEF" : identity.ink,
    };
  };

  const light = {
    themeVariables: {
      ...paletteExtras(false),
      background: "#FFFFFF",
      fontFamily: font,
      fontSize: "15px",
      primaryColor: "#F2F7F9",
      primaryTextColor: identity.ink,
      primaryBorderColor: identity.slate,
      secondaryColor: "#E9F1F4",
      tertiaryColor: "#FBF7F0",
      lineColor: identity.slate,
      textColor: identity.ink,
      mainBkg: "#F2F7F9",
      secondBkg: "#E9F1F4",
      border1: identity.slate,
      border2: identity.blue,
      nodeBorder: identity.slate,
      nodeTextColor: identity.ink,
      clusterBkg: "#F7FAFB",
      clusterBorder: identity.slate,
      defaultLinkColor: identity.slate,
      titleColor: identity.ink,
      edgeLabelBackground: "#FFFFFF",
      actorBkg: "#F2F7F9",
      actorBorder: identity.slate,
      actorTextColor: identity.ink,
      actorLineColor: identity.slate,
      signalColor: identity.slate,
      signalTextColor: identity.ink,
      labelBoxBkgColor: "#FFFFFF",
      labelBoxBorderColor: identity.slate,
      labelTextColor: identity.ink,
      loopTextColor: identity.ink,
      noteBkgColor: "#FBF7F0",
      noteBorderColor: identity.amber,
      noteTextColor: identity.ink,
      activationBkgColor: "#E9F1F4",
      activationBorderColor: identity.blue,
      sequenceNumberColor: "#FFFFFF",
      sectionBkgColor: "#F2F7F9",
      altSectionBkgColor: "#FFFFFF",
      gridColor: "#D6E1E6",
      taskBkgColor: "#E9F1F4",
      taskTextColor: identity.ink,
      taskTextDarkColor: identity.ink,
      taskBorderColor: identity.slate,
      activeTaskBkgColor: "#DDEBF2",
      activeTaskBorderColor: identity.blue,
      doneTaskBkgColor: "#E3EFEA",
      doneTaskBorderColor: identity.green,
      critBkgColor: "#FBE6EC",
      critBorderColor: identity.red,
      critTextColor: identity.ink,
      todayLineColor: identity.amber,
    },
  };

  const dark = {
    themeVariables: {
      ...paletteExtras(true),
      background: "#0E1A20",
      fontFamily: font,
      fontSize: "15px",
      primaryColor: "#1B3039",
      primaryTextColor: "#E3EBEF",
      primaryBorderColor: "#7C9AA6",
      secondaryColor: "#1E3B52",
      tertiaryColor: "#2B241C",
      lineColor: "#AFC2CB",
      textColor: "#E3EBEF",
      mainBkg: "#1B3039",
      secondBkg: "#1E3B52",
      border1: "#7C9AA6",
      border2: "#8FBEE8",
      nodeBorder: "#7C9AA6",
      nodeTextColor: "#E3EBEF",
      clusterBkg: "#13232B",
      clusterBorder: "#7C9AA6",
      defaultLinkColor: "#AFC2CB",
      titleColor: "#E3EBEF",
      edgeLabelBackground: "#0E1A20",
      actorBkg: "#1B3039",
      actorBorder: "#7C9AA6",
      actorTextColor: "#E3EBEF",
      actorLineColor: "#AFC2CB",
      signalColor: "#AFC2CB",
      signalTextColor: "#E3EBEF",
      labelBoxBkgColor: "#0E1A20",
      labelBoxBorderColor: "#7C9AA6",
      labelTextColor: "#E3EBEF",
      loopTextColor: "#E3EBEF",
      noteBkgColor: "#2B241C",
      noteBorderColor: "#D3AE86",
      noteTextColor: "#E3EBEF",
      activationBkgColor: "#1E3B52",
      activationBorderColor: "#8FBEE8",
      sequenceNumberColor: "#0E1A20",
      sectionBkgColor: "#15252C",
      altSectionBkgColor: "#0E1A20",
      gridColor: "#3A5059",
      taskBkgColor: "#1E3B52",
      taskTextColor: "#E3EBEF",
      taskTextDarkColor: "#E3EBEF",
      taskBorderColor: "#7C9AA6",
      activeTaskBkgColor: "#173A52",
      activeTaskBorderColor: "#8FBEE8",
      doneTaskBkgColor: "#1B3B34",
      doneTaskBorderColor: "#7FCBAE",
      critBkgColor: "#4A2231",
      critBorderColor: "#EE93A4",
      critTextColor: "#E3EBEF",
      todayLineColor: "#D3AE86",
    },
  };

  // Identity colours are authored once with classDef in the diagram. Each
  // paper repaints those classes: the tutor never writes a dark-mode variant.
  const identityFill = {
    light: {
      blue: ["#E9F1F4", identity.blue],
      green: ["#E3EFEA", identity.green],
      amber: ["#FBF2E6", identity.amber],
      red: ["#FBE6EC", identity.red],
      ink: ["#F2F7F9", identity.slate],
    },
    dark: {
      blue: ["#1E3B52", "#8FBEE8"],
      green: ["#1B3B34", "#7FCBAE"],
      amber: ["#2B241C", "#D3AE86"],
      red: ["#4A2231", "#EE93A4"],
      ink: ["#1B3039", "#7C9AA6"],
    },
  };

  // themeCSS is injected in the generated SVG. Keep every letter at or above
  // 13 px (the small print of Mermaid's defaults is too small on a reader),
  // round the boxes and let edges be quiet lines rather than heavy arrows.
  // Mermaid prefixes every selector with #mermaid-<id> — and that id is the
  // SVG itself. So selectors must start with the element/class, never `svg`.
  const css = (v, ids) => `
    & {
      background: ${v.background};
      /* Mermaid writes classDef styles inline with !important: let those
         authored colours read the paper from variables instead. */
      --lk-text: ${v.textColor};
      ${Object.entries(ids).map(([name, [fill, stroke]]) =>
        `--lk-fill-${name}: ${fill}; --lk-stroke-${name}: ${stroke};`).join("\n      ")}
    }
    text {
      font-family: ${font} !important;
      font-size: 13px !important;
      /* no blanket fill: each diagram paints its own labels on its own shapes */
    }
    .actor rect { fill: ${v.actorFill} !important; stroke: ${v.actorBorder} !important; }
    .cluster rect { fill: ${v.clusterBkg} !important; stroke: ${v.clusterBorder} !important; }
    text.actor, .actor text { fill: ${v.actorText} !important; }
    .node rect, .node path, .node polygon, .cluster rect, .actor,
    .labelBox, .note, .task, .state, .taskTextOutsideRight, .taskTextOutsideLeft {
      stroke-width: 1.5px;
    }
    .node rect, .node path, .node polygon, .actor, .labelBox {
      rx: 9px; ry: 9px;
    }
    .edgePath .path, .flowchart-link, .messageLine0, .messageLine1,
    .transition, .arrowheadPath { stroke-width: 1.6px; }
    .edgeLabel, .edgeLabel rect, .edgeLabel span, .edgeLabel p,
    .labelBox, .labelBox label, .loopLabel, .tickLabel, .legend {
      font-family: ${font} !important;
      font-size: 13px !important;
      fill: ${v.textColor};
      color: ${v.textColor};
    }
    .edgeLabel, .edgeLabel rect, .labelBox, .labelBkg {
      background: ${v.edgeLabelBackground} !important;
      fill: ${v.edgeLabelBackground} !important;
    }
    /* ER attribute stripes and edge-label pills keep Mermaid's light default. */
    path[fill^="hsl("], path[fill="white"] { fill: ${v.attrFill} !important; }
    .nodeLabel, .nodeLabel div, .nodeLabel span,
    .clusterLabel, .clusterLabel span,
    text.messageText, .noteText, .loopLabel .text,
    .stateLabel, .stateLabel span, .transition span,
    .sectionTitle, .taskText, .titleText, .edgeLabel .label {
      font-family: ${font} !important;
      font-size: 15px !important;
      fill: ${v.textColor};
      color: ${v.textColor};
    }
    .nodeLabel, text.actor, text.messageText, .stateLabel, .taskText {
      font-weight: 500;
    }
    .clusterLabel, .sectionTitle, .titleText { font-weight: 700; }
    /* Mermaid's diagram CSS uses more specific selectors for this small print. */
    text.tickLabel, text .tickLabel, text.label,
    .er.relationshipLabel, .er.entityBox, .nodeLabel div,
    .mindmap-node, .quadrantChart .label, .block-label {
      font-family: ${font} !important;
      font-size: 14px !important;
      fill: ${v.textColor} !important;
      color: ${v.textColor} !important;
    }
    /* Gantt ticks and git commits ship a font-size presentation attribute. */
    text[font-size], text.commit-label, text.tickLabel,
    .quadrantChart text, .commit-label, .tag-label {
      font-size: 13px !important;
    }
    .pieTitleText, .pieLegendText, .pieSectionText { font-size: 14px !important; }
    .gitGraph text, .journey text, .sankey text, .xychart text {
      font-family: ${font} !important;
      font-size: 13px !important;
      fill: ${v.textColor} !important;
    }
    /* Accent fills always carry paper-coloured letters, in either theme. */
    .pieSectionText { fill: ${v.onAccent} !important; }
    .journey-section .label, svg[aria-roledescription="journey"] .label { color: ${v.onAccent} !important; }
    svg[aria-roledescription="journey"] text.task, svg[aria-roledescription="journey"] .task .label { fill: ${v.onAccent} !important; color: ${v.onAccent} !important; }
    g[class*="branch-label"] text, text.branchLabel { fill: ${v.onAccent} !important; }
    g:has(> .node-circle) text, .node-circle + g text { fill: ${v.onAccent} !important; }
    /* Message labels keep a paper halo and clear the arrow line. */
    text.messageText, text.messageText tspan {
      paint-order: stroke fill;
      stroke: ${v.background};
      stroke-width: 6px;
      stroke-linejoin: round;
    }
    text.messageText { transform: translateY(-6px); }
    ${Object.entries(ids).map(([name, [fill, stroke]]) => `
    .id-${name}.cluster, .id-${name} rect, .id-${name} path, .id-${name} polygon,
    .id-${name} ellipse, .id-${name} circle {
      fill: ${fill} !important; stroke: ${stroke} !important; stroke-width: 1.8px;
    }`).join("\n")}
  `;

  const cssTokens = (variant) => ({
    textColor: variant.themeVariables.primaryTextColor,
    background: variant.themeVariables.background,
    edgeLabelBackground: variant.themeVariables.edgeLabelBackground,
    actorFill: variant.themeVariables.actorBkg,
    actorBorder: variant.themeVariables.actorBorder,
    actorText: variant.themeVariables.actorTextColor,
    attrFill: variant.themeVariables.attributeBackgroundColorOdd,
    onAccent: variant.themeVariables.background,
    clusterBkg: variant.themeVariables.clusterBkg,
    clusterBorder: variant.themeVariables.clusterBorder,
  });
  light.themeCSS = css(cssTokens(light), identityFill.light);

  // The paper is a CSS token, not a colour baked into this file: `black` and
  // `dark` differ in kit.css, and a future theme only has to set its tokens.
  // Every colour that sits on the paper is rebuilt from those tokens too, so
  // no diagram keeps the showcase's navy background after the port.
  const nightTokens = () => {
    const style = getComputedStyle(document.documentElement);
    const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    return {
      paper: token("--paper", "#000000"),
      ink: token("--ink", "#E3EBEF"),
      accent: token("--accent", "#8FC0E0"),
      cobalt: token("--cobalt", "#8FBEE8"),
      emerald: token("--emerald", "#7FCBAE"),
      amber: token("--amber", "#E0B583"),
      crimson: token("--crimson", "#EE93A4"),
    };
  };
  const nightTheme = () => {
    const t = nightTokens();
    const variables = {
      ...dark.themeVariables,
      background: t.paper,
      primaryTextColor: t.ink,
      textColor: t.ink,
      nodeTextColor: t.ink,
      titleColor: t.ink,
      edgeLabelBackground: t.paper,
      edgeLabelColor: t.ink,
      lineColor: t.accent,
      primaryBorderColor: t.accent,
      border2: t.cobalt,
      nodeBorder: t.accent,
      clusterBorder: t.accent,
      actorBorder: t.accent,
      actorTextColor: t.ink,
      signalTextColor: t.ink,
      signalColor: t.accent,
      labelBoxBorderColor: t.accent,
      labelTextColor: t.ink,
      loopTextColor: t.ink,
      noteTextColor: t.ink,
      noteBorderColor: t.amber,
      taskTextColor: t.ink,
      taskTextDarkColor: t.ink,
      critTextColor: t.ink,
      todayLineColor: t.amber,
      commitLabelBackground: t.paper,
      commitLabelColor: t.ink,
      classText: t.ink,
      classBorder: t.cobalt,
      entityTextColor: t.ink,
      entityBorder: t.cobalt,
      pieLegendTextColor: t.ink,
      pieTitleTextColor: t.ink,
      sankeyTextColor: t.ink,
      xyChartTitleColor: t.ink,
      xyChartLabelColor: t.ink,
      xyChartAxisColor: t.ink,
      quadrantXAxisTextFill: t.ink,
      quadrantYAxisTextFill: t.ink,
      quadrantTitleFill: t.ink,
      quadrantPointFill: t.ink,
      blockText: t.ink,
      blockBorder: t.cobalt,
      relationshipColor: t.accent,
      activationBorderColor: t.cobalt,
      activeTaskBorderColor: t.cobalt,
      doneTaskBorderColor: t.emerald,
      critBorderColor: t.crimson,
    };
    const fills = Object.fromEntries(Object.entries(identityFill.dark).map(([name, [fill, stroke]]) => [
      name, [name === "amber" ? t.amber : fill, stroke],
    ]));
    return { themeVariables: variables, themeCSS: css(cssTokens({ themeVariables: variables }), fills) };
  };

  const themes = { light, get dark() { return nightTheme(); } };
  const current = () =>
    document.documentElement && (document.documentElement.dataset.theme === "dark" || document.documentElement.dataset.theme === "black") ? "dark" : "light";

  // Everything app.js needs: the same safety/start options it has today plus
  // the two theme sets, and diagram geometry tuned for a 720 px reader.
  const config = () => ({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: themes[current()].themeVariables,
    themeCSS: themes[current()].themeCSS,
    flowchart: { curve: "basis", nodeSpacing: 44, rankSpacing: 56, padding: 14 },
    sequence: { diagramMarginX: 12, diagramMarginY: 12, actorMargin: 48, messageMargin: 38, useMaxWidth: true },
    gantt: { sectionFontSize: "13px", fontSize: 13, barHeight: 26, barGap: 9, leftPadding: 96, rightPadding: 28, topPadding: 54 },
  });

  const initialize = () => {
    if (!window.mermaid) throw new Error("Mermaid must be loaded before LkMermaidTheme.initialize()");
    window.mermaid.initialize(config());
    return config();
  };

  globalThis.LkMermaidTheme = { themes, identity, current, config, initialize };
})();
