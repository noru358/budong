import {fetchRtmsTrades,fetchBuildingTitles} from "../src/adapters/data_go_kr.mjs";

function safeSample(row,fields){
  if(!row)return null;
  return Object.fromEntries(fields.map(k=>[k,row[k]??null]));
}

async function main(){
  if(!process.env.DATA_GO_KR_SERVICE_KEY) throw new Error("DATA_GO_KR_SERVICE_KEY is not configured");

  const rtms=await fetchRtmsTrades({
    env:process.env,
    lawdCd:"11590",
    dealYmd:"202609",
    pageNo:1,
    numOfRows:10,
    observedAt:new Date().toISOString()
  });
  console.log("RTMS_MULTIFAMILY_SALE_OK count=",rtms.length,
    "sample=",JSON.stringify(safeSample(rtms[0],["legal_dong","jibun","deal_date","deal_amount_10k_krw"])));

  // Connectivity smoke uses a known existing parcel in 상도동 (not an investment assertion).
  const bld=await fetchBuildingTitles({
    env:process.env,
    sigunguCd:"11590",
    bjdongCd:"10200",
    bun:"0418",
    ji:"0000",
    pageNo:1,
    numOfRows:10,
    observedAt:new Date().toISOString()
  });
  console.log("BUILDING_HUB_OK count=",bld.length,
    "sample=",JSON.stringify(safeSample(bld[0],["building_name","plat_plc","main_purpose","mgm_bldrgst_pk"])));

  if(!Array.isArray(rtms)||!Array.isArray(bld)) throw new Error("Unexpected adapter output");
}
main().catch(err=>{
  console.error("LIVE_DATA_SMOKE_FAILED:",err?.message||String(err));
  process.exit(1);
});
