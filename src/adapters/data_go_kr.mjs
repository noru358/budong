import {requireSecret, assertNoSecretLikeFields} from "./contracts.mjs";

export const ENDPOINTS=Object.freeze({
  RTMS_MULTIFAMILY_SALE:"https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade",
  RTMS_DETACHED_SALE:"https://apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade",
  RTMS_APT_SALE:"https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
  RTMS_APT_SALE_DETAIL:"https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
  RTMS_APT_RENT:"https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
  BUILDING_HUB_TITLE:"https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo",
  BUILDING_HUB_EXPOSURE:"https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposInfo",
  BUILDING_HUB_EXPOS_PUBUSE_AREA:"https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo",
  BUILDING_HUB_HOUSE_PRICE:"https://apis.data.go.kr/1613000/BldRgstHubService/getBrHsprcInfo",
  BUILDING_HUB_JIJIGU:"https://apis.data.go.kr/1613000/BldRgstHubService/getBrJijiguInfo"
});

function checkCode(value,n,name){
  const s=String(value??"").trim();
  if(!new RegExp("^\\d{"+n+"}$").test(s)) throw new Error(name+" must be "+n+" digits");
  return s;
}
function positiveInt(value,name){
  const n=Number(value);
  if(!Number.isInteger(n)||n<1) throw new Error(name+" must be a positive integer");
  return n;
}

