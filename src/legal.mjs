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
// General education only: these links do not establish this project's facts.
const LAW_SOURCES = {
  types: {label: "도시정비법 제2조 · 사업유형", url: "https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1031061685"},
  developer: {label: "도시정비법 제27조 · 지정개발자", url: "https://law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1032613883"},
  membership: {label: "도시정비법 제39조 · 조합원의 자격", url: "https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1000970595"},
  cutoff: {label: "도시정비법 제77조 · 권리산정기준일", url: "https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029443529"},
  street: {label: "서울시 · 가로주택정비 절차", url: "https://cleanup.seoul.go.kr/cleanup/view/garoHouse.do"}
};

export function getProjectTypeExplanation(raw) {
  const original = typeof raw === "string" ? raw : "";
  const normalized = original.normalize("NFC").replace(/\s+/gu, "");
  const definitions = [
    ["재건축", "RECONSTRUCTION", "URBAN_RENEWAL_ACT", "기반시설이 비교적 갖춰진 곳의 노후 공동주택 등을 새로 짓는 사업입니다.", "재건축 동의 여부와 조합원 지위의 취득·양도 요건을 별도로 확인합니다."],
    ["재개발(주택정비형)", "RESIDENTIAL_REDEVELOPMENT", "URBAN_RENEWAL_ACT", "주거환경과 기반시설을 함께 개선하는 재개발 유형입니다.", "권리산정기준일과 토지·건축물의 소유 이력, 분양신청·관리처분 자료를 함께 확인합니다."],
    ["재개발(도시정비형)", "URBAN_REDEVELOPMENT", "URBAN_RENEWAL_ACT", "상업·공업지역 등의 도시기능과 환경을 개선하는 재개발 유형입니다.", "주택 공급 여부와 권리 배분은 해당 사업계획·관리처분 원문을 확인합니다."],
    ["재개발", "REDEVELOPMENT", "URBAN_RENEWAL_ACT", "노후 지역의 주거환경 또는 도시환경을 개선하는 사업입니다.", "구체적인 사업유형과 시행방식은 해당 구역의 원문으로 확인합니다."],
    ["가로주택정비", "STREET_HOUSING", "SMALL_HOUSING_ACT", "기존 가로를 유지하면서 노후주택을 소규모로 정비하는 사업입니다.", "정비구역 지정·추진위원회 절차가 생략될 수 있고 사업시행계획에 관리처분계획이 포함됩니다. 재개발의 단계표를 그대로 적용하지 않습니다."],
    ["가로주택정비사업", "STREET_HOUSING", "SMALL_HOUSING_ACT", "기존 가로를 유지하면서 노후주택을 소규모로 정비하는 사업입니다.", "정비구역 지정·추진위원회 절차가 생략될 수 있고 사업시행계획에 관리처분계획이 포함됩니다. 재개발의 단계표를 그대로 적용하지 않습니다."]
  ];
  const definition = definitions.find(([name]) => name === normalized);
  if (!definition) return {
    raw: original, code: "UNKNOWN", law_family: "NEEDS_REVIEW", status: "NEEDS_REVIEW",
    plain_explanation: "사업유형에 따른 절차와 적용 법령을 원문에서 확인해야 합니다.",
    route_note: "재개발·재건축의 공통 단계표만으로 이 사업의 다음 절차를 정하지 않습니다.", source_links: []
  };
  return {raw: original, code: definition[1], law_family: definition[2], status: "GENERAL_GUIDANCE",
    plain_explanation: definition[3], route_note: definition[4],
    source_links: [{...(definition[2] === "SMALL_HOUSING_ACT" ? LAW_SOURCES.street : LAW_SOURCES.types)}]};
}

function governanceSummary(project, events, context) {
  const raw = project.implementation_method_official_raw ?? project.governance_type_official_raw ?? "";
  const trustObserved = typeof raw === "string" && raw.includes("신탁") || events.some(event =>
    typeof event.actor_name === "string" && event.actor_name.includes("신탁"));
  return {
    raw, status: "NEEDS_REVIEW", trust_actor_observed: trustObserved,
    note: trustObserved
      ? "신탁 관련 표시가 있습니다. 신탁사가 사업시행자인지 대행자인지, 지정 고시·계약의 역할과 날짜를 별도로 확인합니다. 포털의 조합 단계 표시만으로 조합 방식으로 확정하지 않습니다."
      : "조합·공공·신탁 등 시행방식과 사업시행자 지정은 단계와 별도로 원문을 확인합니다.",
    source_links: context.law_family === "URBAN_RENEWAL_ACT" ? [{...LAW_SOURCES.developer}] : []
  };
}

