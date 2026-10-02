import crypto from "node:crypto";

export const CHANGE_KIND = Object.freeze({
  NEW_PROJECT: "NEW_PROJECT",
  PROJECT_MISSING: "PROJECT_MISSING",
  PROJECT_NAME_CHANGED: "PROJECT_NAME_CHANGED",
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
const projectKey=project=>project.project_source_key?`source:${project.project_source_key}`:`name:${norm(project.canonical_name)}`;

export function diffProjectSnapshots(previous=[], current=[]) {
  for(const [label,rows] of [["previous",previous],["current",current]]) {
    if(!Array.isArray(rows)) throw new Error(`${label} project snapshot must be an array`);
    const keys=new Set();
    for(const row of rows) {
      if(!norm(row?.canonical_name)) throw new Error(`${label} project snapshot has an unnamed project`);
      const key=projectKey(row);
      if(keys.has(key)) throw new Error(`${label} project snapshot has a duplicate canonical name: ${row.canonical_name}`);
      keys.add(key);
    }
  }
  const oldMap=new Map(previous.map(p=>[projectKey(p),p]));
  const newMap=new Map(current.map(p=>[projectKey(p),p]));
  const changes=[];

  for(const [key,p] of newMap) {
    const old=oldMap.get(key);
    if(!old) {
      changes.push({kind:CHANGE_KIND.NEW_PROJECT,project_name:p.canonical_name,before:null,after:p});
      continue;
    }
    const pairs=[
      ["canonical_name",CHANGE_KIND.PROJECT_NAME_CHANGED],
      ["current_stage_official_raw",CHANGE_KIND.STAGE_CHANGED],
      ["project_type_official_raw",CHANGE_KIND.PROJECT_TYPE_CHANGED],
      ["representative_lot",CHANGE_KIND.REPRESENTATIVE_LOT_CHANGED]
    ];
    for(const [field,kind] of pairs) {
      if(norm(old[field])!==norm(p[field])) {
        changes.push({kind,project_name:p.canonical_name,...(p.project_source_key?{project_source_key:p.project_source_key}:{}),field,before:old[field]??null,after:p[field]??null});
      }
    }
  }

  for(const [key,p] of oldMap) {
    if(!newMap.has(key)) changes.push({kind:CHANGE_KIND.PROJECT_MISSING,project_name:p.canonical_name,before:p,after:null});
  }
  return changes;
}

export function reconcileProjectSnapshot({sensor,previousState,projects,sourcePages=[],observedAt,parserId}) {
  // Validate identities before writing a baseline; duplicate rows are incomplete
  // evidence, never a reason to silently merge projects or remove a prior one.
  diffProjectSnapshots(projects,projects);
  const serialized=JSON.stringify(projects);
  const nextState={sensor_id:sensor.id,source_id:sensor.source_id,locator:sensor.url,observed_at:observedAt,
    sha256:sha256(serialized),normalized_length:serialized.length,parser_id:parserId,
    project_snapshot:projects,source_pages:sourcePages};
  if(!previousState?.project_snapshot) return {nextState,candidates:[],event:previousState?"PROJECT_BASELINE_CREATED":"BASELINE_CREATED"};
  if(previousState.parser_id!==parserId) throw new Error("Project parser changed; a reviewed baseline migration is required");
  const changes=diffProjectSnapshots(previousState.project_snapshot,projects);
  const candidates=changes.map(change=>makeChangeCandidate({sensorId:sensor.id,sourceId:sensor.source_id,
    kind:change.kind,observedAt,locator:sensor.url,payload:{...change,source_pages:sourcePages,
      previous_observed_at:previousState.observed_at,certainty:"SOURCE_CONFIRMED",legal_effect_status:"NEEDS_REVIEW"}}));
  return {nextState,candidates,event:changes.length?"CHANGED":"UNCHANGED"};
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
  if(candidate.status===CANDIDATE_STATUS.REJECTED) return {ok:false,reason:"rejected candidate requires a new review"};
  if(evidence.certainty!=="OFFICIAL_CONFIRMED") return {ok:false,reason:"official confirmation required"};
  if(!evidence.source_id||!evidence.source_locator) return {ok:false,reason:"official evidence source required"};
  const seoulAuthorities=["seoul.go.kr","jongno.go.kr","junggu.seoul.kr","yongsan.go.kr","sd.go.kr","gwangjin.go.kr","ddm.go.kr","jungnang.go.kr","sb.go.kr","gangbuk.go.kr","dobong.go.kr","nowon.kr","ep.go.kr","sdm.go.kr","mapo.go.kr","yangcheon.go.kr","gangseo.seoul.kr","guro.go.kr","geumcheon.go.kr","ydp.go.kr","dongjak.go.kr","gwanak.go.kr","seocho.go.kr","gangnam.go.kr","songpa.go.kr","gangdong.go.kr"];
  const officialHosts={
    SEOUL_OFFICIAL_NOTICE:host=>seoulAuthorities.some(domain=>host===domain||host.endsWith(`.${domain}`)),
    LAND_USE_EUM_GOV_NOTICE:host=>host==="eum.go.kr"||host.endsWith(".eum.go.kr"),
    SONGPA_NOTICE_BOARD:host=>host==="songpa.go.kr"||host.endsWith(".songpa.go.kr")
  };
  const allowedHost=officialHosts[evidence.source_id];
  if(!allowedHost) return {ok:false,reason:"source is not approved for official evidence"};
  try {
    const url=new URL(evidence.source_locator);
    if(url.protocol!=="https:"||url.username||url.password||!allowedHost(url.hostname)) {
      return {ok:false,reason:"official source URL does not match source registry"};
    }
  } catch { return {ok:false,reason:"official source URL invalid"}; }
  if(!String(evidence.event_name_official||"").trim()) return {ok:false,reason:"official event name required"};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(evidence.event_date||"")||
    Number.isNaN(Date.parse(evidence.event_date))||
    new Date(evidence.event_date).toISOString().slice(0,10)!==evidence.event_date) {
    return {ok:false,reason:"valid official event date required"};
  }
  if(!String(evidence.notice_number||"").trim()) return {ok:false,reason:"official notice number required"};
  if(!String(evidence.issuer||"").trim()) return {ok:false,reason:"official issuing institution required"};
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
