import test from "node:test";
import assert from "node:assert/strict";
import {
  ENDPOINTS,buildRtmsUrl,buildBuildingHubUrl,parseFlatXmlItems,
  normalizeRtmsTradeItem,extractBuildingHubItems,normalizeBuildingTitleItem,
  fetchRtmsTrades,fetchBuildingTitles,normalizeServiceKey,sanitizeApiError
} from "../src/adapters/data_go_kr.mjs";

const env={DATA_GO_KR_SERVICE_KEY:"TEST_ONLY_KEY"};

test("RTMS request validates 5-digit district and 6-digit deal month",()=>{
  const u=buildRtmsUrl({env,lawdCd:"11590",dealYmd:"202609"});
  assert.equal(u.origin+u.pathname,ENDPOINTS.RTMS_MULTIFAMILY_SALE);
  assert.equal(u.searchParams.get("LAWD_CD"),"11590");
  assert.equal(u.searchParams.get("DEAL_YMD"),"202609");
  assert.throws(()=>buildRtmsUrl({env,lawdCd:"1159",dealYmd:"202609"}),/5 digits/);
});

test("Building HUB request uses parcel codes and json",()=>{
  const u=buildBuildingHubUrl({env,sigunguCd:"11590",bjdongCd:"10300",bun:"0279",ji:"0000"});
  assert.equal(u.searchParams.get("sigunguCd"),"11590");
  assert.equal(u.searchParams.get("bjdongCd"),"10300");
  assert.equal(u.searchParams.get("_type"),"json");
});

test("flat RTMS XML parser rejects provider error",()=>{
  assert.throws(()=>parseFlatXmlItems("<response><header><resultCode>30</resultCode><resultMsg>BAD KEY</resultMsg></header></response>"),/BAD KEY/);
});

test("flat RTMS XML parser and normalizer preserve economic units",()=>{
  const xml="<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items><item><sggCd>11590</sggCd><umdNm>상도동</umdNm><jibun>279</jibun><mhouseNm>예시빌라</mhouseNm><dealYear>2026</dealYear><dealMonth>9</dealMonth><dealDay>5</dealDay><dealAmount>85,000</dealAmount><excluUseAr>59.8</excluUseAr><floor>3</floor></item></items></body></response>";
  const rows=parseFlatXmlItems(xml);
  assert.equal(rows.length,1);
  const n=normalizeRtmsTradeItem(rows[0],{observedAt:"2026-09-28T00:00:00Z"});
  assert.equal(n.deal_amount_10k_krw,85000);
  assert.equal(n.deal_date,"2026-09-05");
  assert.equal(n.exclusive_area_m2,59.8);
  assert.ok(!JSON.stringify(n).includes("TEST_ONLY_KEY"));
});

