import fs from "node:fs/promises";
import path from "node:path";
import {CHANGE_KIND,reconcilePageFingerprint} from "../src/updater/core.mjs";

const args=new Map(process.argv.slice(2).map((v,i,a)=>v.startsWith("--")?[v,a[i+1]]:null).filter(Boolean));
const configPath=args.get("--config")||"config/update_sensors.json";
const statePath=args.get("--state")||"runtime/update-watch/state.json";
const candidatePath=args.get("--candidates")||"runtime/update-watch/candidates.json";

const config=JSON.parse(await fs.readFile(configPath,"utf8"));
let state={schema_version:"1.0",updated_at:null,sensors:{}};
try{state=JSON.parse(await fs.readFile(statePath,"utf8"));}catch{}
const observedAt=new Date().toISOString();
const candidates=[];
const report=[];

async function fetchText(url){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),20000);
  try{
    const res=await fetch(url,{signal:ctrl.signal,headers:{"user-agent":"budong-v1-update-watcher/1.0","accept":"text/html,application/xhtml+xml,*/*;q=0.8"}});
    if(!res.ok)throw new Error("HTTP "+res.status);
    return await res.text();
  }finally{clearTimeout(timer)}
}

function due(group){
  if(group.status==="ACTIVE_SNAPSHOT_WATCH") return true;
  return false;
}

for(const group of config.groups){
  if(!due(group)){
    report.push({sensor_group:group.id,status:"SKIPPED",reason:group.status});
    continue;
  }
  const sensors=[];
  if(group.sensor_type==="TEMPLATED_HTTP_SNAPSHOT"){
    for(const [code,name] of group.districts){
      sensors.push({
        id:group.id+"_"+code,
        source_id:group.source_id,
        url:group.url_template.replace("{code}",code),
        change_kind:group.change_kind||CHANGE_KIND.SOURCE_PAGE_CHANGED,
        district_code:code,district_name:name
      });
    }
  }else if(group.sensor_type==="HTTP_SNAPSHOT"){
    sensors.push({id:group.id,source_id:group.source_id,url:group.url,change_kind:group.change_kind});
  }
  for(const sensor of sensors){
    try{
      const text=await fetchText(sensor.url);
      const rec=reconcilePageFingerprint({sensor,previousState:state.sensors[sensor.id],currentText:text,observedAt});
      state.sensors[sensor.id]=rec.nextState;
      candidates.push(...rec.candidates.map(c=>({...c,district_code:sensor.district_code||null,district_name:sensor.district_name||null})));
      report.push({sensor:sensor.id,status:"OK",event:rec.event,candidates:rec.candidates.length});
    }catch(err){
      report.push({sensor:sensor.id,status:"ERROR",error:String(err?.message||err)});
    }
  }
}

state.updated_at=observedAt;
await fs.mkdir(path.dirname(statePath),{recursive:true});
await fs.writeFile(statePath,JSON.stringify(state,null,2)+"\n");
await fs.mkdir(path.dirname(candidatePath),{recursive:true});
await fs.writeFile(candidatePath,JSON.stringify({
  schema_version:"1.0",
  generated_at:observedAt,
  principle:"candidate != official fact",
  count:candidates.length,
  candidates
},null,2)+"\n");

console.log(JSON.stringify({generated_at:observedAt,candidate_count:candidates.length,report},null,2));
