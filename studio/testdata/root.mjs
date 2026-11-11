// Temporary Learnings root used by the studio tests: one topic with two parts,
// one app, one quick note, and a fake engine that reports the stage the test is about.
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The studio remembers opened topics in the user's state directory: tests never touch the real one.
process.env.XDG_STATE_HOME = realpathSync(mkdtempSync(join(tmpdir(), "studio-state-")));

/**
 * @param {{status?: Record<string, unknown>, statuses?: Record<string, unknown>[], delayMs?: number,
 *   parts?: Array<{id: string, title: string, slug: string, subtema?: string}>}} [options]
 *   `status` is what the fake engine answers, so a test can put the topic in the stage it studies;
 *   `statuses` answers a different report per call, so a test can fail a stage and then clear it;
 *   `delayMs` makes every answer slow, so a test can act while the studio waits for the engine;
 *   `parts` is the topic's plan, so a test can study a route longer than the default two parts.
 */
export function makeRoot(options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "studio-")));
  const topic = join(root, "redes");
  mkdirSync(join(topic, "explicaciones", "apps"), { recursive: true });
  mkdirSync(join(topic, ".learning"));
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({
      topic: "Redes",
      parts: options.parts ?? [
        { id: "p1", title: "Capas", slug: "Capas", subtema: "1.1" },
        { id: "p2", title: "TCP", slug: "TCP", subtema: "1.2.1" },
      ],
    }),
  );
  writeFileSync(
    join(topic, "planificador.md"),
    [
      "---",
      "tipo: planificador",
      "tema: Redes",
      "fecha: 2026-10-30",
      "diagnostico_puntaje: 3/5",
      "---",
      "",
      "# Plan de Redes",
      "",
      "## Resultado",
      "",
      "Puntaje 3/5: las capas están a medias.",
      "",
      "## Tabla de plan",
      "",
      "| Subtema | Qué sabes | Profundidad | Por qué |",
      "| --- | --- | --- | --- |",
      "| `1.1` | 1/2 | Desde su base | Falló `d1` |",
      "| `1.2.1` | 0/1 | Completo | No evaluado |",
      "",
      "## Mapa de dependencias",
      "",
      "```mermaid",
      "flowchart LR",
      "```",
      "",
      "## Ruta",
      "",
      "Primero las capas, después el transporte.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(topic, "mapa.mmd"),
    [
      "flowchart TB",
      '  subgraph M1_1 ["1.1 Capas"]',
      '    N1_1_1["1.1.1 Qué es una capa<br/>🟢 evaluado"]:::ok',
      '    N1_1_2["1.1.2 Encapsulamiento<br/>🟡 frágil"]:::frag',
      "    N1_1_1 --> N1_1_2",
      "  end",
      '  subgraph M1_2 ["1.2.1 Transporte"]',
      '    N1_2_1_1["1.2.1.1 Puerto<br/>⚪ no evaluado"]:::neu',
      "    N1_1_2 --> N1_2_1_1",
      "  end",
      '  N1_9_1["1.9.1 Concepto huérfano<br/>⚪ no evaluado"]:::neu',
      "  classDef ok fill:#d4edda,stroke:#28a745,color:#14532d;",
      "  classDef frag fill:#fff3cd,stroke:#ffc107,color:#664d03;",
      "  classDef neu fill:#eceef1,stroke:#8b95a7,color:#3d4451;",
      "",
    ].join("\n"),
  );
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Capas.md"), "# Parte 1 — Capas\n");
  writeFileSync(join(topic, "explicaciones", "apps", "p1.html"), "<html><head></head><body>app</body></html>");
  writeFileSync(join(topic, "quiz.json"), JSON.stringify({ questions: [] }));
  mkdirSync(join(root, "rapidos"));
  writeFileSync(join(root, "rapidos", "hash.md"), "---\ntipo: rapido\n---\n# Qué es un hash\n");
  const engine = join(root, "fake-engine.sh");
  const asEcho = (report) => JSON.stringify(report ?? { status: "waiting", stage: "diagnosis", nextStage: "diagnosis" }).replace(/'/g, `'\\''`);
  const slow = options.delayMs ? `sleep ${(options.delayMs / 1000).toFixed(2)}\n` : "";
  const script = options.statuses
    ? [
        "#!/bin/sh",
        `calls=${JSON.stringify(join(root, ".engine-calls"))}`,
        'n=$(cat "$calls" 2>/dev/null || echo 0)',
        "n=$((n+1))",
        'echo $n > "$calls"',
        // The call is counted before it answers, so a test can act while the studio waits on it.
        slow,
        "case $n in",
        ...options.statuses.map((report, index) => `  ${index + 1}) echo '${asEcho(report)}' ;;`),
        // A sequence that runs out keeps answering its last report: the engine is the authority.
        `  *) echo '${asEcho(options.statuses.at(-1))}' ;;`,
        "esac",
      ].join("\n") + "\n"
    : `#!/bin/sh\n${slow}echo '${asEcho(options.status)}'\n`;
  writeFileSync(engine, script);
  chmodSync(engine, 0o755);
  return { root, engine, log: join(root, "pi.log") };
}
