// Search terms retain their origin; derived names never replace official names.
export function normalizeText(value = "") {
  return String(value).normalize("NFC").toLowerCase()
    .replace(/[·ㆍ・,()[\]{}]/g, " ")
    .replace(/[^0-9a-z가-힣\s-]/g, " ")
    .replace(/\s+/g, " ").trim();
}

const compact = value => normalizeText(value).replace(/\s/g, "");

function derivedAliases(name) {
  const short = name.replace(/\s*(?:주택정비형|도시정비형|주택재개발|주택재건축|재개발정비사업|재건축정비사업|재건축 조합|재개발사업|신속통합기획 후보지|장기전세주택).*$/, "").trim();
  const aliases = new Set();
  if (short && short !== name) aliases.add(short);
  const district = short.match(/^(.+?\d+)(?:재정비촉진)?구역$/);
  const complex = short.match(/^(.+?\d+)단지(?:아파트)?$/);
  if (district) aliases.add(district[1]);
  if (complex) {
    aliases.add(complex[1]);
    aliases.add(complex[1] + "단지");
  }
  return [...aliases];
}

/** Optional terms: {project_id, term, kind:'ALIAS'|'STATION',
 * review_status:'REVIEWED', source_locator}. Unreviewed terms are excluded. */
export function prepareSearchProjects(projects, curatedTerms = []) {
  return projects.map(p => {
    const terms = [
      {kind:"canonical", term:p.canonical_name, origin:"OFFICIAL_NAME", source_locator:p.source_locator},
      ...derivedAliases(p.canonical_name).map(term => ({kind:"alias", term, origin:"DERIVED_CANONICAL_NAME", review_status:"DERIVED", source_locator:p.source_locator})),
      ...[p.representative_lot, p.jurisdiction].filter(Boolean).map(term => ({kind:"address", term, origin:"SEED_ADDRESS", source_locator:p.source_locator}))
    ];
    for (const term of curatedTerms) {
      if (term.project_id !== p.id || term.review_status !== "REVIEWED" || !term.source_locator || !term.term) continue;
      if (!["ALIAS", "STATION"].includes(term.kind)) continue;
      terms.push({...term, kind:term.kind.toLowerCase(), origin:"REVIEWED_SOURCE"});
    }
    const stationTokens = terms.filter(t => t.kind === "station").map(t => t.term);
    return {
      ...p, real:true,
      project_type_name_official:p.project_type_name_official ?? p.project_type_official_raw,
      current_stage_name_official:p.current_stage_name_official ?? p.current_stage_official_raw,
      aliases:terms.filter(t => t.kind === "alias").map(t => t.term),
      address_tokens:terms.filter(t => t.kind === "address").map(t => t.term),
      station_tokens:stationTokens,
      station_search_status:stationTokens.length ? "SOURCE_CONNECTED" : "NOT_CONNECTED",
      search_terms:terms
    };
  });
}

function editDistance(a, b) {
  let previous = Array.from({length:b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function trigramSimilarity(a, b) {
  const grams = value => {
    const padded = "  " + value + "  ";
    const result = new Set();
    for (let i = 0; i < padded.length - 2; i++) result.add(padded.slice(i, i + 3));
    return result;
  };
  const aa = grams(a), bb = grams(b);
  const shared = [...aa].filter(x => bb.has(x)).length;
  return 2 * shared / (aa.size + bb.size || 1);
}

const FIELD_LABELS = {canonical:"공식 명칭", alias:"축약명·별칭", address:"주소", station:"검증된 역명"};
const MATCH_LABELS = {exact:"정확히 일치", prefix:"앞부분 일치", substring:"부분 일치", fuzzy:"유사한 이름"};

function scoreTerm(term, query) {
  const value = compact(term.term);
  if (!value) return null;
  let mode, score;
  if (value === query) {
    mode = "exact";
    score = term.kind === "canonical" ? 100 : term.kind === "alias" ? 95 : 90;
  } else if (value.startsWith(query)) {
    mode = "prefix";
    score = term.kind === "canonical" ? 82 : term.kind === "alias" ? 80 : 78;
  } else if (value.includes(query)) {
    mode = "substring";
    score = term.kind === "canonical" ? 68 : term.kind === "alias" ? 66 : 64;
  } else {
    // An address typo must not silently resolve to another parcel. Station
    // proximity likewise cannot be inferred from a similar neighbourhood name.
    if (!["canonical", "alias"].includes(term.kind) || query.length < 4 || query.endsWith("역")) return null;
    const queryNumbers = query.match(/\d+/g) || [];
    const termNumbers = value.match(/\d+/g) || [];
    if (queryNumbers.some(n => !termNumbers.includes(n))) return null;
    const similarity = trigramSimilarity(value, query);
    const distance = editDistance(value, query);
    if (distance > (query.length >= 8 ? 2 : 1) || similarity < 0.35) return null;
    mode = "fuzzy";
    score = 40 + similarity * 20;
  }
  return {
    score, tier:term.kind + "_" + mode, matched:term.term,
    match_origin:term.origin,
    match_explanation:FIELD_LABELS[term.kind] + " · " + MATCH_LABELS[mode] + (term.origin === "DERIVED_CANONICAL_NAME" ? " · 공식 명칭에서 축약" : "")
  };
}

export function searchProjects(projects, query, limit = 20) {
  const normalized = compact(query);
  if (!normalized || !Number.isFinite(limit) || limit <= 0) return [];
  const result = [];
  for (const project of projects) {
    let best = null;
    for (const term of project.search_terms || []) {
      const match = scoreTerm(term, normalized);
      if (match && (!best || match.score > best.score)) best = match;
    }
    if (best) result.push({project, ...best});
  }
  return result.sort((a, b) => b.score - a.score || a.project.canonical_name.localeCompare(b.project.canonical_name, "ko") || a.project.id.localeCompare(b.project.id)).slice(0, Math.floor(limit));
}
