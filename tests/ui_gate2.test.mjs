import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../web/index.html",import.meta.url),"utf8");

test("UI loads real Seoul seed and deep validation data",()=>{
  assert.match(html,/seoul_seed_v1\.json/);
  assert.match(html,/deep_validation_v1\.json/);
});

test("map fails closed before official boundary adapter",()=>{
  assert.match(html,/FAIL-CLOSED/);
  assert.match(html,/공식 경계 adapter 연결 전/);
});

test("real detail distinguishes stage snapshot from legal effective event",()=>{
  assert.match(html,/현재단계 표시 ≠ 자동으로 법적 효력일/);
});

test("investment analysis remains visibly marked fixture",()=>{
  assert.match(html,/물건 분석·비교 <span class="badge">FIXTURE<\/span>/);
});
