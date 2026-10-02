import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import {CHANGE_KIND,diffProjectSnapshots,reconcilePageFingerprint,reconcileProjectSnapshot,sha256} from "../src/updater/core.mjs";
import {environmentFetch} from "../src/http_transport.mjs";
import {CLEANUP_PARSER_ID,cleanupPageUrl,collectCleanupProjects} from "../src/updater/seoul_cleanup.mjs";

const CADENCE_MS={DAILY:86400000,WEEKLY:604800000};
const emptyState=()=>({schema_version:"1.0",updated_at:null,sensors:{}});
const emptyCandidates=()=>({schema_version:"1.0",generated_at:null,principle:"candidate != official fact",count:0,candidates:[]});
const validTime=value=>typeof value==="string"&&Number.isFinite(Date.parse(value));
const isRecord=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);

export function validateState(state) {
  if(!isRecord(state)||state.schema_version!=="1.0"||!isRecord(state.sensors)||
    (state.updated_at!==null&&!validTime(state.updated_at))) throw new Error("Invalid watcher state schema; restore a valid state instead of resetting history");
  for(const [id,sensor] of Object.entries(state.sensors)) {
    if(!isRecord(sensor)||sensor.sensor_id!==id||!sensor.source_id||!sensor.locator||
      !validTime(sensor.observed_at)||!/^[a-f0-9]{64}$/.test(sensor.sha256||"")||
      !Number.isInteger(sensor.normalized_length)||sensor.normalized_length<0) {
      throw new Error(`Invalid watcher state for sensor ${id}`);
    }
    if(sensor.project_snapshot!==undefined) {
      if(sensor.parser_id!==CLEANUP_PARSER_ID||!Array.isArray(sensor.project_snapshot)||!Array.isArray(sensor.source_pages)) throw new Error(`Invalid project snapshot state for sensor ${id}`);
      diffProjectSnapshots(sensor.project_snapshot,sensor.project_snapshot);
      if(sensor.project_snapshot.some(row=>row.certainty!=="SOURCE_CONFIRMED"||row.legal_effect_status!=="NEEDS_REVIEW"||row.source_id!==sensor.source_id)) throw new Error(`Invalid project snapshot lineage for sensor ${id}`);
      const serialized=JSON.stringify(sensor.project_snapshot);
      if(sha256(serialized)!==sensor.sha256||serialized.length!==sensor.normalized_length) throw new Error(`Invalid project snapshot integrity for sensor ${id}`);
    }
  }
  return state;
}

export function validateCandidateHistory(history) {
  if(!isRecord(history)||history.schema_version!=="1.0"||!Array.isArray(history.candidates)||
    history.count!==history.candidates.length||history.candidates.some(c=>!isRecord(c)||
      !c.candidate_id||!c.sensor_id||!c.source_id||!c.source_locator||!validTime(c.observed_at)||
      c.verification_required!==true||c.auto_promote_to_official!==false)) {
    throw new Error("Invalid watcher candidate history; restore a valid history instead of overwriting it");
  }
  return history;
}

function validUrl(value) {
  let url;
  try{url=new URL(value);}catch{throw new Error("Invalid sensor URL");}
  if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.hash) {
    throw new Error("Sensor URL must be HTTP(S) without embedded credentials or fragment");
  }
  return value;
}

export function expandSensors(group) {
  if(!group.id||!group.source_id) throw new Error("Sensor group id and source_id required");
  const common={source_id:group.source_id,change_kind:group.change_kind||CHANGE_KIND.SOURCE_PAGE_CHANGED};
  if(group.sensor_type==="HTTP_SNAPSHOT") return [{...common,id:group.id,url:validUrl(group.url)}];
  if(group.sensor_type==="TEMPLATED_HTTP_SNAPSHOT") {
    if(typeof group.url_template!=="string"||!group.url_template.includes("{code}")||!Array.isArray(group.districts)||!group.districts.length) {
      throw new Error("Templated sensor needs a URL template and districts");
    }
    return group.districts.map(row=>{
      if(!Array.isArray(row)||row.length!==2||!String(row[0]).trim()||!String(row[1]).trim()) throw new Error("Invalid district sensor row");
      const [code,name]=row;
      return {...common,id:`${group.id}_${code}`,url:validUrl(group.url_template.replaceAll("{code}",encodeURIComponent(code))),district_code:code,district_name:name};
    });
  }
  throw new Error(`Unsupported active sensor type: ${group.sensor_type}`);
}

export function isSensorDue(previousState,cadence,observedAt) {
  if(!Object.hasOwn(CADENCE_MS,cadence)) throw new Error(`Unsupported active sensor cadence: ${cadence}`);
  if(!validTime(observedAt)) throw new Error("Invalid observation timestamp");
  if(!previousState) return true;
  if(!validTime(previousState.observed_at)) throw new Error("Invalid previous sensor observation timestamp");
  return Date.parse(observedAt)-Date.parse(previousState.observed_at)>=CADENCE_MS[cadence];
}

