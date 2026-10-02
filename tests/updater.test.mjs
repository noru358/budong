import test from "node:test";
import assert from "node:assert/strict";
import {
  CHANGE_KIND,CANDIDATE_STATUS,normalizeSourceText,fingerprintSource,
  diffProjectSnapshots,makeChangeCandidate,mayPromoteCandidate,reconcilePageFingerprint
} from "../src/updater/core.mjs";

test("source normalization removes scripts/styles and formatting noise",()=>{
  const a=normalizeSourceText("<html><style>x{}</style><script>token=1</script><b> 상도15 </b>  조합설립인가</html>");
  assert.equal(a,"상도15 조합설립인가");
});

test("first observation creates baseline without factual candidate",()=>{
  const r=reconcilePageFingerprint({
    sensor:{id:"s1",source_id:"SEOUL_CLEANUP",url:"https://example.invalid"},
    previousState:null,currentText:"A",observedAt:"2026-09-29T00:00:00Z"
  });
  assert.equal(r.event,"BASELINE_CREATED");
  assert.equal(r.candidates.length,0);
});

test("unchanged snapshot creates no candidate",()=>{
  const sensor={id:"s1",source_id:"SEOUL_CLEANUP",url:"https://example.invalid"};
  const first=reconcilePageFingerprint({sensor,previousState:null,currentText:"A",observedAt:"2026-09-28T00:00:00Z"});
  const next=reconcilePageFingerprint({sensor,previousState:first.nextState,currentText:" A ",observedAt:"2026-09-29T00:00:00Z"});
  assert.equal(next.event,"UNCHANGED");
  assert.equal(next.candidates.length,0);
});

test("changed HTML creates parser candidate, never official fact",()=>{
  const sensor={id:"s1",source_id:"SEOUL_CLEANUP",url:"https://example.invalid"};
  const prev={...fingerprintSource("추진위원회"),sensor_id:"s1"};
  const r=reconcilePageFingerprint({sensor,previousState:prev,currentText:"조합설립인가",observedAt:"2026-09-29T00:00:00Z"});
  assert.equal(r.event,"CHANGED");
  assert.equal(r.candidates[0].status,CANDIDATE_STATUS.NEEDS_PARSER);
  assert.equal(r.candidates[0].auto_promote_to_official,false);
});

test("structured project diff finds new project and stage change",()=>{
  const old=[{canonical_name:"A구역",current_stage_official_raw:"추진위원회승인",project_type_official_raw:"재개발",representative_lot:"1"}];
  const cur=[
    {canonical_name:"A구역",current_stage_official_raw:"조합설립인가",project_type_official_raw:"재개발",representative_lot:"1"},
    {canonical_name:"B구역",current_stage_official_raw:"정비계획 수립",project_type_official_raw:"재개발",representative_lot:"2"}
  ];
  const d=diffProjectSnapshots(old,cur);
  assert.ok(d.some(x=>x.kind===CHANGE_KIND.STAGE_CHANGED&&x.project_name==="A구역"));
  assert.ok(d.some(x=>x.kind===CHANGE_KIND.NEW_PROJECT&&x.project_name==="B구역"));
});

test("missing project is a candidate, not automatic deletion",()=>{
  const d=diffProjectSnapshots([{canonical_name:"A"}],[]);
  assert.equal(d[0].kind,CHANGE_KIND.PROJECT_MISSING);
});

test("ambiguous structured snapshots fail instead of silently merging or deleting projects",()=>{
  assert.throws(()=>diffProjectSnapshots([],[{canonical_name:"A 구역"},{canonical_name:"A구역"}]),/duplicate canonical name/);
  assert.throws(()=>diffProjectSnapshots([{}],[]),/unnamed project/);
});

test("candidate cannot become official without complete first-party evidence",()=>{
  const c=makeChangeCandidate({
    sensorId:"s",sourceId:"SEOUL_CLEANUP",kind:CHANGE_KIND.STAGE_CHANGED,
    observedAt:"2026-09-29",locator:"https://example.invalid",payload:{project:"A"}
  });
  assert.equal(mayPromoteCandidate(c,{certainty:"SOURCE_CONFIRMED"}).ok,false);
  assert.equal(mayPromoteCandidate(c,{
    certainty:"OFFICIAL_CONFIRMED",source_id:"SEOUL_OFFICIAL_NOTICE",
    source_locator:"https://www.seoul.go.kr/notice/1",event_name_official:"조합설립인가",event_date:"2026-09-29",
    notice_number:"서울특별시 고시 제2026-1호",issuer:"서울특별시"
  }).ok,true);
});

test("candidate ids are deterministic for identical observations",()=>{
  const args={sensorId:"s",sourceId:"x",kind:CHANGE_KIND.NEW_PROJECT,observedAt:"2026-09-29",locator:"u",payload:{a:1}};
  assert.equal(makeChangeCandidate(args).candidate_id,makeChangeCandidate(args).candidate_id);
});

test("official promotion blocks unapproved sources, forged locators, missing metadata and invalid dates",()=>{
  const c=makeChangeCandidate({sensorId:"s",sourceId:"SEOUL_CLEANUP",kind:CHANGE_KIND.STAGE_CHANGED,observedAt:"2026-10-01",locator:"https://cleanup.seoul.go.kr",payload:{project:"A"}});
  const valid={certainty:"OFFICIAL_CONFIRMED",source_id:"LAND_USE_EUM_GOV_NOTICE",source_locator:"https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=610123",event_name_official:"정비구역 지정",event_date:"2026-09-29",notice_number:"서울특별시 고시 제2026-1호",issuer:"서울특별시"};
  assert.equal(mayPromoteCandidate(c,valid).ok,true);
  for(const override of [
    {source_id:"SEOUL_CLEANUP"},
    {source_locator:"https://www.eum.go.kr.evil.example/notice"},
    {source_locator:"https://user:password@www.eum.go.kr/notice"},
    {source_locator:"http://www.eum.go.kr/notice"},
    {notice_number:" "},{issuer:""},{event_date:"2026-02-30"},{event_date:"not-a-date"}
  ]) assert.equal(mayPromoteCandidate(c,{...valid,...override}).ok,false,JSON.stringify(override));
  assert.equal(mayPromoteCandidate({...c,status:CANDIDATE_STATUS.REJECTED},valid).ok,false);
  assert.equal(mayPromoteCandidate(c,{...valid,source_id:"SEOUL_OFFICIAL_NOTICE",source_locator:"https://www.dongjak.go.kr/notice"}).ok,true);
});
