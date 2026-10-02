import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { attachUrbanBoundaryProvenance, URBAN_BOUNDARY_QUERY } from '../src/adapters/seoul_urban_boundaries.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const license = {
  license_name: '저작권법 제30·36·94조에 따른 비영리 사적 참고 검토 · 기관 재사용 허락 아님',
  license_reviewed_at: '2026-10-03',
  attribution: '서울특별시 서울도시공간포털 · 정비사업구역계 · 조회 2026-10-03 · 법적 효력 없는 참고 경계 · 이 기기 내 비영리 사적 이용',
};

export async function collectPrivateBoundaries({ mapping, projects, fetchImpl = fetch, runtimeContext = 'LOCAL_PRIVATE', mode = 'PERSONAL', timeoutMs = 30000 }) {
  if (runtimeContext !== 'LOCAL_PRIVATE' || mode !== 'PERSONAL') throw new Error('LOCAL_PRIVATE / PERSONAL 이용만 지원합니다.');
  if (mapping.mapping_count !== 42 || mapping.mappings?.length !== 42) throw new Error('검토된 42개 OBJECTID 목록이 필요합니다.');
  // One request, only the reviewed allowlist; no discovery, pagination or retry.
  const body = new URLSearchParams({ objectIds: mapping.mappings.map(m => m.object_id).join(','), outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'geojson' });
  const response = await fetchImpl(URBAN_BOUNDARY_QUERY, { method: 'POST', body, headers: { Referer: 'https://urban.seoul.go.kr/view/map/main.html' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`원출처 HTTP ${response.status}; 기존 개인 경계 파일을 보존합니다.`);
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error('경계 응답 크기 상한을 초과했습니다.');
  const native = JSON.parse(raw);
  if (native.error || native.exceededTransferLimit) throw new Error('원출처 조회 오류 또는 불완전 응답입니다.');
  const sourceResponseSha256 = createHash('sha256').update(raw).digest('hex');
  const observedAt = new Date().toISOString();
  const observedKstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(observedAt));
  const dataset = attachUrbanBoundaryProvenance(native, { projects, mappings: mapping.mappings, observedAt, responseSha256: sourceResponseSha256, license: { ...license, attribution: license.attribution.replace('조회 2026-10-03', `조회 ${observedKstDate}`) } });
  if (!dataset.features.every((f, i) => JSON.stringify(f.geometry) === JSON.stringify(native.features[i].geometry))) throw new Error('서버 원본 geometry 동일성 검사 실패');
  return dataset;
}

export async function savePrivateBoundariesAtomically(outputPath, dataset) {
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(dataset) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, outputPath);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function main() {
  if (String(process.env.BUDONG_USE_MODE || 'PERSONAL').toUpperCase() !== 'PERSONAL') throw new Error('PERSONAL 로컬 사적 이용 모드에서만 경계를 복원합니다.');
  if (process.argv.length > 2) throw new Error('추가 URL·전체수집·공개모드 옵션은 지원하지 않습니다.');
  const output = path.join(root, 'data/boundaries_v1.geojson');
  execFileSync('git', ['check-ignore', '--quiet', 'data/boundaries_v1.geojson'], { cwd: root });
  const mapping = JSON.parse(await fs.readFile(path.join(root, 'data/urban_boundary_mapping_v1.json'), 'utf8'));
  const projects = JSON.parse(await fs.readFile(path.join(root, 'data/seoul_seed_v1.json'), 'utf8')).projects;
  console.log('LOCAL_PRIVATE / PERSONAL: 이 기기 내 비영리 사적 참고용입니다. 웹 공개·상업 이용·재배포 허락이 아닙니다. 검토된 42개 경계만 원출처에서 한 번 조회합니다.');
  const dataset = await collectPrivateBoundaries({ mapping, projects });
  await savePrivateBoundariesAtomically(output, dataset);
  console.log(JSON.stringify({ feature_count: dataset.feature_count, observed_at: dataset.observed_at, sha256: dataset.source_response_sha256, geometry_transformed: false, legal_boundary_verified: false, output: 'data/boundaries_v1.geojson (Git 제외)' }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.name === 'TimeoutError' ? '원출처 조회 시간 초과; 기존 개인 경계 파일을 보존합니다.' : error.message); process.exitCode = 1; });
}
