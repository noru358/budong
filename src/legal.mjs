// Display helpers: registered evidence is not a fresh legal verification.
// Preserve the source's official wording; explanations never decide eligibility.
const STAGE_DICTIONARY = [
  ["정비구역 지정·고시", ["정비구역지정", "정비구역 지정"], "정비계획과 구역이 결정·고시된 단계입니다."],
  ["조합설립추진위원회 승인", ["추진위원회승인", "추진위원회 승인"], "조합 설립을 준비하는 추진위원회가 관할청 승인을 받은 단계입니다."],
  ["조합설립인가", [], "토지등소유자가 구성한 조합이 관할청 인가를 받은 단계입니다. 개별 물건의 조합원 지위·분양자격은 별도 확인해야 합니다."],
  ["사업시행계획인가", ["사업시행인가"], "사업시행계획이 관할청 인가를 받은 단계입니다. 표시된 단계와 원문상의 인가일은 별도로 확인합니다."],
  ["관리처분계획인가", ["관리처분인가"], "분양·권리가액 등을 정하는 관리처분계획이 관할청 인가를 받은 단계입니다. 개별 물건의 확정 금액은 해당 자료로 확인해야 합니다."],
  ["착공", [], "정비사업 공사에 착수한 단계입니다. 신고·착수일은 해당 원문에서 확인합니다."],
  ["준공인가", [], "공사가 사업시행계획대로 완료되었다고 인가된 단계입니다."],
  ["이전고시", [], "관리처분계획에 따른 대지·건축물 이전 내용이 고시된 단계입니다."]
];
const POLICY_NAMES = new Set(["정비계획 수립", "신속통합기획", "신속통합기획 후보지", "신속통합기획 후보지 / 정비계획 수립"]);
const SOURCE_HOSTS = {
  LAND_USE_EUM_GOV_NOTICE: "www.eum.go.kr",
  SONGPA_NOTICE_BOARD: "www.songpa.go.kr",
  SEOUL_WEEKLY_NOTICE_INDEX: "news.seoul.go.kr",
  SEOUL_OFFICIAL_NOTICE: "www.seoul.go.kr",
  SEOUL_CLEANUP: "cleanup.seoul.go.kr"
};

