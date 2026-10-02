import {pathToFileURL} from "node:url";
import {environmentFetch} from "../src/http_transport.mjs";
import {fetchRtmsTrades,fetchBuildingTitles,fetchAllRtmsTrades,fetchAllBuildingTitles,sanitizeApiError,RTMS_SERVICES} from "../src/adapters/data_go_kr.mjs";
import {HANNAM5_REVIEWED_PARCEL_SAMPLE,linkRowsToProject} from "../src/adapters/project_linkage.mjs";

const FLAGS={
  "--deal-ymd":"dealYmd","--lawd-cd":"lawdCd","--sigungu-cd":"sigunguCd",
  "--bjdong-cd":"bjdongCd","--bun":"bun","--ji":"ji",
  "--timeout-ms":"timeoutMs","--building-endpoint":"buildingEndpoint",
  "--all-pages":"allPages","--max-pages":"maxPages","--num-of-rows":"numOfRows","--plat-gb-cd":"platGbCd","--service-type":"serviceType"
};

export function readSmokeOptions(argv=[],env=process.env){
  const options={};
  const variables={SMOKE_DEAL_YMD:"dealYmd",SMOKE_LAWD_CD:"lawdCd",SMOKE_SIGUNGU_CD:"sigunguCd",
    SMOKE_BJDONG_CD:"bjdongCd",SMOKE_BUN:"bun",SMOKE_JI:"ji",SMOKE_TIMEOUT_MS:"timeoutMs",SMOKE_BUILDING_ENDPOINT:"buildingEndpoint",
    SMOKE_ALL_PAGES:"allPages",SMOKE_MAX_PAGES:"maxPages",SMOKE_NUM_OF_ROWS:"numOfRows",SMOKE_PLAT_GB_CD:"platGbCd",SMOKE_SERVICE_TYPE:"serviceType"};
  for(const [name,key] of Object.entries(variables))if(env[name])options[key]=env[name];
  for(let i=0;i<argv.length;i+=2){
    if(!Object.hasOwn(FLAGS,argv[i])||!argv[i+1]||argv[i+1].startsWith("--")){
      throw new Error("Invalid smoke arguments; use --deal-ymd, --lawd-cd, --sigungu-cd, --bjdong-cd, --bun, --ji, --timeout-ms or --building-endpoint with a value");
    }
    options[FLAGS[argv[i]]]=argv[i+1];
  }
  return options;
}

