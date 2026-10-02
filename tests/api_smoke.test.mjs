import test from "node:test";
import assert from "node:assert/strict";
import {readSmokeOptions,runLiveDataSmoke} from "../scripts/live_data_smoke.mjs";

const env={DATA_GO_KR_SERVICE_KEY:"SMOKE_TEST_KEY"};
const now=new Date("2026-09-30T15:01:00Z");
const emptyXml='<response><header><resultCode>000</resultCode></header><body><items/><totalCount>0</totalCount></body></response>';
const emptyJson=JSON.stringify({response:{header:{resultCode:"00"},body:{items:"",totalCount:0}}});
const reply=text=>({ok:true,text:async()=>text});
const rtmsUrl=url=>url.pathname.includes("RTMSData");

test("smoke defaults to Seoul current month and reports empty results as connectivity only",async()=>{
  const urls=[];
  const result=await runLiveDataSmoke({env,now,fetchImpl:async url=>{
    urls.push(url);
    return reply(rtmsUrl(url)?emptyXml:emptyJson);
  }});
  assert.equal(result.ok,true);
  assert.equal(result.project_linkage_validated,false);
  assert.equal(result.scope,"CONNECTIVITY_ONLY");
  assert.deepEqual(result.services.map(s=>s.data_presence),["NO_ROWS","NO_ROWS"]);
  assert.equal(urls.find(rtmsUrl).searchParams.get("DEAL_YMD"),"202610");
  assert.ok(!JSON.stringify(result).includes(env.DATA_GO_KR_SERVICE_KEY));
});

test("RTMS failure does not hide Building success and both results explain provider errors",async()=>{
  let count=0;
  const result=await runLiveDataSmoke({env,now,fetchImpl:async url=>{
    count++;
    if(rtmsUrl(url))return reply('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>');
    return reply(JSON.stringify({response:{header:{resultCode:"00"},body:{items:{item:{mgmBldrgstPk:"PK1"}}}}}));
  }});
  assert.equal(count,2);
  assert.equal(result.ok,false);
  assert.equal(result.services[0].provider_code,"30");
  assert.equal(result.services[1].connectivity,"OK");
  assert.equal(result.services[1].data_presence,"ROWS_PRESENT");
});

test("both failures and missing secrets are independently diagnosed without network leaks",async()=>{
  const errors=await runLiveDataSmoke({env,now,fetchImpl:async url=>{throw new Error("failed URL "+url);}});
  assert.equal(errors.services.filter(s=>s.connectivity==="FAILED").length,2);
  assert.ok(!JSON.stringify(errors).includes(env.DATA_GO_KR_SERVICE_KEY));
  assert.ok(!JSON.stringify(errors).includes("https://"));
  const missing=await runLiveDataSmoke({env:{},now,fetchImpl:async()=>{throw new Error("must not fetch");}});
  assert.equal(missing.services.length,2);
  assert.ok(missing.services.every(s=>/Missing required secret/.test(s.error)));
});

test("parcel/month overrides are used while malformed responses remain failures",async()=>{
  const options=readSmokeOptions(["--deal-ymd","202608","--bun","0279"],{SMOKE_JI:"0001"});
  const urls=[];
  const result=await runLiveDataSmoke({env,now,options,fetchImpl:async url=>{
    urls.push(url);
    return reply(rtmsUrl(url)?"<html>error</html>":"{}");
  }});
  assert.equal(urls.find(rtmsUrl).searchParams.get("DEAL_YMD"),"202608");
  assert.equal(urls.find(u=>!rtmsUrl(u)).searchParams.get("bun"),"0279");
  assert.equal(urls.find(u=>!rtmsUrl(u)).searchParams.get("ji"),"0001");
  assert.equal(result.ok,false);
  assert.ok(result.services.every(s=>s.data_presence==="UNVERIFIED"));
  assert.throws(()=>readSmokeOptions(["--unknown","value"]),/Invalid smoke arguments/);
});
