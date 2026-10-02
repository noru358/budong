import {assertNoSecretLikeFields} from "./contracts.mjs";

// Officially reviewed historical sample, not the full current project parcel list.
// Personal names/rights holders in the appendix are deliberately not copied.
export const HANNAM5_REVIEWED_PARCEL_SAMPLE=Object.freeze({
  project_id:"seoul-11170-03",sample_only:true,membership_as_of:"2026-04-30",
  current_membership_verified:false,
  parcels:Object.freeze([Object.freeze({
    pnu:"1117013200100330013",legal_dong:"동빙고동",source_id:"LAND_USE_EUM_GOV_NOTICE",
    source_locator:"https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=637767",
    observed_at:"2026-10-02T09:30:53.214Z",reviewed_at:"2026-10-02T09:35:12.072Z",
    certainty:"OFFICIAL_CONFIRMED",membership_reviewed:true,membership_as_of:"2026-04-30",
    current_membership_verified:false,notice_number:"서울특별시 용산구 고시 제2026-55호",
    appendix_pdf_page:6,appendix_printed_page:26,incorporated_area_m2:208,
    appendix_sha256:"1666a7154dc2ac36cda177ca9b12984acc638b81913863a91643866850f7f52b",
    code_evidence:{source_id:"MOIS_LEGAL_DONG_CODE",legal_dong_code:"1117013200",
      source_locator:"https://www.code.go.kr/stdcode/regCodeL.do?regionCd=1117013200&disuseAt=0&cPage=1&pageSize=10&searchOk=0",
      observed_at:"2026-10-02T09:35:12.072Z",disuse_status:"ACTIVE",
      body_sha256:"d707b431594ae241967c9b8f19901b438bb6d7e34297cc67152a789272b9ce54"}
  })])
});

const isoTime=value=>{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value))return false;
  const time=Date.parse(value);
  if(!Number.isFinite(time))return false;
  const canonical=new Date(time).toISOString();
  return value.length===10?canonical.slice(0,10)===value:canonical.slice(0,19)===value.slice(0,19);
};
const digits=(value,n)=>new RegExp(`^\\d{${n}}$`).test(String(value??""));
const publicLocator=value=>{
  try{
    const u=new URL(value);
    return u.protocol==="https:"&&!u.username&&!u.password&&
      ![...u.searchParams.keys()].some(k=>/key|token|secret/i.test(k));
  }catch{return false;}
};

// A representative discovery address is insufficient. Membership must have been
// reviewed against an official parcel list or boundary; this module never guesses it.
// Mapping is trusted reviewer input. Its flags/URL are a contract, not host
// authentication or proof that the reviewer opened all official attachments.
export function validateProjectParcels(mapping){
  assertNoSecretLikeFields(mapping);
  if(typeof mapping?.project_id!=="string"||!mapping.project_id.trim()||!Array.isArray(mapping.parcels)||!mapping.parcels.length)
    throw new Error("Reviewed project parcel mapping required");
  const seen=new Set();
  for(const parcel of mapping.parcels){
    if(!digits(parcel.pnu,19)||!["1","2"].includes(parcel.pnu[10])||
      typeof parcel.legal_dong!=="string"||!parcel.legal_dong.trim()||!parcel.source_id||!publicLocator(parcel.source_locator)||
      !isoTime(parcel.reviewed_at)||!isoTime(parcel.observed_at)||
      parcel.certainty!=="OFFICIAL_CONFIRMED"||parcel.membership_reviewed!==true){
      throw new Error("Parcel requires reviewed official membership, PNU, dong and provenance");
    }
    if(seen.has(parcel.pnu))throw new Error("Duplicate parcel membership");
    seen.add(parcel.pnu);
  }
  return mapping;
}

function tradeIdentity(row){
  if(!digits(row.jurisdiction_code,5)||!row.legal_dong)return null;
  // Masked, road-name, unit-bearing and approximate addresses cannot match.
  const match=String(row.jibun??"").trim().match(/^(산\s*)?(\d{1,4})(?:-(\d{1,4}))?$/);
  if(!match)return null;
  return {district:row.jurisdiction_code,dong:row.legal_dong.trim(),
    land:match[1]?"2":"1",bun:match[2].padStart(4,"0"),ji:(match[3]??"0").padStart(4,"0")};
}

