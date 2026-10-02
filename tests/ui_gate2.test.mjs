import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(
  new URL('../web/app.mjs', import.meta.url),
  'utf8',
);

test('UI loads real Seoul seed and deep validation data', () => {
  assert.match(html, /seoul_seed_v1\.json/);
  assert.match(html, /deep_validation_v1\.json/);
});

test('map uses geographic renderer with explicit imported provenance contract', () => {
  const module = fs.readFileSync(
    new URL('../web/map_workspace.mjs', import.meta.url),
    'utf8',
  );
  assert.match(module, /inspectBoundary/);
  assert.match(module, /직접 표시한 위치/);
});

test('real detail distinguishes stage snapshot from legal effective event', () => {
  assert.match(html, /현재단계 표시 ≠ 자동으로 법적 효력일/);
});

test('investment analysis remains visibly marked fixture', () => {
  assert.match(html, /물건 분석·비교 <span class="badge">FIXTURE<\/span>/);
});
