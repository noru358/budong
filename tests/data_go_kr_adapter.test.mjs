import test from "node:test";
import assert from "node:assert/strict";
import {
  ENDPOINTS,buildRtmsUrl,buildBuildingHubUrl,parseFlatXmlItems,normalizeServiceKey,
  normalizeRtmsTradeItem,extractBuildingHubItems,normalizeBuildingTitleItem
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

test("service key accepts decoded or URL-encoded portal form without double encoding",()=>{
  const decoded="abc+/==";
  const encoded="abc%2B%2F%3D%3D";
  assert.equal(normalizeServiceKey(decoded),decoded);
  assert.equal(normalizeServiceKey(encoded),decoded);
  const a=buildRtmsUrl({env:{DATA_GO_KR_SERVICE_KEY:decoded},lawdCd:"11590",dealYmd:"202609"});
  const b=buildRtmsUrl({env:{DATA_GO_KR_SERVICE_KEY:encoded},lawdCd:"11590",dealYmd:"202609"});
  assert.equal(a.searchParams.get("serviceKey"),decoded);
  assert.equal(b.searchParams.get("serviceKey"),decoded);
  assert.ok(!b.toString().includes("%252B"));
});
