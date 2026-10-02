import {pathToFileURL} from "node:url";
import {environmentFetch} from "../src/http_transport.mjs";
import {fetchRtmsTrades,fetchBuildingTitles,sanitizeApiError} from "../src/adapters/data_go_kr.mjs";

const FLAGS={
  "--deal-ymd":"dealYmd","--lawd-cd":"lawdCd","--sigungu-cd":"sigunguCd",
  "--bjdong-cd":"bjdongCd","--bun":"bun","--ji":"ji",
  "--timeout-ms":"timeoutMs","--building-endpoint":"buildingEndpoint"
};

export function readSmokeOptions(argv=[],env=process.env){
  const options={};
  const variables={SMOKE_DEAL_YMD:"dealYmd",SMOKE_LAWD_CD:"lawdCd",SMOKE_SIGUNGU_CD:"sigunguCd",
    SMOKE_BJDONG_CD:"bjdongCd",SMOKE_BUN:"bun",SMOKE_JI:"ji",SMOKE_TIMEOUT_MS:"timeoutMs",SMOKE_BUILDING_ENDPOINT:"buildingEndpoint"};
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
  const common={env,fetchImpl,timeoutMs:options.timeoutMs??20000,observedAt,pageNo:1,numOfRows:10};
  const names=["RTMS_MULTIFAMILY_SALE","BUILDING_HUB"];
  // Persist allowlisted query identifiers only, never the URL, endpoint override or key.
  const safeCode=(value,n)=>new RegExp(`^\\d{${n}}$`).test(String(value))?String(value):null;
  const query=[
    {lawd_cd:safeCode(options.lawdCd??"11590",5),deal_ymd:safeCode(options.dealYmd??currentSeoulMonth(now),6)},
    {sigungu_cd:safeCode(options.sigunguCd??"11590",5),bjdong_cd:safeCode(options.bjdongCd??"10200",5),
      plat_gb_cd:"0",bun:safeCode(options.bun??"0418",4),ji:safeCode(options.ji??"0000",4)}
  ];
  const requests=await Promise.allSettled([
    fetchRtmsTrades({...common,lawdCd:options.lawdCd??"11590",dealYmd:options.dealYmd??currentSeoulMonth(now)}),
    // Connectivity example: 상도동 418. Override codes for another known parcel;
    // absence here is not an investment or building assertion.
    fetchBuildingTitles({...common,sigunguCd:options.sigunguCd??"11590",bjdongCd:options.bjdongCd??"10200",
      bun:options.bun??"0418",ji:options.ji??"0000",endpoint:options.buildingEndpoint})
  ]);
  const services=requests.map((result,i)=>{
    if(result.status==="fulfilled"){
      return {service:names[i],request:{...query[i],page_no:1,num_of_rows:10},
        coverage:"FIRST_PAGE_ONLY",connectivity:"OK",row_count:result.value.length,
        data_presence:result.value.length?"ROWS_PRESENT":"NO_ROWS"};
    }
    const error=result.reason;
    return {service:names[i],request:{...query[i],page_no:1,num_of_rows:10},
      coverage:"UNVERIFIED",connectivity:"FAILED",row_count:null,data_presence:"UNVERIFIED",
      provider_code:error?.providerCode??null,http_status:error?.httpStatus??null,category:error?.category??"REQUEST_OR_RESPONSE",
      error:sanitizeApiError(error,{env})};
  });
  return {observed_at:observedAt,scope:"CONNECTIVITY_ONLY",project_linkage_validated:false,
    ok:services.every(s=>s.connectivity==="OK"),services};
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
