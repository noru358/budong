// Personal V1 ledger: all amounts are KRW; loans/deposits are liabilities,
// and an explicit dated exit repays them. Unknown inputs never become zero.
import { xirr as prototypeXirr } from './prototype.mjs';

const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
  && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const issue = (field, message) => ({ field, message });

export function validateInvestmentCase(c) {
  const issues = [];
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    return { valid: false, issues: [issue('case', '물건 입력을 확인해주세요.')] };
  }
  const amount = (field, value) => {
    if (!isAmount(value)) issues.push(issue(field, '확인된 0 이상의 금액을 입력해주세요.'));
  };
  const date = (field, value) => {
    if (!isDate(value)) issues.push(issue(field, '실제 달력에 존재하는 날짜를 YYYY-MM-DD로 입력해주세요.'));
  };
  date('acquisition_date', c.acquisition_date);
  for (const field of ['contract_price', 'acquisition_incidental_cost', 'existing_deposit_assumed', 'initial_loan_draw']) amount(field, c[field]);
  if (c.paid_contribution != null) amount('paid_contribution', c.paid_contribution);
  if (c.available_cash != null) amount('available_cash', c.available_cash);
  if ([c.contract_price, c.acquisition_incidental_cost, c.existing_deposit_assumed, c.initial_loan_draw].every(isAmount)
    && c.existing_deposit_assumed + c.initial_loan_draw > c.contract_price + c.acquisition_incidental_cost) {
    issues.push(issue('initial_loan_draw', '보증금과 초기 대출의 합이 매입가격·취득비용을 초과합니다.'));
  }
  if (!Array.isArray(c.future_events)) issues.push(issue('future_events', '향후 지급 일정을 입력해주세요. 일정이 없으면 빈 목록으로 명시해주세요.'));
  for (const [i, event] of (Array.isArray(c.future_events) ? c.future_events : []).entries()) {
    const field = `future_events[${i}]`;
    if (!event || typeof event !== 'object') { issues.push(issue(field, '지급 일정 입력을 확인해주세요.')); continue; }
    date(`${field}.date`, event.date);
    amount(`${field}.amount`, event.amount);
    amount(`${field}.loan_funded`, event.loan_funded);
    if (typeof event.kind !== 'string' || !event.kind.trim()) issues.push(issue(`${field}.kind`, '지급 항목을 입력해주세요.'));
    if (isAmount(event.amount) && isAmount(event.loan_funded) && event.loan_funded > event.amount) issues.push(issue(`${field}.loan_funded`, '대출 충당액이 해당 지급액을 초과합니다.'));
    if (isDate(event.date) && isDate(c.acquisition_date) && event.date < c.acquisition_date) issues.push(issue(`${field}.date`, '향후 지급일이 취득일보다 빠릅니다.'));
  }
  if (!c.exit || typeof c.exit !== 'object' || Array.isArray(c.exit)) {
    issues.push(issue('exit', '매도일·가격·비용·대출 및 보증금 상환을 확인해야 손익을 계산할 수 있습니다.'));
  } else {
    date('exit.date', c.exit.date);
    for (const field of ['price', 'selling_cost', 'debt_repayment', 'deposit_repayment']) amount(`exit.${field}`, c.exit[field]);
    if (isDate(c.exit.date) && isDate(c.acquisition_date) && c.exit.date <= c.acquisition_date) issues.push(issue('exit.date', '매도일은 취득일 이후여야 합니다.'));
    for (const [i, event] of (Array.isArray(c.future_events) ? c.future_events : []).entries()) {
      if (isDate(event?.date) && isDate(c.exit.date) && event.date > c.exit.date) issues.push(issue(`future_events[${i}].date`, '지급일이 매도일 이후입니다.'));
    }
    if (isAmount(c.initial_loan_draw) && Array.isArray(c.future_events) && c.future_events.every(e => isAmount(e?.loan_funded)) && isAmount(c.exit.debt_repayment)) {
      const debt = c.initial_loan_draw + c.future_events.reduce((sum, e) => sum + e.loan_funded, 0);
      if (Math.abs(c.exit.debt_repayment - debt) > 0.01) issues.push(issue('exit.debt_repayment', '매도 시 대출상환액은 초기·향후 대출 합계와 일치해야 합니다. 중도상환은 현재 입력 형식에서 지원하지 않습니다.'));
    }
    if (isAmount(c.existing_deposit_assumed) && isAmount(c.exit.deposit_repayment)
      && Math.abs(c.exit.deposit_repayment - c.existing_deposit_assumed) > 0.01) issues.push(issue('exit.deposit_repayment', '매도 시 보증금 반환액은 승계한 보증금과 일치해야 합니다. 중간 반환은 현재 입력 형식에서 지원하지 않습니다.'));
  }
  return { valid: issues.length === 0, issues };
}

export function xirr(cashflows) {
  if (!Array.isArray(cashflows) || cashflows.some(cf => !isDate(cf?.date) || !Number.isFinite(cf?.amount))) return null;
  if (new Set(cashflows.map(cf => cf.date)).size < 2) return null;
  return prototypeXirr(cashflows);
}

