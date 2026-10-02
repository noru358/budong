import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {parseCleanupPage,collectCleanupProjects,cleanupPageUrl,CLEANUP_PARSER_ID} from "../src/updater/seoul_cleanup.mjs";
import {runUpdateWatch,validateState} from "../scripts/run_update_watch.mjs";
import {reconcileProjectSnapshot,CHANGE_KIND} from "../src/updater/core.mjs";

const html=await fs.readFile(new URL("./update_cleanup_fixture.html",import.meta.url),"utf8");
const sensor={id:"district_11590",source_id:"SEOUL_CLEANUP",district_code:"11590",district_name:"동작구",url:"https://cleanup.seoul.go.kr/cleanup/bsnssttus/lscrMainIndx.do?scupBsnsSttus.signguCode=11590"};
const rows=[.../<tbody>([\s\S]*?)<\/tbody>/.exec(html)[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match=>match[0]);
const baseline=()=>parseCleanupPage(html,{sensor,url:cleanupPageUrl(sensor)});
function page({selected=1,entries,total=2,links=[]}={}) {
  return html.replace(/<tbody>[\s\S]*?<\/tbody>/,`<tbody>${entries.join("")}</tbody>`)
    .replace(/<p\b[^>]*class="[^"]*board-list-top-total[^"]*"[^>]*>[\s\S]*?<\/p>/,`<p class="board-list-top-total">추진위원회 : <span>${total}</span></p>`)
    .replace(/<div class="board-paging">[\s\S]*?<\/div>/,`<div class="board-paging"><a title="현재 선택된 페이지" href="#n">${selected}</a>${links.map(number=>`<a href="/cleanup/bsnssttus/lscrMainIndx.do?scupBsnsSttus.signguCode=11590&amp;cpage=${number}&amp;pageSize=100">${number}</a>`).join("")}</div>`);
}
const renumber=(row,value)=>row.replace(/<td>\d+<\/td>/,`<td>${value}</td>`);
const group={id:sensor.id,source_id:sensor.source_id,status:"ACTIVE_SNAPSHOT_WATCH",sensor_type:"TEMPLATED_HTTP_SNAPSHOT",url_template:sensor.url.replace("11590","{code}"),districts:[["11590","동작구"]],cadence:"DAILY",parser:CLEANUP_PARSER_ID,page_size:100};
const config={schema_version:"1.0",groups:[group]};

test("captured real Dongjak source contains all 61 projects and preserves raw stage/provenance",()=>{
  const result=baseline();
  assert.equal(result.total,61);assert.equal(result.entries.length,61);assert.deepEqual(result.pages,[]);
  const first=result.entries[0].project;
  assert.equal(first.canonical_name,"노량진역 은하맨션 일대 가로주택정비사업 조합");
  assert.equal(first.current_stage_official_raw,"조합설립인가");
  assert.equal(first.representative_lot,"노량진동 84-24");
  assert.equal(first.cafe_id,"galaxy84");assert.equal(first.certainty,"SOURCE_CONFIRMED");assert.equal(first.legal_effect_status,"NEEDS_REVIEW");
  const regional=result.entries.find(entry=>entry.project.canonical_name==="한강 지역주택조합").project;
  assert.equal(regional.current_stage_official_raw,null,"empty source stages must not be guessed");
});

test("blocked HTML, wrong district and schema changes cannot become project baselines",()=>{
  for(const changed of ["<h1>접근이 제한되었습니다.</h1>",html.replace('value="11590"','value="11680"'),html.replace('<td>동작구</td>','<td>강남구</td>'),html.replace('>사업장명</th>','>변경열</th>'),html.replace('title="현재 선택된 페이지"','title="other"')]) {
    assert.throws(()=>parseCleanupPage(changed,{sensor,url:cleanupPageUrl(sensor)}));
  }
  assert.throws(()=>cleanupPageUrl({...sensor,url:sensor.url.replace('cleanup.seoul.go.kr','evil.example')}),/Unsupported/);
  assert.throws(()=>parseCleanupPage(html,{sensor,url:cleanupPageUrl(sensor,{page:2})}),/requested page/);
});

test("collector follows all real pagination links and validates total, stable identities and page selection",async()=>{
  const first=page({entries:[renumber(rows[0],2)],links:[2]});
  const second=page({selected:2,entries:[renumber(rows[1],1)],links:[1]});
  const requested=[];
  const collected=await collectCleanupProjects({sensor,initialHtml:first,fetchText:async url=>{requested.push(url);return second;}});
  assert.equal(collected.total,2);assert.equal(collected.page_count,2);assert.equal(requested.length,1);
  assert.equal(new URL(requested[0]).searchParams.get("scupBsnsSttus.signguCode"),"11590");
  assert.equal(new URL(requested[0]).searchParams.get("cpage"),"2");
  assert.equal(collected.projects.length,2);
  await assert.rejects(collectCleanupProjects({sensor,initialHtml:first,fetchText:async()=>first}),/requested page/);
  await assert.rejects(collectCleanupProjects({sensor,initialHtml:first,fetchText:async()=>second.replace('<span>2</span>','<span>3</span>')}),/total changed/);
  await assert.rejects(collectCleanupProjects({sensor,initialHtml:page({entries:[renumber(rows[0],2)],links:[]}),fetchText:async()=>second}),/incomplete/);
  await assert.rejects(collectCleanupProjects({sensor,initialHtml:first,fetchText:async()=>page({selected:2,entries:[renumber(rows[0],1)],links:[1]})}),/duplicated/);
});

test("collector refuses unfiltered/offsite pagination before network requests",async()=>{
  const first=page({entries:[renumber(rows[0],2)],links:[2]});
  for(const changed of [first.replace('signguCode=11590&amp;cpage=2','signguCode=11680&amp;cpage=2'),first.replace('href="/cleanup/bsnssttus/lscrMainIndx.do?','href="https://evil.example/cleanup/bsnssttus/lscrMainIndx.do?')]) {
    await assert.rejects(collectCleanupProjects({sensor,initialHtml:changed,fetchText:async()=>{assert.fail("unsafe links must not be fetched");}}),/pagination URL/);
  }
});

test("source display-number defects do not discard a complete list with distinct project identities",async()=>{
  const first=page({entries:[renumber(rows[0],2)],links:[2]});
  const second=page({selected:2,entries:[renumber(rows[1],2)],links:[1]});
  const collected=await collectCleanupProjects({sensor,initialHtml:first,fetchText:async()=>second});
  assert.equal(collected.projects.length,2);
  assert.deepEqual(collected.warnings,["SOURCE_DISPLAY_ROW_NUMBERS_REPEAT"]);
});

test("project snapshot migration creates baseline only, then new/missing/stage/name changes remain candidates",()=>{
  const projects=baseline().entries.map(entry=>entry.project);
  const previous={sensor_id:sensor.id,source_id:sensor.source_id,locator:sensor.url,observed_at:"2026-10-01T00:00:00Z",sha256:"0".repeat(64),normalized_length:5};
  const first=reconcileProjectSnapshot({sensor,previousState:previous,projects,observedAt:"2026-10-02T00:00:00Z",parserId:CLEANUP_PARSER_ID});
  assert.equal(first.event,"PROJECT_BASELINE_CREATED");assert.equal(first.candidates.length,0);
  const changed=structuredClone(projects);changed[0].canonical_name="변경된 사업장명";changed[0].current_stage_official_raw="사업시행인가";changed.pop();changed.push({...projects.at(-1),project_source_key:"11590:cafe:new",canonical_name:"신규 구역"});
  const result=reconcileProjectSnapshot({sensor,previousState:first.nextState,projects:changed,observedAt:"2026-10-03T00:00:00Z",parserId:CLEANUP_PARSER_ID});
  assert.deepEqual(new Set(result.candidates.map(candidate=>candidate.kind)),new Set([CHANGE_KIND.PROJECT_NAME_CHANGED,CHANGE_KIND.STAGE_CHANGED,CHANGE_KIND.PROJECT_MISSING,CHANGE_KIND.NEW_PROJECT]));
  for(const candidate of result.candidates){assert.equal(candidate.status,"NEEDS_OFFICIAL_VERIFICATION");assert.equal(candidate.auto_promote_to_official,false);assert.equal(candidate.payload.legal_effect_status,"NEEDS_REVIEW");}
});

test("runner persists parsed full-source baseline, ignores unrelated markup, generates only semantic changes",async()=>{
  const calls=[];const saved=[];
  let body=html;
  const options={config,fetchImpl:async url=>{calls.push(url);return new Response(body);},onSnapshot:async(sensor,text)=>{saved.push({sensor,text});return `/tmp/${sensor.id}.html`;}};
  const first=await runUpdateWatch({...options,observedAt:"2026-10-02T00:00:00Z"});
  assert.equal(first.ok,true);assert.equal(first.report[0].project_count,61);assert.equal(first.report[0].page_count,1);assert.equal(first.candidate_count,0);
  const id=`${sensor.id}_11590`;
  assert.equal(first.state.sensors[id].project_snapshot.length,61);
  assert.equal(new URL(calls[0]).searchParams.get("pageSize"),"100");
  assert.match(saved[0].sensor.id,/_page_1$/);
  body='<h1>내비게이션 변경</h1>'+html;
  const unchanged=await runUpdateWatch({...options,state:first.state,observedAt:"2026-10-03T00:00:00Z"});
  assert.equal(unchanged.report[0].event,"UNCHANGED");assert.equal(unchanged.candidate_count,0);
  body=html.replace('<td>조합설립인가</td>','<td>사업시행인가</td>');
  const changed=await runUpdateWatch({...options,state:unchanged.state,observedAt:"2026-10-04T00:00:00Z"});
  assert.equal(changed.candidate_count,1);assert.equal(changed.candidates[0].kind,"STAGE_CHANGED");assert.equal(changed.candidates[0].auto_promote_to_official,false);
  body="<h1>200 OK access denied</h1>";
  const blocked=await runUpdateWatch({...options,state:changed.state,history:changed.history,observedAt:"2026-10-05T00:00:00Z"});
  assert.equal(blocked.ok,false);assert.equal(blocked.history.count,1);assert.deepEqual(blocked.state.sensors,changed.state.sensors);
});

test("saved project state corruption is reported rather than losing earlier project history",()=>{
  const projects=baseline().entries.map(entry=>entry.project);
  const rec=reconcileProjectSnapshot({sensor,projects,observedAt:"2026-10-02T00:00:00Z",parserId:CLEANUP_PARSER_ID});
  const state={schema_version:"1.0",updated_at:null,sensors:{[sensor.id]:rec.nextState}};
  assert.doesNotThrow(()=>validateState(state));
  state.sensors[sensor.id].project_snapshot[0].certainty="OFFICIAL_CONFIRMED";
  assert.throws(()=>validateState(state),/snapshot lineage/);
});
