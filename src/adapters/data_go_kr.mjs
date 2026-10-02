import {requireSecret, assertNoSecretLikeFields} from "./contracts.mjs";
import {environmentFetch} from "../http_transport.mjs";

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
// The portal offers both Encoding and Decoding keys. Decode the former once;
// URLSearchParams then applies the single transport encoding (literal + stays +).
export function normalizeServiceKey(value){
  const key=requireSecret({DATA_GO_KR_SERVICE_KEY:value},"DATA_GO_KR_SERVICE_KEY");
  if(!/%[0-9a-f]{2}/i.test(key)) return key;
  try{return decodeURIComponent(key);}catch{throw new Error("Invalid DATA_GO_KR_SERVICE_KEY encoding");}
}
export function extractServiceKeyCandidates(value){
  const raw=String(value??"").trim();
  if(!raw) throw new Error("Missing DATA_GO_KR_SERVICE_KEY");

  // A normal single-token secret should work as-is, regardless of length.
  // Length filtering is only for pasted multi-line portal blocks.
  if(!/\s/.test(raw)) return [normalizeServiceKey(raw)];

  const pieces=[];
  // data.go.kr general keys are long opaque URL/base64-like tokens.
  // Extract only token-shaped candidates from pasted blocks; never persist/log values.
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
function keyFrom(env){return extractServiceKeyCandidates(requireSecret(env,"DATA_GO_KR_SERVICE_KEY"))[0];}

export function sanitizeApiError(error,{env=process.env}={}){
  let message=String(error?.message??error??"Unknown API error");
  const supplied=typeof env?.DATA_GO_KR_SERVICE_KEY==="string"?env.DATA_GO_KR_SERVICE_KEY.trim():"";
  const variants=new Set();
  if(supplied){
    variants.add(supplied);
    try{for(const key of extractServiceKeyCandidates(supplied))variants.add(key);}catch{}
    for(const value of [...variants]){
      variants.add(encodeURIComponent(value));
      variants.add(encodeURIComponent(encodeURIComponent(value)));
    }
  }
  for(const value of [...variants].sort((a,b)=>b.length-a.length)) message=message.split(value).join("[REDACTED]");
  // Provider and fetch messages can echo entire request URLs. Omit them entirely.
  message=message.replace(/https?:\/\/[^\s<>"']+/gi,"[URL REDACTED]")
    .replace(/(?:serviceKey|service%4bey|api_key|token)\s*(?:=|:|%3[dD])\s*[^\s&,<>"']+/gi,"serviceKey=[REDACTED]");
  return message.replace(/[\r\n\t]+/g," ").slice(0,300);
}

function publicEndpoint(endpoint){
  const url=new URL(endpoint);
  if(url.protocol!=="https:"||url.hostname!=="apis.data.go.kr"||url.username||url.password){
    throw new Error("API endpoint must use https://apis.data.go.kr");
  }
  return url;
}

export function buildRtmsUrl({env=process.env,serviceKey=null,endpoint=ENDPOINTS.RTMS_MULTIFAMILY_SALE,lawdCd,dealYmd,pageNo=1,numOfRows=1000}){
  const url=publicEndpoint(endpoint);
  const month=checkCode(dealYmd,6,"DEAL_YMD");
  if(Number(month.slice(4))<1||Number(month.slice(4))>12||Number(month.slice(0,4))<1)throw new Error("DEAL_YMD must be a valid calendar month");
  url.searchParams.set("serviceKey",serviceKey?normalizeServiceKey(serviceKey):keyFrom(env));
  url.searchParams.set("LAWD_CD",checkCode(lawdCd,5,"LAWD_CD"));
  url.searchParams.set("DEAL_YMD",month);
  url.searchParams.set("pageNo",String(positiveInt(pageNo,"pageNo")));
  url.searchParams.set("numOfRows",String(positiveInt(numOfRows,"numOfRows")));
  return url;
}

export function buildBuildingHubUrl({
  env=process.env,serviceKey=null,endpoint=ENDPOINTS.BUILDING_HUB_TITLE,
  sigunguCd,bjdongCd,platGbCd="0",bun,ji="0000",pageNo=1,numOfRows=100
}){
  const url=publicEndpoint(endpoint);
  if(!["0","1","2"].includes(String(platGbCd)))throw new Error("platGbCd must be 0, 1 or 2");
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
const decodeXml=s=>String(s??"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/&#(x[0-9a-f]+|\d+);/gi,(match,n)=>{
    const code=n.toLowerCase().startsWith("x")?parseInt(n.slice(1),16):Number(n);
    return code>=0&&code<=0x10ffff?String.fromCodePoint(code):match;
  })
  .replace(/&(amp|lt|gt|quot|apos);/g,m=>XML_ENTITIES[m]??m).trim();

export class PublicApiError extends Error {
  constructor(service,code,message){
    const safeCode=/^\d{1,3}$/.test(String(code))?String(code):"UNKNOWN";
    super(service+" provider error "+safeCode+": "+message);
    this.name="PublicApiError";
    this.providerCode=safeCode;
    this.category=safeCode==="10"?"INVALID_REQUEST":/^(20|21|22|30|31|32|33)$/.test(safeCode)?"AUTH_OR_ACCESS":"PROVIDER";
  }
}

function assertXmlDocument(text){
  if(/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Unsupported API XML document");
  const clean=text.replace(/<!--([\s\S]*?)-->/g,"").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,"").replace(/<\?[\s\S]*?\?>/g,"").trim();
  const stack=[];
  let roots=0;
  let end=0;
  for(const match of clean.matchAll(/<[^>]*>/g)){
    if(clean.slice(end,match.index).includes("<")) throw new Error("Malformed API XML response");
    if(!stack.length&&clean.slice(end,match.index).trim()) throw new Error("Malformed API XML response");
    const tag=match[0];
    const parsed=tag.match(/^<(\/?)([\w:-]+)(?:\s[^<>]*)?\s*(\/?)>$/);
    if(!parsed)throw new Error("Malformed API XML response");
    const [,closing,name]=parsed;
    if(closing){if(stack.pop()!==name)throw new Error("Malformed API XML response");}
    else{
      if(!stack.length) roots++;
      if(!/\/\s*>$/.test(tag))stack.push(name);
    }
    end=match.index+tag.length;
  }
  if(stack.length||roots!==1||clean.slice(end).trim())throw new Error("Malformed API XML response");
}

function xmlValue(text,tag){return (text.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+tag+">","i"))||[])[1];}

export function throwXmlProviderError(text,{service="data.go.kr",env=process.env}={}){
  assertXmlDocument(String(text??""));
  if(/<cmmMsgHeader(?:\s|>)/i.test(text)){
    const code=decodeXml(xmlValue(text,"returnReasonCode"))||"UNKNOWN";
    const msg=decodeXml(xmlValue(text,"returnAuthMsg")||xmlValue(text,"errMsg"))||"Gateway rejected request";
    throw new PublicApiError(service,code,sanitizeApiError(msg,{env}));
  }
  const code=decodeXml(xmlValue(text,"resultCode"));
  if(!code)throw new Error(service+" missing provider resultCode");
  if(!["000","00","0"].includes(code)){
    throw new PublicApiError(service,code,sanitizeApiError(decodeXml(xmlValue(text,"resultMsg"))||"Provider rejected request",{env}));
  }
}

export function parseFlatXmlItems(xml,{env=process.env,pageNo=1,numOfRows=1000}={}){
  const text=String(xml??"");
  throwXmlProviderError(text,{env});
  if(!/<response(?:\s|>)/i.test(text)||!/<header(?:\s|>)/i.test(text)||!/<body(?:\s|>)/i.test(text))throw new Error("Malformed RTMS response envelope");
  const body=xmlValue(text,"body");
  if(!/<items(?:\s|\/?>)/i.test(body)&&decodeXml(xmlValue(body,"totalCount"))!=="0")throw new Error("RTMS response missing items");
  const items=[];
  const content=xmlValue(body,"items")??"";
  if(content.replace(/<item>[\s\S]*?<\/item>/gi,"").trim())throw new Error("Malformed RTMS items");
  for(const m of content.matchAll(/<item>([\s\S]*?)<\/item>/gi)){
    const row={};
    for(const f of m[1].matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) row[f[1]]=decodeXml(f[2]);
    if(!Object.keys(row).length)throw new Error("Malformed RTMS item");
    items.push(row);
  }
  const total=Number(decodeXml(xmlValue(body,"totalCount")));
  if(!items.length&&total>0&&(pageNo-1)*numOfRows<total)throw new Error("RTMS response reports data but has no items");
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

function throwJsonProviderError(json,{service="data.go.kr",env=process.env}={}){
  const gateway=json?.OpenAPI_ServiceResponse?.cmmMsgHeader??json?.cmmMsgHeader;
  if(gateway){
    throw new PublicApiError(service,String(gateway.returnReasonCode??"UNKNOWN"),
      sanitizeApiError(String(gateway.returnAuthMsg||gateway.errMsg||"Gateway rejected request"),{env}));
  }
  const header=json?.response?.header;
  const code=String(header?.resultCode??"").trim();
  if(code&&!["00","000","0"].includes(code)){
    throw new PublicApiError(service,code,sanitizeApiError(String(header?.resultMsg??"Provider rejected request"),{env}));
  }
}

export function extractBuildingHubItems(json,{env=process.env,pageNo=1,numOfRows=100}={}){
  throwJsonProviderError(json,{service:"Building HUB",env});
  const header=json?.response?.header;
  const code=String(header?.resultCode??"").trim();
  if(!code)throw new Error("Building HUB missing provider resultCode");
  if(!["00","000","0"].includes(code)) throw new PublicApiError("Building HUB",code,sanitizeApiError(String(header?.resultMsg??"Provider rejected request"),{env}));
  const body=json?.response?.body;
  if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Malformed Building HUB body");
  if(!Object.hasOwn(body,"items")&&String(body.totalCount)!=="0")throw new Error("Building HUB response missing items");
  if(body.items!==""&&body.items!=null&&(typeof body.items!=="object"||Array.isArray(body.items)))throw new Error("Malformed Building HUB items");
  const items=body.items?.item;
  if(items==null){
    if(body.items&&typeof body.items==="object"&&Object.keys(body.items).length)throw new Error("Malformed Building HUB items");
    if(Number(body.totalCount)>0&&(pageNo-1)*numOfRows<Number(body.totalCount))throw new Error("Building HUB response reports data but has no items");
    return [];
  }
  const rows=Array.isArray(items)?items:[items];
  if(rows.some(row=>!row||typeof row!=="object"||Array.isArray(row)||!Object.keys(row).length))throw new Error("Malformed Building HUB item");
  return rows;
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
    plat_gb_cd:String(raw.platGbCd??"").trim()||null,
    bun:String(raw.bun||"").trim()||null,
    ji:String(raw.ji||"").trim()||null
  };
  assertNoSecretLikeFields(out);
  return out;
}

async function requestText({url,service,accept,fetchImpl,timeoutMs,env}){
  const ms=positiveInt(timeoutMs,"timeoutMs");
  const ctrl=new AbortController();
  let timer;
  try{
    return await Promise.race([
      (async()=>{
        const res=await fetchImpl(url,{signal:ctrl.signal,headers:{accept}});
        const text=await res.text();
        if(!res.ok){
          try{
            if(text.trimStart().startsWith("<"))throwXmlProviderError(text,{service,env});
            else throwJsonProviderError(JSON.parse(text),{service,env});
          }catch(error){
            if(error instanceof PublicApiError){error.httpStatus=res.status;throw error;}
          }
          throw new Error(service+" HTTP "+res.status);
        }
        return text;
      })(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{
        reject(new Error(service+" timeout after "+ms+"ms"));
        ctrl.abort();
      },ms);})
    ]);
  }catch(err){
    if(err instanceof PublicApiError)throw err;
    throw new Error(sanitizeApiError(err,{env}));
  }finally{clearTimeout(timer);}
}

// Preserve upstream fallback only for an HTTP authentication rejection.
async function requestWithServiceKeyCandidates({env,makeUrl,...options}){
  const keys=extractServiceKeyCandidates(requireSecret(env,"DATA_GO_KR_SERVICE_KEY"));
  for(let i=0;i<keys.length;i++){
    try{return await requestText({...options,env,url:makeUrl(keys[i])});}
    catch(error){
      const rejected=error instanceof PublicApiError&&error.providerCode==="30"&&[401,403].includes(error.httpStatus);
      if(!rejected||i===keys.length-1)throw error;
    }
  }
}

export async function fetchRtmsTrades({env=process.env,fetchImpl=environmentFetch,timeoutMs=20000,...args}){
  try{
    const xml=await requestWithServiceKeyCandidates({makeUrl:key=>buildRtmsUrl({env,...args,serviceKey:key}),service:"RTMS",accept:"application/xml,text/xml;q=0.9,*/*;q=0.1",fetchImpl,timeoutMs,env});
    return parseFlatXmlItems(xml,{env,pageNo:args.pageNo??1,numOfRows:args.numOfRows??1000}).map(raw=>normalizeRtmsTradeItem(raw,{
      sourceId:args.sourceId||"MOLIT_RTMS_MULTIFAMILY_SALE",
      observedAt:args.observedAt||new Date().toISOString()
    }));
  }catch(err){
    if(err instanceof PublicApiError)throw err;
    throw new Error(sanitizeApiError(err,{env}));
  }
}

export async function fetchBuildingTitles({env=process.env,fetchImpl=environmentFetch,timeoutMs=20000,...args}){
  try{
    const text=await requestWithServiceKeyCandidates({makeUrl:key=>buildBuildingHubUrl({env,...args,serviceKey:key,endpoint:args.endpoint||ENDPOINTS.BUILDING_HUB_TITLE}),service:"Building HUB",accept:"application/json,application/xml;q=0.9",fetchImpl,timeoutMs,env});
    if(text.trimStart().startsWith("<")){
      throwXmlProviderError(text,{service:"Building HUB",env});
      throw new Error("Building HUB expected JSON success response; received XML");
    }
    let json;
    try{json=JSON.parse(text);}catch{throw new Error("Malformed Building HUB JSON response");}
    return extractBuildingHubItems(json,{env,pageNo:args.pageNo??1,numOfRows:args.numOfRows??100}).map(raw=>normalizeBuildingTitleItem(raw,{observedAt:args.observedAt||new Date().toISOString()}));
  }catch(err){
    if(err instanceof PublicApiError)throw err;
    throw new Error(sanitizeApiError(err,{env}));
  }
}