function buildingPnu(row){
  if(!digits(row.sigungu_cd,5)||!digits(row.bjdong_cd,5)||
    !digits(row.bun,4)||!digits(row.ji,4)||!["0","1"].includes(row.plat_gb_cd))return null;
  return row.sigungu_cd+row.bjdong_cd+(row.plat_gb_cd==="1"?"2":"1")+row.bun+row.ji;
}

function lineage(row,parcel,mapping){
  return {project_id:mapping.project_id,parcel_pnu:parcel.pnu,
    match_scope:"PARCEL_ONLY",unit_identity_verified:false,
    membership_as_of:parcel.membership_as_of??mapping.membership_as_of??null,
    current_membership_verified:parcel.current_membership_verified===true,
    source_id:row.source_id,observed_at:row.observed_at,
    membership_source_id:parcel.source_id,membership_source_locator:parcel.source_locator,
    membership_reviewed_at:parcel.reviewed_at};
}

export function linkRowsToProject({mapping,rows,kind}){
  validateProjectParcels(mapping);
  if(!Array.isArray(rows)||!["RTMS","BUILDING"].includes(kind))throw new Error("Rows and supported linkage kind required");
  assertNoSecretLikeFields(rows);
  const links=[];
  const unresolved=[];
  rows.forEach((row,rowIndex)=>{
    if(!row?.source_id||!isoTime(row.observed_at)){
      unresolved.push({row_index:rowIndex,reason:"MISSING_ROW_PROVENANCE"});return;
    }
    if(kind==="RTMS"&&row.cancellation_date){
      unresolved.push({row_index:rowIndex,reason:"CANCELLED_TRANSACTION"});return;
    }
    const id=kind==="RTMS"?tradeIdentity(row):buildingPnu(row);
    if(!id){unresolved.push({row_index:rowIndex,reason:"INCOMPLETE_PARCEL_IDENTITY"});return;}
    const matches=mapping.parcels.filter(p=>kind==="BUILDING"?p.pnu===id:
      p.pnu.slice(0,5)===id.district&&p.legal_dong.trim()===id.dong&&
      p.pnu[10]===id.land&&p.pnu.slice(11,15)===id.bun&&p.pnu.slice(15)===id.ji);
    if(matches.length!==1){
      unresolved.push({row_index:rowIndex,reason:matches.length?"AMBIGUOUS_PARCEL_IDENTITY":"OUTSIDE_REVIEWED_PARCELS"});return;
    }
    links.push({row_index:rowIndex,...lineage(row,matches[0],mapping)});
  });
  return {project_id:mapping.project_id,kind,scope:"REVIEWED_PARCELS_ONLY",
    sample_only:mapping.sample_only===true,membership_as_of:mapping.membership_as_of??null,
    queried_row_count:rows.length,linked_row_count:links.length,links,unresolved,
    // Even a positive exact parcel match does not prove complete API coverage.
    project_coverage_complete:false,legal_rights_verified:false};
}

export function summarizeProjectCoverage(results=[]){
  if(!Array.isArray(results))throw new Error("Coverage results must be an array");
  const projects=new Map();
  for(const result of results){
    if(!result?.project_id||!["RTMS","BUILDING"].includes(result.kind)||
      result.scope!=="REVIEWED_PARCELS_ONLY"||!Array.isArray(result.links)||
      result.linked_row_count!==result.links.length)throw new Error("Validated linkage result required");
    const p=projects.get(result.project_id)??{project_id:result.project_id,rtms_linked:0,building_linked:0};
    p[result.kind==="RTMS"?"rtms_linked":"building_linked"]+=result.links.length;
    projects.set(result.project_id,p);
  }
  const rows=[...projects.values()];
  return {scope:"PARCEL_LINKAGE_COUNTS_ONLY",projects:rows,
    projects_with_both_sources:rows.filter(p=>p.rtms_linked>0&&p.building_linked>0).length,
    gate2_complete:false};
}
