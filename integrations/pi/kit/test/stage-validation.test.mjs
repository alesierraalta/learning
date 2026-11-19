// S4: the stage reads one declared vocabulary. Everything outside it is a spec
// error that names the offending value and the path the tutor wrote it at.
//
// Uso: node --test integrations/pi/kit/test/stage-validation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
require(join(KIT, 'stage.js'));
// A classic kit script has no ESM export; its public API is the global the
// browser reads too, so the test uses exactly the same object.
const { validate } = globalThis.lkStage;

const valid = () => ({
  title: 'Recompensa diferida',
  question: '¿Qué acciones elijo a lo largo del tiempo para maximizar la recompensa total?',
  focus: 'acciones',
  actors: [
    { id: 'robot', kind: 'robot', cell: 'B3', name: 'Robot', color: '#5AB0FF' },
    { id: 'room', kind: 'room', cell: 'D2', name: 'Habitación sucia', color: '#F2B45C' },
    { id: 'charger', kind: 'charger', cell: 'E4', name: 'Cargador', color: '#5FD6A4' },
    { id: 'battery', kind: 'block', cell: 'A5', name: 'Batería', color: '#9AA7BD' },
  ],
  lanes: [
    { id: 'sweep', from: 'robot', to: 'room', verb: 'aspirar', identity: 'robot' },
    { id: 'charge', from: 'robot', to: 'charger', verb: 'cargar', identity: 'charger' },
  ],
  steps: [
    {
      activeActor: 'robot', battery: 4, highlightLane: null,
      facts: [{ identity: 'battery', label: 'Batería', value: '4 %', tone: 'warn' }],
      narrator: ['Le queda [4 % de batería|warn].'],
      focusOn: [{ target: 'actor:robot', tone: 'look' }],
    },
    {
      activeActor: 'charger', battery: 100, highlightLane: 'charge',
      facts: [{ identity: 'charger', label: 'Batería', value: '100 %', tone: 'good' }],
      narrator: ['Si miras la hora siguiente, [cargar gana|good].'],
    },
  ],
});

const fails = (change, message) => {
  const spec = valid();
  change(spec);
  assert.throws(() => validate(spec), { message });
};

test('a declared robot story validates without changing the author\'s object', () => {
  const spec = valid();
  const result = validate(spec);
  assert.equal(result.question, spec.question);
  assert.equal(result.actors.length, 4);
  assert.equal(result.steps.length, 2);
  assert.notEqual(result.actors[0], spec.actors[0], 'validation returns its own copy');
  assert.equal(spec.actors[0].kind, 'robot', 'the input is untouched');
});

test('an unknown key names the value and its path', () => {
  fails((spec) => { spec.extra = 'nope'; }, 'extra: unknown key "extra"');
  fails((spec) => { spec.actors[0].identity = 'robot'; }, 'actors[0].identity: unknown key "identity"');
});

test('an unknown kind names the value and its path', () => {
  fails((spec) => { spec.actors[0].kind = 'tree'; }, 'actors[0].kind: "tree" is not a kind');
});

test('an unknown cell names the value and its path', () => {
  fails((spec) => { spec.actors[0].cell = 'Z9'; }, 'actors[0].cell: "Z9" is not a cell');
});

test('a lane pointing at an unknown actor names the value and its path', () => {
  fails((spec) => { spec.lanes[0].to = 'robo'; }, 'lanes[0].to: "robo" is not an actor');
  fails((spec) => { spec.lanes[0].identity = 'ghost'; }, 'lanes[0].identity: "ghost" is not an actor');
});

test('a step with an unknown active actor names the value and its path', () => {
  fails((spec) => { spec.steps[1].activeActor = 'robo'; }, 'steps[1].activeActor: "robo" is not an actor');
  fails((spec) => { spec.steps[1].highlightLane = 'sweep2'; }, 'steps[1].highlightLane: "sweep2" is not a lane');
});

test('an unknown chip tone names the value and its path', () => {
  fails((spec) => { spec.steps[0].narrator[0] = 'Le queda [4 %|loud].'; }, 'steps[0].narrator[0]: "loud" is not a tone');
});

test('an unknown fact tone names the value and its path', () => {
  fails((spec) => { spec.steps[0].facts[0].tone = 'muted'; }, 'steps[0].facts[0].tone: "muted" is not a tone');
});

test('a fact pointing at an unknown actor names the value and its path', () => {
  fails((spec) => { spec.steps[0].facts[0].identity = 'ghost'; }, 'steps[0].facts[0].identity: "ghost" is not an actor');
});

test('any x or y key is refused, wherever it is written', () => {
  fails((spec) => { spec.actors[0].x = 12; }, 'actors[0].x: unknown key "x"');
  fails((spec) => { spec.steps[1].y = 40; }, 'steps[1].y: unknown key "y"');
  fails((spec) => { spec.grid = { x: 1 }; }, 'grid.x: unknown key "x"');
});

test('a focus word absent from the question names the value and its path', () => {
  fails((spec) => { spec.focus = 'ninguna'; }, 'focus: "ninguna" is not in the question');
});

test('focusOn accepts the declared actor, tag, lane and fact targets', () => {
  const spec = valid();
  spec.steps[1].focusOn = [
    { target: 'lane:charge', tone: 'right' },
    { target: 'fact:0', tone: 'wrong' },
  ];
  const result = validate(spec);
  assert.deepEqual(result.steps[1].focusOn, spec.steps[1].focusOn);
  assert.deepEqual(result.steps[0].focusOn, [{ target: 'actor:robot', tone: 'look' }]);
});

test('focusOn with no one-or-two targets names the step', () => {
  fails((spec) => { spec.steps[0].focusOn = []; }, 'steps[0].focusOn: expected one or two focus targets');
  fails((spec) => { spec.steps[0].focusOn = [
    { target: 'actor:robot', tone: 'look' },
    { target: 'tag:robot', tone: 'look' },
    { target: 'lane:charge', tone: 'look' },
  ]; }, 'steps[0].focusOn: expected one or two focus targets');
});

test('a focus target names the offending prefix, id and path', () => {
  fails((spec) => { spec.steps[0].focusOn[0].target = 'bogus:robot'; },
    'steps[0].focusOn[0].target: "bogus:robot" must be actor:, tag:, lane: or fact:');
  fails((spec) => { spec.steps[0].focusOn[0].target = 'actor:robo'; },
    'steps[0].focusOn[0].target: "robo" is not an actor');
  fails((spec) => { spec.steps[0].focusOn[0].target = 'tag:ghost'; },
    'steps[0].focusOn[0].target: "ghost" is not an actor');
  fails((spec) => { spec.steps[0].focusOn[0].target = 'lane:nope'; },
    'steps[0].focusOn[0].target: "nope" is not a lane');
  fails((spec) => { spec.steps[0].focusOn[0].target = 'fact:1'; },
    'steps[0].focusOn[0].target: "fact:1" is not a fact of this step');
});

test('a focus tone or duplicate target names the offending value and path', () => {
  fails((spec) => { spec.steps[0].focusOn[0].tone = 'loud'; },
    'steps[0].focusOn[0].tone: "loud" is not a focus tone');
  fails((spec) => { spec.steps[0].focusOn = [
    { target: 'actor:robot', tone: 'look' },
    { target: 'actor:robot', tone: 'right' },
  ]; }, 'steps[0].focusOn: duplicate focus target');
});
