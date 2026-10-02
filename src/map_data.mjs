import { evaluateSourceOperation } from './source_policy.mjs';
import { assertNoSecretLikeFields } from './adapters/contracts.mjs';
import { safeSourceUrl } from './legal.mjs';

export const MAP_STORAGE_KEY = 'budong.map.personal.v1';
const https = (value) => Boolean(safeSourceUrl(value));
const date = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))
    return false;
  try {
    return new Date(value).toISOString().slice(0, 10) === value.slice(0, 10);
  } catch {
    return false;
  }
};

// Imported provenance is supplied by the reviewer. This validates the contract,
// not the truth of the document or a legal boundary on the ground.
export function inspectBoundary(
  feature,
  { projects = [], sources = [], mode = 'PERSONAL' } = {},
) {
  const p = feature?.properties || {},
    issues = [];
  if (!projects.some((project) => project.id === p.project_id))
    issues.push('연결할 구역 식별자를 확인하세요.');
  if (!['OFFICIAL', 'ADMIN_CANDIDATE', 'USER_DRAWN'].includes(p.boundary_kind))
    issues.push('경계 종류를 명시하세요.');
  const own = p.boundary_kind === 'USER_DRAWN';
  const source = sources.find(
    (s) => s.source_id === p.source_id || s.id === p.source_id,
  );
  if (own && p.source_id !== 'USER_INPUT')
    issues.push('직접 작성한 경계의 출처는 USER_INPUT이어야 합니다.');
  if (!own && p.source_id === 'USER_INPUT')
    issues.push('외부 경계를 사용자 작성 경계로 바꿀 수 없습니다.');
  if (!own) {
    if (!https(p.source_url || p.source_locator))
      issues.push('경계 원문의 HTTPS 주소가 필요합니다.');
    if (p.review_status !== 'REVIEWED' || !date(p.reviewed_at))
      issues.push('원문과 구역 연결의 검토 기록이 필요합니다.');
    if (!p.license_name || !date(p.license_reviewed_at))
      issues.push('이용조건과 확인일이 필요합니다.');
    if (
      p.attribution_required !== false &&
      !(p.attribution_required === true && String(p.attribution || '').trim())
    )
      issues.push('출처 표시 조건이 필요합니다.');
    if (![false, true].includes(p.geometry_transformed))
      issues.push('원본 좌표의 가공 여부를 명시하세요.');
  }
  const operation = evaluateSourceOperation(
    source || { source_id: p.source_id },
    { mode, operation: 'map_display' },
  );
  if (
    operation.requires_attribution &&
    !own &&
    (p.attribution_required !== true || !String(p.attribution || '').trim())
  )
    issues.push('등록된 출처의 필수 출처표시를 유지해야 합니다.');
  if (!operation.enabled)
    issues.push(operation.reason || '지도 표시 이용조건 확인이 필요합니다.');
  if (p.geometry_transformed === true) {
    const transform = evaluateSourceOperation(
      source || { source_id: p.source_id },
      { mode, operation: 'geometry_transform' },
    );
    if (!transform.enabled)
      issues.push('좌표 변환·가공 허락을 검증한 출처 등록이 필요합니다.');
  }
  if (mode.toUpperCase() === 'COMMERCIAL' && !operation.enabled)
    issues.push('상업 모드에서는 이 출처를 표시할 수 없습니다.');
  try {
    validateGeometry(feature?.geometry);
  } catch (error) {
    issues.push(error.message);
  }
  return {
    enabled: issues.length === 0,
    issues,
    kind: p.boundary_kind,
    source_policy: operation,
    verification: 'REVIEWER_SUPPLIED_PROVENANCE',
  };
}

export function validateGeometry(geometry) {
  if (!['Polygon', 'MultiPolygon'].includes(geometry?.type))
    throw new Error('Polygon 또는 MultiPolygon 경계가 필요합니다.');
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length)
    throw new Error('경계 좌표가 비어 있습니다.');
  let count = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length)
      throw new Error('경계 고리를 확인하세요.');
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error('경계 고리는 최소 4개 좌표가 필요합니다.');
      for (const point of ring) {
        count++;
        if (
          !Array.isArray(point) ||
          point.length < 2 ||
          !point.slice(0, 2).every(Number.isFinite) ||
          Math.abs(point[0]) > 180 ||
          Math.abs(point[1]) > 85.051129
        )
          throw new Error('경도·위도 좌표(EPSG:4326)를 확인하세요.');
      }
      const first = ring[0],
        last = ring.at(-1);
      if (first[0] !== last[0] || first[1] !== last[1])
        throw new Error('경계 고리의 시작·끝 좌표가 같아야 합니다.');
    }
  }
  if (count > 50000) throw new Error('파일의 좌표 수가 너무 많습니다.');
  return true;
}

export function parseBoundaryFile(text, context) {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).length > 2 * 1024 * 1024
  )
    throw new Error('경계 파일은 2MB 이하로 가져오세요.');
  let collection;
  try {
    collection = JSON.parse(text);
  } catch {
    throw new Error('GeoJSON 파일 형식을 확인하세요.');
  }
  assertNoSecretLikeFields(collection);
  if (
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    !collection.features.length ||
    collection.features.length > 100
  )
    throw new Error('1~100개 경계를 담은 FeatureCollection이 필요합니다.');
  const results = collection.features.map((feature) =>
    inspectBoundary(feature, context),
  );
  const rejected = results.find((result) => !result.enabled);
  if (rejected) throw new Error(rejected.issues.join(' '));
  return collection;
}

export function makePersonalPin(
  { project_id, latitude, longitude, label },
  projects,
) {
  if (
    !projects.some((p) => p.id === project_id) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 85.051129 ||
    Math.abs(longitude) > 180
  )
    throw new Error('구역과 올바른 위도·경도를 확인하세요.');
  return {
    project_id,
    latitude,
    longitude,
    label: String(label || '직접 표시한 위치').slice(0, 120),
    source_id: 'USER_INPUT',
    certainty: 'USER_ASSUMPTION',
    observed_at: new Date().toISOString(),
  };
}
