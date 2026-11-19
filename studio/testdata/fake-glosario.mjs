// One-shot stand-in for the tutor CLI used by the quick preliminary glossary.
// `models` answers the catalogue; anything else is a generation call. The argv and
// the delay are observable so a test can prove the command is bounded and injectable.
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
if (process.env.FAKE_GLOSARIO_ARGV) appendFileSync(process.env.FAKE_GLOSARIO_ARGV, `${JSON.stringify(args)}\n`);
const delay = Number(process.env.FAKE_GLOSARIO_DELAY_MS ?? 0);
if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

if (args[0] === "models" || args.includes("--list-models")) {
  process.stdout.write("provider  model  context\nopencode-go deepseek-v4.1-flash 1M\n");
  process.exit(0);
}
if (process.env.FAKE_GLOSARIO_REPLY) {
  process.stdout.write(process.env.FAKE_GLOSARIO_REPLY);
  process.exit(0);
}
process.stdout.write(`${JSON.stringify({
  terminos: Array.from({ length: 6 }, (_, i) => ({ termino: `T${i + 1}`, definicion: `Definición ${i + 1}`, ejemplo: `Ejemplo ${i + 1}` })),
  preguntas: [{ enunciado: "¿Qué significa T1?", opciones: { A: "una", B: "otra" }, respuesta: "A" }],
})}\n`);