export function safeSourceUrl(value) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function getStageExplanation(raw) {
  const original = typeof raw === "string" ? raw : "";
  const normalized = original.normalize("NFC").replace(/\s+/gu, "").trim();
  const match = STAGE_DICTIONARY.find(([name, aliases]) =>
    [name, ...aliases].some(term => term.replace(/\s+/gu, "") === normalized)
  );
  if (match) return {
    raw: original, official_name: match[0], plain_explanation: match[2],
    kind: "STATUTORY_STAGE", status: "DICTIONARY_MATCH"
  };
  if (POLICY_NAMES.has(original.trim())) return {
    raw: original, official_name: original,
    plain_explanation: "계획 수립·정책 절차의 표시입니다. 이 표시만으로 법정 인가·고시나 개별 물건의 권리가 확정되지 않습니다.",
    kind: "POLICY_PROGRAM", status: "DICTIONARY_MATCH"
  };
  return {
    raw: original, official_name: original,
    plain_explanation: "표시된 절차의 의미와 근거 원문을 확인해야 합니다.",
    kind: "UNKNOWN", status: "NEEDS_REVIEW"
  };
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function projectEvent(event, eventKind, events) {
  const review = event.evidence_review ?? {};
  const sourceUrl = safeSourceUrl(review.verified_locator ?? event.source_locator);
  const issues = [];
  if (!sourceUrl) issues.push("SAFE_SOURCE_URL_MISSING");
  if (!event.event_name_official) issues.push("OFFICIAL_NAME_MISSING");
  if (!validDate(event.event_date ?? event.effective_date)) issues.push("EVENT_DATE_NEEDS_REVIEW");
  const expectedHost = SOURCE_HOSTS[event.source_id];
  const sourceMatch = Boolean(sourceUrl && expectedHost && new URL(sourceUrl).hostname === expectedHost);
  if (!sourceMatch) issues.push("SOURCE_IDENTITY_NEEDS_REVIEW");
  const isCorrection = event.event_type_code === "NOTICE_CORRECTION";
  const correctionOf = event.correction_of ?? event.corrects_event_id ?? review.corrects_notice_number ?? null;
  const correctionTarget = correctionOf != null && events.find(other =>
    other !== event && (other.id === correctionOf || other.notice_number === correctionOf) && other.event_type_code !== "NOTICE_CORRECTION"
  );
  const targetFound = Boolean(correctionTarget);
  if (isCorrection && !targetFound) issues.push("CORRECTION_TARGET_NEEDS_REVIEW");
  if (event.certainty === "OFFICIAL_CONFIRMED" && !event.notice_number) issues.push("NOTICE_NUMBER_MISSING");
  const completeRegistered = event.certainty === "OFFICIAL_CONFIRMED" && issues.length === 0;
  const checked = review.checked_fields ?? {};
  const reviewed = completeRegistered && review.status === "NOTICE_METADATA_AND_BODY_CHECKED" &&
    review.http_status === 200 && typeof review.reviewed_at === "string" &&
    Number.isFinite(Date.parse(review.reviewed_at)) && /^[a-f0-9]{64}$/u.test(review.body_sha256 ?? "") &&
    checked.notice_number === event.notice_number && checked.event_date === event.event_date &&
    checked.event_name_official === event.event_name_official;
  return {
    ...event,
    event_kind: isCorrection ? "NOTICE_CORRECTION" : eventKind,
    source_url: sourceUrl,
    correction_of: isCorrection && targetFound ? correctionOf : null,
    evidence_status: reviewed ? "NOTICE_DOCUMENT_REVIEWED" : completeRegistered ? "REGISTERED_OFFICIAL_EVIDENCE_REVIEW_NEEDED" : "NEEDS_REVIEW",
    evidence_label: reviewed ? "고시 정보·본문 재확인 · 현재단계 최신성 별도 확인" : completeRegistered ? "공식 근거 등록 · 최신 원문 재확인 필요" : "근거·법적 효력 확인 필요",
    review_status: reviewed ? review.status : "NEEDS_REVIEW",
    evidence_verified: reviewed,
    evidence_reviewed_at: reviewed ? review.reviewed_at : null,
    latest_official_verified: false,
    issues
  };
}

export function getProjectEvidence(project = {}, deepTarget = null) {
  // A mismatched project's evidence must never be attached to this detail page.
  const matched = Boolean(deepTarget && project.id && deepTarget.project_id === project.id);
  const deep = matched ? deepTarget : {};
  const observed = deep.display_snapshot ?? {};
  const stageRaw = observed.stage_raw ?? project.current_stage_official_raw ?? project.current_stage_name_official ?? "";
  const observedAt = observed.observed_at ?? project.stage_snapshot_at ?? project.current_stage_display_observed_at ?? null;
  const legalRaw = Array.isArray(deep.legal_events) ? deep.legal_events : [];
  const legalEvents = legalRaw.map(event => projectEvent(event, "PROJECT_STAGE_EVENT", legalRaw));
  const policyEvents = (deep.policy_events ?? []).map(event => projectEvent(event, "POLICY_PROGRAM_EVENT", []));
  const governanceEvents = (deep.governance_events ?? []).map(event => projectEvent(event, "PROJECT_GOVERNANCE_EVENT", []));
  const rightsRaw = deep.rights_regulation_events ?? deep.rights_events ?? [];
  const rightsItems = rightsRaw.map(event => projectEvent(event, "RIGHTS_REGULATION_EVENT", []));
  const issues = ["LATEST_OFFICIAL_SOURCE_REVIEW_REQUIRED"];
  if (deepTarget && !matched) issues.push("PROJECT_EVIDENCE_MISMATCH");
  if (!observedAt) issues.push("SNAPSHOT_DATE_MISSING");
  if (!legalEvents.length) issues.push("LEGAL_EVENT_MISSING");
  if (!rightsItems.length) issues.push("RIGHTS_EVIDENCE_MISSING");
  return {
    snapshot: {
      stage_raw: stageRaw,
      observed_at: observedAt,
      source_id: observed.source_id ?? project.source_id ?? null,
      source_url: safeSourceUrl(observed.source_locator ?? project.source_locator),
      effective_date: null,
      status: "OBSERVED_SNAPSHOT",
      explanation: getStageExplanation(stageRaw)
    },
    legal_events: legalEvents,
    policy_events: policyEvents,
    governance_events: governanceEvents,
    rights: {
      status: "NEEDS_REVIEW", items: rightsItems,
      note: "권리산정기준일·조합원 지위·분양자격·거래규제는 단계와 별도로 확인해야 합니다. 자료가 없으면 확인 필요 상태를 유지합니다."
    },
    readiness: {
      status: "NEEDS_REVIEW",
      latest_official_verified: false,
      registered_official_event_count: legalEvents.filter(event => event.certainty === "OFFICIAL_CONFIRMED").length,
      reviewed_notice_count: legalEvents.filter(event => event.evidence_verified).length,
      issues
    }
  };
}
