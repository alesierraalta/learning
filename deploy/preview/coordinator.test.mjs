import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinator } from './coordinator.mjs';

const a = 'a'.repeat(40), b = 'b'.repeat(40);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  const events = [], heads = new Map([[1, a], [2, b]]);
  let physical = null;
  const adapters = {
    build: async build => { events.push(`build:${build.pr}`); },
    inspect: async pr => { events.push(`inspect:${pr}`); return { open: heads.has(pr), head: heads.get(pr) }; },
    stop: async preview => { events.push(`stop:${preview.pr}`); assert.deepEqual(physical, preview); physical = null; },
    start: async preview => { events.push(`start:${preview.pr}`); assert.equal(physical, null); physical = preview; },
  };
  return { events, heads, adapters, physical: () => physical };
}

test('replaces the one physical slot only after two freshness checks and scopes close', async () => {
  const f = fixture(), c = createCoordinator(f.adapters);
  await c.select(1, a); f.events.length = 0;
  await c.select(2, b);
  assert.deepEqual(f.events, ['build:2', 'inspect:2', 'stop:1', 'inspect:2', 'start:2', 'inspect:2']);
  await c.close(1);
  assert.deepEqual(c.state().active, { pr: 2, sha: b });
  assert.deepEqual(f.physical(), c.state().active);
  await c.close(2);
  assert.equal(f.physical(), null);
  assert.equal(c.state().active, null);
});

test('freshness rejection preserves old preview before stop, and records empty slot after stop', async () => {
  const f = fixture(), c = createCoordinator(f.adapters);
  await c.select(1, a);
  f.heads.set(2, a);
  await assert.rejects(c.select(2, b));
  assert.equal(c.state().active.pr, 1);
  f.heads.set(2, b);
  const stop = f.adapters.stop;
  f.adapters.stop = async p => { await stop(p); f.heads.delete(2); };
  await assert.rejects(c.select(2, b));
  assert.equal(c.state().active, null);
  assert.equal(f.physical(), null);
});

test('failed start records empty slot and failed stop preserves existing preview', async () => {
  const f = fixture(), c = createCoordinator(f.adapters);
  await c.select(1, a);
  const stop = f.adapters.stop;
  f.adapters.stop = async () => { throw Error('stop failed'); };
  await assert.rejects(c.select(2, b), /stop failed/);
  assert.equal(c.state().physical, 'unknown');
  f.adapters.reconcile = async () => f.physical();
  await c.reconcile();
  f.adapters.stop = stop;
  f.adapters.start = async () => { throw Error('start failed'); };
  await assert.rejects(c.select(2, b), /start failed/);
  assert.equal(c.state().physical, 'unknown');
  assert.equal(f.physical(), null);
});

test('close or later selection invalidates an in-flight build before physical changes', async () => {
  for (const action of ['close', 'select']) {
    const f = fixture(), gate = deferred(), entered = deferred();
    f.adapters.build = async build => { if (build.pr === 1) { entered.resolve(); await gate.promise; } };
    const c = createCoordinator(f.adapters), old = c.select(1, a);
    await entered.promise;
    const next = action === 'close' ? c.close(1) : c.select(2, b);
    gate.resolve();
    await assert.rejects(old, /superseded/);
    await next;
    assert.ok(!f.events.includes('start:1'));
    assert.deepEqual(c.state().active, f.physical());
  }
});

test('partial physical failures block all mutations until trusted reconciliation', async () => {
  for (const failing of ['start', 'stop']) {
    const f = fixture(), c = createCoordinator(f.adapters);
    if (failing === 'stop') await c.select(1, a);
    const original = f.adapters[failing];
    f.adapters[failing] = async p => { await original(p); throw Error('partial'); };
    await assert.rejects(c.select(2, b), /partial/);
    assert.equal(c.state().physical, 'unknown');
    assert.equal(c.state().active, null);
    const before = f.events.slice();
    await assert.rejects(c.select(1, a), /unknown/);
    await assert.rejects(c.close(2), /unknown/);
    assert.deepEqual(f.events, before);
    f.adapters.reconcile = async () => f.physical();
    await c.reconcile();
    assert.equal(c.state().physical, 'known');
    assert.deepEqual(c.state().active, f.physical());
    f.adapters[failing] = original;
    await c.close(2);
    assert.equal(f.physical(), null);
  }
});

test('head change during start cleans up without promotion; failed cleanup blocks', async () => {
  for (const cleanupFails of [false, true]) {
    const f = fixture(), start = f.adapters.start, stop = f.adapters.stop;
    f.adapters.start = async p => { await start(p); f.heads.set(1, b); };
    if (cleanupFails) f.adapters.stop = async p => { await stop(p); throw Error('cleanup failed'); };
    const c = createCoordinator(f.adapters);
    await assert.rejects(c.select(1, a));
    assert.equal(c.state().active, null);
    assert.equal(c.state().physical, cleanupFails ? 'unknown' : 'known');
    assert.equal(f.physical(), null);
    if (cleanupFails) await assert.rejects(c.select(2, b), /unknown/);
  }
});

test('failed or invalid reconciliation cannot unblock physical operations', async () => {
  const f = fixture(), c = createCoordinator(f.adapters);
  f.adapters.start = async () => { throw Error('uncertain start'); };
  await assert.rejects(c.select(1, a), /uncertain start/);
  f.adapters.reconcile = async () => { throw Error('inspection failed'); };
  await assert.rejects(c.reconcile(), /inspection failed/);
  f.adapters.reconcile = async () => ({ pr: 1, sha: 'bad' });
  await assert.rejects(c.reconcile(), /full lowercase/);
  await assert.rejects(c.close(1), /unknown/);
  assert.equal(c.state().physical, 'unknown');
});

test('later selection during start cleans stale preview before new start', async () => {
  const f = fixture(), gate = deferred(), entered = deferred(), start = f.adapters.start;
  f.adapters.start = async p => { if (p.pr === 1) { entered.resolve(); await gate.promise; } await start(p); };
  const c = createCoordinator(f.adapters), old = c.select(1, a);
  await entered.promise;
  const next = c.select(2, b);
  gate.resolve();
  await assert.rejects(old, /superseded/);
  await next;
  assert.deepEqual(f.events.filter(e => /^(start|stop):/.test(e)), ['start:1', 'stop:1', 'start:2']);
  assert.deepEqual(c.state().active, f.physical());
});

test('same PR update retains its pending build after stopping the old SHA', async () => {
  const f = fixture(), c = createCoordinator(f.adapters);
  await c.select(1, a);
  f.heads.set(1, b);
  await c.select(1, b);
  assert.deepEqual(c.state().active, { pr: 1, sha: b });
  assert.deepEqual(c.state().active, f.physical());
});

test('close during an in-flight start serializes the stop after start', async () => {
  const f = fixture(), gate = deferred(), entered = deferred(), start = f.adapters.start;
  f.adapters.start = async preview => { entered.resolve(); await gate.promise; await start(preview); };
  const c = createCoordinator(f.adapters), selected = c.select(1, a);
  await entered.promise;
  const closed = c.close(1);
  gate.resolve();
  await assert.rejects(selected, /superseded/);
  await closed;
  assert.deepEqual(f.events.slice(-2), ['start:1', 'stop:1']);
  assert.equal(c.state().active, null);
  assert.equal(f.physical(), null);
});
