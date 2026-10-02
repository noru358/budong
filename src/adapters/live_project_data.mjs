import {fetchAllRtmsTrades,fetchAllBuildingTitles,rtmsService} from "./data_go_kr.mjs";

function representativeParcel(value){
  const m=String(value??"").trim().match(/^(.+?)\s+(산\s*)?(\d{1,4})(?:-(\d{1,4}))?(?:번지)?$/);
  return m?{legal_dong:m[1].trim(),platGbCd:m[2]?"1":"0",bun:m[3].padStart(4,"0"),ji:(m[4]??"0").padStart(4,"0")}:null;
}

// Server passes its seed project, not an arbitrary client-provided project object.
// The representative address is a query aid, never official parcel membership.
export function buildProjectReferenceQuery({project,kind,query={}}){
  if(!project?.id||!/^\d{5}$/.test(String(project.borough_code??"")))throw new Error("Project requires a 5 digits borough code");
  if(!["rtms","buildings"].includes(kind))throw new Error("Reference kind must be rtms or buildings");
  const allowed=kind==="rtms"?["dealYmd","serviceType"]:["bjdongCd","bun","ji","platGbCd"];
  if(Object.keys(query).some(k=>!allowed.includes(k)))throw new Error("Reference query must use allowed parameters");
  const parcel=representativeParcel(project.representative_lot);
  if(kind==="rtms"){
    if(!/^\d{4}(0[1-9]|1[0-2])$/.test(String(query.dealYmd??"")))throw new Error("dealYmd must be valid YYYYMM");
    rtmsService(query.serviceType??"RH");
    return {lawdCd:project.borough_code,dealYmd:query.dealYmd,...(query.serviceType?{serviceType:query.serviceType}:{})};
  }
  // Legal dong code is supplied from reviewed official codes or by the user.
  // No lookup, PNU inference or hardcoded 상도동 code is performed here.
  if(!/^\d{5}$/.test(String(query.bjdongCd??"")))throw new Error("bjdongCd must be 5 digits; representative name cannot infer its code");
  const result={sigunguCd:project.borough_code,bjdongCd:query.bjdongCd,
    bun:query.bun??parcel?.bun,ji:query.ji??parcel?.ji,platGbCd:query.platGbCd??parcel?.platGbCd};
  if(!/^\d{4}$/.test(String(result.bun??""))||!/^\d{4}$/.test(String(result.ji??""))||!["0","1","2"].includes(result.platGbCd))
    throw new Error("Representative parcel or manual bun/ji must be 4 digits and platGbCd valid");
  return result;
}

export async function queryLiveProjectData({project,kind,query,env=process.env,fetchImpl,
  observedAt=new Date().toISOString()}={}){
  const request=buildProjectReferenceQuery({project,kind,query});
  const args={...request,env,...(fetchImpl?{fetchImpl}:{}),observedAt,
    numOfRows:100,maxPages:20,maxDurationMs:60000};
  const result=kind==="rtms"?await fetchAllRtmsTrades(args):await fetchAllBuildingTitles(args);
  return {...result,project_context_id:project.id,
    representative_lot:project.representative_lot??null,
    reference_label:kind==="rtms"?`선택 구역 자치구의 ${rtmsService(request.serviceType??"RH").name} 참고자료`:"대표지번 또는 입력 필지의 건축물 참고자료",
    project_linkage_validated:false,legal_rights_verified:false,
    status:result.coverage==="PARTIAL_CAP"?"PARTIAL_RESULT":result.rows.length?"DATA_RECEIVED":"EMPTY_RESULT"};
}
