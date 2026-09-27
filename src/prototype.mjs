const DAY_MS = 86400000;

export function normalizeText(value = "") {
  return String(value).normalize("NFC").toLowerCase()
    .replace(/[·ㆍ・]/g, " ")
    .replace(/[()\[\]{}]/g, " ")
    .replace(/[^0-9a-z가-힣\s-]/g, " ")
    .replace(/\s+/g, " ").trim();
}

const compact = (v) => normalizeText(v).replace(/[\s-]/g, "");

export function trigramSimilarity(a, b) {
  const grams = (v) => {
    const s = "  " + compact(v) + "  ";
    const out = new Set();
    for (let i = 0; i <= Math.max(0, s.length - 3); i += 1) out.add(s.slice(i, i + 3));
    return out;
  };
  const aa = grams(a), bb = grams(b);
  let n = 0;
  for (const x of aa) if (bb.has(x)) n += 1;
  return (2 * n) / (aa.size + bb.size || 1);
}

export const STAGES = {
  ZONE_DESIGNATION: { official_name: "정비구역 지정·고시", plain: "정비계획과 구역이 공식 결정·고시된 단계입니다." },
  PROMOTION_COMMITTEE_APPROVAL: { official_name: "조합설립추진위원회 승인", plain: "조합 설립을 준비하는 추진위원회가 관할청 승인을 받은 단계입니다." },
  ASSOCIATION_APPROVAL: { official_name: "조합설립인가", plain: "토지등소유자가 구성한 조합이 관할청 인가를 받은 단계입니다." },
  IMPLEMENTATION_APPROVAL: { official_name: "사업시행계획인가", plain: "구체적인 사업시행계획이 관할청 인가를 받은 단계입니다." },
  MANAGEMENT_DISPOSITION_APPROVAL: { official_name: "관리처분계획인가", plain: "분양·권리가액 등을 정하는 관리처분계획이 관할청 인가를 받은 단계입니다." },
  CONSTRUCTION_START: { official_name: "착공", plain: "정비사업 공사에 착수한 단계입니다." },
  COMPLETION_APPROVAL: { official_name: "준공인가", plain: "공사가 사업시행계획대로 완료되었다고 인가된 단계입니다." },
  OWNERSHIP_TRANSFER_NOTICE: { official_name: "이전고시", plain: "관리처분계획에 따른 대지·건축물 이전 내용이 고시된 단계입니다." }
};

const projectRows = [
  ["성수예시1구역","재개발사업","서울 성동구",37.545,127.055,"ASSOCIATION_APPROVAL","2026-04-17","성수역"],
  ["상도예시2구역","재개발사업","서울 동작구",37.502,126.949,"IMPLEMENTATION_APPROVAL","2026-03-11","상도역"],
  ["청파예시3구역","재개발사업","서울 용산구",37.547,126.967,"ZONE_DESIGNATION","2026-06-02","서울역"],
  ["신림예시4구역","재개발사업","서울 관악구",37.482,126.929,"PROMOTION_COMMITTEE_APPROVAL","2026-08-13","신림역"],
  ["불광예시5구역","재개발사업","서울 은평구",37.612,126.930,"MANAGEMENT_DISPOSITION_APPROVAL","2025-12-22","불광역"],
  ["잠실예시6단지","재건축사업","서울 송파구",37.512,127.088,"ASSOCIATION_APPROVAL","2026-01-30","잠실새내역"],
  ["목동예시7단지","재건축사업","서울 양천구",37.526,126.873,"ZONE_DESIGNATION","2026-05-09","오목교역"],
  ["창동예시8단지","재건축사업","서울 도봉구",37.654,127.047,"IMPLEMENTATION_APPROVAL","2025-11-18","창동역"],
  ["대치예시9단지","재건축사업","서울 강남구",37.499,127.062,"MANAGEMENT_DISPOSITION_APPROVAL","2026-02-20","대치역"],
  ["이문예시10구역","재개발사업","서울 동대문구",37.600,127.067,"CONSTRUCTION_START","2026-07-08","외대앞역"]
];

