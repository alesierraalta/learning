const PART = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;

/**
 * `pi --list-models` prints a `provider  model  context …` table, with warnings and
 * notices around it. Only the rows under that header count; the id `--model` accepts
 * is `provider/model`.
 */
export function parsePiModels(output: string): string[] {
  const seen = new Set<string>();
  const models: string[] = [];
  let inTable = false;
  for (const line of output.split("\n")) {
    const [provider, model] = line.trim().split(/\s+/);
    if (!inTable) {
      inTable = provider === "provider" && model === "model";
      continue;
    }
    if (!PART.test(provider ?? "") || !PART.test(model ?? "")) continue;
    const id = `${provider}/${model}`;
    if (seen.has(id)) continue;
    seen.add(id);
    models.push(id);
  }
  return models;
}
