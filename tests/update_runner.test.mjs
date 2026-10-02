import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {runUpdateWatch,runUpdateWatchFromFiles,isSensorDue,atomicWrite} from "../scripts/run_update_watch.mjs";

async function fixture(t) {
  let body="<h1>추진위원회</h1>";
  let status=200;
  let requests=0;
  let hang=false;
  const server=http.createServer((req,res)=>{requests++;if(hang)return;res.writeHead(status,{"content-type":"text/html"});res.end(body);});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"budong-update-test-"));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const url=`http://127.0.0.1:${server.address().port}/source`;
  const group={id:"district_1",source_id:"SEOUL_CLEANUP",status:"ACTIVE_SNAPSHOT_WATCH",sensor_type:"HTTP_SNAPSHOT",cadence:"DAILY",url};
  const config={schema_version:"1.0",groups:[group]};
  return {directory,url,group,config,get requests(){return requests;},setBody:value=>body=value,setStatus:value=>status=value,setHang:value=>hang=value};
}

const when=day=>`2026-10-${String(day).padStart(2,"0")}T00:00:00.000Z`;

test("daily/weekly due dates use successful sensor observations and exact intervals",()=>{
  const prev={observed_at:when(1)};
  assert.equal(isSensorDue(prev,"DAILY","2026-10-01T23:59:59Z"),false);
  assert.equal(isSensorDue(prev,"DAILY",when(2)),true);
  assert.equal(isSensorDue(prev,"WEEKLY",when(7)),false);
  assert.equal(isSensorDue(prev,"WEEKLY",when(8)),true);
  assert.throws(()=>isSensorDue(prev,"MONTHLY",when(8)),/cadence/);
});

test("HTTP baseline, no-fetch not-due, unchanged and changed observations retain cumulative candidates",async t=>{
  const f=await fixture(t);
  const configPath=path.join(f.directory,"config.json");
  const options={configPath,statePath:path.join(f.directory,"nested/state-data.json"),candidatePath:path.join(f.directory,"elsewhere/history-data.json"),reportPath:path.join(f.directory,"reports/report-data.json"),snapshotDir:path.join(f.directory,"html")};
  await fs.writeFile(configPath,JSON.stringify(f.config));
  const first=await runUpdateWatchFromFiles({...options,observedAt:when(1)});
  assert.equal(first.report[0].event,"BASELINE_CREATED");
  assert.equal(first.candidate_count,0);
  assert.equal(await fs.readFile(first.state.sensors.district_1.raw_snapshot_path,"utf8"),"<h1>추진위원회</h1>");
  const skipped=await runUpdateWatchFromFiles({...options,observedAt:"2026-10-01T12:00:00Z"});
  assert.equal(skipped.report[0].reason,"NOT_DUE");
  assert.equal(f.requests,1);
  const unchanged=await runUpdateWatchFromFiles({...options,observedAt:when(2)});
  assert.equal(unchanged.report[0].event,"UNCHANGED");
  f.setBody("<h1>조합설립인가</h1>");
  const changed=await runUpdateWatchFromFiles({...options,observedAt:when(3)});
  assert.equal(changed.report[0].event,"CHANGED");
  assert.equal(changed.history.count,1);
  assert.equal(changed.history.candidates[0].auto_promote_to_official,false);
  assert.equal(changed.history.candidates[0].status,"NEEDS_PARSER");
  const next=await runUpdateWatchFromFiles({...options,observedAt:when(4)});
  assert.equal(next.candidate_count,0);
  assert.equal(next.history.count,1);
  assert.deepEqual(next.history.candidates,changed.history.candidates);
  const report=JSON.parse(await fs.readFile(options.reportPath,"utf8"));
  assert.equal(report.total_candidate_count,1);
  assert.equal(report.candidate_count,0);
  assert.equal(report.ok,true);
});

test("required HTTP error preserves prior successful baseline and history, then immediately retries",async t=>{
  const f=await fixture(t);
  const first=await runUpdateWatch({config:f.config,observedAt:when(1)});
  f.setStatus(503);
  const failed=await runUpdateWatch({config:f.config,state:first.state,history:first.history,observedAt:when(2)});
  assert.equal(failed.ok,false);
  assert.equal(failed.required_error_count,1);
  assert.match(failed.report[0].error,/HTTP 503/);
  assert.deepEqual(failed.state.sensors,first.state.sensors);
  assert.equal(failed.history.count,0);
  f.setStatus(200);f.setBody("<h1>관리처분계획인가</h1>");
  const retry=await runUpdateWatch({config:f.config,state:failed.state,history:failed.history,observedAt:when(2)});
  assert.equal(retry.ok,true);
  assert.equal(retry.report[0].event,"CHANGED");
});

test("weekly group is not fetched until seventh day; paused registry reports an explicit skip",async t=>{
  const f=await fixture(t); f.group.cadence="WEEKLY";
  f.config.groups.push({id:"notice_registry",status:"PARSER_REGISTRY_IN_PROGRESS"});
  const baseline=await runUpdateWatch({config:f.config,observedAt:when(1)});
  const earlier=await runUpdateWatch({config:f.config,state:baseline.state,observedAt:when(2)});
  assert.equal(earlier.report[0].reason,"NOT_DUE");
  assert.equal(earlier.report[1].reason,"PARSER_REGISTRY_IN_PROGRESS");
  const weekly=await runUpdateWatch({config:f.config,state:earlier.state,observedAt:when(8)});
  assert.equal(weekly.report[0].event,"UNCHANGED");
  assert.equal(f.requests,2);
});

