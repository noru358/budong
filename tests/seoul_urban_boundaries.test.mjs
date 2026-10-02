import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachUrbanBoundaryProvenance } from '../src/adapters/seoul_urban_boundaries.mjs';

// Synthetic geometry only. Real provider coordinates remain in an ignored,
// private runtime file and are never copied into repository fixtures.
const geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const project = { id: 'synthetic-project', borough_code: '11590', representative_lot: '시험동 123' };
const feature = { type: 'Feature', geometry, properties: { OBJECTID: 7, PRESENT_SN: 'synthetic-source-row', SIGNGU_SE: '11590', DGM_NM: '시험구역', ATRB_SE: 'BZ103' } };
const mapping = { project_id: project.id, object_id: 7, summary: { presentSn: 'synthetic-source-row', siteCode: '11590', bsnsName: '시험구역', bsnsAddr: '시험동 123 일대', classifyL: 'BZ103', updateDatetime: '2026-10-01T00:00:00.000', bsnsArea: 1 } };
const options = { projects: [project], mappings: [mapping], observedAt: '2026-10-03T00:00:00Z', responseSha256: 'a'.repeat(64) };
const make = (features = [feature], opts = {}) => attachUrbanBoundaryProvenance({ type: 'FeatureCollection', features }, { ...options, ...opts });

test('native geometry survives provenance attachment and stays an administrative reference', () => {
  const output = make();
  assert.deepEqual(output.features[0].geometry, geometry);
  assert.equal(output.features[0].properties.geometry_transformed, false);
  assert.equal(output.features[0].properties.boundary_kind, 'ADMIN_CANDIDATE');
  for (const key of ['legal_boundary_verified', 'current_membership_verified', 'rights_eligibility_verified']) assert.equal(output.features[0].properties[key], false);
  assert.equal(output.features[0].properties.legal_effective_date, null);
});

test('identity mismatch, unsupported source rows and duplicate responses fail closed', () => {
  for (const patch of [{ SIGNGU_SE: '11170' }, { DGM_NM: '다른구역' }, { PRESENT_SN: 'other' }, { OBJECTID: 8 }, { ATRB_SE: 'BZ101' }]) {
    assert.throws(() => make([{ ...feature, properties: { ...feature.properties, ...patch } }]));
  }
  for (const patch of [{ siteCode: '11170' }, { bsnsAddr: '시험동 123-1' }, { bsnsAddr: '다른동 123' }]) assert.throws(() => make([feature], { mappings: [{ ...mapping, summary: { ...mapping.summary, ...patch } }] }));
  assert.throws(() => make([feature, feature]), /exactly/);
  assert.throws(() => make([feature], { mappings: [mapping, mapping] }), /Unique/);
  assert.throws(() => make([feature], { observedAt: '2026-02-30T00:00:00Z' }), /observation/);
  assert.throws(() => make([feature], { responseSha256: null }), /SHA256/);
});

test('license metadata cannot upgrade legal certainty or replace geometry provenance', () => {
  const p = make([feature], { license: { boundary_kind: 'OFFICIAL', legal_boundary_verified: true, geometry_transformed: true, source_id: 'FAKE' } }).features[0].properties;
  assert.equal(p.boundary_kind, 'ADMIN_CANDIDATE');
  assert.equal(p.legal_boundary_verified, false);
  assert.equal(p.geometry_transformed, false);
  assert.equal(p.source_id, 'SEOUL_URBAN_PLAN_GEOJSON');
});

test('committed mapping contains no coordinates and each included identity matches the seed', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../data/urban_boundary_mapping_v1.json', import.meta.url)));
  const projects = JSON.parse(fs.readFileSync(new URL('../data/seoul_seed_v1.json', import.meta.url))).projects;
  assert.equal(data.mapping_count, 42);
  assert.equal(new Set(data.mappings.map(m => m.object_id)).size, 42);
  assert.equal(new Set(data.mappings.map(m => m.project_id)).size, 42);
  const normalizeLot = text => text.replace(/\s+/g, '').replace(/일대$/, '');
  for (const mapping of data.mappings) {
    const project = projects.find(p => p.id === mapping.project_id);
    assert.equal(mapping.summary.siteCode, project.borough_code);
    assert.equal(normalizeLot(mapping.summary.bsnsAddr), normalizeLot(project.representative_lot));
  }
  assert.doesNotMatch(JSON.stringify(data), /"(?:coordinates|geometry|rings|shape)"/);
  assert.deepEqual(data.unmatched.map(m => m.project_id), ['seoul-11440-05', 'seoul-11470-04']);
});
