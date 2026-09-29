import crypto from "node:crypto";

export const CHANGE_KIND = Object.freeze({
  NEW_PROJECT: "NEW_PROJECT",
  PROJECT_MISSING: "PROJECT_MISSING",
  STAGE_CHANGED: "STAGE_CHANGED",
  PROJECT_TYPE_CHANGED: "PROJECT_TYPE_CHANGED",
  REPRESENTATIVE_LOT_CHANGED: "REPRESENTATIVE_LOT_CHANGED",
  SOURCE_PAGE_CHANGED: "SOURCE_PAGE_CHANGED",
  SOURCE_FILE_VERSION_CHANGED: "SOURCE_FILE_VERSION_CHANGED"
});

export const CANDIDATE_STATUS = Object.freeze({
  DISCOVERED: "DISCOVERED",
  NEEDS_PARSER: "NEEDS_PARSER",
  NEEDS_OFFICIAL_VERIFICATION: "NEEDS_OFFICIAL_VERIFICATION",
  READY_FOR_ASSERTION: "READY_FOR_ASSERTION",
  REJECTED: "REJECTED"
});

export function normalizeSourceText(value="") {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<!--([\s\S]*?)-->/g," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ")
    .trim();
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function fingerprintSource(value) {
  const normalized=normalizeSourceText(value);
  return {normalized_length:normalized.length,sha256:sha256(normalized)};
}

const norm=v=>String(v??"").normalize("NFC").replace(/\s+/g,"").trim().toLowerCase();

export function diffProjectSnapshots(previous=[], current=[]) {
  const oldMap=new Map(previous.map(p=>[norm(p.canonical_name),p]));
  const newMap=new Map(current.map(p=>[norm(p.canonical_name),p]));
  const changes=[];

  for(const [key,p] of newMap) {
    const old=oldMap.get(key);
    if(!old) {
      changes.push({kind:CHANGE_KIND.NEW_PROJECT,project_name:p.canonical_name,before:null,after:p});
      continue;
    }
    const pairs=[
      ["current_stage_official_raw",CHANGE_KIND.STAGE_CHANGED],
      ["project_type_official_raw",CHANGE_KIND.PROJECT_TYPE_CHANGED],
      ["representative_lot",CHANGE_KIND.REPRESENTATIVE_LOT_CHANGED]
    ];
    for(const [field,kind] of pairs) {
      if(norm(old[field])!==norm(p[field])) {
        changes.push({kind,project_name:p.canonical_name,field,before:old[field]??null,after:p[field]??null});
      }
    }
  }

  for(const [key,p] of oldMap) {
    if(!newMap.has(key)) changes.push({kind:CHANGE_KIND.PROJECT_MISSING,project_name:p.canonical_name,before:p,after:null});
  }
  return changes;
}

export function makeChangeCandidate({
  sensorId,
  sourceId,
  kind,
  observedAt,
  locator,
  payload,
  status
}) {
  if(!sensorId||!sourceId||!kind||!observedAt||!locator) throw new Error("change candidate missing required field");
  return {
    candidate_id:sha256([sensorId,kind,locator,JSON.stringify(payload),observedAt].join("|")).slice(0,24),
    sensor_id:sensorId,
    source_id:sourceId,
    kind,
    observed_at:observedAt,
    source_locator:locator,
    status:status||(
      kind===CHANGE_KIND.SOURCE_PAGE_CHANGED||kind===CHANGE_KIND.SOURCE_FILE_VERSION_CHANGED
        ? CANDIDATE_STATUS.NEEDS_PARSER
        : CANDIDATE_STATUS.NEEDS_OFFICIAL_VERIFICATION
    ),
    payload,
    verification_required:true,
    auto_promote_to_official:false
  };
}

export function mayPromoteCandidate(candidate,evidence={}) {
  if(!candidate?.verification_required) return {ok:false,reason:"candidate must require verification"};
  if(evidence.certainty!=="OFFICIAL_CONFIRMED") return {ok:false,reason:"official confirmation required"};
  if(!evidence.source_id||!evidence.source_locator) return {ok:false,reason:"official evidence source required"};
  if(!evidence.event_name_official) return {ok:false,reason:"official event name required"};
  if(!evidence.event_date) return {ok:false,reason:"official event date required"};
  return {ok:true,reason:"official evidence complete"};
}

export function reconcilePageFingerprint({sensor,previousState,currentText,observedAt}) {
  const fp=fingerprintSource(currentText);
  const next={
    sensor_id:sensor.id,
    source_id:sensor.source_id,
    locator:sensor.url,
    observed_at:observedAt,
    sha256:fp.sha256,
    normalized_length:fp.normalized_length
  };
  if(!previousState) return {nextState:next,candidates:[],event:"BASELINE_CREATED"};
  if(previousState.sha256===next.sha256) return {nextState:next,candidates:[],event:"UNCHANGED"};
  const candidate=makeChangeCandidate({
    sensorId:sensor.id,
    sourceId:sensor.source_id,
    kind:sensor.change_kind||CHANGE_KIND.SOURCE_PAGE_CHANGED,
    observedAt,
    locator:sensor.url,
    payload:{
      previous_sha256:previousState.sha256,
      current_sha256:next.sha256,
      previous_length:previousState.normalized_length??null,
      current_length:next.normalized_length
    }
  });
  return {nextState:next,candidates:[candidate],event:"CHANGED"};
}
