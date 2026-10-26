import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { CodeRunError, DockerDaemonError, forPage, ImageMissingError, loadRunners, readExercise, runCode } from './coderun.ts';
import { exerciseFile, listExercises, saveSubmission } from './codevault.ts';
import { resolveContained, safeTopic } from './paths.ts';

const HELP = 'Uso: learning code [--root <directorio>] <comando>\n  list [<tema>]\n  open <tema> <id>\n  test <tema> <id> [archivo]\n  submit <tema> <id> [archivo] [--note "nota"]\n  setup [<lenguaje>...]\n';
const DEFAULT_ROOT = '/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings';
const fail = (message: string): never => { throw new Error(message); };
function docker(args: string[]) {
  return new Promise<void>((ok, reject) => {
    const child = spawn('docker', args, { stdio: 'inherit' });
    child.on('error', () => reject(new Error('No se pudo ejecutar Docker. Comprueba su instalación.')));
    child.on('close', (code: number | null) => code === 0 ? ok() : reject(new Error('Docker no pudo descargar la imagen.')));
  });
}
async function main() {
  const args: string[] = process.argv.slice(2);
  let root = process.env.LEARNINGS_ROOT || DEFAULT_ROOT;
  let note: string | undefined;
  for (let i = 0; i < args.length;) {
    if (args[i] === '--root' || args[i] === '--note') {
      const option = args[i];
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) fail(`Falta el valor de ${option}.`);
      if (option === '--root') root = value; else note = value;
      args.splice(i, 2);
    } else i++;
  }
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(HELP); return; }
  const [command, ...pos] = args;
  if (args.some(a => a.startsWith('--')) || (note !== undefined && command !== 'submit')) fail('Opción no válida.');
  const runners = loadRunners();
  if (command === 'setup') {
    const languages = pos.length ? pos : Object.keys(runners);
    for (const lang of languages) if (!Object.hasOwn(runners, lang)) fail(`Lenguaje desconocido: ${lang}.`);
    for (const image of new Set(languages.map(lang => runners[lang].image))) {
      console.log(`Descargando ${image}…`);
      await docker(['pull', image]);
    }
    return;
  }
  const topicDir = (topic: string) => {
    if (!safeTopic(topic)) fail('Tema no válido.');
    const found = resolveContained(resolve(root), resolve(root, topic));
    if (!found.ok) return fail(`Tema desconocido o fuera de Learnings: ${topic}.`);
    return found.targetReal;
  };
  if (command === 'list') {
    if (pos.length > 1) fail('list acepta como máximo un tema.');
    const topics = pos.length ? pos : readdirSync(root, { withFileTypes: true }).filter((e: import('node:fs').Dirent) => e.isDirectory()).map((e: import('node:fs').Dirent) => e.name).sort();
    for (const topic of topics) {
      const exercises = listExercises(topicDir(topic), runners);
      if (exercises.length) console.log(topic);
      for (const ex of exercises) console.log(ex.error ? `${ex.id} · Error: ejercicio no válido.` : `${ex.id} · ${ex.titulo} · ${ex.lenguaje} · mejor: ${ex.mejor ?? '—'} · entregas: ${ex.entregas}`);
    }
    return;
  }
  if (!['open', 'test', 'submit'].includes(command) || pos.length < 2 || pos.length > (command === 'open' ? 2 : 3)) fail('Comando o argumentos no válidos.');
  let file: string;
  try { file = exerciseFile(topicDir(pos[0]), pos[1]); }
  catch { fail('Tema o ejercicio desconocido o no válido.'); }
  const exercise = readExercise(file!, runners);
  const runner = runners[exercise.lenguaje];
  const dir = dirname(file!);
  // Java's public class requires the configured Main.java filename.
  const solutionDir = join(dir, 'mi-solucion');
  const defaultFile = runner.file === 'Main.java' ? join(solutionDir, runner.file) : join(dir, `mi-solucion${extname(runner.file)}`);
  if (command === 'open') {
    if (runner.file === 'Main.java' && !existsSync(solutionDir)) mkdirSync(solutionDir);
    const parent = resolveContained(dir, dirname(defaultFile));
    if (!parent.ok) fail('La solución está fuera del ejercicio.');
    if (!existsSync(defaultFile)) {
      try { writeFileSync(defaultFile, exercise.plantilla, { flag: 'wx' }); }
      catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err; }
    }
    if (!resolveContained(dir, defaultFile).ok) fail('La solución está fuera del ejercicio.');
    console.log(defaultFile);
    return;
  }
  const code = readFileSync(pos[2] ? resolve(pos[2]) : defaultFile, 'utf8');
  let result;
  try {
    const tests = command === 'test' ? exercise.tests.filter(t => !t.oculto) : exercise.tests;
    result = tests.length ? await runCode({ runner, code, tests, limitSeconds: exercise.limite_segundos }) : { compilacion: { ok: true, salida: '' }, resultados: [], aprobados: 0, total: 0 };
  } catch (err) {
    if (err instanceof DockerDaemonError) fail('Docker no responde. Arranca el daemon (por ejemplo: sudo systemctl start docker) y reintenta.');
    if (err instanceof ImageMissingError) fail(`Falta la imagen de Docker. Ejecuta: learning code setup ${exercise.lenguaje}`);
    throw err;
  }
  if (!result.compilacion.ok) console.log(`💥 Error de compilación:\n${result.compilacion.salida}`);
  const icons = { correcto: '✔', incorrecto: '✘', tiempo: '⏱', error: '💥', ejecutado: '▶' };
  for (const test of forPage(result).resultados) {
    console.log(`${icons[test.estado]} ${test.nombre}: ${test.estado}`);
    if (!test.oculto && test.estado !== 'correcto') {
      console.log(`Entrada: ${JSON.stringify(test.entrada ?? '')}\nEsperado: ${JSON.stringify(test.esperado ?? '')}\nObtenido: ${JSON.stringify(test.obtenido ?? '')}`);
      if (test.errores) console.log(`Errores: ${test.errores}`);
    }
  }
  console.log(`Puntaje: ${result.aprobados}/${result.total}`);
  if (command === 'submit') {
    const saved = saveSubmission(dir, { ...result, lenguaje: exercise.lenguaje, codigo: code, ...(note !== undefined ? { nota: note } : {}) });
    console.log(`Entrega guardada: ${saved}\nDile al tutor en el chat que entregaste este ejercicio.`);
  }
  process.exitCode = result.compilacion.ok && result.aprobados === result.total ? 0 : 1;
}
main().catch(error => {
  console.error(`Error: ${error instanceof CodeRunError ? 'No se pudo evaluar el ejercicio: ' : ''}${error.message}`);
  process.stderr.write(HELP);
  process.exitCode = 2;
});