export async function fetchSourceText(url,{fetchImpl=environmentFetch,timeoutMs=20000}={}) {
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0) throw new Error("timeoutMs must be positive");
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try {
    const res=await fetchImpl(validUrl(url),{signal:ctrl.signal,headers:{"user-agent":"budong-v1-update-watcher/1.0","accept":"text/html,application/xhtml+xml,*/*;q=0.8"}});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text=await res.text();
    if(!text.trim()) throw new Error("Empty source response; previous baseline preserved");
    return text;
  } catch(error) {
    if(ctrl.signal.aborted) throw new Error(`Source request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {clearTimeout(timer);}
}

// Configuration or saved-state errors stop before any fetch. A failed sensor keeps its
// previous successful observation, so it remains due and is retried on the next run.
export async function runUpdateWatch({config,state=emptyState(),history=emptyCandidates(),observedAt=new Date().toISOString(),fetchImpl=environmentFetch,timeoutMs=20000,onSnapshot}={}) {
  if(!isRecord(config)||config.schema_version!=="1.0"||!Array.isArray(config.groups)) throw new Error("Invalid watcher configuration schema");
  validateState(state);
  validateCandidateHistory(history);
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0) throw new Error("timeoutMs must be positive");
  if(config.network_timeout_ms!==undefined&&(!Number.isFinite(config.network_timeout_ms)||config.network_timeout_ms<=0)) throw new Error("Invalid configuration network timeout");
  if(!validTime(observedAt)) throw new Error("Invalid observation timestamp");
  const ids=new Set();
  const groups=config.groups.map(group=>{
    if(!isRecord(group)||!group.id||!group.status) throw new Error("Invalid sensor group configuration");
    if(group.status!=="ACTIVE_SNAPSHOT_WATCH") return {group,sensors:[]};
    if(group.required!==undefined&&typeof group.required!=="boolean") throw new Error(`Invalid required flag for ${group.id}`);
    if(group.timeout_ms!==undefined&&(!Number.isFinite(group.timeout_ms)||group.timeout_ms<=0)) throw new Error(`Invalid timeout for ${group.id}`);
    if(group.parser!==undefined&&group.parser!==CLEANUP_PARSER_ID) throw new Error(`Unsupported source parser for ${group.id}`);
    const cadence=group.cadence||config.default_cadence||"DAILY";
    isSensorDue(null,cadence,observedAt);
    const sensors=expandSensors(group);
    for(const sensor of sensors) {
      if(group.parser===CLEANUP_PARSER_ID) cleanupPageUrl(sensor,{pageSize:group.page_size??100});
      if(ids.has(sensor.id)) throw new Error(`Duplicate sensor id: ${sensor.id}`);
      ids.add(sensor.id);
      const previous=state.sensors[sensor.id];
      if(previous&&(previous.source_id!==sensor.source_id||previous.locator!==sensor.url)) {
        throw new Error(`Sensor ${sensor.id} source changed; use a new sensor id to preserve lineage`);
      }
      if(previous&&Date.parse(previous.observed_at)>Date.parse(observedAt)) throw new Error(`Sensor ${sensor.id} observation is in the future`);
    }
    return {group,sensors,cadence};
  });
  const nextState=structuredClone(state);
  const candidates=[];
  const report=[];
  let requiredErrors=0;
  for(const {group,sensors,cadence} of groups) {
    if(group.status!=="ACTIVE_SNAPSHOT_WATCH") {
      report.push({sensor_group:group.id,status:"SKIPPED",reason:group.status});
      continue;
    }
    for(const sensor of sensors) {
      if(!isSensorDue(nextState.sensors[sensor.id],cadence,observedAt)) {
        report.push({sensor:sensor.id,status:"SKIPPED",reason:"NOT_DUE",cadence,last_success_at:nextState.sensors[sensor.id].observed_at});
        continue;
      }
      try {
        const fetchText=url=>fetchSourceText(url,{fetchImpl,timeoutMs:group.timeout_ms??config.network_timeout_ms??timeoutMs});
        const text=await fetchText(group.parser===CLEANUP_PARSER_ID?cleanupPageUrl(sensor,{pageSize:group.page_size??100}):sensor.url);
        // Optional raw HTML is saved before baseline advancement. A failed snapshot
        // write must not discard the evidence behind a newly detected candidate.
        let snapshotPath=null;
        let collection=null;
        let rec;
        if(group.parser===CLEANUP_PARSER_ID) {
          collection=await collectCleanupProjects({sensor,initialHtml:text,fetchText,pageSize:group.page_size??100,
            onPage:onSnapshot?async(html,url,page)=>onSnapshot({...sensor,id:`${sensor.id}_page_${page}`,url},html,observedAt):undefined});
          rec=reconcileProjectSnapshot({sensor,previousState:nextState.sensors[sensor.id],projects:collection.projects,
            sourcePages:collection.source_pages,observedAt,parserId:CLEANUP_PARSER_ID});
          rec.nextState.raw_snapshot_paths=collection.raw_snapshot_paths;
          snapshotPath=collection.raw_snapshot_paths[0]||null;
        } else {
          snapshotPath=onSnapshot?await onSnapshot(sensor,text,observedAt):null;
          rec=reconcilePageFingerprint({sensor,previousState:nextState.sensors[sensor.id],currentText:text,observedAt});
        }
        if(snapshotPath) rec.nextState.raw_snapshot_path=snapshotPath;
        nextState.sensors[sensor.id]=rec.nextState;
        candidates.push(...rec.candidates.map(c=>({...c,district_code:sensor.district_code||null,district_name:sensor.district_name||null,...(snapshotPath?{raw_snapshot_path:snapshotPath}:{}),...(collection?.raw_snapshot_paths.length?{raw_snapshot_paths:collection.raw_snapshot_paths}:{})})));
        report.push({sensor:sensor.id,status:"OK",event:rec.event,candidates:rec.candidates.length,cadence,
          ...(collection?{parser_id:CLEANUP_PARSER_ID,project_count:collection.total,page_count:collection.page_count,warnings:collection.warnings}:{})});
      } catch(error) {
        const required=group.required!==false;
        if(required) requiredErrors++;
        report.push({sensor:sensor.id,status:"ERROR",required,error:String(error?.message||error)});
      }
    }
  }
  nextState.updated_at=observedAt;
  const merged=new Map(history.candidates.map(c=>[c.candidate_id,c]));
  for(const candidate of candidates) merged.set(candidate.candidate_id,candidate);
  const nextHistory={...history,generated_at:observedAt,candidates:[...merged.values()],count:merged.size};
  return {state:nextState,history:nextHistory,candidates,report,generated_at:observedAt,candidate_count:candidates.length,total_candidate_count:merged.size,required_error_count:requiredErrors,ok:requiredErrors===0};
}

async function readJsonOrMissing(file,fallback) {
  try{return JSON.parse(await fs.readFile(file,"utf8"));}
  catch(error){if(error.code==="ENOENT") return fallback();throw new Error(`Cannot read ${file}: ${error.message}`);}
}

export async function atomicWrite(file,value) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=`${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp,value,{flag:"wx",mode:0o600});
    await fs.rename(temp,file);
  } finally {await fs.rm(temp,{force:true});}
}

