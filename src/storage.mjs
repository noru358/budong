export const STORAGE_KEY = 'budong.personal.v1';
const blank = () => ({ version: 1, cases: [], recentProjectIds: [] });
const clone = value => JSON.parse(JSON.stringify(value));
function validState(state) {
  return state && state.version === 1 && Array.isArray(state.cases) &&
    state.cases.every(c => c && typeof c.id === 'string' && c.id && typeof c.project_id === 'string' && c.project_id) &&
    new Set(state.cases.map(c => c.id)).size === state.cases.length &&
    Array.isArray(state.recentProjectIds) && state.recentProjectIds.every(id => typeof id === 'string');
}
export function createWorkspaceStore(storage) {
  function read() {
    if (!storage) throw new Error('이 브라우저에서 로컬 저장을 사용할 수 없습니다.');
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return blank();
    let state;
    try { state = JSON.parse(raw); } catch { throw new Error('저장된 물건을 읽을 수 없습니다. 기존 데이터를 덮어쓰지 않았습니다.'); }
    if (!validState(state)) throw new Error('저장된 데이터 형식을 확인해야 합니다. 기존 데이터를 덮어쓰지 않았습니다.');
    return clone(state);
  }
  function update(change) {
    const state = read();
    change(state);
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return clone(state);
  }
  return {
    load: read,
    saveCase(investmentCase) {
      if (!investmentCase?.id || !investmentCase?.project_id || typeof investmentCase.id !== 'string' || typeof investmentCase.project_id !== 'string') throw new Error('물건과 구역 식별자가 필요합니다.');
      return update(state => {
        const item = clone(investmentCase);
        const index = state.cases.findIndex(c => c.id === item.id);
        if (index < 0) state.cases.push(item); else state.cases[index] = item;
      });
    },
    deleteCase(id) { return update(state => { state.cases = state.cases.filter(c => c.id !== id); }); },
    recordRecent(projectId) {
      if (typeof projectId !== 'string' || !projectId) throw new Error('구역 식별자가 필요합니다.');
      return update(state => { state.recentProjectIds = [projectId, ...state.recentProjectIds.filter(id => id !== projectId)].slice(0, 8); });
    }
  };
}
