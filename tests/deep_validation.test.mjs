import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const deep=JSON.parse(fs.readFileSync(new URL("../data/deep_validation_v1.json",import.meta.url),"utf8"));

test("deep validation has exactly 10 selected projects",()=>{
  assert.equal(deep.targets.length,10);
  assert.equal(new Set(deep.targets.map(x=>x.project_id)).size,10);
});

test("official-confirmed events only use first-party administrative sources",()=>{
  const allowed=new Set(["LAND_USE_EUM_GOV_NOTICE","SONGPA_NOTICE_BOARD"]);
  const official=deep.targets.flatMap(x=>x.legal_events||[]).filter(e=>e.certainty==="OFFICIAL_CONFIRMED");
  assert.ok(official.length>=4);
  for(const e of official){
    assert.ok(allowed.has(e.source_id),e.source_id);
    assert.ok(e.event_date);
    assert.ok(e.source_locator.startsWith("https://"));
  }
});

test("portal snapshots are observations, not invented legal effective dates",()=>{
  for(const t of deep.targets){
    assert.equal(t.display_snapshot.source_id,"SEOUL_CLEANUP");
    assert.ok(t.display_snapshot.observed_at);
  }
});

test("a correction notice is not treated as a new stage advance",()=>{
  const jamsil=deep.targets.find(x=>x.short_name==="잠실5단지");
  const correction=jamsil.legal_events.find(x=>x.event_type_code==="NOTICE_CORRECTION");
  assert.equal(correction.notice_number,"서울특별시 송파구 고시 제2026-99호");
  assert.notEqual(correction.event_type_code,"IMPLEMENTATION_PLAN_APPROVAL");
});

test("trust/governance observation stays separate from legal stage",()=>{
  const sangdo=deep.targets.find(x=>x.short_name==="상도15구역");
  assert.equal(sangdo.display_snapshot.stage_raw,"조합설립인가");
  assert.equal(sangdo.governance_events[0].actor_name,"대신자산신탁 주식회사");
  assert.equal(sangdo.governance_events[0].legal_effect_status,"NEEDS_REVIEW");
});

test("policy program status is not promoted into statutory legal event",()=>{
  const mangwon=deep.targets.find(x=>x.short_name.includes("망원동"));
  assert.equal(mangwon.validation_status,"POLICY_STAGE_ONLY");
  assert.equal((mangwon.legal_events||[]).length,0);
  assert.equal(mangwon.policy_events[0].event_type_code,"POLICY_PROGRAM_STATUS");
});

test("source-confirmed stage history can have date without being official-confirmed",()=>{
  const b=deep.targets.find(x=>x.short_name==="불광제5구역");
  assert.ok(b.legal_events.some(e=>e.event_date==="2024-11-28"&&e.certainty==="SOURCE_CONFIRMED"));
  assert.ok(!b.legal_events.some(e=>e.certainty==="OFFICIAL_CONFIRMED"));
});

test("official index without direct notice does not invent date",()=>{
  const d=deep.targets.find(x=>x.short_name==="독바위역세권");
  const e=d.legal_events.find(x=>x.notice_number==="서울특별시 은평구 고시 제2026-37호");
  assert.equal(e.event_date,null);
  assert.equal(e.certainty,"SOURCE_CONFIRMED");
});