export async function runUpdateWatchFromFiles({configPath="config/update_sensors.json",statePath="runtime/update-watch/state.json",candidatePath="runtime/update-watch/candidates.json",reportPath=path.join(path.dirname(statePath),"last-run.json"),snapshotDir,...options}={}) {
  const paths=[statePath,candidatePath,reportPath].map(file=>path.resolve(file));
  if(new Set(paths).size!==paths.length||paths.includes(path.resolve(configPath))) throw new Error("Watcher output paths must be distinct from each other and configuration");
  const config=JSON.parse(await fs.readFile(configPath,"utf8"));
  const state=await readJsonOrMissing(statePath,emptyState);
  const history=await readJsonOrMissing(candidatePath,emptyCandidates);
  const result=await runUpdateWatch({config,state,history,...options,onSnapshot:snapshotDir?async(sensor,text,observedAt)=>{
    const file=path.join(snapshotDir,`${encodeURIComponent(sensor.id)}-${observedAt.replace(/[^0-9TZ]/g,"")}.html`);
    await atomicWrite(file,text);
    return file;
  }:options.onSnapshot});
  const summary={generated_at:result.generated_at,ok:result.ok,candidate_count:result.candidate_count,total_candidate_count:result.total_candidate_count,required_error_count:result.required_error_count,report:result.report};
  // Candidate evidence is committed first. If the process stops before state write,
  // the next run repeats the observation; candidate ids deduplicate identical runs.
  await atomicWrite(candidatePath,JSON.stringify(result.history,null,2)+"\n");
  await atomicWrite(statePath,JSON.stringify(result.state,null,2)+"\n");
  await atomicWrite(reportPath,JSON.stringify(summary,null,2)+"\n");
  return result;
}

export async function main(argv=process.argv.slice(2)) {
  const supported=new Map([["--config","configPath"],["--state","statePath"],["--candidates","candidatePath"],["--report","reportPath"],["--snapshots-dir","snapshotDir"],["--timeout-ms","timeoutMs"]]);
  const options={};
  for(let index=0;index<argv.length;index+=2) {
    const key=supported.get(argv[index]);
    if(!key||!argv[index+1]||argv[index+1].startsWith("--")) throw new Error(`Invalid watcher option: ${argv[index]}`);
    options[key]=key==="timeoutMs"?Number(argv[index+1]):argv[index+1];
  }
  const result=await runUpdateWatchFromFiles(options);
  console.log(JSON.stringify({generated_at:result.generated_at,ok:result.ok,candidate_count:result.candidate_count,total_candidate_count:result.total_candidate_count,required_error_count:result.required_error_count,report:result.report},null,2));
  return result.ok?0:1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try{process.exitCode=await main();}
  catch(error){console.error(`Update watch failed: ${error.message}`);process.exitCode=1;}
}
