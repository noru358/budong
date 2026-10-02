import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getStageExplanation, getProjectEvidence, safeSourceUrl } from "../src/legal.mjs";

const seed = JSON.parse(fs.readFileSync(new URL("../data/seoul_seed_v1.json", import.meta.url), "utf8"));
const deep = JSON.parse(fs.readFileSync(new URL("../data/deep_validation_v1.json", import.meta.url), "utf8"));
const detail = name => {
  const target = deep.targets.find(item => item.short_name === name);
  return getProjectEvidence(seed.projects.find(project => project.id === target.project_id), target);
};

test("dictionary preserves portal wording alongside the canonical explanation", () => {
  const explanation = getStageExplanation("사업시행인가");
  assert.equal(explanation.raw, "사업시행인가");
  assert.equal(explanation.official_name, "사업시행계획인가");
  assert.equal(explanation.kind, "STATUTORY_STAGE");
  assert.equal(getStageExplanation("임의 새 단계").status, "NEEDS_REVIEW");
});

test("policy and governance cannot become statutory eligibility decisions", () => {
  const policy = detail("망원동 신속통합기획 후보지");
  assert.equal(policy.snapshot.explanation.kind, "POLICY_PROGRAM");
  assert.equal(policy.legal_events.length, 0);
  assert.equal(policy.policy_events[0].event_kind, "POLICY_PROGRAM_EVENT");
  const trust = detail("상도15구역");
  assert.equal(trust.governance_events[0].event_kind, "PROJECT_GOVERNANCE_EVENT");
  assert.equal(trust.governance_events[0].legal_effect_status, "NEEDS_REVIEW");
  assert.equal(trust.rights.status, "NEEDS_REVIEW");
  assert.deepEqual(trust.rights.items, []);
});

test("registered official evidence never implies a freshly verified current stage", () => {
  const project = detail("한남5재정비촉진구역");
  assert.equal(project.snapshot.effective_date, null);
  assert.equal(project.legal_events[0].event_date, "2026-04-30");
  assert.ok(["REGISTERED_OFFICIAL_EVIDENCE_REVIEW_NEEDED", "NOTICE_DOCUMENT_REVIEWED"].includes(project.legal_events[0].evidence_status));
  assert.equal(project.readiness.latest_official_verified, false);
  assert.equal(project.readiness.status, "NEEDS_REVIEW");
});

test("correction without an explicit original event reference stays unresolved", () => {
  const target = structuredClone(deep.targets.find(item => item.short_name === "잠실5단지"));
  for (const event of target.legal_events) delete event.evidence_review;
  const correction = getProjectEvidence({id:target.project_id},target).legal_events.find(event => event.event_kind === "NOTICE_CORRECTION");
  assert.equal(correction.correction_of, null);
  assert.ok(correction.issues.includes("CORRECTION_TARGET_NEEDS_REVIEW"));
  assert.equal(correction.evidence_status, "NEEDS_REVIEW");
});

test("document review must match the event and never establishes current-stage freshness", () => {
  const target = structuredClone(deep.targets.find(item => item.short_name === "한남5재정비촉진구역"));
  const event = target.legal_events[0];
  event.evidence_review = {
    status: "NOTICE_METADATA_AND_BODY_CHECKED", http_status: 200,
    reviewed_at: "2026-10-01T16:12:00Z", body_sha256: "a".repeat(64),
    checked_fields: {notice_number:event.notice_number,event_date:event.event_date,event_name_official:event.event_name_official}
  };
  const verified = getProjectEvidence({id:target.project_id},target);
  assert.equal(verified.legal_events[0].evidence_verified, true);
  assert.equal(verified.readiness.latest_official_verified, false);
  event.evidence_review.checked_fields.notice_number = "잘못된 고시번호";
  assert.equal(getProjectEvidence({id:target.project_id},target).legal_events[0].evidence_verified, false);
});

test("an explicit reviewed correction reference links the original notice without advancing stage", () => {
  const target = structuredClone(deep.targets.find(item => item.short_name === "잠실5단지"));
  const correction = target.legal_events.find(event => event.event_type_code === "NOTICE_CORRECTION");
  correction.evidence_review = {corrects_notice_number:"서울특별시 송파구 고시 제2026-90호"};
  const model = getProjectEvidence({id:target.project_id},target);
  const corrected = model.legal_events.find(event => event.event_kind === "NOTICE_CORRECTION");
  assert.equal(corrected.correction_of,"서울특별시 송파구 고시 제2026-90호");
  assert.ok(!corrected.issues.includes("CORRECTION_TARGET_NEEDS_REVIEW"));
  assert.equal(model.snapshot.effective_date,null);
});

test("official labels cannot bless unsafe links, impersonated hosts or impossible dates", () => {
  const event = { certainty: "OFFICIAL_CONFIRMED", event_name_official: "인가", event_date: "2026-02-30", notice_number: "1", source_id: "LAND_USE_EUM_GOV_NOTICE", source_locator: "https://www.eum.go.kr.attacker.example/notice" };
  const detailModel = getProjectEvidence({ id: "p" }, { project_id: "p", legal_events: [event] });
  assert.equal(detailModel.legal_events[0].evidence_status, "NEEDS_REVIEW");
  assert.ok(detailModel.legal_events[0].issues.includes("SOURCE_IDENTITY_NEEDS_REVIEW"));
  assert.ok(detailModel.legal_events[0].issues.includes("EVENT_DATE_NEEDS_REVIEW"));
  for (const input of ["javascript:alert(1)", "data:text/html,hi", "http://eum.go.kr/", "//eum.go.kr/", "https://user:pass@eum.go.kr/", "https://eum.go.kr/\npath", "invalid"]) assert.equal(safeSourceUrl(input), null);
  assert.equal(safeSourceUrl("https://www.eum.go.kr/web/notice?seq=1"), "https://www.eum.go.kr/web/notice?seq=1");
});

test("another project's legal evidence is not attached to the selected project", () => {
  const model = getProjectEvidence({ id: "other" }, deep.targets[0]);
  assert.deepEqual(model.legal_events, []);
  assert.ok(model.readiness.issues.includes("PROJECT_EVIDENCE_MISMATCH"));
});