test("portal XML sample accepts self-closing script, whitespace and basement floors",()=>{
  // Public row shape only; no service key or credential-bearing locator.
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
    <response><script/><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
    <body><items><item>
      <buildYear>2006</buildYear><buyerGbn>공공기관</buyerGbn><cdealDay>   </cdealDay>
      <dealAmount>36,400</dealAmount><dealDay>8</dealDay><dealMonth>1</dealMonth><dealYear>2024</dealYear>
      <dealingGbn>직거래</dealingGbn><excluUseAr>67.86</excluUseAr><floor>2</floor>
      <houseType>다세대</houseType><jibun>7-24</jibun><landAr>25.18</landAr>
      <mhouseNm>(7-24)</mhouseNm><rgstDate>24.07.01</rgstDate><sggCd>11110</sggCd>
      <slerGbn>개인</slerGbn><umdNm>동숭동</umdNm>
    </item></items><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>20</totalCount></body></response>`;
  const rows=parseFlatXmlItems(xml);
  assert.equal(rows.length,1);
  const row=normalizeRtmsTradeItem(rows[0],{observedAt:"2026-10-02T00:00:00Z"});
  assert.equal(row.deal_date,"2024-01-08");
  assert.equal(row.deal_amount_10k_krw,36400);
  assert.equal(row.build_year,2006);
  assert.equal(row.land_area_m2,25.18);
  assert.equal(row.cancellation_date,null);
  assert.equal(row.transaction_type,"직거래");
  assert.equal(row.floor,2);
  assert.equal(row.raw_reference.rgstDate,"24.07.01");
  assert.equal(normalizeRtmsTradeItem({...rows[0],floor:" -1 "}).floor,-1);
});

test("Building HUB extracts one-or-many item shapes",()=>{
  assert.deepEqual(extractBuildingHubItems({response:{header:{resultCode:"00"},body:{items:{item:{bldNm:"A"}}}}}),[{bldNm:"A"}]);
  assert.equal(extractBuildingHubItems({response:{header:{resultCode:"00"},body:{items:{}}}}).length,0);
});

test("Building HUB title normalizer keeps PK and does not infer unit",()=>{
  const n=normalizeBuildingTitleItem({mgmBldrgstPk:"PK1",bldNm:"건물",platPlc:"서울 동작구 상도동 279",mainPurpsCdNm:"공동주택",totArea:"123.4"},{observedAt:"2026-09-28T00:00:00Z"});
  assert.equal(n.mgm_bldrgst_pk,"PK1");
  assert.equal(n.total_area_m2,123.4);
  assert.equal("ho_name" in n,false);
});

const rtmsArgs={env,lawdCd:"11590",dealYmd:"202610"};
const buildingArgs={env,sigunguCd:"11590",bjdongCd:"10200",bun:"0418",ji:"0000"};
const xmlEmpty='<response><header><resultCode>000</resultCode></header><body><items/><totalCount>0</totalCount></body></response>';
const authXml='<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';
const reply=text=>({ok:true,status:200,text:async()=>text});

test("both key forms have one transport encoding; plus stays literal and placeholders are not rejected",()=>{
  const key="not-a-real+key/with=padding";
  for(const supplied of [key,encodeURIComponent(key)]){
    const url=buildRtmsUrl({...rtmsArgs,env:{DATA_GO_KR_SERVICE_KEY:supplied}});
    assert.equal(url.searchParams.get("serviceKey"),key);
    assert.equal(url.search.match(/serviceKey=([^&]+)/)[1],encodeURIComponent(key));
  }
  assert.equal(normalizeServiceKey("TEST_ONLY_KEY"),"TEST_ONLY_KEY");
  assert.throws(()=>buildRtmsUrl({...rtmsArgs,dealYmd:"202613"}),/calendar month/);
});

test("RTMS rejects public gateway errors rather than claiming an empty success",async()=>{
  await assert.rejects(fetchRtmsTrades({...rtmsArgs,fetchImpl:async()=>reply(authXml)}),error=>{
    assert.equal(error.providerCode,"30");
    assert.equal(error.category,"AUTH_OR_ACCESS");
    return /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/.test(error.message);
  });
});

test("malformed XML, HTML and missing provider headers fail closed",()=>{
  for(const text of ["", "<html><body>maintenance</body></html>", "<response><body><items/></body></response>",
    xmlEmpty.replace("</response>",""),xmlEmpty.replace("</header>","</body>")]){
    assert.throws(()=>parseFlatXmlItems(text));
  }
  assert.deepEqual(parseFlatXmlItems(xmlEmpty),[]);
  assert.throws(()=>parseFlatXmlItems('<response><header><resultCode>000</resultCode></header><body/></response>'));
  assert.throws(()=>parseFlatXmlItems(xmlEmpty.replace('<items/>','<items><unexpected/></items>')),/Malformed/);
  assert.throws(()=>parseFlatXmlItems(xmlEmpty.replace('<totalCount>0','<totalCount>1')),/reports data/);
  assert.deepEqual(parseFlatXmlItems(xmlEmpty.replace('<totalCount>0','<totalCount>1'),{pageNo:2,numOfRows:10}),[]);
});

test("Building handles XML gateway errors despite requesting JSON and rejects malformed successes",async()=>{
  await assert.rejects(fetchBuildingTitles({...buildingArgs,fetchImpl:async()=>reply(authXml)}),error=>error.providerCode==="30");
  for(const text of ["{}","[]","<html>maintenance</html>",JSON.stringify({response:{header:{resultCode:"00"}}})]){
    await assert.rejects(fetchBuildingTitles({...buildingArgs,fetchImpl:async()=>reply(text)}));
  }
  const json={response:{header:{resultCode:"00"},body:{items:{item:{mgmBldrgstPk:"PK1",platPlc:"상도동 418"}}}}};
  const rows=await fetchBuildingTitles({...buildingArgs,fetchImpl:async()=>reply(JSON.stringify(json))});
  assert.equal(rows[0].mgm_bldrgst_pk,"PK1");
  assert.throws(()=>extractBuildingHubItems({response:{header:{resultCode:"00"},body:{items:{item:"bad"}}}}),/Malformed/);
  assert.throws(()=>extractBuildingHubItems({response:{header:{resultCode:"00"},body:{items:{},totalCount:5}}}),/reports data/);
  assert.throws(()=>extractBuildingHubItems({response:{header:{resultCode:"00"},body:{items:{unexpected:"bad"}}}}),/Malformed/);
});

test("timeouts cover fetch and response body, aborting the operation",async()=>{
  let signal;
  await assert.rejects(fetchRtmsTrades({...rtmsArgs,timeoutMs:10,fetchImpl:async(_,options)=>{
    signal=options.signal;
    return {ok:true,text:()=>new Promise(()=>{})};
  }}),/timeout/);
  assert.equal(signal.aborted,true);
  await assert.rejects(fetchBuildingTitles({...buildingArgs,timeoutMs:10,fetchImpl:()=>new Promise(()=>{})}),/timeout/);
});

test("HTTP, fetch and provider errors never expose raw or encoded keys or request URLs",async()=>{
  const supplied="fake-secret+with/slash=";
  const secretEnv={DATA_GO_KR_SERVICE_KEY:encodeURIComponent(supplied)};
  const leaked=async url=>{throw new Error("network failed "+url+" "+supplied);};
  for(const fetcher of [
    ()=>fetchRtmsTrades({...rtmsArgs,env:secretEnv,fetchImpl:leaked}),
    ()=>fetchBuildingTitles({...buildingArgs,env:secretEnv,fetchImpl:leaked}),
    ()=>fetchRtmsTrades({...rtmsArgs,env:secretEnv,fetchImpl:async()=>reply(authXml.replace("SERVICE_KEY_IS_NOT_REGISTERED_ERROR",supplied))})
  ]){
    await assert.rejects(fetcher(),error=>{
      assert.ok(!error.message.includes(supplied));
      assert.ok(!error.message.includes(encodeURIComponent(supplied)));
      assert.ok(!error.message.includes("https://"));
      return true;
    });
  }
  assert.match(sanitizeApiError("https://apis.data.go.kr/route?serviceKey=anything"),/URL REDACTED/);
  await assert.rejects(fetchRtmsTrades({...rtmsArgs,fetchImpl:async()=>({ok:false,status:403,text:async()=>"Forbidden"})}),/RTMS HTTP 403/);
  assert.throws(()=>buildBuildingHubUrl({...buildingArgs,endpoint:"https://example.com/api"}),/endpoint must/);
});

test("HTTP 400 preserves provider parameter diagnosis for XML and JSON gateway errors",async()=>{
  const xml='<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>INVALID_REQUEST_PARAMETER_ERROR</errMsg><returnAuthMsg>잘못된 요청 파라미터 에러</returnAuthMsg><returnReasonCode>10</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';
  const json=JSON.stringify({OpenAPI_ServiceResponse:{cmmMsgHeader:{errMsg:"INVALID_REQUEST_PARAMETER_ERROR",returnAuthMsg:"잘못된 요청 파라미터 에러",returnReasonCode:"10"}}});
  for(const [fetcher,args,body] of [[fetchRtmsTrades,rtmsArgs,xml],[fetchBuildingTitles,buildingArgs,json]]){
    await assert.rejects(fetcher({...args,fetchImpl:async()=>({ok:false,status:400,text:async()=>body})}),error=>{
      assert.equal(error.httpStatus,400);
      assert.equal(error.providerCode,"10");
      assert.equal(error.category,"INVALID_REQUEST");
      assert.match(error.message,/잘못된 요청 파라미터/);
      assert.ok(!error.message.includes(env.DATA_GO_KR_SERVICE_KEY));
      return true;
    });
  }
  await assert.rejects(fetchBuildingTitles({...buildingArgs,fetchImpl:async()=>reply(json)}),error=>error.providerCode==="10");
});
