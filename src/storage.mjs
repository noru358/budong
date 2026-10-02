export const STORAGE_KEY = 'budong.personal.v1';
import { assertNoSecretLikeFields } from './adapters/contracts.mjs';
const blank = () => ({ version: 1, cases: [], recentProjectIds: [] });
const clone = (value) => JSON.parse(JSON.stringify(value));
function validState(state) {
  return (
    state &&
    state.version === 1 &&
    Array.isArray(state.cases) &&
    state.cases.every(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        c.id &&
        typeof c.project_id === 'string' &&
        c.project_id,
    ) &&
    new Set(state.cases.map((c) => c.id)).size === state.cases.length &&
    Array.isArray(state.recentProjectIds) &&
    state.recentProjectIds.every((id) => typeof id === 'string')
  );
}
export function inspectWorkspaceBackup(text, { knownProjectIds = [] } = {}) {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).length > 2 * 1024 * 1024
  )
    throw new Error('백업 파일은 2MB 이하로 가져오세요.');
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    throw new Error('백업 JSON 파일 형식을 확인하세요.');
  }
  assertNoSecretLikeFields(state);
  if (!validState(state) || state.cases.length > 1000)
    throw new Error('budong 버전1 백업 형식이 필요합니다.');
  const known = new Set(knownProjectIds);
  for (const c of state.cases) {
    if (known.size && !known.has(c.project_id))
      throw new Error('현재 목록에 없는 구역의 물건이 포함되어 있습니다.');
    if (
      !Array.isArray(c.future_events) ||
      c.future_events.length > 100 ||
      c.future_events.some(
        (e) => !e || typeof e !== 'object' || Array.isArray(e),
      )
    )
      throw new Error('백업의 지급 일정 형식을 확인하세요.');
    for (const field of [
      'contract_price',
      'acquisition_incidental_cost',
      'existing_deposit_assumed',
      'initial_loan_draw',
      'paid_contribution',
      'available_cash',
    ]) {
      if (
        c[field] != null &&
        (typeof c[field] !== 'number' || !Number.isFinite(c[field]))
      )
        throw new Error('백업의 금액 형식을 확인하세요.');
    }
    if (c.exit != null && (typeof c.exit !== 'object' || Array.isArray(c.exit)))
      throw new Error('백업의 매도 조건 형식을 확인하세요.');
    for (const field of ['user_assumptions', 'unresolved_items'])
      if (
        c[field] != null &&
        (!Array.isArray(c[field]) ||
          c[field].some((v) => typeof v !== 'string'))
      )
        throw new Error('백업의 메모 형식을 확인하세요.');
  }
  return {
    state: clone(state),
    case_count: state.cases.length,
    scope: 'USER_CASES_ONLY',
    restores_map: false,
  };
}
export function createWorkspaceStore(storage) {
  function read() {
    if (!storage)
      throw new Error('이 브라우저에서 로컬 저장을 사용할 수 없습니다.');
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return blank();
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      throw new Error(
        '저장된 물건을 읽을 수 없습니다. 기존 데이터를 덮어쓰지 않았습니다.',
      );
    }
    if (!validState(state))
      throw new Error(
        '저장된 데이터 형식을 확인해야 합니다. 기존 데이터를 덮어쓰지 않았습니다.',
      );
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
    importBackup(text, options = {}) {
      const imported = inspectWorkspaceBackup(text, options).state;
      return update((state) => {
        // Restore by merging; an existing id always keeps its current version.
        const ids = new Set(state.cases.map((c) => c.id));
        state.cases.push(...imported.cases.filter((c) => !ids.has(c.id)));
        state.recentProjectIds = [
          ...new Set([...state.recentProjectIds, ...imported.recentProjectIds]),
        ].slice(0, 8);
      });
    },
    saveCase(investmentCase) {
      if (
        !investmentCase?.id ||
        !investmentCase?.project_id ||
        typeof investmentCase.id !== 'string' ||
        typeof investmentCase.project_id !== 'string'
      )
        throw new Error('물건과 구역 식별자가 필요합니다.');
      return update((state) => {
        const item = clone(investmentCase);
        const index = state.cases.findIndex((c) => c.id === item.id);
        if (index < 0) state.cases.push(item);
        else state.cases[index] = item;
      });
    },
    deleteCase(id) {
      return update((state) => {
        state.cases = state.cases.filter((c) => c.id !== id);
      });
    },
    recordRecent(projectId) {
      if (typeof projectId !== 'string' || !projectId)
        throw new Error('구역 식별자가 필요합니다.');
      return update((state) => {
        state.recentProjectIds = [
          projectId,
          ...state.recentProjectIds.filter((id) => id !== projectId),
        ].slice(0, 8);
      });
    },
  };
}
