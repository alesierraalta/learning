import { initialState, select, promote, close } from './lifecycle.mjs';

// Prerequisite (not enforced here): the caller holds one host-wide exclusive lock
// for this coordinator's entire lifetime and initially knows the slot is empty.
// Successful physical calls must have completed. A rejected call may have changed
// anything; reconcile must authoritatively report the whole slot as null or {pr,sha}.
export function createCoordinator(adapters) {
  let state = initialState();
  let physical = 'known';
  let tail = Promise.resolve();
  let intent = null;
  let revision = 0;

  function enqueue(operation) {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }

  function assertKnown() {
    if (physical !== 'known') throw new Error('Physical preview state unknown; reconciliation required');
  }

  function assertCurrent(token) {
    if (token !== revision) throw new Error('Preview selection superseded');
  }

  async function check(build, token) {
    assertCurrent(token);
    const fresh = await adapters.inspect(build.pr);
    assertCurrent(token);
    if (fresh?.open !== true || fresh.head !== build.sha) throw new Error('PR is closed or head is stale');
    return fresh;
  }

  async function change(method, preview) {
    physical = 'transitioning';
    try {
      await adapters[method]({ ...preview });
    } catch (error) {
      physical = 'unknown';
      state = { ...state, active: null };
      throw error;
    }
  }

  return {
    state: () => structuredClone({ ...state, active: physical === 'known' ? state.active : null, physical }),
    select(pr, sha) {
      select(initialState(), pr, sha);
      const token = ++revision;
      intent = pr;
      return enqueue(async () => {
        assertKnown();
        assertCurrent(token);
        const selected = select(state, pr, sha);
        state = selected.state;
        const build = selected.build;
        await adapters.build({ ...build });
        await check(build, token);
        if (state.active) {
          const active = { ...state.active };
          await change('stop', active);
          const pending = state.pending;
          state = { ...close(state, active.pr).state, pending };
          physical = 'known';
        }
        await check(build, token);
        const preview = { pr, sha };
        await change('start', preview);
        // Until the post-start check completes, report the physical slot as
        // transitioning rather than claiming either an empty or promoted slot.
        physical = 'transitioning';
        let fresh;
        try {
          fresh = await check(build, token);
        } catch (error) {
          try {
            await change('stop', preview);
            physical = 'known';
          } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'Post-start validation and cleanup failed');
          }
          throw error;
        }
        state = promote(state, build, fresh).state;
        physical = 'known';
      });
    },
    close(pr) {
      if (!Number.isSafeInteger(pr) || pr <= 0) throw new TypeError('Expected a positive PR number');
      if (intent === pr) { revision++; intent = null; }
      return enqueue(async () => {
        assertKnown();
        const result = close(state, pr);
        if (result.removed) await change('stop', result.removed);
        state = result.state;
        physical = 'known';
      });
    },
    reconcile() {
      return enqueue(async () => {
        if (physical !== 'unknown') throw new Error('Reconciliation requires unknown physical state');
        const actual = await adapters.reconcile();
        if (actual !== null) {
          if (typeof actual !== 'object' || actual === null || Object.keys(actual).sort().join(',') !== 'pr,sha') {
            throw new TypeError('Reconciliation must return null or {pr, sha}');
          }
          select(initialState(), actual.pr, actual.sha);
        }
        state = { ...state, active: actual === null ? null : { ...actual }, pending: null };
        physical = 'known';
      });
    },
  };
}
