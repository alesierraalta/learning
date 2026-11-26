// Provider registry: the studio recognises whose API key sits in the environment and what effort
// levels the chosen model accepts. The shape of a key is advice, not permission: what enables a
// provider is its variable being present. A key that belongs to somebody else is never coerced.
import { test } from "node:test";
import assert from "node:assert/strict";

import { catalogoMistral, detectar, nivelesDeEffort, PROVEEDORES } from "./proveedores.ts";

/** A 32-character alphanumeric key, the shape Mistral's dashboard issues. */
const MISTRAL = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const ANTHROPIC = `sk-ant-api03-${"a".repeat(24)}`;

const uno = (env, id) => detectar(env).find((entrada) => entrada.id === id);

test("a Mistral-shaped key in MISTRAL_API_KEY reports Mistral, offered", () => {
  const entrada = uno({ MISTRAL_API_KEY: MISTRAL }, "mistral");
  assert.equal(entrada.presente, true);
  assert.equal(entrada.forma, "propia");
  assert.equal(entrada.implementado, true);
  assert.equal(entrada.variable, "MISTRAL_API_KEY");
});

test("with no key the studio still opens and names the variable it needs", () => {
  const entrada = uno({}, "mistral");
  assert.equal(entrada.presente, false);
  assert.equal(entrada.forma, "ausente");
  assert.match(entrada.aviso, /MISTRAL_API_KEY/);
  assert.equal(detectar({}).some((cada) => cada.presente), false);
});

test("a key that belongs to another provider is never read as Mistral", () => {
  const entrada = uno({ MISTRAL_API_KEY: ANTHROPIC }, "mistral");
  assert.equal(entrada.forma, "ajena");
  assert.deepEqual(entrada.sospechoso, ["anthropic"]);
  assert.equal(entrada.presente, true, "it is present; presence is a fact and the shape is the warning");
  assert.match(entrada.aviso, /ANTHROPIC_API_KEY|Anthropic/);
});

test("both formats Mistral issues are recognised as its own", () => {
  // Measured against a real key on 2026-11-06: 45 characters, mixed case, underscore separators.
  const largo = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_abcdefgh";
  assert.equal(largo.length, 45);
  assert.equal(uno({ MISTRAL_API_KEY: largo }, "mistral").forma, "propia");
  assert.equal(uno({ MISTRAL_API_KEY: MISTRAL }, "mistral").forma, "propia", "the older 32-character token still reads as Mistral");
  // It never claims a key that belongs to somebody else, whatever its length.
  assert.equal(uno({ MISTRAL_API_KEY: ANTHROPIC }, "mistral").forma, "ajena");
  assert.equal(uno({ MISTRAL_API_KEY: `sk-proj-${"a".repeat(40)}` }, "mistral").forma, "ajena");
});

test("an unrecognised shape is still usable, with the doubt recorded", () => {
  const entrada = uno({ MISTRAL_API_KEY: "una-clave-de-forma-nueva" }, "mistral");
  assert.equal(entrada.presente, true);
  assert.equal(entrada.forma, "desconocida");
  assert.deepEqual(entrada.sospechoso, []);
});

test("another provider's key is reported as not implemented, never as Mistral", () => {
  const anthropic = uno({ ANTHROPIC_API_KEY: ANTHROPIC }, "anthropic");
  assert.equal(anthropic.presente, true);
  assert.equal(anthropic.implementado, false);
  assert.equal(uno({ ANTHROPIC_API_KEY: ANTHROPIC }, "mistral").presente, false);
});

test("every provider in the registry declares the variable it reads and whether it runs", () => {
  for (const proveedor of PROVEEDORES) {
    assert.match(proveedor.variable, /^[A-Z][A-Z0-9_]*_API_KEY$/, `${proveedor.id} names an environment variable`);
    assert.equal(typeof proveedor.implementado, "boolean", `${proveedor.id} says whether it is implemented`);
    assert.match(proveedor.base, /^https:\/\/[^/]+\//, `${proveedor.id} names an https base`);
  }
  assert.equal(PROVEEDORES.filter((cada) => cada.implementado).map((cada) => cada.id).join(), "mistral");
});

test("effort follows the model, as the provider documents it", () => {
  // docs.mistral.ai/inference/conversations/reasoning, read 2026-11-06.
  assert.deepEqual(nivelesDeEffort("mistral-small-2603"), ["high", "none"]);
  assert.deepEqual(nivelesDeEffort("mistral-medium-3-5"), ["high", "none"]);
  assert.deepEqual(nivelesDeEffort("mistral-large-4-0"), ["low", "medium", "high"]);
  assert.deepEqual(nivelesDeEffort("zai-glm-5-3"), ["low", "high", "max"]);
  assert.deepEqual(nivelesDeEffort("zai-glm-5-3-flash"), ["low", "high", "max"]);
});

test("a model whose levels nobody documented gets none, instead of a guess", () => {
  // An alias resolves to a version the page never names, and calling it with a level it does not
  // accept is a refused request; the studio offers nothing rather than promising a default.
  for (const modelo of ["mistral-large-latest", "mistral-small-latest", "", "zzz"]) {
    assert.deepEqual(nivelesDeEffort(modelo), []);
  }
});

test("the catalogue is what the API returns, chat models only", () => {
  const cuerpo = {
    object: "list",
    data: [
      { id: "mistral-large-4-0", name: "Mistral Large", capabilities: { completion_chat: true, function_calling: true, reasoning: true } },
      { id: "codestral-2508", capabilities: { completion_chat: false, completion_fim: true } },
      { id: "sin-capacidades" },
    ],
  };
  const modelos = catalogoMistral(cuerpo);
  assert.deepEqual(modelos.map((modelo) => modelo.id), ["mistral-large-4-0", "sin-capacidades"]);
  assert.deepEqual(modelos[0], { id: "mistral-large-4-0", nombre: "Mistral Large", proveedor: "mistral", razona: true });
  assert.deepEqual(modelos[1], { id: "sin-capacidades", nombre: "sin-capacidades", proveedor: "mistral", razona: false });
});

test("a catalogue that is not a list is empty, not a crash", () => {
  assert.deepEqual(catalogoMistral(null), []);
  assert.deepEqual(catalogoMistral({}), []);
  assert.deepEqual(catalogoMistral({ data: "nope" }), []);
});
