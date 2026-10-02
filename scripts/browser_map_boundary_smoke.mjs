// Actual local boundary integration QA. Background tiles are deterministic fixtures.
// Requires map:load; it never substitutes synthetic geometry for missing source data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BUDONG_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BUDONG_MAP_TEST_URL || 'http://127.0.0.1:4187';
const response = await fetch(base + '/data/boundaries_v1.geojson');
assert.equal(response.status, 200, 'Load the private source geometry before this QA');
const collection = await response.json();
const ids = [...new Set(collection.features.map(f => f.properties.project_id))];
assert.equal(ids.length, 42);
const browser = await chromium.launch({ headless: true, executablePath: process.env.BUDONG_BROWSER_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4kQAAAAASUVORK5CYII=', 'base64')}));
  await page.goto(base + '/web/#map?project=seoul-11590-02');
  await page.waitForFunction(() => document.querySelector('#map-result-count')?.textContent.includes('42'));
  assert.equal(await page.locator('path.zone-boundary').count(), ids.length);
  assert.equal(await page.locator('path.zone-boundary--reference').count(), ids.length);
  await page.waitForFunction(() => Number(document.querySelector('#map-canvas').dataset.zoom) >= 14);
  assert.equal(await page.locator('path[data-project-id="seoul-11590-02"][aria-pressed=true]').count(), 1);
  assert.match(await page.locator('#map-selected-project').innerText(), /서울시 GIS의 행정 참고경계/);
  assert.ok(await page.locator('.zone-label').first().evaluate(e => e.getBoundingClientRect().width >= 140));
  // Click an adjacent actual source label: map remains, selection and sidebar change together.
  await page.locator('.zone-label').filter({hasText:'상도14'}).click();
  await page.waitForFunction(() => document.querySelector('#map-selected-project').textContent.includes('상도14'));
  assert.equal(await page.locator('#map-canvas').count(), 1);
  const selected = await page.locator('.map-project-row.selected').getAttribute('data-id');
  assert.equal(await page.locator(`path[data-project-id="${selected}"][aria-pressed=true]`).count(), 1);
  // A source polygon can also be selected by keyboard.
  const keyboardId = 'seoul-11590-02';
  await page.locator(`path[data-project-id="${keyboardId}"]`).press('Enter');
  await page.waitForFunction(() => document.querySelector('.map-project-row.selected').dataset.id === 'seoul-11590-02');
  await page.locator('#map-seoul').click();
  await page.waitForFunction(() => document.querySelector('#map-canvas').dataset.zoom === '11');
  assert.equal(await page.locator('.zone-cluster-count').evaluateAll(nodes => nodes.reduce((n, e) => n + Number(e.textContent), 0)), ids.length);
  await page.locator('.zone-cluster').filter({hasText:'동작구'}).click();
  await page.waitForFunction(() => Number(document.querySelector('#map-canvas').dataset.zoom) > 12);
  // Search filters actual layers as well as rows; the total coverage counter remains truthful.
  await page.locator('#search-form input[name=query]').fill('상도15');
  await page.locator('#search-form button[type=submit]').click();
  await page.waitForFunction(() => document.querySelectorAll('.map-project-row').length === 1);
  await page.waitForFunction(() => document.querySelectorAll('path.zone-boundary').length === 1);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({width, height:900});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('.zone-label').first().evaluate(e => e.getBoundingClientRect().width >= 140));
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({result:'PASS', actual_boundaries:ids.length, kind:'ADMIN_CANDIDATE', checks:['native 42 source polygons','direct URL selection','label click and sidebar','keyboard polygon selection','real coverage clusters','search filters layers','label width and four viewports'],page_errors:errors}));
} finally { await browser.close(); }