function rightsChecklist(context, items) {
  const smallOrUnknown = context.law_family !== "URBAN_RENEWAL_ACT";
  const definitions = [
    ["RIGHTS_CUTOFF", "권리산정기준일", "구역 지정일과 별도로 정한 기준일·변경 고시 및 해당 필지의 분할·건축 이력을 확인합니다.", ["RIGHTS_CUTOFF", "RIGHTS_CALCULATION_BASE_DATE"], LAW_SOURCES.cutoff],
    ["MEMBERSHIP_ELIGIBILITY", "조합원 지위", "사업유형·시행방식, 소유·동의·취득 이력과 거래 시점의 제한·예외를 함께 확인합니다.", ["MEMBERSHIP_ELIGIBILITY"], LAW_SOURCES.membership],
    ["ALLOCATION_ELIGIBILITY", "분양자격", "분양신청 및 관리처분 자료와 물건별 권리 관계를 확인합니다. 고시일만으로 분양자격을 정하지 않습니다.", ["ALLOCATION_ELIGIBILITY", "SALE_ELIGIBILITY"], null],
    ["TRANSACTION_RESTRICTIONS", "거래규제", "거래일에 적용되는 규제지역 지정·토지거래허가 등 별도 고시와 적용 대상을 확인합니다.", ["TRANSACTION_RESTRICTIONS"], null]
  ];
  return definitions.map(([code, label, note, types, source]) => ({
    code, label, note, status: "NEEDS_REVIEW", effective_date: null,
    evidence_count: items.filter(item => types.includes(item.event_type_code)).length,
    source_links: source && !smallOrUnknown ? [{...source}] : [],
    individual_eligibility_verified: false
  }));
}

export function safeSourceUrl(value) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function getStageExplanation(raw, context = null) {
  const original = typeof raw === "string" ? raw : "";
  const normalized = original.normalize("NFC").replace(/\s+/gu, "").trim();
  const match = STAGE_DICTIONARY.find(([name, aliases]) =>
    [name, ...aliases].some(term => term.replace(/\s+/gu, "") === normalized)
  );
  if (match && context?.raw && (context.law_family === "NEEDS_REVIEW" ||
    context.law_family === "SMALL_HOUSING_ACT" && ["정비구역 지정·고시", "조합설립추진위원회 승인", "관리처분계획인가"].includes(match[0]))) return {
    raw: original, official_name: match[0], kind: "UNKNOWN", status: "NEEDS_REVIEW",
    plain_explanation: "이 사업유형에서는 표시된 절차의 적용 방식과 근거를 별도로 확인해야 합니다. " + context.route_note
  };
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

function validReviewInstant(value) {
  if (typeof value !== "string") return false;
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.exec(value);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60 && Number(match[3]) < 60 &&
    validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)));
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
    review.http_status === 200 && validReviewInstant(review.reviewed_at) &&
    /^[a-f0-9]{64}$/u.test(review.body_sha256 ?? "") &&
    checked.notice_number === event.notice_number && validDate(checked.event_date) && checked.event_date === (event.event_date ?? event.effective_date) &&
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
    provenance: {
      registered_source_url: safeSourceUrl(event.source_locator), reviewed_source_url: reviewed ? sourceUrl : null,
      notice_date: validDate(event.event_date) ? event.event_date : null,
      effective_date: validDate(event.effective_date) ? event.effective_date : null,
      reviewed_at: reviewed ? review.reviewed_at : null,
      document_sha256: reviewed ? review.body_sha256 : null,
      hash_representation: reviewed ? review.body_hash_representation ?? null : null,
      attachments_reviewed: reviewed && review.attachments_reviewed === true,
      review_scope: reviewed ? "REGISTERED_NOTICE_METADATA_AND_HTML_BODY" : "NEEDS_REVIEW",
      individual_eligibility_verified: false
    },
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
  const projectContext = getProjectTypeExplanation(project.project_type_official_raw ?? project.project_type_name_official);
  const issues = ["LATEST_OFFICIAL_SOURCE_REVIEW_REQUIRED"];
  if (deepTarget && !matched) issues.push("PROJECT_EVIDENCE_MISMATCH");
  if (!observedAt) issues.push("SNAPSHOT_DATE_MISSING");
  else if (!validDate(observedAt)) issues.push("SNAPSHOT_DATE_NEEDS_REVIEW");
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
      freshness: {status: validDate(observedAt) ? "OBSERVATION_ONLY" : "OBSERVATION_DATE_NEEDS_REVIEW", observed_at: observedAt, latest_official_verified: false},
      explanation: getStageExplanation(stageRaw, projectContext)
    },
    legal_events: legalEvents,
    policy_events: policyEvents,
    governance_events: governanceEvents,
    project_context: projectContext,
    governance_summary: governanceSummary(project, governanceEvents, projectContext),
    rights: {
      status: "NEEDS_REVIEW", items: rightsItems,
      checklist: rightsChecklist(projectContext, rightsItems),
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
