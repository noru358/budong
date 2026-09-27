export const CERTAINTY = Object.freeze({
  OFFICIAL_CONFIRMED: "OFFICIAL_CONFIRMED",
  SOURCE_CONFIRMED: "SOURCE_CONFIRMED",
  ESTIMATED: "ESTIMATED",
  USER_ASSUMPTION: "USER_ASSUMPTION",
  NEEDS_REVIEW: "NEEDS_REVIEW"
});

export const READINESS = Object.freeze({
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  RED: "RED",
  WHITE: "WHITE"
});

// WHITE means unreviewed, so a derived commercial result cannot be GREEN/YELLOW
// while any upstream source remains WHITE.
const READINESS_RISK = Object.freeze({ GREEN: 0, YELLOW: 1, WHITE: 2, RED: 3 });

export function inheritCommercialReadiness(values = []) {
  if (!Array.isArray(values) || values.length === 0) return READINESS.WHITE;
  const clean = values.map(v => String(v || "").toUpperCase());
  for (const value of clean) {
    if (!(value in READINESS_RISK)) throw new Error("Unknown license readiness: " + value);
  }
  return clean.reduce((worst, value) =>
    READINESS_RISK[value] > READINESS_RISK[worst] ? value : worst
  , READINESS.GREEN);
}

export function requireSecret(env, name) {
  const value = env?.[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Missing required secret: " + name);
  }
  return value.trim();
}

export function makeAssertion({
  id,
  sourceId,
  subjectType,
  subjectId,
  predicate,
  value,
  certainty = CERTAINTY.SOURCE_CONFIRMED,
  locator,
  observedAt,
  effectiveAt = null,
  reviewedAt
}) {
  const required = { id, sourceId, subjectType, subjectId, predicate, locator, observedAt, reviewedAt };
  for (const [key,val] of Object.entries(required)) {
    if (val == null || val === "") throw new Error("Assertion requires " + key);
  }
  if (!Object.values(CERTAINTY).includes(certainty)) {
    throw new Error("Unknown certainty: " + certainty);
  }
  if (value === undefined) throw new Error("Assertion value must not be undefined");
  return {
    id,
    source_id: sourceId,
    subject_type: subjectType,
    subject_id: subjectId,
    predicate,
    value,
    certainty,
    source_locator: locator,
    observed_at: observedAt,
    effective_at: effectiveAt,
    reviewed_at: reviewedAt
  };
}

export function dataGoKrQuery(serviceKey, params = {}) {
  const key = typeof serviceKey === "string" ? serviceKey.trim() : "";
  if (!key) throw new Error("Missing DATA_GO_KR_SERVICE_KEY");
  const q = new URLSearchParams();
  // Keep the provided key opaque; never log or persist the result.
  q.set("serviceKey", key);
  for (const [k,v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  }
  return q;
}

export function assertNoSecretLikeFields(record) {
  const bad = [];
  const walk = (value, path = "") => {
    if (!value || typeof value !== "object") return;
    for (const [k,v] of Object.entries(value)) {
      const p = path ? path + "." + k : k;
      if (/service.?key|api.?key|secret|token/i.test(k) && typeof v === "string" && v.trim()) bad.push(p);
      else walk(v,p);
    }
  };
  walk(record);
  if (bad.length) throw new Error("Secret-like field must not be persisted: " + bad.join(", "));
  return true;
}
