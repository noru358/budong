import test from "node:test";
import assert from "node:assert/strict";
import {fetchAllRtmsTrades,fetchAllBuildingTitles,RTMS_SERVICES,fetchRtmsTrades,normalizeRtmsTradeItem} from "../src/adapters/data_go_kr.mjs";
import {buildProjectReferenceQuery,queryLiveProjectData} from "../src/adapters/live_project_data.mjs";

const env={DATA_GO_KR_SERVICE_KEY:"TEST_PRIVATE_KEY"},observedAt="2026-10-02T09:00:00Z";
const rtms={env,lawdCd:"11590",dealYmd:"202609",observedAt,numOfRows:2};
const buildings={env,sigunguCd:"11590",bjdongCd:"10200",bun:"0418",ji:"0000",observedAt,numOfRows:2};
const xml=(page,total,ids,size=2)=>`<response><header><resultCode>000</resultCode></header><body><items>${ids.map(id=>`<item><sggCd>11590</sggCd><umdNm>상도동</umdNm><jibun>${id}</jibun><dealAmount>10,000</dealAmount></item>`).join("")}</items><totalCount>${total}</totalCount><pageNo>${page}</pageNo><numOfRows>${size}</numOfRows></body></response>`;
const json=(page,total,ids,size=2)=>JSON.stringify({response:{header:{resultCode:"00"},body:{items:ids.length?{item:ids.map(id=>({mgmBldrgstPk:id}))}:"",totalCount:total,pageNo:page,numOfRows:size}}});
const response=body=>new Response(body);
const sequence=pages=>{let index=0;return async()=>response(pages[index++]);};

test("all pages terminate on provider totalCount and preserve safe page provenance",async()=>{
  const urls=[];
  const result=await fetchAllRtmsTrades({...rtms,fetchImpl:async u=>{
    urls.push(u);return response(urls.length===1?xml(1,3,["279","280"]):xml(2,3,["281"]));
  }});
  assert.equal(result.rows.length,3);assert.equal(result.total_count,3);assert.equal(result.page_count,2);
  assert.equal(result.coverage,"COMPLETE");assert.equal(result.scope,"DISTRICT_MONTH_REFERENCE");
  assert.equal(result.project_linkage_validated,false);
  assert.deepEqual(result.pages.map(p=>p.row_count),[2,1]);
  assert.equal(urls[1].searchParams.get("pageNo"),"2");
  assert.ok(!JSON.stringify(result).includes(env.DATA_GO_KR_SERVICE_KEY));
});

test("building all-page and valid empty-query results do not claim project membership",async()=>{
  const result=await fetchAllBuildingTitles({...buildings,fetchImpl:sequence([json(1,3,["A","B"]),json(2,3,["C"])])});
  assert.equal(result.rows.length,3);assert.equal(result.scope,"PARCEL_REFERENCE");
  for(const [fetcher,args,body] of [[fetchAllBuildingTitles,buildings,json(1,0,[])],[fetchAllRtmsTrades,rtms,xml(1,0,[])]]){
    const empty=await fetcher({...args,fetchImpl:async()=>response(body)});
    assert.equal(empty.total_count,0);assert.equal(empty.page_count,1);assert.equal(empty.coverage,"COMPLETE");
  }
});

test("pagination cap returns partial with actual provider total instead of hiding remaining rows",async()=>{
  const result=await fetchAllRtmsTrades({...rtms,maxPages:1,fetchImpl:sequence([xml(1,5,["1","2"])])});
  assert.equal(result.rows.length,2);assert.equal(result.total_count,5);
  assert.equal(result.coverage,"PARTIAL_CAP");assert.equal(result.stop_reason,"MAX_PAGES");
});

test("missing, malformed, drifting and repeated provider pagination fail closed",async()=>{
  for(const pages of [
    [xml(1,3,["1","2"]).replace(/<totalCount>.*?<\/totalCount>/,"")],
    [xml(1,3,["1","2"]).replace("<totalCount>3","<totalCount>NaN")],
    [xml(2,3,["1","2"])],[xml(1,3,["1","2"],100)],
    [xml(1,3,["1"])],[xml(1,3,["1","2"]),xml(2,4,["3","4"])],
    [xml(1,4,["1","2"]),xml(2,4,["1","2"])],
    [xml(1,3,["1","2"]),xml(2,3,[])]
  ])await assert.rejects(fetchAllRtmsTrades({...rtms,fetchImpl:sequence(pages)}),/pagination|metadata|incomplete|reports data|totalCount|repeated/);
  await assert.rejects(fetchAllBuildingTitles({...buildings,fetchImpl:sequence([json(1,3,["A","B"]).replace('"pageNo":1','"pageNo":2')])}),/metadata/);
});

