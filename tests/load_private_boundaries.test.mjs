import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectPrivateBoundaries, savePrivateBoundariesAtomically } from '../scripts/load_private_boundaries.mjs';
const mapping = JSON.parse(await fs.readFile(new URL('../data/urban_boundary_mapping_v1.json', import.meta.url)));
const projects = JSON.parse(await fs.readFile(new URL('../data/seoul_seed_v1.json', import.meta.url))).projects;
// Source identities are public metadata. All geometry below is synthetic.
const native = { type: 'FeatureCollection', features: mapping.mappings.map(m => ({ type: 'Feature', properties: { OBJECTID: m.object_id, PRESENT_SN: m.summary.presentSn, SIGNGU_SE: m.summary.siteCode, DGM_NM: m.summary.bsnsName, ATRB_SE: m.summary.classifyL }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } })) };
const response = () => ({ ok: true, text: async () => JSON.stringify(native) });

test('private loader issues one fixed native GeoJSON query for only reviewed IDs', async () => {
  const calls = [];
  const data = await collectPrivateBoundaries({ mapping, projects, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(); } });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/urban\.seoul\.go\.kr\/proxy\/proxy\.jsp\?/);
  assert.equal(calls[0].options.body.get('f'), 'geojson');
  assert.equal(calls[0].options.body.get('outSR'), '4326');
  assert.equal(calls[0].options.body.get('objectIds'), mapping.mappings.map(m => m.object_id).join(','));
  assert.deepEqual(data.features.map(f => f.geometry), native.features.map(f => f.geometry));
  assert.equal(data.feature_count, 42);
  assert.equal(data.geometry_transformed, false);
});

test('public and commercial contexts fail before any provider request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(); };
  await assert.rejects(collectPrivateBoundaries({ mapping, projects, fetchImpl, runtimeContext: 'PUBLIC' }), /LOCAL_PRIVATE/);
  await assert.rejects(collectPrivateBoundaries({ mapping, projects, fetchImpl, mode: 'COMMERCIAL' }), /PERSONAL/);
  assert.equal(calls, 0);
});

test('HTTP failures, interrupted queries and incomplete geometry never produce a dataset', async () => {
  await assert.rejects(collectPrivateBoundaries({ mapping, projects, fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  await assert.rejects(collectPrivateBoundaries({ mapping, projects, fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ ...native, exceededTransferLimit: true }) }) }), /불완전/);
  await assert.rejects(collectPrivateBoundaries({ mapping, projects, fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ ...native, features: native.features.slice(1) }) }) }), /exactly/);
  await assert.rejects(collectPrivateBoundaries({ mapping, projects, timeoutMs: 10, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(options.signal.reason)); setTimeout(() => reject(new Error('signal did not abort')), 100); }) }), { name: 'TimeoutError' });
});

test('atomic persistence preserves the existing file when serialization fails and cleans temporary files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'budong-private-'));
  try {
    const output = path.join(directory, 'boundaries.geojson');
    await fs.writeFile(output, 'existing-source');
    const cyclic = {}; cyclic.cyclic = cyclic;
    await assert.rejects(savePrivateBoundariesAtomically(output, cyclic));
    assert.equal(await fs.readFile(output, 'utf8'), 'existing-source');
    assert.deepEqual(await fs.readdir(directory), ['boundaries.geojson']);
    await savePrivateBoundariesAtomically(output, native);
    assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), native);
    assert.equal((await fs.stat(output)).mode & 0o777, 0o600);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
