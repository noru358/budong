// Isolated product-flow QA. Public map tiles are intercepted; this does not
// exercise provider endpoints or consume the community tile service.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.BUDONG_PLAYWRIGHT_MODULE || 'playwright',
);
const args = process.argv.slice(2),
  option = (name) => args[args.indexOf(name) + 1];
const base = args.includes('--base-url')
  ? option('--base-url')
  : 'http://127.0.0.1:4173';
const output = args.includes('--screenshot-dir')
  ? option('--screenshot-dir')
  : null;
const executablePath =
  process.env.BUDONG_BROWSER_PATH ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4kQAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/.test(m.text()))
      errors.push(m.text());
  });
  await page.goto(base + '/web/', { waitUntil: 'domcontentloaded' });
  await page.locator('#search-form input[name=query]').fill('동작구 상도15');
  await page.locator('#search-form button[type=submit]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('.project-card').length === 1,
  );
  await page.locator('[data-action=select-project]').click();
  assert.match(await page.locator('#selected-project').innerText(), /상도15/);
  await page.locator('.project-open[data-action=project]').click();
  await page.waitForFunction(() =>
    document.querySelector('h1')?.textContent.includes('상도15'),
  );
  assert.ok(
    (await page.locator('a.source[href^="https://www.eum.go.kr/"]').count()) >
      0,
  );
  assert.match(
    await page.locator('.evidence').first().innerText(),
    /고시 정보·본문 재확인일/,
  );
  await page.goBack();
  await page.locator('#search-form').waitFor();
  await page.locator('.project-open[data-action=project]').click();
  await page.waitForFunction(() =>
    document.querySelector('h1')?.textContent.includes('상도15'),
  );
  async function createCase(
    label,
    price = '54000',
    cost = '2970',
    repay = false,
  ) {
    await page.locator('[data-action=new-case]').click();
    const values = {
      label,
      acquisition_date: '2026-10-15',
      contract_price: price,
      acquisition_incidental_cost: cost,
      existing_deposit_assumed: '14000',
      initial_loan_draw: '12000',
      paid_contribution: '3500',
      available_cash: '35000',
      exit_date: '2029-06-30',
      exit_price: '86200',
      exit_selling_cost: '800',
    };
    for (const [name, value] of Object.entries(values))
      await page.locator(`#case-form [name="${name}"]`).fill(value);
    const events = [
      ['2027-06-30', 'REMAINING_CONTRIBUTION', '10000', '3500'],
      ['2028-06-30', 'FINANCING_COST', '2200', '0'],
    ];
    if (repay)
      events.push(
        ['2028-07-01', 'DEBT_REPAYMENT', '5000', '0'],
        ['2028-08-01', 'DEPOSIT_RETURN', '14000', '0'],
      );
    for (let i = 0; i < events.length; i++) {
      await page.locator('[data-action=add-event]').click();
      for (const [j, name] of ['date', 'kind', 'amount', 'loan'].entries()) {
        const field = page.locator(`[name=event_${i}_${name}]`);
        if (name === 'kind') await field.selectOption(events[i][j]);
        else await field.fill(events[i][j]);
      }
    }
    await page.locator('[data-action=fill-liabilities]').click();
    assert.equal(
      await page.locator('[name=exit_debt_repayment]').inputValue(),
      repay ? '10500' : '15500',
    );
    assert.equal(
      await page.locator('[name=exit_deposit_repayment]').inputValue(),
      repay ? '0' : '14000',
    );
    await page.locator('#case-form button[type=submit]').click();
    await page.locator('[data-action=edit-case]').waitFor();
  }
  await createCase('브라우저 검증 A');
  assert.match(await page.locator('#app').innerText(), /3.97억/);
  assert.equal(await page.locator('.kpi').count(), 6);
  const firstId = await page.evaluate(
    () => JSON.parse(localStorage.getItem('budong.personal.v1')).cases[0].id,
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-action=edit-case]').waitFor();
  assert.match(await page.locator('#app').innerText(), /브라우저 검증 A/);
  await createCase('브라우저 검증 B', '55000', '3025', true);
  await page.locator('#compare-b').selectOption(firstId);
  assert.match(
    await page.locator('.comparison-panel').innerText(),
    /브라우저 검증 A/,
  );
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action=export]').click();
  const download = await downloadPromise,
    backup = await fs.readFile(await download.path(), 'utf8');
  assert.equal(JSON.parse(backup).cases.length, 2);
  await page.locator('.backup-panel summary').click();
  await page.locator('#backup-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('#backup-summary')
      ?.textContent.includes('기존 ID 유지 2개'),
  );
  await page.locator('[data-action=backup-import]').click();
  await page.waitForFunction(() =>
    document.querySelector('#notice')?.textContent.includes('복원'),
  );
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('budong.personal.v1')).cases.length,
    ),
    2,
  );
  const editedId = await page
    .locator('[data-action=edit-case]')
    .getAttribute('data-id');
  await page.locator('[data-action=edit-case]').click();
  await page.locator('[name=acquisition_incidental_cost]').fill('');
  await page.locator('#case-form button[type=submit]').click();
  await page.locator('[data-action=edit-case]').waitFor();
  assert.equal(await page.locator('.kpi').count(), 0);
  assert.equal(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem('budong.personal.v1')).cases.find(
          (c) => c.id === id,
        ).acquisition_incidental_cost,
      editedId,
    ),
    null,
  );
  await page.locator('#nav [data-view=home]').click();
  await page.locator('#search-form').waitFor();
  await page.locator('#search-form input[name=query]').fill('상도15');
  await page.locator('#search-form button[type=submit]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('.project-card').length === 1,
  );
  await page.locator('[data-action=clear-search]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('.project-card').length === 44,
  );
  await page.locator('#search-district').selectOption({ label: '동작구' });
  await page.waitForFunction(
    () => document.querySelectorAll('.project-card').length === 8,
  );
  const hash = await page.evaluate(() => location.hash);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#search-district').waitFor();
  assert.equal(await page.evaluate(() => location.hash), hash);
  assert.equal(
    await page.locator('#search-district').inputValue(),
    '서울특별시 동작구',
  );
  await page.locator('[data-action=clear-search]').click();
  await page.locator('#map-options').click();
  await page.locator('#map-pin-form [name=latitude]').fill('37.5');
  await page.locator('#map-pin-form [name=longitude]').fill('126.95');
  await page.locator('#map-pin-form button[type=submit]').click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('budong.map.personal.v1') || '{}').pins
        ?.length === 1,
  );
  const pinState = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('budong.map.personal.v1')),
  );
  assert.equal(pinState.pins[0].certainty, 'USER_ASSUMPTION');
  const good = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          project_id: 'seoul-11590-02',
          boundary_kind: 'USER_DRAWN',
          source_id: 'USER_INPUT',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [126.95, 37.5],
              [126.951, 37.5],
              [126.951, 37.501],
              [126.95, 37.5],
            ],
          ],
        },
      },
    ],
  };
  await page.locator('#map-import-panel details summary').click();
  await page.locator('#map-boundary-file').setInputFiles({
    name: 'personal.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(good)),
  });
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('budong.map.personal.v1') || '{}')
        .features?.length === 1,
  );
  const saved = await page.evaluate(() =>
    localStorage.getItem('budong.map.personal.v1'),
  );
  const bad = structuredClone(good);
  bad.features[0].properties.boundary_kind = 'OFFICIAL';
  await page.locator('#map-boundary-file').setInputFiles({
    name: 'unverified.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await page.waitForFunction(() =>
    document.querySelector('#map-data-status')?.textContent.includes('필요'),
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('budong.map.personal.v1')),
    saved,
  );
  await page.locator('#map-options').click();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'explore overflow ' + width,
    );
  }
  await page.goto(base + '/web/#sources', { waitUntil: 'domcontentloaded' });
  await page.locator('.source-policy-row').first().waitFor();
  assert.match(await page.locator('#app').innerText(), /상업 이용 금지/);
  assert.match(await page.locator('#app').innerText(), /변경·파생 제작 금지/);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.goto(base + '/web/#analysis', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action=edit-case]').waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-action=delete-case]').click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('budong.personal.v1')).cases.length === 1,
  );
  if (output) {
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, 'analysis-mobile-qa.png'),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks: [
        'compound search',
        'inline preview',
        'official source',
        'manual case and repayment',
        'save/reload/compare',
        'backup/export/merge',
        'unknown stays null',
        'all44/filter/url',
        'personal map pin',
        'boundary import/reject preservation',
        '1440/768/390/320 layout',
        'source commercial/modification labels',
        'deletion',
      ],
      page_errors: errors,
      external_tile_requests: 0,
    }),
  );
} finally {
  await browser.close();
}
