import {fetchRtmsTrades,fetchBuildingTitles} from "../src/adapters/data_go_kr.mjs";

function safeSample(row,fields){
  if(!row)return null;
  return Object.fromEntries(fields.map(k=>[k,row[k]??null]));
}

async function check(name,fn){
  try{
    const rows=await fn();
    console.log(name+"_OK count=",rows.length);
    return {ok:true,rows};
  }catch(err){
    console.error(name+"_FAIL:",err?.message||String(err));
    return {ok:false,error:err};
  }
}

async function main(){
  if(!process.env.DATA_GO_KR_SERVICE_KEY) throw new Error("DATA_GO_KR_SERVICE_KEY is not configured");
  const rawKey=String(process.env.DATA_GO_KR_SERVICE_KEY||"");
  const trimmed=rawKey.trim();
  const looksEncoded=/%[0-9A-Fa-f]{2}/.test(trimmed);
  const hasInternalWhitespace=/\s/.test(trimmed);
  const wrappedInQuotes=(trimmed.startsWith('"')&&trimmed.endsWith('"'))||(trimmed.startsWith("'")&&trimmed.endsWith("'"));
  const looksMasked=/\*{3,}|\.\.\./.test(trimmed);
  console.log("DATA_GO_KR_SERVICE_KEY_PRESENT=yes");
  console.log("KEY_DIAGNOSTIC raw_length="+rawKey.length+
    " trimmed_length="+trimmed.length+
    " encoded_escapes="+looksEncoded+
    " internal_whitespace="+hasInternalWhitespace+
    " wrapped_quotes="+wrappedInQuotes+
    " looks_masked="+looksMasked); // never log value/hash

  const rtms=await check("RTMS_MULTIFAMILY_SALE",()=>fetchRtmsTrades({
    env:process.env,
    lawdCd:"11590",
    dealYmd:"202609",
    pageNo:1,
    numOfRows:10,
    observedAt:new Date().toISOString()
  }));
  if(rtms.ok){
    console.log("RTMS_SAMPLE=",JSON.stringify(safeSample(rtms.rows[0],["legal_dong","jibun","deal_date","deal_amount_10k_krw"])));
  }

  const bld=await check("BUILDING_HUB",()=>fetchBuildingTitles({
    env:process.env,
    sigunguCd:"11590",
    bjdongCd:"10200",
    bun:"0418",
    ji:"0000",
    pageNo:1,
    numOfRows:10,
    observedAt:new Date().toISOString()
  }));
  if(bld.ok){
    console.log("BUILDING_SAMPLE=",JSON.stringify(safeSample(bld.rows[0],["building_name","plat_plc","main_purpose","mgm_bldrgst_pk"])));
  }

  if(!rtms.ok||!bld.ok){
    throw new Error("One or more live providers failed; see masked provider diagnostics above");
  }
}
main().catch(err=>{
  console.error("LIVE_DATA_SMOKE_FAILED:",err?.message||String(err));
  process.exit(1);
});