test("optional sensor errors are visible but required request timeouts fail the run",async t=>{
  const f=await fixture(t);f.setStatus(403);f.group.required=false;
  const optional=await runUpdateWatch({config:f.config,observedAt:when(1)});
  assert.equal(optional.ok,true);
  assert.equal(optional.report[0].status,"ERROR");
  assert.equal(optional.report[0].required,false);
  f.setHang(true);f.group.required=true;
  const timeout=await runUpdateWatch({config:f.config,observedAt:when(1),timeoutMs:40});
  assert.equal(timeout.ok,false);
  assert.match(timeout.report[0].error,/timed out/);
  assert.deepEqual(timeout.state.sensors,{});
});

test("state corruption, history corruption and invalid configuration stop before fetching or overwriting",async t=>{
  const f=await fixture(t);
  const configPath=path.join(f.directory,"config.json");
  const statePath=path.join(f.directory,"state.json");
  const candidatePath=path.join(f.directory,"candidates.json");
  const options={configPath,statePath,candidatePath,observedAt:when(1)};
  await fs.writeFile(configPath,JSON.stringify(f.config));
  await fs.writeFile(statePath,"{corrupt");
  await assert.rejects(runUpdateWatchFromFiles(options),/Cannot read/);
  assert.equal(await fs.readFile(statePath,"utf8"),"{corrupt");
  await fs.writeFile(statePath,JSON.stringify({schema_version:"0",sensors:{},updated_at:null}));
  await assert.rejects(runUpdateWatchFromFiles(options),/state schema/);
  await fs.rm(statePath);
  await fs.writeFile(candidatePath,JSON.stringify({schema_version:"1.0",count:1,candidates:[]}));
  await assert.rejects(runUpdateWatchFromFiles(options),/candidate history/);
  await fs.rm(candidatePath);
  f.group.url="file:///etc/passwd";
  await fs.writeFile(configPath,JSON.stringify(f.config));
  await assert.rejects(runUpdateWatchFromFiles(options),/HTTP/);
  assert.equal(f.requests,0);
});

test("active unsupported sensors, duplicate ids and changed source lineage fail loudly",async t=>{
  const f=await fixture(t);
  await assert.rejects(runUpdateWatch({config:{...f.config,groups:[{...f.group,sensor_type:"API"}]}}),/Unsupported active sensor/);
  await assert.rejects(runUpdateWatch({config:{...f.config,groups:[f.group,f.group]}}),/Duplicate/);
  const baseline=await runUpdateWatch({config:f.config,observedAt:when(1)});
  await assert.rejects(runUpdateWatch({config:{...f.config,groups:[{...f.group,url:f.url+"?changed=1"}]},state:baseline.state,observedAt:when(2)}),/source changed/);
  assert.equal(f.requests,1);
});

test("empty HTTP response does not advance a successful baseline",async t=>{
  const f=await fixture(t);
  const first=await runUpdateWatch({config:f.config,observedAt:when(1)});
  f.setBody("  ");
  const failed=await runUpdateWatch({config:f.config,state:first.state,observedAt:when(2)});
  assert.equal(failed.ok,false);
  assert.match(failed.report[0].error,/Empty source/);
  assert.deepEqual(failed.state.sensors,first.state.sensors);
});

test("snapshot persistence failure preserves baseline and creates no unsupported candidate",async t=>{
  const f=await fixture(t);
  const first=await runUpdateWatch({config:f.config,observedAt:when(1)});
  f.setBody("new official-looking content");
  const failed=await runUpdateWatch({config:f.config,state:first.state,observedAt:when(2),onSnapshot:async()=>{throw new Error("disk failure");}});
  assert.equal(failed.ok,false);
  assert.deepEqual(failed.state.sensors,first.state.sensors);
  assert.equal(failed.history.count,0);
});

test("atomic writer supports arbitrary output filenames without leftover temporary files",async t=>{
  const f=await fixture(t);
  const file=path.join(f.directory,"alternate-name.data");
  await atomicWrite(file,"old");await atomicWrite(file,"new");
  assert.equal(await fs.readFile(file,"utf8"),"new");
  assert.deepEqual((await fs.readdir(f.directory)).filter(name=>name.includes(".tmp")),[]);
});

test("CLI returns nonzero on required HTTP failure and still saves the failure report",async t=>{
  const f=await fixture(t);f.setStatus(502);
  const configPath=path.join(f.directory,"config.json");
  const statePath=path.join(f.directory,"state.json");
  const historyPath=path.join(f.directory,"candidates.json");
  await fs.writeFile(configPath,JSON.stringify(f.config));
  const script=fileURLToPath(new URL("../scripts/run_update_watch.mjs",import.meta.url));
  const child=spawn(process.execPath,[script,"--config",configPath,"--state",statePath,"--candidates",historyPath],{stdio:["ignore","pipe","pipe"]});
  let output="";child.stdout.on("data",value=>output+=value);child.stderr.on("data",value=>output+=value);
  const exitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",resolve);});
  assert.equal(exitCode,1,output);
  assert.equal(JSON.parse(output).required_error_count,1);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.directory,"last-run.json"),"utf8")).ok,false);
  assert.deepEqual(JSON.parse(await fs.readFile(statePath,"utf8")).sensors,{});
});
