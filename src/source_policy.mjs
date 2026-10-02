// Source use permissions are independent of factual/legal certainty and API access.
// A noncommercial app does not automatically clear an unknown source licence.
import {safeSourceUrl} from './legal.mjs';

export const SOURCE_OPERATIONS = Object.freeze([
  'view_original', 'raw_download', 'reference_metadata', 'normalize',
  'geometry_transform', 'map_display', 'bulk_collect', 'redistribute'
]);
const STATES = new Set(['allowed', 'requires_review', 'noncommercial', 'no_derivatives']);
const MODIFYING = new Set(['normalize', 'geometry_transform']);
const LABELS = {
  personal: {allowed:'개인 이용 가능',requires_review:'개인 재사용 조건 확인 필요',noncommercial:'비상업 이용만 가능',no_derivatives:'변경 불가'},
  commercial: {allowed:'상업 이용 가능 · 조건 준수',requires_review:'상업 이용 전 조건 확인',noncommercial:'상업 이용 금지',no_derivatives:'변경 불가'},
  modification: {allowed:'가공 가능 · 조건 준수',requires_review:'가공 범위 확인 필요',noncommercial:'비상업 이용만 가능',no_derivatives:'변경·파생 제작 금지'}
};
const cleanState = value => STATES.has(value) ? value : 'requires_review';
function validReviewDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}

export function getSourceUsePolicy(source = {}) {
  const policy = source?.use_policy ?? {};
  const evidence = (Array.isArray(policy.evidence) ? policy.evidence : []).filter(item =>
    item && safeSourceUrl(item.url) && validReviewDate(item.checked_at) && typeof item.observed_statement === 'string' && item.observed_statement.trim());
  const internalInput = source?.source_id === 'USER_INPUT' && policy.basis === 'USER_AUTHORED_APP_INPUT_CONTRACT';
  const reviewed = policy.verified === true && validReviewDate(policy.reviewed_at) && (evidence.length > 0 || internalInput);
  const personal = reviewed ? cleanState(policy.personal_use) : 'requires_review';
  const commercial = reviewed ? cleanState(policy.commercial_use) : 'requires_review';
  const modification = reviewed ? cleanState(policy.modification) : 'requires_review';
  return {
    source_id: source?.source_id ?? null, name: source?.name ?? '출처 확인 필요',
    catalog_url: safeSourceUrl(source?.catalog_url ?? source?.url ?? policy.conditions_url),
    license_id: reviewed ? policy.license_id ?? 'DOCUMENT_SPECIFIC' : 'UNREVIEWED',
    personal_use: personal, commercial_use: commercial, modification,
    attribution_required: reviewed ? policy.attribution_required === true : null,
    attribution_text: reviewed ? policy.attribution_text ?? source?.institution ?? source?.name ?? null : null,
    reviewed_at: reviewed ? policy.reviewed_at : null,
    conditions_url: safeSourceUrl(policy.conditions_url), verified: reviewed,
    legal_basis: reviewed ? policy.legal_basis ?? null : null,
    required_runtime_context: reviewed ? policy.required_runtime_context ?? null : null,
    scope_note: policy.scope_note ?? '공개 페이지 접근과 데이터 재사용 허락을 구분합니다.',
    conditions: Array.isArray(policy.conditions) ? policy.conditions.filter(value => typeof value === 'string') : [],
    prohibited_operations: Array.isArray(policy.prohibited_operations) ? policy.prohibited_operations.filter(value => typeof value === 'string') : [],
    operation_permissions: Object.fromEntries(SOURCE_OPERATIONS.map(operation => [operation,
      reviewed ? cleanState(policy.operation_permissions?.[operation]) : 'requires_review'])),
    evidence: evidence.map(item => ({...item, url:safeSourceUrl(item.url)})),
    labels: {personal:reviewed && policy.required_runtime_context === 'LOCAL_PRIVATE' ? '이 기기 내 비영리 사적 이용만 가능' : LABELS.personal[personal],commercial:LABELS.commercial[commercial],modification:LABELS.modification[modification]}
  };
}

export function listSourceUsePolicies(registry = {}) {
  const sources = Array.isArray(registry) ? registry : registry?.sources;
  return (Array.isArray(sources) ? sources : []).map(getSourceUsePolicy);
}

export function evaluateSourceOperation(source, {mode = 'PERSONAL', operation = 'reference_metadata', runtimeContext = null} = {}) {
  const policy = getSourceUsePolicy(source);
  const normalizedMode = String(mode).toUpperCase();
  const result = status => ({source_id:policy.source_id, mode:normalizedMode, operation,
    status, enabled:status === 'allowed', requires_attribution:policy.attribution_required === true,
    conditions:policy.conditions, reason:status === 'allowed' ? '확인한 이용범위와 출처 조건을 준수하여 사용 가능'
      : status === 'noncommercial' ? '이 출처는 상업적 이용이 금지되어 있습니다.'
      : status === 'no_derivatives' ? '개인 이용이어도 변경·파생 제작 금지 조건은 유지됩니다.'
      : '이 작업에 필요한 출처별 이용조건을 확인해야 합니다.'});
  if (!['PERSONAL','COMMERCIAL'].includes(normalizedMode) || !SOURCE_OPERATIONS.includes(operation)) return result('requires_review');
  if (policy.prohibited_operations.includes(operation)) return {...result('requires_review'), prohibited:true, reason:'이 출처의 검토된 이용 계약에서 금지한 작업입니다. 해당 작업을 허용하는 다른 출처가 필요합니다.'};
  // Opening a public original URL is not republication or a licence assertion.
  if (operation === 'view_original' && policy.catalog_url) return result('allowed');
  // PERSONAL alone can mean a publicly hosted nonprofit app. Private-copy review
  // applies only when the caller derives LOCAL_PRIVATE from enforced local use;
  // never forward this value from uploaded feature properties or request JSON.
  if (policy.required_runtime_context && (normalizedMode !== 'PERSONAL' || runtimeContext !== policy.required_runtime_context)) {
    return {...result(normalizedMode === 'COMMERCIAL' ? policy.commercial_use : 'requires_review'), enabled:false,
      reason:'이 자료는 영리 목적이 아닌 이 기기 내 사적 참고 범위로만 검토했습니다. 공개 서비스·공유·상업 이용은 별도 허락을 확인해야 합니다.'};
  }
  if (normalizedMode === 'COMMERCIAL' && policy.commercial_use !== 'allowed') return result(policy.commercial_use);
  if (normalizedMode === 'PERSONAL' && policy.personal_use !== 'allowed') return result(policy.personal_use);
  if (MODIFYING.has(operation) && policy.modification !== 'allowed') return result(policy.modification);
  return result(policy.operation_permissions[operation]);
}

export function evaluateDerivedSourceUse(sources = [], options = {}) {
  const decisions = (Array.isArray(sources) ? sources : []).map(source => evaluateSourceOperation(source, options));
  const denied = decisions.find(item => item.status === 'noncommercial')
    ?? decisions.find(item => item.status === 'no_derivatives')
    ?? decisions.find(item => !item.enabled);
  return {enabled:decisions.length > 0 && !denied, status:denied?.status ?? (decisions.length ? 'allowed' : 'requires_review'), sources:decisions};
}
