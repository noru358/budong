import {normalizeSourceText} from "./core.mjs";

export const CLEANUP_PARSER_ID="SEOUL_CLEANUP_PROJECT_LIST_V1";
const PATH="/cleanup/bsnssttus/lscrMainIndx.do";
const clean=value=>normalizeSourceText(value).replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,number)=>{
  const point=number[0].toLowerCase()==="x"?parseInt(number.slice(1),16):Number(number);
  return point<=0x10ffff?String.fromCodePoint(point):"�";
}).replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();
const attr=(tag,key)=>new RegExp(`\\b${key}\\s*=\\s*(["'])(.*?)\\1`,"i").exec(tag)?.[2];

export function cleanupPageUrl(sensor,{page=1,pageSize=100}={}) {
  const url=new URL(sensor.url);
  if(url.protocol!=="https:"||url.hostname!=="cleanup.seoul.go.kr"||url.pathname!==PATH||url.username||url.password) throw new Error("Unsupported cleanup source URL");
  if(url.searchParams.get("scupBsnsSttus.signguCode")!==String(sensor.district_code)||!sensor.district_name) throw new Error("Cleanup sensor must specify its district code/name");
  if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100) throw new Error("Invalid cleanup pagination request");
  url.searchParams.set("cpage",String(page));url.searchParams.set("pageSize",String(pageSize));
  return url.href;
}

