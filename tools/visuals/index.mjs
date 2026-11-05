#!/usr/bin/env node
// One scene in, one drawing out. The same scene feeds a note (vars, so the
// reader's theme decides) and anything that needs a still (static, so no CSS
// engine has to resolve a variable).
import { readFileSync, writeFileSync } from "node:fs";
import { renderScene, varsStyle } from "./markup.mjs";

const USAGE = `usage: node tools/visuals/index.mjs --scene <file.json> [options]

  --scene <file>   the scene to draw (required)
  --theme <name>   light | dark (default light)
  --mode <name>    vars | static (default vars)
  --out <file>     write the SVG here (default: print it)
  --html <file>    write a page that shows the scene in both themes

  node tools/visuals/index.mjs --scene escena.json --html escena.html
`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!["--scene", "--theme", "--mode", "--out", "--html"].includes(flag)) {
      throw new Error(`unknown flag ${flag}\n\n${USAGE}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value\n\n${USAGE}`);
    args[flag.slice(2)] = value;
    i += 1;
  }
  if (!args.scene) throw new Error(`--scene is required\n\n${USAGE}`);
  return args;
}

function page(scene) {
  const light = renderScene(scene, { theme: "light", mode: "static" });
  const dark = renderScene(scene, { theme: "dark", mode: "static" });
  const live = renderScene(scene, { theme: "light", mode: "vars" });
  return `<!doctype html>
<meta charset="utf-8">
<title>${scene.title ?? "escena"}</title>
${varsStyle()}<style>
body{margin:0;background:#fff;color:#0F2E3D;font:16px/1.5 system-ui,sans-serif}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0}
figure{margin:0;padding:16px}
figure.dark{background:#0B0B0C;color:#F1EFE8}
figure.live{background:var(--v-paper);color:var(--v-ink);cursor:pointer}
figcaption{font-size:13px;opacity:.7;padding-top:8px}
svg{width:100%;height:auto}</style>
<div class="grid">
<figure><figcaption>light</figcaption>${light}</figure>
<figure class="dark"><figcaption>dark</figcaption>${dark}</figure>
<figure class="live" id="live"><figcaption>live — click to switch the theme</figcaption>${live}</figure>
</div>
<script>
document.getElementById("live").addEventListener("click", (event) => {
  const host = event.currentTarget;
  host.dataset.theme = host.dataset.theme === "dark" ? "light" : "dark";
});
</script>
`;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const scene = JSON.parse(readFileSync(args.scene, "utf8"));
  if (args.html) {
    writeFileSync(args.html, page(scene));
    console.log(args.html);
  } else {
    const svg = renderScene(scene, { theme: args.theme ?? "light", mode: args.mode ?? "vars" });
    if (args.out) {
      writeFileSync(args.out, svg);
      console.log(args.out);
    } else process.stdout.write(`${svg}\n`);
  }
} catch (error) {
  console.error(`visuals: ${error.message}`);
  process.exit(2);
}
