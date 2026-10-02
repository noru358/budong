import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getSourceUsePolicy,listSourceUsePolicies,evaluateSourceOperation,evaluateDerivedSourceUse} from '../src/source_policy.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('../data/source_registry.json',import.meta.url),'utf8'));
const source=id=>registry.sources.find(item=>item.source_id===id);

test('noncommercial original access is enabled independently of legacy red readiness',()=>{
  const boundary=source('SEOUL_PLAN_PLUS_BOUNDARY_SHP');
  assert.equal(boundary.readiness,'RED');
  const policy=getSourceUsePolicy(boundary);
  assert.equal(policy.personal_use,'allowed');
  assert.equal(policy.commercial_use,'noncommercial');
  assert.equal(policy.modification,'no_derivatives');
  assert.equal(evaluateSourceOperation(boundary,{operation:'view_original'}).enabled,true);
  assert.equal(evaluateSourceOperation(boundary,{operation:'raw_download'}).enabled,true);
  assert.equal(evaluateSourceOperation(boundary,{mode:'COMMERCIAL',operation:'raw_download'}).status,'noncommercial');
});

test('personal mode never clears no-derivatives or uncertain map conversion',()=>{
  for(const id of ['SEOUL_OPEN_REDEVELOPMENT_STATUS','SEOUL_OPEN_PLANNING_NOTICES','SEOUL_OPEN_BOUNDARY_SHP','SEOUL_PLAN_PLUS_BOUNDARY_SHP']){
    const s=source(id);
    assert.equal(evaluateSourceOperation(s,{mode:'personal',operation:'geometry_transform'}).status,'no_derivatives');
    assert.equal(evaluateSourceOperation(s,{operation:'normalize'}).enabled,false);
    assert.equal(evaluateSourceOperation(s,{operation:'map_display'}).status,'requires_review');
  }
});

test('approved unrestricted API data remain usable for personal and commercial processing',()=>{
  for(const s of registry.sources.filter(item=>item.source_id.startsWith('MOLIT_RTMS_')||item.source_id==='MOLIT_BUILDING_HUB')){
    assert.equal(evaluateSourceOperation(s,{operation:'normalize'}).enabled,true);
    assert.equal(evaluateSourceOperation(s,{mode:'commercial',operation:'normalize'}).enabled,true);
    assert.equal(getSourceUsePolicy(s).license_id,'DATA_GO_KR_UNRESTRICTED');
  }
});

test('a public URL and a green colour never imply an unknown reuse licence',()=>{
  const unknown={source_id:'NEW',readiness:'GREEN',catalog_url:'https://example.org/source'};
  assert.equal(evaluateSourceOperation(unknown,{operation:'view_original'}).enabled,true);
  for(const operation of ['raw_download','normalize','geometry_transform','map_display','redistribute']){
    assert.equal(evaluateSourceOperation(unknown,{operation}).enabled,false);
  }
  assert.equal(getSourceUsePolicy(source('VWORLD_WFS_WMS')).personal_use,'requires_review');
});

test('source permissions require valid review evidence rather than a permission-looking string',()=>{
  const malformed=structuredClone(source('MOLIT_BUILDING_HUB'));
  malformed.use_policy.reviewed_at='2026-02-30';
  assert.equal(evaluateSourceOperation(malformed,{operation:'normalize'}).enabled,false);
  malformed.use_policy.reviewed_at='2026-10-02';
  malformed.use_policy.evidence[0].url='https://user:password@example.org';
  assert.equal(getSourceUsePolicy(malformed).verified,false);
  malformed.use_policy.evidence[0].url='javascript:alert(1)';
  assert.equal(getSourceUsePolicy(malformed).verified,false);
});

test('public notice reference does not authorize attachment copying or bulk harvesting',()=>{
  const s=source('SONGPA_NOTICE_BOARD');
  assert.equal(evaluateSourceOperation(s,{operation:'reference_metadata'}).enabled,true);
  assert.equal(evaluateSourceOperation(s,{operation:'bulk_collect'}).enabled,false);
  assert.equal(evaluateSourceOperation(s,{operation:'redistribute'}).enabled,false);
  assert.equal(evaluateSourceOperation(s,{mode:'COMMERCIAL',operation:'reference_metadata'}).enabled,false);
});

test('a mixed-source derived output inherits the relevant operation restriction',()=>{
  const open=source('MOLIT_BUILDING_HUB'),restricted=source('SEOUL_OPEN_BOUNDARY_SHP');
  assert.equal(evaluateDerivedSourceUse([open,restricted],{operation:'geometry_transform'}).status,'no_derivatives');
  assert.equal(evaluateDerivedSourceUse([open,restricted],{mode:'COMMERCIAL',operation:'reference_metadata'}).status,'noncommercial');
  assert.equal(evaluateDerivedSourceUse([open],{operation:'normalize'}).enabled,true);
  assert.equal(evaluateDerivedSourceUse([],{operation:'normalize'}).enabled,false);
});

