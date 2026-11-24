/**
 * Whose API key is in the environment: the provider registry.
 *
 * The learner configures a key as an environment variable; the studio reads it, says which
 * provider it belongs to, and asks that provider for its own model list. The shape of the key is
 * advice and never permission: what enables a provider is its variable being present, and a key
 * whose shape belongs to somebody else is reported as such instead of being handed to the wrong
 * endpoint. Provider keys live only here and in the process environment; nothing writes one to
 * the vault, to `tutor.json`, to the page or to a log.
 */
/** What every runtime reports as its catalogue entry, and what the page renders. */
export interface ModeloApi {
  id: string;
  nombre: string;
  proveedor: string;
  razona: boolean;
}

export interface Proveedor {
  id: string;
  nombre: string;
  /** The environment variable that carries this provider's key. */
  variable: string;
  /** The shared shape of the keys this provider issues, as far as the studio can tell. */
  forma: RegExp;
  /** The API root the studio calls, with its trailing slash. */
  base: string;
  /** Whether this studio can drive it today. The others are detected and reported, not guessed. */
  implementado: boolean;
}

/**
 * Detectable providers. Mistral is the one implemented; the rest are here because their keys are
 * the ones a learner is likely to have exported, and a key that is present must never be silently
 * ignored nor silently sent to Mistral.
 */
export const PROVEEDORES: readonly Proveedor[] = [
  { id: "mistral", nombre: "Mistral", variable: "MISTRAL_API_KEY", forma: /^[A-Za-z0-9]{32}$/, base: "https://api.mistral.ai/v1/", implementado: true },
  { id: "anthropic", nombre: "Anthropic", variable: "ANTHROPIC_API_KEY", forma: /^sk-ant-[A-Za-z0-9_-]{20,}$/, base: "https://api.anthropic.com/v1/", implementado: false },
  { id: "openai", nombre: "OpenAI", variable: "OPENAI_API_KEY", forma: /^sk-(?!ant-)[A-Za-z0-9_-]{20,}$/, base: "https://api.openai.com/v1/", implementado: false },
  { id: "deepseek", nombre: "DeepSeek", variable: "DEEPSEEK_API_KEY", forma: /^sk-[0-9a-f]{32}$/, base: "https://api.deepseek.com/v1/", implementado: false },
  { id: "google", nombre: "Google", variable: "GOOGLE_API_KEY", forma: /^AIza[0-9A-Za-z_-]{30,}$/, base: "https://generativelanguage.googleapis.com/v1beta/", implementado: false },
];

export type Forma = "propia" | "ajena" | "desconocida" | "ausente";

/** One provider as the studio sees it right now, key included only as a fact of presence. */
export interface Deteccion {
  id: string;
  nombre: string;
  variable: string;
  base: string;
  presente: boolean;
  forma: Forma;
  /** The providers whose shape this key matches, in registry order. Empty when nobody matches. */
  sospechoso: string[];
  implementado: boolean;
  /** What the page tells the learner, in the learner's language. */
  aviso: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const proveedorPorId = (id: string): Proveedor | null =>
  PROVEEDORES.find((proveedor) => proveedor.id === id) ?? null;

/**
 * Which providers issue a key with this shape. More than one is a real answer: an `sk-` key can
 * belong to more than one provider, and the studio says so instead of inventing a favourite.
 */
export function proveedoresDeLaClave(valor: string): string[] {
  const clave = String(valor ?? "").trim();
  if (!clave) return [];
  return PROVEEDORES.filter((proveedor) => proveedor.forma.test(clave)).map((proveedor) => proveedor.id);
}

const nombres = (ids: readonly string[]): string =>
  ids.map((id) => proveedorPorId(id)?.nombre ?? id).join(", ");

export function detectar(env: Record<string, string | undefined>): Deteccion[] {
  return PROVEEDORES.map((proveedor) => {
    const base = { id: proveedor.id, nombre: proveedor.nombre, variable: proveedor.variable, base: proveedor.base, implementado: proveedor.implementado };
    const valor = String(env?.[proveedor.variable] ?? "").trim();
    if (!valor) {
      return { ...base, presente: false, forma: "ausente" as const, sospechoso: [], aviso: `Falta ${proveedor.variable}: expórtala y reinicia el estudio.` };
    }
    const ajenos = proveedoresDeLaClave(valor);
    if (ajenos.includes(proveedor.id)) {
      const otros = ajenos.filter((id) => id !== proveedor.id);
      return {
        ...base,
        presente: true,
        forma: "propia" as const,
        sospechoso: otros,
        aviso: otros.length
          ? `Reconocida como ${proveedor.nombre}; su forma también la acepta ${nombres(otros)}.`
          : `Reconocida como ${proveedor.nombre}.`,
      };
    }
    if (ajenos.length > 0) {
      return {
        ...base,
        presente: true,
        forma: "ajena" as const,
        sospechoso: ajenos,
        aviso: `${proveedor.variable} tiene forma de ${nombres(ajenos)}: exporta esa clave en su propia variable.`,
      };
    }
    return {
      ...base,
      presente: true,
      forma: "desconocida" as const,
      sospechoso: [],
      aviso: `La clave de ${proveedor.variable} tiene una forma que el estudio no reconoce; se usará igual.`,
    };
  });
}

/**
 * The effort levels each model accepts. Values are per model, not per API: sending a level the
 * model does not name is a refused request, so a model nobody documented gets an empty list and
 * the page says so instead of offering a selector that cannot work.
 * Source: docs.mistral.ai/inference/conversations/reasoning, read 2026-11-06.
 */
const EFORT: readonly { modelos: readonly string[]; niveles: readonly string[] }[] = [
  { modelos: ["mistral-small-2603", "mistral-medium-3-5"], niveles: ["high", "none"] },
  { modelos: ["mistral-large-4-0"], niveles: ["low", "medium", "high"] },
  { modelos: ["zai-glm-5-3", "zai-glm-5-3-flash"], niveles: ["low", "high", "max"] },
];

export function nivelesDeEffort(modelo: string): string[] {
  const fila = EFORT.find((cada) => cada.modelos.includes(String(modelo ?? "")));
  return fila ? [...fila.niveles] : [];
}

/** Mistral's `GET /v1/models` body, read as the catalogue the page offers. */
export function catalogoMistral(cuerpo: unknown): ModeloApi[] {
  if (!isRecord(cuerpo) || !Array.isArray(cuerpo.data)) return [];
  const modelos: ModeloApi[] = [];
  for (const item of cuerpo.data) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) continue;
    const capacidades = isRecord(item.capabilities) ? item.capabilities : {};
    if (capacidades.completion_chat === false) continue;
    modelos.push({
      id: item.id,
      nombre: typeof item.name === "string" && item.name ? item.name : item.id,
      proveedor: "mistral",
      razona: capacidades.reasoning === true,
    });
  }
  return modelos;
}

/**
 * The provider the studio can tutor with, when its key is in the environment. A key whose shape
 * belongs to somebody else is present but not usable here: sending it would be a refused request
 * at best and a leak of one provider's credential to another at worst.
 */
export function proveedorDisponible(env: Record<string, string | undefined>): Proveedor | null {
  const usable = detectar(env).find((entrada) => entrada.presente && entrada.forma !== "ajena" && entrada.implementado);
  return usable ? proveedorPorId(usable.id) : null;
}