function currentSeoulMonth(now){
  const parts=new Intl.DateTimeFormat("en",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"}).formatToParts(now);
  return parts.find(p=>p.type==="year").value+parts.find(p=>p.type==="month").value;
}

// A valid empty result proves connectivity, not data coverage or project linkage.
export async function runLiveDataSmoke({env=process.env,fetchImpl=environmentFetch,now=new Date(),options={}}={}){
  const observedAt=now.toISOString();
  const allPages=options.allPages===true||options.allPages==="true"||options.allPages==="1";
  if(options.allPages!==undefined&&!allPages&&![false,"false","0"].includes(options.allPages))throw new Error("allPages must be true or false");
  const common={env,fetchImpl,timeoutMs:options.timeoutMs??20000,observedAt,pageNo:1,
    numOfRows:allPages?(options.numOfRows??100):10,...(allPages?{maxPages:options.maxPages??20,maxDurationMs:60000}:{})};
  const serviceType=options.serviceType??"RH";
  const service=Object.hasOwn(RTMS_SERVICES,serviceType)?RTMS_SERVICES[serviceType]:null;
  const names=[service?.sourceId?.replace("MOLIT_","")??"RTMS_UNSUPPORTED","BUILDING_HUB"];
  // Persist allowlisted query identifiers only, never the URL, endpoint override or key.
  const safeCode=(value,n)=>new RegExp(`^\\d{${n}}$`).test(String(value))?String(value):null;
  const safePageSize=value=>/^\d{1,4}$/.test(String(value))&&Number(value)>=1&&Number(value)<=1000?Number(value):null;
  const query=[
    {lawd_cd:safeCode(options.lawdCd??"11590",5),deal_ymd:safeCode(options.dealYmd??currentSeoulMonth(now),6),service_type:service?serviceType:null},
    {sigungu_cd:safeCode(options.sigunguCd??"11590",5),bjdong_cd:safeCode(options.bjdongCd??"10200",5),
      plat_gb_cd:safeCode(options.platGbCd??"0",1),bun:safeCode(options.bun??"0418",4),ji:safeCode(options.ji??"0000",4)}
  ];
  const requests=await Promise.allSettled([
    (allPages?fetchAllRtmsTrades:fetchRtmsTrades)({...common,lawdCd:options.lawdCd??"11590",dealYmd:options.dealYmd??currentSeoulMonth(now),serviceType}),
    // Connectivity example: 상도동 418. Override codes for another known parcel;
    // absence here is not an investment or building assertion.
    (allPages?fetchAllBuildingTitles:fetchBuildingTitles)({...common,sigunguCd:options.sigunguCd??"11590",bjdongCd:options.bjdongCd??"10200",
      platGbCd:options.platGbCd??"0",bun:options.bun??"0418",ji:options.ji??"0000",endpoint:options.buildingEndpoint})
  ]);
  const services=requests.map((result,i)=>{
    if(result.status==="fulfilled"){
      if(allPages){
        const page=result.value;
        return {service:names[i],request:page.request,coverage:page.coverage,stop_reason:page.stop_reason,
          total_count:page.total_count,page_count:page.page_count,pages:page.pages,
          connectivity:"OK",row_count:page.rows.length,data_presence:page.rows.length?"ROWS_PRESENT":"NO_ROWS"};
      }
      return {service:names[i],request:{...query[i],page_no:1,num_of_rows:10},
        coverage:"FIRST_PAGE_ONLY",connectivity:"OK",row_count:result.value.length,
        data_presence:result.value.length?"ROWS_PRESENT":"NO_ROWS"};
    }
    const error=result.reason;
    return {service:names[i],request:{...query[i],page_no:1,num_of_rows:allPages?safePageSize(common.numOfRows):10},
      coverage:"UNVERIFIED",connectivity:"FAILED",row_count:null,data_presence:"UNVERIFIED",
      provider_code:error?.providerCode??null,http_status:error?.httpStatus??null,category:error?.category??"REQUEST_OR_RESPONSE",
      error:sanitizeApiError(error,{env})};
  });
  const historicalSampleQuery=query[1].sigungu_cd==="11170"&&query[1].bjdong_cd==="13200"&&
    query[1].plat_gb_cd==="0"&&query[1].bun==="0033"&&query[1].ji==="0013";
  const historicalSample=historicalSampleQuery?requests.map((result,i)=>{
    if(result.status!=="fulfilled")return {kind:i===0?"RTMS":"BUILDING",status:"UNVERIFIED"};
    const rows=allPages?result.value.rows:result.value;
    const linked=linkRowsToProject({mapping:HANNAM5_REVIEWED_PARCEL_SAMPLE,rows,kind:i===0?"RTMS":"BUILDING"});
    const parcel=HANNAM5_REVIEWED_PARCEL_SAMPLE.parcels[0];
    return {kind:linked.kind,queried_row_count:linked.queried_row_count,linked_row_count:linked.linked_row_count,
      rejected_row_count:linked.unresolved.length,rejected_by_reason:linked.unresolved.reduce((out,row)=>{
        out[row.reason]=(out[row.reason]??0)+1;return out;
      },{}),scope:"HISTORICAL_REVIEWED_PARCEL_SAMPLE",project_id:linked.project_id,
      source_id:i===0?service?.sourceId??null:"MOLIT_BUILDING_HUB",observed_at:observedAt,
      parcel_pnu:parcel.pnu,membership_source_id:parcel.source_id,membership_source_locator:parcel.source_locator,
      appendix_sha256:parcel.appendix_sha256,appendix_pdf_page:parcel.appendix_pdf_page,
      membership_reviewed_at:parcel.reviewed_at,code_evidence:parcel.code_evidence,
      membership_as_of:linked.membership_as_of,sample_only:true,current_membership_verified:false,
      legal_rights_verified:false};
  }):null;
  return {observed_at:observedAt,scope:allPages?"QUERY_COVERAGE_ONLY":"CONNECTIVITY_ONLY",project_linkage_validated:false,
    ...(historicalSample?{historical_parcel_sample_validation:historicalSample}:{}),
    connectivity_ok:services.every(s=>s.connectivity==="OK"),
    ok:services.every(s=>s.connectivity==="OK"&&(!allPages||s.coverage==="COMPLETE")),services};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await runLiveDataSmoke({options:readSmokeOptions(process.argv.slice(2))});
    console.log(JSON.stringify(result,null,2));
    process.exitCode=result.ok?0:1;
  }catch(err){
    console.error("LIVE_DATA_SMOKE_FAILED:",sanitizeApiError(err));
    process.exitCode=1;
  }
}
