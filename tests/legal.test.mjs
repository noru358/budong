import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getStageExplanation, getProjectEvidence, getProjectTypeExplanation, safeSourceUrl } from "../src/legal.mjs";

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

test("small housing and unrecognized types do not inherit the redevelopment procedure", () => {
  const street = getProjectTypeExplanation("가로주택정비사업");
  assert.equal(street.law_family, "SMALL_HOUSING_ACT");
  assert.match(street.route_note, /관리처분계획이 포함/);
  for (const type of ["지역주택", "리모델링", "재건축 유사사업", "미상", null]) {
    const context = getProjectTypeExplanation(type);
    assert.equal(context.status, "NEEDS_REVIEW");
    assert.equal(context.law_family, "NEEDS_REVIEW");
    assert.deepEqual(context.source_links, []);
  }
  assert.equal(getProjectTypeExplanation(" 재개발 (주택정비형) ").code, "RESIDENTIAL_REDEVELOPMENT");
  const streetDetail = getProjectEvidence({id:"street", project_type_official_raw:"가로주택정비", current_stage_official_raw:"관리처분인가"});
  assert.equal(streetDetail.snapshot.explanation.status, "NEEDS_REVIEW");
  const regional = getProjectEvidence({id:"regional", project_type_official_raw:"지역주택", current_stage_official_raw:"조합설립인가"});
  assert.equal(regional.snapshot.explanation.kind, "UNKNOWN");
  assert.deepEqual(regional.governance_summary.source_links, []);
});

test("observed trust company cannot establish a designated developer or association route", () => {
  const model = detail("상도15구역");
  assert.equal(model.governance_summary.trust_actor_observed, true);
  assert.equal(model.governance_summary.status, "NEEDS_REVIEW");
  assert.match(model.governance_summary.note, /시행자인지 대행자인지/);
  assert.equal(model.snapshot.stage_raw, "조합설립인가");
  assert.equal(model.project_context.code, "RESIDENTIAL_REDEVELOPMENT");
});

test("rights review is per topic and a reviewed notice is not individual eligibility", () => {
  const event = structuredClone(deep.targets[0].legal_events[0]);
  event.event_type_code = "RIGHTS_CUTOFF";
  const model = getProjectEvidence({id: "rights", project_type_official_raw: "재개발"}, {
    project_id: "rights", rights_events: [event]
  });
  assert.equal(model.rights.items[0].evidence_verified, true);
  assert.equal(model.rights.checklist.find(item => item.code === "RIGHTS_CUTOFF").evidence_count, 1);
  for (const item of model.rights.checklist) {
    assert.equal(item.status, "NEEDS_REVIEW");
    assert.equal(item.effective_date, null);
    assert.equal(item.individual_eligibility_verified, false);
  }
  const unknown = getProjectEvidence({id: "unknown", project_type_official_raw: "지역주택"});
  assert.ok(unknown.rights.checklist.every(item => item.source_links.length === 0));
});

test("document review requires a real explicitly checked date and timezone-bearing instant", () => {
  const target = structuredClone(deep.targets[0]);
  const event = target.legal_events[0];
  // An effective date cannot pass through matching two missing event_date fields.
  event.effective_date = event.event_date;
  delete event.event_date;
  delete event.evidence_review.checked_fields.event_date;
  assert.equal(getProjectEvidence({id:target.project_id}, target).legal_events[0].evidence_verified, false);
  event.evidence_review.checked_fields.event_date = event.effective_date;
  assert.equal(getProjectEvidence({id:target.project_id}, target).legal_events[0].evidence_verified, true);
  for (const date of ["2026-02-30T12:00:00Z", "2026-10-01", "2026-10-01T12:00:00", "2026-10-01T24:00:00Z"]) {
    event.evidence_review.reviewed_at = date;
    assert.equal(getProjectEvidence({id:target.project_id}, target).legal_events[0].evidence_verified, false);
  }
});

test("notice dates, effective dates and observation freshness retain distinct provenance", () => {
  const model = detail("한남5재정비촉진구역");
  const event = model.legal_events[0];
  assert.equal(event.provenance.notice_date, "2026-04-30");
  assert.equal(event.provenance.effective_date, null);
  assert.equal(event.provenance.attachments_reviewed, false);
  assert.equal(event.provenance.individual_eligibility_verified, false);
  assert.equal(model.snapshot.freshness.status, "OBSERVATION_ONLY");
  assert.equal(model.snapshot.freshness.latest_official_verified, false);
  const invalid = getProjectEvidence({id:"date", stage_snapshot_at:"2026-02-30"});
  assert.equal(invalid.snapshot.freshness.status, "OBSERVATION_DATE_NEEDS_REVIEW");
  assert.ok(invalid.readiness.issues.includes("SNAPSHOT_DATE_NEEDS_REVIEW"));
});