export const PROJECTS = projectRows.map((r, i) => {
  const id = "fx-p" + String(i + 1).padStart(2, "0");
  const s = STAGES[r[5]];
  return {
    id, fixture:true, canonical_name:r[0], aliases:[r[0].replace("예시","샘플"), r[0].replace(/\d+(구역|단지)$/,"")],
    project_type_name_official:r[1], jurisdiction:r[2], centroid:{lat:r[3],lng:r[4]},
    current_stage_code:r[5], current_stage_name_official:s.official_name,
    current_stage_plain_explanation:s.plain, current_stage_effective_date:r[6],
    verified_at:"2026-09-28", station_tokens:[r[7]], address_tokens:[r[2]],
    boundary_kind:"ANALYSIS_ESTIMATE", certainty:"USER_ASSUMPTION",
    rights_events:[{event_type_code:"MEMBERSHIP_ELIGIBILITY",event_name_official:"조합원 지위·분양자격",status:"NEEDS_REVIEW",note:"fixture에서는 법률결론을 자동 확정하지 않음"}]
  };
});

function scoreTerm(term, q, field) {
  const t = compact(term);
  if (!t || !q) return null;
  if (t === q) return {score:field === "canonical" ? 100 : field === "alias" ? 95 : 90,tier:field + "_exact",matched:term};
  if (t.startsWith(q)) return {score:field === "canonical" ? 82 : 78,tier:field + "_prefix",matched:term};
  if (t.includes(q)) return {score:field === "canonical" ? 68 : 64,tier:field + "_substring",matched:term};
  const sim = trigramSimilarity(t,q);
  return sim >= 0.28 ? {score:40 + sim * 20,tier:field + "_fuzzy",matched:term} : null;
}

export function searchProjects(projects, query, limit = 20) {
  const q = compact(query);
  if (!q) return [];
  return projects.map((p) => {
    const terms = [
      ["canonical",p.canonical_name],
      ...(p.aliases || []).map((x)=>["alias",x]),
      ...(p.address_tokens || []).map((x)=>["address",x]),
      ...(p.station_tokens || []).map((x)=>["station",x])
    ];
    let best = null;
    for (const [field,term] of terms) {
      const s = scoreTerm(term,q,field);
      if (s && (!best || s.score > best.score)) best = s;
    }
    return best ? {project:p,...best} : null;
  }).filter(Boolean).sort((a,b)=>b.score-a.score || a.project.canonical_name.localeCompare(b.project.canonical_name,"ko")).slice(0,limit);
}

const won = (eok) => Math.round(eok * 100000000);
export const INVESTMENT_CASES = Array.from({length:20}, (_,i) => {
  const p=i%10, variant=i<10?0:1, price=5.4+p*0.24+variant*0.35;
  const deposit=1.4+(p%4)*0.15, loan=1.2+(p%3)*0.2, remain=1.0+(p%5)*0.12+variant*0.18, finance=0.22+p*0.015+variant*0.05;
  return {
    id:"fx-c"+String(i+1).padStart(2,"0"), fixture:true, project_id:"fx-p"+String(p+1).padStart(2,"0"),
    label:variant===0?"예시 물건 A":"예시 물건 B", acquisition_date:variant===0?"2026-10-15":"2026-11-15",
    contract_price:won(price), acquisition_incidental_cost:won(price*0.055), existing_deposit_assumed:won(deposit), initial_loan_draw:won(loan),
    paid_contribution:won(0.35+(p%3)*0.1),
    future_events:[
      {date:"2027-06-30",kind:"REMAINING_CONTRIBUTION",amount:won(remain),loan_funded:won(remain*0.35)},
      {date:"2028-06-30",kind:"FINANCING_COST",amount:won(finance),loan_funded:0}
    ],
    exit:{date:"2029-06-30",price:won(price+remain+finance+2.0+(p%3)*0.35),selling_cost:won(0.08),debt_repayment:won(loan+remain*0.35),deposit_repayment:won(deposit)},
    unresolved_items:["권리산정기준일·조합원 지위·분양자격 실제 원문 확인 필요"]
  };
});

