import { validateGeometry } from '../map_data.mjs';

export const URBAN_BOUNDARY_SOURCE_ID = 'SEOUL_URBAN_PLAN_GEOJSON';
export const URBAN_BOUNDARY_QUERY = 'https://urban.seoul.go.kr/proxy/proxy.jsp?http://98.33.2.225:6080/arcgis/rest/services/UPIS/20200526_WFS/MapServer/12/query';

// These are reviewed project identity mappings, not a spatial join or a legal
// boundary determination. The official viewer itself describes the map as a
// reference without legal effect. Preserve the server's native GeoJSON geometry.
const lot = (value) => String(value || '').replace(/\s+/g, '').replace(/일대$/, '');
const validDate = (value) => {
  try { return /^\d{4}-\d{2}-\d{2}T/.test(value) && new Date(value).toISOString().slice(0, 10) === value.slice(0, 10); }
  catch { return false; }
};

export function attachUrbanBoundaryProvenance(collection, { projects, mappings, observedAt, responseSha256, license = {} }) {
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Native GeoJSON FeatureCollection required');
  if (!validDate(observedAt) || !/^[a-f0-9]{64}$/.test(responseSha256 || '')) throw new Error('Source response observation and SHA256 required');
  if (!Array.isArray(mappings) || new Set(mappings.map(m => m.object_id)).size !== mappings.length || new Set(mappings.map(m => m.project_id)).size !== mappings.length) throw new Error('Unique reviewed project mappings required');
  if (collection.features.length !== mappings.length) throw new Error('Response must contain exactly the reviewed feature set');
  const seen = new Set();
  const features = collection.features.map(feature => {
    const p = feature.properties, id = p?.OBJECTID;
    const mapping = mappings.find(m => m.object_id === id);
    const project = projects.find(project => project.id === mapping?.project_id);
    if (seen.has(id) || !mapping || !project) throw new Error('Unexpected or duplicate source object');
    seen.add(id);
    const summary = mapping.summary;
    if (p.PRESENT_SN !== summary?.presentSn || p.SIGNGU_SE !== project.borough_code || summary.siteCode !== project.borough_code || p.DGM_NM !== summary.bsnsName || lot(summary.bsnsAddr) !== lot(project.representative_lot)) throw new Error('Source identity, district, name and representative address must match reviewed mapping');
    if (p.ATRB_SE !== summary.classifyL) throw new Error('Source business class must match reviewed mapping');
    validateGeometry(feature.geometry);
    return {
      ...feature,
      properties: {
        ...p,
        project_id: project.id,
        boundary_kind: 'ADMIN_CANDIDATE',
        source_id: URBAN_BOUNDARY_SOURCE_ID,
        source_url: `https://urban.seoul.go.kr/view/map/main.html?presentSn=${encodeURIComponent(p.PRESENT_SN)}`,
        source_locator: `https://urban.seoul.go.kr/view/map/main.html?presentSn=${encodeURIComponent(p.PRESENT_SN)}`,
        source_layer: 'UPIS_C_UQ120',
        source_native_format: 'GeoJSON',
        source_crs: 'EPSG:4326',
        source_response_sha256: responseSha256,
        source_name: summary.bsnsName,
        source_address: summary.bsnsAddr,
        source_updated_at_raw: summary.updateDatetime,
        source_area_m2_raw: summary.bsnsArea,
        observed_at: observedAt,
        reviewed_at: observedAt,
        review_status: 'REVIEWED',
        identity_review: 'DISTRICT_NAME_REPRESENTATIVE_ADDRESS_PRESENT_SN',
        geometry_transformed: false,
        legal_boundary_verified: false,
        legal_effective_date: null,
        current_membership_verified: false,
        rights_eligibility_verified: false,
        scope_note: '서울도시공간포털 행정 참고 경계. 원출처 사업명·자치구·대표지번 연결을 확인했으며 법적 현행 경계·전체 필지·권리 또는 분양자격을 검증한 자료가 아닙니다.',
        license_name: license.license_name || '외부 재이용 허락 미확인 · 개인 로컬 사적이용',
        license_reviewed_at: license.license_reviewed_at || null,
        attribution_required: true,
        attribution: license.attribution || '출처: 서울특별시 서울도시공간포털 · UPIS_C_UQ120 · 법적 효력 없는 행정 참고 지도',
      },
    };
  });
  return { type: 'FeatureCollection', source_id: URBAN_BOUNDARY_SOURCE_ID, observed_at: observedAt, source_response_sha256: responseSha256, legal_boundary_verified: false, geometry_transformed: false, feature_count: features.length, features };
}