const labels = { REMAINING_CONTRIBUTION: '잔여 분담금', FINANCING_COST: '금융비용', OTHER_COST: '기타 비용' };
export function computeInvestmentCase(c) {
  const validation = validateInvestmentCase(c);
  if (!validation.valid) return { status: 'NEEDS_REVIEW', issues: validation.issues, metrics: null, cashflows: [], timeline: [] };
  const initial = c.contract_price + c.acquisition_incidental_cost - c.existing_deposit_assumed - c.initial_loan_draw;
  const events = c.future_events.map((e, index) => ({ ...e, index })).sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  const exitNet = c.exit.price - c.exit.selling_cost - c.exit.debt_repayment - c.exit.deposit_repayment;
  const entries = [
    { date: c.acquisition_date, kind: 'ACQUISITION', label: '취득', cashflow: -initial },
    ...events.map(e => ({ date: e.date, kind: e.kind, label: labels[e.kind] || e.kind, cashflow: -(e.amount - e.loan_funded) })),
    { date: c.exit.date, kind: 'EXIT', label: '매도·부채 상환', cashflow: exitNet }
  ];
  let cumulative = 0, peak = 0, fundingGapDate = null;
  const available = c.available_cash == null ? null : c.available_cash;
  const timeline = entries.map(entry => {
    cumulative -= entry.cashflow;
    peak = Math.max(peak, cumulative);
    const remaining = available == null ? null : available - cumulative;
    if (remaining != null && remaining < -0.01 && fundingGapDate == null) fundingGapDate = entry.date;
    return { ...entry, equity_required: Math.max(0, -entry.cashflow), cumulative_equity: cumulative, available_cash_remaining: remaining };
  });
  const cashflows = timeline.map(e => ({ date: e.date, amount: e.cashflow }));
  const invested = timeline.reduce((sum, e) => sum + e.equity_required, 0);
  const returned = timeline.reduce((sum, e) => sum + Math.max(0, e.cashflow), 0);
  const totalEconomic = c.contract_price + c.acquisition_incidental_cost + events.reduce((sum, e) => sum + e.amount, 0) + c.exit.selling_cost;
  return {
    status: 'OK', issues: [], cashflows, timeline,
    metrics: {
      initial_equity_required: initial,
      future_additional_equity: invested - initial,
      peak_cumulative_equity: peak,
      total_economic_cost: totalEconomic,
      pretax_profit: c.exit.price - totalEconomic,
      moic: invested > 0 ? returned / invested : null,
      xirr: xirr(cashflows),
      break_even_exit_price: totalEconomic,
      funding_gap_date: fundingGapDate
    }
  };
}

export const DEFAULT_SCENARIOS = Object.freeze([
  { id: 'base', label: '기준', contribution_multiplier: 1, financing_cost_multiplier: 1, exit_price_multiplier: 1, exit_delay_months: 0 },
  { id: 'optimistic', label: '낙관 가정', contribution_multiplier: 0.9, financing_cost_multiplier: 0.8, exit_price_multiplier: 1.1, exit_delay_months: -6 },
  { id: 'conservative', label: '보수 가정', contribution_multiplier: 1.1, financing_cost_multiplier: 1.2, exit_price_multiplier: 0.9, exit_delay_months: 12 }
].map(scenario => Object.freeze(scenario)));

function shiftMonths(date, months) {
  const d = new Date(date + 'T00:00:00Z'), day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

// Delays change the exit date only. Financing costs are explicit amounts,
// scaled independently; this does not invent an interest rate or new loan.
export function compareScenarios(c, assumptions = DEFAULT_SCENARIOS) {
  const validation = validateInvestmentCase(c);
  if (!validation.valid) return { status: 'NEEDS_REVIEW', issues: validation.issues, scenarios: [] };
  if (!Array.isArray(assumptions) || assumptions.length === 0) return { status: 'NEEDS_REVIEW', issues: [issue('scenarios', '시나리오 가정을 입력해주세요.')], scenarios: [] };
  const scenarios = assumptions.map((input, index) => {
    const settings = { contribution_multiplier: 1, financing_cost_multiplier: 1, exit_price_multiplier: 1, exit_delay_months: 0, ...input };
    const issues = [];
    for (const field of ['contribution_multiplier', 'financing_cost_multiplier', 'exit_price_multiplier']) if (!isAmount(settings[field])) issues.push(issue(field, '배율은 0 이상의 숫자여야 합니다.'));
    if (!Number.isInteger(settings.exit_delay_months) || Math.abs(settings.exit_delay_months) > 1200) issues.push(issue('exit_delay_months', '매도시점 변화는 -1200~1200 사이 정수 개월로 입력해주세요.'));
    const id = settings.id || `scenario-${index + 1}`, label = settings.label || `시나리오 ${index + 1}`;
    if (issues.length) return { id, label, assumptions: settings, result: { status: 'NEEDS_REVIEW', issues, metrics: null, cashflows: [], timeline: [] } };
    const changed = structuredClone(c);
    changed.future_events = changed.future_events.map(e => {
      const multiplier = e.kind === 'REMAINING_CONTRIBUTION' ? settings.contribution_multiplier : e.kind === 'FINANCING_COST' ? settings.financing_cost_multiplier : 1;
      return { ...e, amount: Math.round(e.amount * multiplier), loan_funded: Math.round(e.loan_funded * multiplier) };
    });
    changed.exit.price = Math.round(changed.exit.price * settings.exit_price_multiplier);
    changed.exit.date = shiftMonths(changed.exit.date, settings.exit_delay_months);
    changed.exit.debt_repayment = changed.initial_loan_draw + changed.future_events.reduce((sum, e) => sum + e.loan_funded, 0);
    return { id, label, assumptions: settings, result: computeInvestmentCase(changed) };
  });
  return { status: scenarios.every(s => s.result.status === 'OK') ? 'OK' : 'NEEDS_REVIEW', issues: [], scenarios };
}
