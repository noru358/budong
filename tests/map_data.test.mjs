import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  inspectBoundary,
  parseBoundaryFile,
  makePersonalPin,
} from '../src/map_data.mjs';
const sources = JSON.parse(
  fs.readFileSync(new URL('../data/source_registry.json', import.meta.url)),
).sources;
const projects = [{ id: 'p' }];
const feature = () => ({
  type: 'Feature',
  properties: {
    project_id: 'p',
    boundary_kind: 'USER_DRAWN',
    source_id: 'USER_INPUT',
  },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [127, 37.5],
        [127.01, 37.5],
        [127.01, 37.51],
        [127, 37.5],
      ],
    ],
  },
});
const context = { projects, sources, mode: 'PERSONAL' };
test('personal authored boundary keeps its assumption type and validates geographic coordinates', () => {
  const f = feature();
  assert.equal(inspectBoundary(f, context).enabled, true);
  const parsed = parseBoundaryFile(
    JSON.stringify({ type: 'FeatureCollection', features: [f] }),
    context,
  );
  assert.equal(parsed.features[0].properties.boundary_kind, 'USER_DRAWN');
  const pin = makePersonalPin(
    { project_id: 'p', latitude: 37.5, longitude: 127, label: '내 참고' },
    projects,
  );
  assert.equal(pin.certainty, 'USER_ASSUMPTION');
  assert.throws(() =>
    makePersonalPin(
      { project_id: 'missing', latitude: 37.5, longitude: 127 },
      projects,
    ),
  );
});
test('invalid geometry, unknown projects and disguised third party boundaries are rejected', () => {
  const edits = [
    (f) => {
      f.geometry.coordinates[0][0][0] = Infinity;
    },
    (f) => {
      f.geometry.coordinates[0].pop();
    },
    (f) => {
      f.geometry.type = 'Point';
    },
    (f) => {
      f.properties.project_id = 'missing';
    },
    (f) => {
      f.properties.boundary_kind = 'OFFICIAL';
    },
  ];
  for (const edit of edits) {
    const f = feature();
    edit(f);
    assert.equal(inspectBoundary(f, context).enabled, false);
  }
});
test('no derivatives and commercial restrictions remain independently enforced', () => {
  const source = sources.find(
    (s) =>
      s.use_policy?.license_id === 'KOGL_TYPE_4' ||
      s.use_policy?.license_id === 'KOGL_4',
  );
  assert.ok(source);
  const f = feature();
  f.properties = {
    project_id: 'p',
    boundary_kind: 'ADMIN_CANDIDATE',
    source_id: source.source_id,
    source_url: 'https://data.seoul.go.kr/example',
    review_status: 'REVIEWED',
    reviewed_at: '2026-10-02',
    license_name: 'KOGL4',
    license_reviewed_at: '2026-10-02',
    attribution_required: true,
    attribution: '서울특별시',
    geometry_transformed: true,
    map_publish_permission: 'CONFIRMED',
    permission_source_url: 'https://data.seoul.go.kr/permission',
  };
  assert.equal(inspectBoundary(f, context).enabled, false);
  f.properties.geometry_transform_permission = 'CONFIRMED';
  assert.equal(inspectBoundary(f, context).enabled, false);
  assert.equal(
    inspectBoundary(f, { ...context, mode: 'COMMERCIAL' }).enabled,
    false,
  );
});
test('import rejection is atomic and secrets are never accepted as map metadata', () => {
  const good = feature(),
    bad = feature();
  bad.properties.api_key = 'private';
  assert.throws(() =>
    parseBoundaryFile(
      JSON.stringify({ type: 'FeatureCollection', features: [good, bad] }),
      context,
    ),
  );
  assert.throws(() => parseBoundaryFile('broken', context));
  assert.throws(() =>
    parseBoundaryFile(' '.repeat(2 * 1024 * 1024 + 1), context),
  );
});
