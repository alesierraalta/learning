import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, select, promote, close } from './lifecycle.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
const fresh = sha => ({ open: true, head: sha });
const activate = (state, pr, sha) => {
  const selected = select(state, pr, sha);
  return promote(selected.state, selected.build, fresh(sha)).state;
};

test('switching PRs keeps active preview through an unsuccessful build', () => {
  const active = activate(initialState(), 1, a);
  const pending = select(active, 2, b);
  assert.deepEqual(pending.state.active, { pr: 1, sha: a });
  const rejected = promote(pending.state, pending.build, fresh(c));
  assert.deepEqual(rejected.state, pending.state);
  assert.equal(rejected.replaced, null);
  assert.deepEqual(rejected.state.active, { pr: 1, sha: a });
});

test('closing active owner removes only that preview while another build remains pending', () => {
  const pending = select(activate(initialState(), 1, a), 2, b);
  const result = close(pending.state, 1);
  assert.deepEqual(result.removed, { pr: 1, sha: a });
  assert.equal(result.state.active, null);
  assert.deepEqual(result.state.pending, pending.state.pending);
  assert.deepEqual(promote(result.state, pending.build, fresh(b)).state.active, { pr: 2, sha: b });
});

test('replacement returns previous preview and stale close cannot remove new owner', () => {
  const pending = select(activate(initialState(), 1, a), 2, b);
  const result = promote(pending.state, pending.build, fresh(b));
  assert.deepEqual(result.replaced, { pr: 1, sha: a });
  assert.deepEqual(result.state.active, { pr: 2, sha: b });
  assert.equal(result.state.pending, null);
  const staleClose = close(result.state, 1);
  assert.equal(staleClose.removed, null);
  assert.deepEqual(staleClose.state, result.state);
});

test('only latest build for an open PR with matching fresh head promotes', () => {
  const first = select(initialState(), 1, a);
  const second = select(first.state, 1, b);
  for (const [build, status] of [[first.build, fresh(a)], [second.build, fresh(c)], [second.build, { open: false, head: b }]]) {
    const rejected = promote(second.state, build, status);
    assert.deepEqual(rejected.state, second.state);
    assert.equal(rejected.replaced, null);
  }
  assert.deepEqual(promote(second.state, second.build, fresh(b)).state.active, { pr: 1, sha: b });
});

test('close cancels its own pending build and cannot be undone by a late result', () => {
  const selected = select(activate(initialState(), 1, a), 1, b);
  const closed = close(selected.state, 1);
  assert.deepEqual(closed.removed, { pr: 1, sha: a });
  assert.equal(closed.state.pending, null);
  assert.equal(closed.state.active, null);
  assert.deepEqual(promote(closed.state, selected.build, fresh(b)).state, closed.state);
  const reopened = select(closed.state, 1, b);
  assert.deepEqual(promote(reopened.state, selected.build, fresh(b)).state, reopened.state);
});

test('closing pending owner preserves another PR’s active preview', () => {
  const selected = select(activate(initialState(), 1, a), 2, b);
  const result = close(selected.state, 2);
  assert.equal(result.removed, null);
  assert.equal(result.state.pending, null);
  assert.deepEqual(result.state.active, { pr: 1, sha: a });
  assert.deepEqual(promote(result.state, selected.build, fresh(b)).state, result.state);
});

test('repeated selection of the same SHA invalidates the older build', () => {
  const first = select(initialState(), 1, a);
  const second = select(first.state, 1, a);
  assert.deepEqual(promote(second.state, first.build, fresh(a)).state, second.state);
  assert.deepEqual(promote(second.state, second.build, fresh(a)).state.active, { pr: 1, sha: a });
});

test('selection requires a positive PR number and an exact full SHA', () => {
  for (const [pr, sha] of [[0, a], [1, 'abc'], [1, 'A'.repeat(40)], [1, 'g'.repeat(40)]]) {
    assert.throws(() => select(initialState(), pr, sha));
  }
});
