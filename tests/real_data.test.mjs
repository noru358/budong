import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  READINESS,
  inheritCommercialReadiness,
  requireSecret,
  makeAssertion,
  assertNoSecretLikeFields
} from "../src/adapters/contracts.mjs";

const seed = JSON.parse(fs.readFileSync(new URL("../data/seoul_seed_v1.json", import.meta.url), "utf8"));
const registry = JSON.parse(fs.readFileSync(new URL("../data/source_registry.json", import.meta.url), "utf8"));

test("real seed has 44 projects and 10 deep targets", () => {
  assert.equal(seed.project_count, 44);
  assert.equal(seed.projects.length, 44);
  assert.equal(seed.projects.filter(x=>x.deep_validation_target).length, 10);
});

test("snapshot seed does not invent stage effective dates", () => {
  for (const p of seed.projects) {
    assert.equal(p.stage_effective_date, null);
    assert.equal(p.stage_effective_date_status, "NEEDS_REVIEW");
    assert.equal(p.source_id, "SEOUL_CLEANUP");
    assert.equal(p.certainty, "SOURCE_CONFIRMED");
  }
});

test("commercial readiness inherits most restrictive upstream", () => {
  assert.equal(inheritCommercialReadiness(["GREEN","GREEN"]), READINESS.GREEN);
  assert.equal(inheritCommercialReadiness(["GREEN","YELLOW"]), READINESS.YELLOW);
  assert.equal(inheritCommercialReadiness(["GREEN","WHITE"]), READINESS.WHITE);
  assert.equal(inheritCommercialReadiness(["GREEN","RED"]), READINESS.RED);
});

test("missing API secret fails closed", () => {
  assert.throws(()=>requireSecret({},"DATA_GO_KR_SERVICE_KEY"), /Missing required secret/);
  assert.equal(requireSecret({DATA_GO_KR_SERVICE_KEY:" abc "},"DATA_GO_KR_SERVICE_KEY"),"abc");
});

test("assertion separates observation from legal effective date", () => {
  const a = makeAssertion({
    id:"a1",
    sourceId:"SEOUL_CLEANUP",
    subjectType:"PROJECT",
    subjectId:"p1",
    predicate:"current_stage_snapshot",
    value:"조합설립인가",
    locator:"https://example.invalid/source",
    observedAt:"2026-09-28",
    reviewedAt:"2026-09-28"
  });
  assert.equal(a.effective_at, null);
  assert.equal(a.observed_at, "2026-09-28");
});

test("secrets cannot be persisted as data records", () => {
  assert.equal(assertNoSecretLikeFields({source_id:"x",payload:{count:1}}), true);
  assert.throws(()=>assertNoSecretLikeFields({serviceKey:"abc"}), /must not be persisted/);
});

test("registry records user-approved core APIs", () => {
  const byId = new Map(registry.sources.map(x=>[x.source_id,x]));
  for (const id of ["MOLIT_RTMS_MULTIFAMILY_SALE","MOLIT_BUILDING_HUB"]) {
    assert.equal(byId.get(id)?.access_status, "DEV_APPROVED_USER_CONFIRMED");
    assert.equal(byId.get(id)?.readiness, "GREEN");
  }
});
