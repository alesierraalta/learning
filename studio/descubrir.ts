import { HttpError } from "../integrations/pi/bridge.ts";
import { readGlobalTelemetry, type GlobalTelemetry } from "../integrations/pi/telemetry.ts";
import { readPreferences, savePreferences, type Aspecto } from "./preferences.ts";

/**
 * The bar for calling a friction an aspect: three answers in the category and
 * six in ten right. Below that the counts say nothing worth a new preference.
 */
export const MIN_RESPUESTAS = 3;
export const MAX_ACIERTO = 0.6;

const slug = (categoria: string) =>
  categoria.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface Candidato {
  id: string;
  categoria: string;
  titulo: string;
  descripcion: string;
  evidencia: { respuestas: number; aciertos: number };
}

/**
 * What the learner keeps getting wrong, with the numbers that say so. The counts
 * live in `estadisticas_globales.por_categoria`; a trend entry carries no count.
 */
export function candidatos(global: GlobalTelemetry): Candidato[] {
  const out: Candidato[] = [];
  for (const [categoria, counts] of Object.entries(global.estadisticas_globales.por_categoria)) {
    const respuestas = counts.total;
    if (respuestas < MIN_RESPUESTAS) continue;
    if (counts.aciertos / respuestas > MAX_ACIERTO) continue;
    const id = slug(categoria);
    if (!id) continue;
    const human = categoria.replace(/_/g, " ");
    out.push({
      id,
      categoria,
      titulo: `Refuerzo de ${human}`,
      descripcion: `Volver sobre ${human}, con pasos y un ejemplo concreto.`,
      evidencia: { respuestas, aciertos: counts.aciertos },
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Appends the aspects the evidence earned and saves. Running it twice changes
 * nothing the second time: an aspect already there keeps its own level.
 */
export function descubrir(root: string) {
  const preferences = readPreferences(root);
  const found: Aspecto[] = [];
  for (const candidate of candidatos(readGlobalTelemetry(root))) {
    if (preferences.aspectos.some((a) => a.id === candidate.id)) continue;
    found.push({
      id: candidate.id,
      titulo: candidate.titulo,
      descripcion: candidate.descripcion,
      nivel: "más",
      origen: "telemetria",
      evidencia: candidate.evidencia,
    });
  }
  if (found.length === 0) return preferences;
  preferences.aspectos.push(...found);
  return savePreferences(root, preferences);
}

/** Removes an aspect the telemetry added. A shipped aspect is not removable. */
export function olvidar(root: string, id: string) {
  const preferences = readPreferences(root);
  const item = preferences.aspectos.find((a) => a.id === id);
  if (!item) throw new HttpError(404, "aspect not found");
  if (item.origen !== "telemetria") throw new HttpError(400, "a shipped aspect cannot be forgotten");
  const kept = preferences.aspectos.filter((a) => a.id !== id);
  return savePreferences(root, { version: preferences.version, aspectos: kept });
}
