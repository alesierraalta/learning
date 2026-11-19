// The authoring gate reads every new kit element's own DOM-free validator.
// A note that ships a broken spec is refused before the reader shows an empty box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditNote } from '../audit-note.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const EXAMPLE = {
  'lk-stage': 'integrations/pi/kit/examples/lk-stage-robot.html',
  'lk-codestep': 'integrations/pi/kit/examples/lk-codestep.html',
  'lk-tablestep': 'integrations/pi/kit/examples/lk-tablestep.html',
  'lk-guided': 'integrations/pi/kit/examples/lk-guided.html',
  'lk-lanes': 'integrations/pi/kit/examples/lk-lanes.html',
};
const block = (tag, spec) => `<${tag}>\n<script type="application/json">\n${JSON.stringify(spec, null, 2)}\n</script>\n</${tag}>`;
const note = (tag, spec) => `# Prueba\n\n${block(tag, spec)}\n`;
const exampleSpec = (tag) => {
  const html = readFileSync(join(ROOT, EXAMPLE[tag]), 'utf8');
  const payload = /<script type="application\/json">([\s\S]*?)<\/script>/i.exec(html)?.[1];
  assert.ok(payload, `${tag}: example has no JSON payload`);
  return JSON.parse(payload);
};

for (const tag of Object.keys(EXAMPLE)) {
  test(`${tag}: a valid spec passes the note gate`, () => {
    const result = auditNote(note(tag, exampleSpec(tag)), 'parte.md');
    assert.deepEqual(result.violations, []);
  });

  test(`${tag}: an invalid spec names the element, index, path and value`, () => {
    const spec = { ...exampleSpec(tag), scandal: 42 };
    const violations = auditNote(note(tag, spec), 'parte.md').violations;
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.match(violations[0], new RegExp(tag.replace('lk-', 'lk-')));
    assert.match(violations[0], /1/); // first element in the note
    assert.match(violations[0], /scandal/); // offending path
    assert.match(violations[0], /42/); // offending value
  });
}

test('an element without a JSON payload is refused by the note gate', () => {
  const violations = auditNote('<lk-lanes><p>sin spec</p></lk-lanes>').violations;
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.match(violations[0], /lk-lanes/);
});