const parseDate = (v) => v ? new Date(v + "T00:00:00Z") : null;
function npv(rate, flows) {
  const d0=parseDate(flows[0].date);
  if (!d0 || rate<=-1) return NaN;
  return flows.reduce((s,cf)=>s+cf.amount/Math.pow(1+rate,(parseDate(cf.date)-d0)/DAY_MS/365),0);
}
export function xirr(flows) {
  const xs=(flows||[]).filter((x)=>x && Number.isFinite(x.amount) && parseDate(x.date)).sort((a,b)=>a.date.localeCompare(b.date));
  if (xs.length<2 || !xs.some((x)=>x.amount<0) || !xs.some((x)=>x.amount>0)) return null;
  let lo=-0.9999, hi=10, flo=npv(lo,xs), fhi=npv(hi,xs), n=0;
  while (flo*fhi>0 && n<8) { hi*=2; fhi=npv(hi,xs); n+=1; }
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo*fhi>0) return null;
  for (let i=0;i<160;i+=1) {
    const mid=(lo+hi)/2, fm=npv(mid,xs);
    if (Math.abs(fm)<1e-7) return mid;
    if (flo*fm<=0) hi=mid; else {lo=mid; flo=fm;}
  }
  return (lo+hi)/2;
}

export function computeInvestmentCase(c) {
  const required=["contract_price","acquisition_incidental_cost","existing_deposit_assumed","initial_loan_draw"];
  const issues=[];
  for (const k of required) if (!Number.isFinite(c?.[k])) issues.push(k + ": 확인 필요");
  if (!c?.acquisition_date) issues.push("acquisition_date: 확인 필요");
  for (const [i,e] of (c?.future_events||[]).entries()) {
    if (!e.date || !Number.isFinite(e.amount) || !Number.isFinite(e.loan_funded)) issues.push("future_events[" + i + "]: 확인 필요");
    if (Number.isFinite(e.amount) && Number.isFinite(e.loan_funded) && e.loan_funded>e.amount) issues.push("future_events[" + i + "]: loan_funded 초과");
  }
  if (issues.length) return {status:"NEEDS_REVIEW",issues,metrics:null,cashflows:[]};

  const grossInitial=c.contract_price+c.acquisition_incidental_cost;
  const initialEquity=Math.max(0,grossInitial-c.existing_deposit_assumed-c.initial_loan_draw);
  const events=(c.future_events||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).map((e)=>({...e,equity_required:Math.max(0,e.amount-e.loan_funded)}));
  const futureEquity=events.reduce((s,e)=>s+e.equity_required,0);
  let cum=initialEquity, peak=cum;
  for (const e of events) { cum+=e.equity_required; peak=Math.max(peak,cum); }
  const totalEconomic=c.contract_price+c.acquisition_incidental_cost+events.reduce((s,e)=>s+e.amount,0)+(c.exit?.selling_cost||0);
  const exitNet=c.exit ? c.exit.price-c.exit.selling_cost-c.exit.debt_repayment-c.exit.deposit_repayment : null;
  const cashflows=[{date:c.acquisition_date,amount:-initialEquity},...events.map((e)=>({date:e.date,amount:-e.equity_required}))];
  if (c.exit && Number.isFinite(exitNet)) cashflows.push({date:c.exit.date,amount:exitNet});
  const pretax=c.exit ? c.exit.price-totalEconomic : null;
  const invested=initialEquity+futureEquity;
  return {
    status:"OK",issues,
    metrics:{
      initial_equity_required:initialEquity,
      future_additional_equity:futureEquity,
      peak_cumulative_equity:peak,
      total_economic_cost:totalEconomic,
      pretax_profit:pretax,
      moic:exitNet!=null && invested>0 ? exitNet/invested : null,
      xirr:xirr(cashflows),
      break_even_exit_price:totalEconomic,
      funding_gap_date:null
    },
    cashflows
  };
}