export function normalizeServiceKey(value){
  let s=String(value??"").trim();
  if(!s) throw new Error("Missing DATA_GO_KR_SERVICE_KEY");
  // data.go.kr shows both Encoding and Decoding keys. Accept either, but always
  // hand URLSearchParams the decoded form so the request is encoded exactly once.
  // This prevents %2B/%2F/%3D from becoming %252B/%252F/%253D.
  if(/%(?:2B|2F|3D|25)/i.test(s)){
    try{
      const once=decodeURIComponent(s);
      if(once) s=once;
    }catch{}
  }
  return s;
}
export function extractServiceKeyCandidates(value){
  const raw=String(value??"").trim();
  if(!raw) throw new Error("Missing DATA_GO_KR_SERVICE_KEY");

  const pieces=[];
  // A normal secret is one token. If the user pasted a portal panel/block,
  // do not treat the whole whitespace-containing block as a key.
  if(!/\s/.test(raw)) pieces.push(raw);

  // data.go.kr general keys are long opaque URL/base64-like tokens.
  // Extract only token-shaped candidates; never persist or log their values.
  for(const match of raw.matchAll(/[A-Za-z0-9+%/_=.-]{40,260}/g)){
    pieces.push(match[0]);
  }

  const out=[];
  const seen=new Set();
  for(const piece of pieces){
    const cleaned=piece.replace(/^[\"']|[\"',;]$/g,"");
    let key;
    try{key=normalizeServiceKey(cleaned);}catch{continue}
    if(key.length<40||key.length>220) continue;
    if(/^https?\/\//i.test(key)) continue;
    if(!seen.has(key)){seen.add(key);out.push(key);}
  }
  if(!out.length) throw new Error("No service-key-shaped token found in DATA_GO_KR_SERVICE_KEY");
  return out;
}
function keyFrom(env){
  return extractServiceKeyCandidates(requireSecret(env,"DATA_GO_KR_SERVICE_KEY"))[0];
}

export function buildRtmsUrl({env=process.env,serviceKey=null,endpoint=ENDPOINTS.RTMS_MULTIFAMILY_SALE,lawdCd,dealYmd,pageNo=1,numOfRows=1000}){
  const url=new URL(endpoint);
  url.searchParams.set("serviceKey",serviceKey?normalizeServiceKey(serviceKey):keyFrom(env));
  url.searchParams.set("LAWD_CD",checkCode(lawdCd,5,"LAWD_CD"));
  url.searchParams.set("DEAL_YMD",checkCode(dealYmd,6,"DEAL_YMD"));
  url.searchParams.set("pageNo",String(positiveInt(pageNo,"pageNo")));
  url.searchParams.set("numOfRows",String(positiveInt(numOfRows,"numOfRows")));
  return url;
}

export function buildBuildingHubUrl({
  env=process.env,serviceKey=null,endpoint=ENDPOINTS.BUILDING_HUB_TITLE,
  sigunguCd,bjdongCd,platGbCd="0",bun,ji="0000",pageNo=1,numOfRows=100
}){
  const url=new URL(endpoint);
  url.searchParams.set("serviceKey",serviceKey?normalizeServiceKey(serviceKey):keyFrom(env));
  url.searchParams.set("sigunguCd",checkCode(sigunguCd,5,"sigunguCd"));
  url.searchParams.set("bjdongCd",checkCode(bjdongCd,5,"bjdongCd"));
  url.searchParams.set("platGbCd",String(platGbCd));
  url.searchParams.set("bun",checkCode(bun,4,"bun"));
  url.searchParams.set("ji",checkCode(ji,4,"ji"));
  url.searchParams.set("numOfRows",String(positiveInt(numOfRows,"numOfRows")));
  url.searchParams.set("pageNo",String(positiveInt(pageNo,"pageNo")));
  url.searchParams.set("_type","json");
  return url;
}

const XML_ENTITIES=Object.freeze({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"});
const decodeXml=s=>String(s??"").replace(/&(amp|lt|gt|quot|apos);/g,m=>XML_ENTITIES[m]??m).trim();

export function parseFlatXmlItems(xml){
  const text=String(xml??"");
  const headerCode=(text.match(/<resultCode>([\s\S]*?)<\/resultCode>/i)||[])[1];
  const headerMsg=(text.match(/<resultMsg>([\s\S]*?)<\/resultMsg>/i)||[])[1];
  if(headerCode && !["000","00"].includes(decodeXml(headerCode))){
    throw new Error("data.go.kr error "+decodeXml(headerCode)+": "+decodeXml(headerMsg));
  }
  const items=[];
  for(const m of text.matchAll(/<item>([\s\S]*?)<\/item>/gi)){
    const row={};
    for(const f of m[1].matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) row[f[1]]=decodeXml(f[2]);
    items.push(row);
  }
  return items;
}

const numberOrNull=v=>{
  const s=String(v??"").replace(/,/g,"").trim();
  if(!s) return null;
  const n=Number(s);
  return Number.isFinite(n)?n:null;
};
const isoDate=(y,m,d)=>{
  const yy=Number(y),mm=Number(m),dd=Number(d);
  if(!yy||!mm||!dd)return null;
  return String(yy).padStart(4,"0")+"-"+String(mm).padStart(2,"0")+"-"+String(dd).padStart(2,"0");
};

export function normalizeRtmsTradeItem(raw,{sourceId="MOLIT_RTMS_MULTIFAMILY_SALE",observedAt=new Date().toISOString()}={}){
  const out={
    source_id:sourceId,
    observed_at:observedAt,
    jurisdiction_code:String(raw.sggCd||raw.sggCdNm||"").trim()||null,
    legal_dong:String(raw.umdNm||"").trim()||null,
    jibun:String(raw.jibun||"").trim()||null,
    building_name:String(raw.mhouseNm||raw.aptNm||"").trim()||null,
    deal_date:isoDate(raw.dealYear,raw.dealMonth,raw.dealDay),
    deal_amount_10k_krw:numberOrNull(raw.dealAmount),
    exclusive_area_m2:numberOrNull(raw.excluUseAr),
    land_area_m2:numberOrNull(raw.landAr??raw.plottageAr),
    floor:numberOrNull(raw.floor),
    build_year:numberOrNull(raw.buildYear),
    transaction_type:String(raw.dealingGbn||"").trim()||null,
    cancellation_date:String(raw.cdealDay||"").trim()||null,
    raw_reference:{
      rgstDate:String(raw.rgstDate||"").trim()||null,
      houseType:String(raw.houseType||"").trim()||null
    }
  };
  assertNoSecretLikeFields(out);
  return out;
}

export function extractBuildingHubItems(json){
  const header=json?.response?.header;
  const code=String(header?.resultCode??"").trim();
  if(code && !["00","000"].includes(code)) throw new Error("Building HUB error "+code+": "+String(header?.resultMsg??""));
  const items=json?.response?.body?.items?.item;
  if(items==null)return [];
  return Array.isArray(items)?items:[items];
}

export function normalizeBuildingTitleItem(raw,{observedAt=new Date().toISOString()}={}){
  const out={
    source_id:"MOLIT_BUILDING_HUB",
    observed_at:observedAt,
    mgm_bldrgst_pk:String(raw.mgmBldrgstPk||"").trim()||null,
    regstr_kind:String(raw.regstrKindCdNm||"").trim()||null,
    building_name:String(raw.bldNm||"").trim()||null,
    dong_name:String(raw.dongNm||"").trim()||null,
    plat_plc:String(raw.platPlc||"").trim()||null,
    road_name_address:String(raw.newPlatPlc||"").trim()||null,
    main_purpose:String(raw.mainPurpsCdNm||"").trim()||null,
    structure:String(raw.strctCdNm||"").trim()||null,
    total_area_m2:numberOrNull(raw.totArea),
    gross_floor_area_m2:numberOrNull(raw.vlRatEstmTotArea),
    building_area_m2:numberOrNull(raw.archArea),
    household_count:numberOrNull(raw.hhldCnt),
    use_approval_day:String(raw.useAprDay||"").trim()||null,
    sigungu_cd:String(raw.sigunguCd||"").trim()||null,
    bjdong_cd:String(raw.bjdongCd||"").trim()||null,
    bun:String(raw.bun||"").trim()||null,
    ji:String(raw.ji||"").trim()||null
  };
  assertNoSecretLikeFields(out);
  return out;
}

function sanitizeProviderText(text,secrets){
  let out=String(text??"").slice(0,2500);
  const list=Array.isArray(secrets)?secrets:[secrets];
  const variants=[];
  for(const secret of list.filter(Boolean)){
    let decoded;
    try{decoded=normalizeServiceKey(secret);}catch{decoded=String(secret)}
    variants.push(String(secret),decoded,encodeURIComponent(decoded));
  }
  for(const v of variants.filter(Boolean)) out=out.split(v).join("***");
  out=out.replace(/(serviceKey=)[^&\s<>"']+/gi,"$1***");
  return out.replace(/\s+/g," ").trim();
}

function providerErrorSummary(text){
  const s=String(text??"");
  const fields=["errMsg","returnAuthMsg","returnReasonCode","resultCode","resultMsg"];
  const found=[];
  for(const f of fields){
    const xml=(s.match(new RegExp("<"+f+">([\\s\\S]*?)<\\/"+f+">","i"))||[])[1];
    const json=(s.match(new RegExp('"'+f+'"\\s*:\\s*"([^"]+)"',"i"))||[])[1];
    const value=decodeXml(xml??json??"");
    if(value) found.push(f+"="+value);
  }
  if(found.length) return found.join(", ");
  const compact=sanitizeProviderText(s,"").slice(0,500);
  return compact || "empty response body";
}

function keyRejectedByGateway(status,body){
  if(![401,403].includes(Number(status))) return false;
  const s=String(body??"");
  return /SERVICE_KEY_IS_NOT_REGISTERED_ERROR|등록되지 않은 서비스키|returnReasonCode>30<|returnReasonCode["']?\s*[:=]\s*["']?30/i.test(s);
}

function providerError(label,status,body,secrets){
  const safe=sanitizeProviderText(body,secrets);
  return new Error(label+" HTTP "+status+": "+providerErrorSummary(safe));
}

async function fetchWithServiceKeyCandidates({env,fetchImpl,label,makeUrl,headers}){
  const raw=requireSecret(env,"DATA_GO_KR_SERVICE_KEY");
  const keys=extractServiceKeyCandidates(raw);
  let last=null;
  for(let i=0;i<keys.length;i+=1){
    const url=makeUrl(keys[i]);
    const res=await fetchImpl(url,{headers});
    if(res.ok) return {res,key_index:i,candidate_count:keys.length};
    let body="";
    try{body=await res.text();}catch{}
    last={status:res.status,body};
    if(keyRejectedByGateway(res.status,body) && i<keys.length-1) continue;
    throw providerError(label,res.status,body,[raw,...keys]);
  }
  throw providerError(label,last?.status??0,last?.body??"No response",[raw,...keys]);
}

export async function fetchRtmsTrades({env=process.env,fetchImpl=fetch,...args}){
  const {res}=await fetchWithServiceKeyCandidates({
    env,fetchImpl,label:"RTMS",
    makeUrl:key=>buildRtmsUrl({env,serviceKey:key,...args}),
    headers:{accept:"application/xml,text/xml;q=0.9,*/*;q=0.1"}
  });
  const xml=await res.text();
  return parseFlatXmlItems(xml).map(raw=>normalizeRtmsTradeItem(raw,{
    sourceId:args.sourceId||"MOLIT_RTMS_MULTIFAMILY_SALE",
    observedAt:args.observedAt||new Date().toISOString()
  }));
}

export async function fetchBuildingTitles({env=process.env,fetchImpl=fetch,...args}){
  const {res}=await fetchWithServiceKeyCandidates({
    env,fetchImpl,label:"Building HUB",
    makeUrl:key=>buildBuildingHubUrl({env,serviceKey:key,...args,endpoint:args.endpoint||ENDPOINTS.BUILDING_HUB_TITLE}),
    headers:{accept:"application/json,application/xml;q=0.9,*/*;q=0.1"}
  });
  const contentType=String(res.headers?.get?.("content-type")||"").toLowerCase();
  if(contentType.includes("json")){
    const json=await res.json();
    return extractBuildingHubItems(json).map(raw=>normalizeBuildingTitleItem(raw,{observedAt:args.observedAt||new Date().toISOString()}));
  }
  const text=await res.text();
  if(text.trim().startsWith("{")){
    const json=JSON.parse(text);
    return extractBuildingHubItems(json).map(raw=>normalizeBuildingTitleItem(raw,{observedAt:args.observedAt||new Date().toISOString()}));
  }
  return parseFlatXmlItems(text).map(raw=>normalizeBuildingTitleItem(raw,{observedAt:args.observedAt||new Date().toISOString()}));
}