test("all-pages request enforces bounded collection and sanitizes later-page failures",async()=>{
  await assert.rejects(fetchAllRtmsTrades({...rtms,maxPages:101,fetchImpl:()=>assert.fail("must not fetch")}),/cap/);
  await assert.rejects(fetchAllRtmsTrades({...rtms,pageNo:2,fetchImpl:()=>assert.fail("must not fetch")}),/start/);
  let calls=0;
  await assert.rejects(fetchAllRtmsTrades({...rtms,fetchImpl:async u=>{
    if(++calls===1)return response(xml(1,3,["1","2"]));
    throw new Error("failed "+u+" "+env.DATA_GO_KR_SERVICE_KEY);
  }}),error=>!error.message.includes(env.DATA_GO_KR_SERVICE_KEY)&&!error.message.includes("https://"));
  await assert.rejects(fetchAllRtmsTrades({...rtms,maxDurationMs:10,fetchImpl:()=>new Promise(()=>{})}),/timeout/);
});

const project={id:"project-test",borough_code:"11170",representative_lot:"동빙고동 60"};
test("project reference uses selected district and only prefills parcel without guessing legal dong code",()=>{
  assert.deepEqual(buildProjectReferenceQuery({project,kind:"rtms",query:{dealYmd:"202609"}}),{lawdCd:"11170",dealYmd:"202609"});
  assert.throws(()=>buildProjectReferenceQuery({project,kind:"buildings",query:{}}),/bjdongCd/);
  const query=buildProjectReferenceQuery({project,kind:"buildings",query:{bjdongCd:"13300"}});
  assert.equal(query.bun,"0060");assert.equal(query.ji,"0000");assert.equal(query.sigunguCd,"11170");
  assert.equal(buildProjectReferenceQuery({project:{...project,representative_lot:"불광동 산 12-4"},kind:"buildings",query:{bjdongCd:"10300"}}).platGbCd,"1");
  assert.throws(()=>buildProjectReferenceQuery({project,kind:"rtms",query:{dealYmd:"202613"}}),/valid/);
  assert.throws(()=>buildProjectReferenceQuery({project,kind:"rtms",query:{dealYmd:"202609",lawdCd:"11590"}}),/allowed/);
});

test("project service exposes reference label, query coverage and context only",async()=>{
  const result=await queryLiveProjectData({project,kind:"rtms",query:{dealYmd:"202609"},env,observedAt,
    fetchImpl:async()=>response(xml(1,0,[],100))});
  assert.equal(result.project_context_id,project.id);assert.equal(result.request.lawd_cd,"11170");
  assert.equal(result.status,"EMPTY_RESULT");assert.equal(result.project_linkage_validated,false);
  assert.equal(result.legal_rights_verified,false);assert.match(result.reference_label,/참고/);
});

test("RH/APT/SH selectors use exact allowlisted official endpoints and matching source IDs",async()=>{
  for(const serviceType of ["RH","APT","SH"]){
    const urls=[];
    const result=await fetchAllRtmsTrades({...rtms,serviceType,fetchImpl:async u=>{
      urls.push(u);return response(xml(1,1,["279"]));
    }});
    assert.equal(urls[0].origin+urls[0].pathname,RTMS_SERVICES[serviceType].endpoint);
    assert.equal(result.rows[0].source_id,RTMS_SERVICES[serviceType].sourceId);
    assert.equal(result.request.service_type,serviceType);
    assert.equal(result.request.source_id,RTMS_SERVICES[serviceType].sourceId);
  }
  for(const args of [{serviceType:"UNKNOWN"},{serviceType:"APT",endpoint:RTMS_SERVICES.RH.endpoint},
    {serviceType:"APT",sourceId:RTMS_SERVICES.RH.sourceId},{endpoint:"https://apis.data.go.kr/unreviewed"}]){
    await assert.rejects(fetchAllRtmsTrades({...rtms,...args,fetchImpl:()=>assert.fail("must not fetch")}),/serviceType|endpoint/);
    await assert.rejects(fetchRtmsTrades({...rtms,...args,fetchImpl:()=>assert.fail("must not fetch")}),/serviceType|endpoint/);
  }
});

test("explicit apartment reference remains district scope and SH total area is not exclusive area",async()=>{
  const result=await queryLiveProjectData({project,kind:"rtms",query:{dealYmd:"202609",serviceType:"APT"},env,observedAt,
    fetchImpl:async()=>response(xml(1,0,[],100))});
  assert.match(result.reference_label,/아파트 매매 상세/);assert.equal(result.scope,"DISTRICT_MONTH_REFERENCE");
  const sh=normalizeRtmsTradeItem({totalFloorAr:"120",plottageAr:"100"},{sourceId:RTMS_SERVICES.SH.sourceId,observedAt});
  assert.equal(sh.total_floor_area_m2,120);assert.equal(sh.exclusive_area_m2,null);assert.equal(sh.land_area_m2,100);
});