test('standard OSM tiles permit viewport display while explicitly prohibiting bulk collection',()=>{
  const s=source('OSM_STANDARD_TILES');
  assert.equal(evaluateSourceOperation(s,{operation:'map_display'}).enabled,true);
  assert.equal(evaluateSourceOperation(s,{mode:'COMMERCIAL',operation:'map_display'}).enabled,true);
  const bulk=evaluateSourceOperation(s,{operation:'bulk_collect'});
  assert.equal(bulk.enabled,false);
  assert.equal(bulk.prohibited,true);
  assert.match(bulk.reason,/금지/);
  assert.equal(getSourceUsePolicy(s).attribution_text,'© OpenStreetMap contributors');
});

test('user-created input is usable but its contract expressly excludes third-party uploads',()=>{
  const s=source('USER_INPUT');
  assert.equal(evaluateSourceOperation(s,{operation:'map_display'}).enabled,true);
  assert.equal(evaluateSourceOperation(s,{mode:'commercial',operation:'normalize'}).enabled,true);
  assert.match(getSourceUsePolicy(s).scope_note,/제3자/);
  assert.equal(evaluateSourceOperation(source('SEOUL_OPEN_BOUNDARY_SHP'),{operation:'geometry_transform'}).enabled,false);
});

test('license view lists source-specific labels without turning verification into legal certainty',()=>{
  const policies=listSourceUsePolicies(registry);
  assert.equal(policies.length,registry.sources.length);
  assert.ok(policies.every(item=>item.labels.personal&&item.labels.commercial&&item.labels.modification));
  assert.ok(policies.every(item=>item.latest_official_verified===undefined));
  assert.equal(evaluateSourceOperation(source('MOLIT_BUILDING_HUB'),{mode:'unknown',operation:'normalize'}).enabled,false);
  assert.equal(evaluateSourceOperation(source('MOLIT_BUILDING_HUB'),{operation:'unknown'}).enabled,false);
});

test('private-copy source requires enforced local context and never grants public nonprofit reuse',()=>{
  const s=source('SEOUL_URBAN_PLAN_GEOJSON');
  assert.equal(evaluateSourceOperation(s,{operation:'map_display'}).enabled,false);
  assert.equal(evaluateSourceOperation(s,{operation:'map_display',runtimeContext:'PUBLIC'}).enabled,false);
  assert.equal(evaluateSourceOperation(s,{operation:'map_display',runtimeContext:'LOCAL_PRIVATE'}).enabled,true);
  assert.equal(evaluateSourceOperation(s,{mode:'COMMERCIAL',operation:'map_display',runtimeContext:'LOCAL_PRIVATE'}).enabled,false);
  assert.equal(evaluateSourceOperation(s,{operation:'redistribute',runtimeContext:'LOCAL_PRIVATE'}).enabled,false);
  const bulk=evaluateSourceOperation(s,{operation:'bulk_collect',runtimeContext:'LOCAL_PRIVATE'});
  assert.equal(bulk.prohibited,true);
  assert.doesNotMatch(bulk.reason,/제공기관 정책/);
  assert.equal(evaluateSourceOperation(s,{operation:'geometry_transform',runtimeContext:'LOCAL_PRIVATE'}).enabled,false);
  assert.equal(evaluateSourceOperation(s,{mode:'COMMERCIAL',operation:'view_original',runtimeContext:'PUBLIC'}).enabled,true);
  assert.match(getSourceUsePolicy(s).labels.personal,/사적 이용/);
  assert.match(getSourceUsePolicy(s).legal_basis,/NOT_PROVIDER_LICENSE/);
});

test('local private context cannot override known no-derivatives or an unreviewed source',()=>{
  assert.equal(evaluateSourceOperation(source('SEOUL_OPEN_BOUNDARY_SHP'),{operation:'geometry_transform',runtimeContext:'LOCAL_PRIVATE'}).status,'no_derivatives');
  assert.equal(evaluateSourceOperation(source('VWORLD_WFS_WMS'),{operation:'map_display',runtimeContext:'LOCAL_PRIVATE'}).enabled,false);
  const mixed=evaluateDerivedSourceUse([source('SEOUL_URBAN_PLAN_GEOJSON'),source('OSM_STANDARD_TILES')],{operation:'map_display',runtimeContext:'PUBLIC'});
  assert.equal(mixed.enabled,false);
  assert.equal(evaluateDerivedSourceUse([source('SEOUL_URBAN_PLAN_GEOJSON'),source('OSM_STANDARD_TILES')],{operation:'map_display',runtimeContext:'LOCAL_PRIVATE'}).enabled,true);
});
