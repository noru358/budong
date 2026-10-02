import test from "node:test";
import assert from "node:assert/strict";
import {validateProjectParcels,linkRowsToProject,summarizeProjectCoverage,HANNAM5_REVIEWED_PARCEL_SAMPLE} from "../src/adapters/project_linkage.mjs";
import {normalizeBuildingTitleItem} from "../src/adapters/data_go_kr.mjs";

// Synthetic contract cases only; this is not an official real-project parcel list.
const observed_at="2026-10-02T08:40:00Z";
const parcel={pnu:"1159010200104180000",legal_dong:"상도동",source_id:"SYNTHETIC_OFFICIAL_NOTICE",
  source_locator:"https://example.gov.test/notice/1",observed_at,reviewed_at:observed_at,
  certainty:"OFFICIAL_CONFIRMED",membership_reviewed:true};
const mapping={project_id:"test-project",parcels:[parcel]};
const trade={source_id:"MOLIT_RTMS_MULTIFAMILY_SALE",observed_at,jurisdiction_code:"11590",legal_dong:"상도동",jibun:"418",cancellation_date:null};
const building={source_id:"MOLIT_BUILDING_HUB",observed_at,sigungu_cd:"11590",bjdong_cd:"10200",plat_gb_cd:"0",bun:"0418",ji:"0000"};
const link=(rows,kind="RTMS",m=mapping)=>linkRowsToProject({mapping:m,rows,kind});

test("only reviewed official parcel membership accepts an exact transaction match",()=>{
  const result=link([trade]);
  assert.equal(result.linked_row_count,1);
  assert.equal(result.links[0].parcel_pnu,parcel.pnu);
  assert.equal(result.links[0].unit_identity_verified,false);
  assert.equal(result.project_coverage_complete,false);
  for(const patch of [{certainty:"SOURCE_CONFIRMED"},{membership_reviewed:false},{reviewed_at:null},{source_locator:"https://example.gov.test/?serviceKey=hidden"}]){
    assert.throws(()=>validateProjectParcels({...mapping,parcels:[{...parcel,...patch}]}),/reviewed official/);
  }
});

test("district/dong/parcel mismatches and masked addresses never become project transactions",()=>{
  const result=link([
    {...trade,jurisdiction_code:"11170"},{...trade,legal_dong:"다른동"},
    {...trade,jibun:"418-1"},{...trade,jibun:"418*"},{...trade,jibun:"산418"},
    {...trade,observed_at:null},{...trade,cancellation_date:"20261001"}
  ]);
  assert.equal(result.linked_row_count,0);
  assert.equal(result.unresolved.length,7);
  assert.equal(result.unresolved[3].reason,"INCOMPLETE_PARCEL_IDENTITY");
  assert.equal(result.unresolved[6].reason,"CANCELLED_TRANSACTION");
});

test("ambiguous RTMS dong identities and duplicate mappings fail closed",()=>{
  const other={...parcel,pnu:"1159010300104180000"};
  const result=link([trade],"RTMS",{...mapping,parcels:[parcel,other]});
  assert.equal(result.linked_row_count,0);
  assert.equal(result.unresolved[0].reason,"AMBIGUOUS_PARCEL_IDENTITY");
  assert.throws(()=>validateProjectParcels({...mapping,parcels:[parcel,parcel]}),/Duplicate/);
});

test("impossible review dates and rollover timestamps cannot satisfy source provenance",()=>{
  for(const value of ["2026-02-30","2026-02-30T12:00:00Z","2026-10-02T24:00:00Z","October 2, 2026"]){
    assert.throws(()=>validateProjectParcels({...mapping,parcels:[{...parcel,reviewed_at:value}]}),/reviewed official/);
    assert.equal(link([{...trade,observed_at:value}]).unresolved[0].reason,"MISSING_ROW_PROVENANCE");
  }
  assert.equal(validateProjectParcels({...mapping,parcels:[{...parcel,reviewed_at:"2026-10-02"}]}).parcels.length,1);
});

test("building joins require land type and all parcel codes, preserving mountain distinction",()=>{
  const result=link([building,{...building,plat_gb_cd:null},{...building,plat_gb_cd:"1"},{...building,ji:"0001"}],"BUILDING");
  assert.equal(result.linked_row_count,1);
  assert.equal(result.unresolved[0].reason,"INCOMPLETE_PARCEL_IDENTITY");
  const normalized=normalizeBuildingTitleItem({sigunguCd:"11590",bjdongCd:"10200",platGbCd:0,bun:"0418",ji:"0000"},{observedAt:observed_at});
  assert.equal(normalized.plat_gb_cd,"0");
  assert.equal(link([normalized],"BUILDING").linked_row_count,1);
});

test("positive linkage counts cannot declare Gate2 or complete coverage",()=>{
  const result=summarizeProjectCoverage([link([trade]),link([building],"BUILDING")]);
  assert.equal(result.projects_with_both_sources,1);
  assert.equal(result.gate2_complete,false);
  assert.throws(()=>link([{...trade,api_key:"hidden"}]),/Secret-like/);
});

test("reviewed Hannam appendix sample preserves historical date and code evidence without current membership claim",()=>{
  validateProjectParcels(HANNAM5_REVIEWED_PARCEL_SAMPLE);
  const p=HANNAM5_REVIEWED_PARCEL_SAMPLE.parcels[0];
  assert.equal(p.pnu.slice(0,10),p.code_evidence.legal_dong_code);
  const result=linkRowsToProject({mapping:HANNAM5_REVIEWED_PARCEL_SAMPLE,kind:"BUILDING",rows:[{
    ...building,sigungu_cd:"11170",bjdong_cd:"13200",bun:"0033",ji:"0013"
  }]});
  assert.equal(result.linked_row_count,1);assert.equal(result.sample_only,true);
  assert.equal(result.links[0].membership_as_of,"2026-04-30");assert.equal(result.links[0].current_membership_verified,false);
  assert.equal(result.project_coverage_complete,false);
});