// Fail closed on a changed schema or a 200 OK login/block/error page. The parser
// uses the source's published table and does not execute its javascript links.
export function parseCleanupPage(html,{sensor,url=sensor.url}={}) {
  html=String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi,"");
  const request=new URL(url);
  const selected=[...String(html).matchAll(/<input\b[^>]*>/gi)].find(([tag])=>attr(tag,"name")==="scupBsnsSttus.signguCode");
  if(!selected||attr(selected[0],"value")!==String(sensor.district_code)) throw new Error("Cleanup district filter was not applied");
  const table=[...String(html).matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].find(([value])=>/<caption>\s*사업장 목록 게시판\s*<\/caption>/i.test(value))?.[0];
  if(!table) throw new Error("Cleanup project table missing; source may be blocked or its schema changed");
  const headers=[...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(match=>clean(match[1]));
  const expected=["번호","자치구","사업구분","사업장명","대표지번","진행단계"];
  if(expected.some((heading,index)=>headers[index]!==heading)) throw new Error("Cleanup project table column schema changed");
  const summary=[...String(html).matchAll(/<p\b[^>]*class=["'][^"']*board-list-top-total[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)][0]?.[1];
  const counts=summary?[...summary.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map(match=>clean(match[1]).replace(/,/g,"")):[];
  if(!counts.length||counts.some(value=>!/^\d+$/.test(value))) throw new Error("Cleanup project total missing or invalid");
  const total=counts.reduce((sum,value)=>sum+Number(value),0);
  if(total>10000) throw new Error("Cleanup district total exceeds collection limit");
  const tbody=/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(table)?.[1];
  if(tbody===undefined) throw new Error("Cleanup project table body missing");
  const entries=[];
  for(const row of tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match=>match[1]);
    if(total===0&&cells.length===1&&/없|존재하지/.test(clean(cells[0]))) continue;
    if(cells.length!==10||!/^\d+$/.test(clean(cells[0]))) throw new Error("Cleanup project row schema changed");
    const district=clean(cells[1]);
    if(district!==sensor.district_name) throw new Error("Cleanup returned a project outside the selected district");
    const name=clean(cells[3]);const stage=clean(cells[5]);const type=clean(cells[2]);
    if(!name||!type) throw new Error("Cleanup project row has missing required metadata");
    const cafe=/cafeOpenPopup\(\s*['"]([^'"]+)['"]\s*\)/.exec(cells[9])?.[1]||null;
    entries.push({row_number:Number(clean(cells[0])),project:{
      project_source_key:cafe?`${sensor.district_code}:cafe:${cafe}`:`${sensor.district_code}:name:${name}`,
      canonical_name:name,district_code:String(sensor.district_code),district_name:district,
      project_type_official_raw:type,representative_lot:clean(cells[4]),current_stage_official_raw:stage||null,
      source_id:sensor.source_id,source_locator:url,cafe_id:cafe,certainty:"SOURCE_CONFIRMED",legal_effect_status:"NEEDS_REVIEW"
    }});
  }
  if((total>0&&!entries.length)||entries.length>total) throw new Error("Cleanup project row count is inconsistent with total");
  const paging=/<div\b[^>]*class=["'][^"']*board-paging[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  if(!paging) throw new Error("Cleanup pagination control missing");
  const current=[...paging.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find(match=>/현재 선택된 페이지/.test(attr(match[1],"title")||""));
  if(!current||Number(clean(current[2]))!==Number(request.searchParams.get("cpage")||1)) throw new Error("Cleanup server did not return requested page");
  const pages=[];
  for(const anchor of paging.matchAll(/<a\b([^>]*)>/gi)) {
    const href=attr(anchor[1],"href");if(!href||href.startsWith("#")) continue;
    const target=new URL(href.replace(/&amp;/g,"&"),url);
    if(target.origin!==request.origin||target.pathname!==PATH||target.searchParams.get("scupBsnsSttus.signguCode")!==String(sensor.district_code)) throw new Error("Unsafe or unfiltered cleanup pagination URL");
    const page=Number(target.searchParams.get("cpage"));
    if(!Number.isInteger(page)||page<1||page>1000) throw new Error("Invalid cleanup pagination link");
    pages.push(page);
  }
  return {total,page:Number(request.searchParams.get("cpage")||1),entries,pages:[...new Set(pages)]};
}

export async function collectCleanupProjects({sensor,initialHtml,fetchText,pageSize=100,onPage}={}) {
  const firstUrl=cleanupPageUrl(sensor,{pageSize});
  const first=parseCleanupPage(initialHtml,{sensor,url:firstUrl});
  const queue=[...first.pages].filter(page=>page!==1);const seen=new Set([1]);
  const entries=[...first.entries];const sourcePages=[firstUrl];const rawPaths=[];
  if(onPage) {const saved=await onPage(initialHtml,firstUrl,1);if(saved)rawPaths.push(saved);}
  while(queue.length) {
    const page=queue.shift();if(seen.has(page)) continue;
    if(seen.size>=100) throw new Error("Cleanup collection page limit exceeded");
    const url=cleanupPageUrl(sensor,{page,pageSize});
    const html=await fetchText(url);const parsed=parseCleanupPage(html,{sensor,url});
    if(parsed.total!==first.total) throw new Error("Cleanup total changed during collection; retry a consistent snapshot");
    if(onPage) {const saved=await onPage(html,url,page);if(saved)rawPaths.push(saved);}
    seen.add(page);sourcePages.push(url);entries.push(...parsed.entries);
    for(const next of parsed.pages) if(!seen.has(next))queue.push(next);
  }
  const ordinals=new Set(entries.map(entry=>entry.row_number));
  const keys=new Set(entries.map(entry=>entry.project.project_source_key));
  if(entries.length!==first.total||keys.size!==first.total||
    entries.some(entry=>entry.row_number<1||entry.row_number>first.total)) {
    throw new Error("Cleanup snapshot incomplete or duplicated; previous successful snapshot must be preserved");
  }
  // The live source repeats displayed row numbers on page 2 when pageSize=100
  // (Yeongdeungpo: 122 distinct cafe ids; numbers 122..23 then 112..91).
  // Completeness is proven by the published total and distinct stable project ids,
  // not by this presentation-only counter. Keep the defect visible in reports.
  return {projects:entries.map(entry=>entry.project).sort((a,b)=>a.project_source_key.localeCompare(b.project_source_key)),source_pages:sourcePages,raw_snapshot_paths:rawPaths,total:first.total,page_count:seen.size,
    warnings:ordinals.size===first.total?[]:["SOURCE_DISPLAY_ROW_NUMBERS_REPEAT"]};
}
