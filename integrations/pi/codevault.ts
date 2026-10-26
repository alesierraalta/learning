import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveContained, safeTopic } from "./paths.ts";
import { CodeRunError, readExercise, type Runner, type RunResult } from "./coderun.ts";

export function exerciseFile(topicDir: string, id: unknown): string {
  if (!safeTopic(id)) throw new CodeRunError("exercise must be one folder name");
  const found = resolveContained(topicDir, join(topicDir, "codigo", id, "ejercicio.json"));
  if (!found.ok) throw new CodeRunError("exercise is missing or outside the topic");
  return found.targetReal;
}

function contained(dir: string, path: string): string {
  const found = resolveContained(dir, path);
  if (!found.ok) throw new CodeRunError("submission path is outside the exercise");
  return found.targetReal;
}

export function readSubmissions(exDir: string) {
  const submissions: { numero: number; fecha: string; aprobados: number; total: number }[] = [];
  let lastCode: string | undefined;
  const dir = join(exDir, "entregas");
  if (!existsSync(dir)) return { submissions, lastCode };
  contained(exDir, dir);
  for (const name of readdirSync(dir).filter((n) => /^\d{3,}\.json$/.test(n)).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]))) {
    let record;
    try {
      record = JSON.parse(readFileSync(contained(exDir, join(dir, name)), "utf8"));
    } catch {
      // A damaged submission never hides the exercise or the other attempts.
      continue;
    }
    submissions.push({ numero: record.numero, fecha: record.fecha, aprobados: record.aprobados, total: record.total });
    lastCode = record.codigo;
  }
  return { submissions, lastCode };
}

export function saveSubmission(exDir: string, record: RunResult & { lenguaje: string; codigo: string; nota?: string }) {
  const dir = join(exDir, "entregas");
  if (existsSync(dir)) contained(exDir, dir);
  else mkdirSync(dir);
  for (let numero = 1; ; numero++) {
    const file = join(dir, `${String(numero).padStart(3, "0")}.json`);
    try {
      writeFileSync(file, JSON.stringify({ ...record, numero, fecha: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
      return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

export function listExercises(topicDir: string, runners: Record<string, Runner>) {
  const dir = join(topicDir, "codigo");
  if (!existsSync(dir)) return [];
  const found = resolveContained(topicDir, dir);
  if (!found.ok) return [];
  return readdirSync(found.targetReal, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map(({ name: id }) => {
    try {
      const file = exerciseFile(topicDir, id);
      const ex = readExercise(file, runners);
      const { submissions } = readSubmissions(dirname(file));
      const best = submissions.reduce<typeof submissions[number] | undefined>((best, s) => !best || s.aprobados / s.total > best.aprobados / best.total ? s : best, undefined);
      return { id, titulo: ex.titulo, lenguaje: ex.lenguaje, parte: ex.parte, entregas: submissions.length, mejor: best ? `${best.aprobados}/${best.total}` : null };
    } catch (error) {
      return { id, titulo: id, lenguaje: "", entregas: 0, mejor: null, error: (error as Error).message };
    }
  });
}
