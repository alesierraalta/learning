const fullSha = /^[0-9a-f]{40}$/;

export function initialState() {
  return { generation: 0, pending: null, active: null };
}

export function select(state, pr, sha) {
  if (!Number.isSafeInteger(pr) || pr <= 0 || typeof sha !== 'string' || !fullSha.test(sha)) {
    throw new TypeError('Expected a positive PR number and full lowercase commit SHA');
  }
  const generation = state.generation + 1;
  if (!Number.isSafeInteger(generation)) throw new RangeError('Build generation exhausted');
  const build = { pr, sha, generation };
  return { state: { ...state, generation, pending: { ...build } }, build };
}

export function promote(state, build, fresh) {
  const pending = state.pending;
  if (!pending || pending.pr !== build.pr || pending.sha !== build.sha ||
      pending.generation !== build.generation || fresh.open !== true || fresh.head !== build.sha) {
    return { state, replaced: null };
  }
  return {
    state: { ...state, pending: null, active: { pr: build.pr, sha: build.sha } },
    replaced: state.active,
  };
}

export function close(state, pr) {
  const removed = state.active?.pr === pr ? state.active : null;
  const pending = state.pending?.pr === pr ? null : state.pending;
  if (!removed && pending === state.pending) return { state, removed: null };
  return { state: { ...state, pending, active: removed ? null : state.active }, removed };
}
