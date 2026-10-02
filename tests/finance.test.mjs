import test from 'node:test';
import assert from 'node:assert/strict';
import { INVESTMENT_CASES } from '../src/prototype.mjs';
import { validateInvestmentCase, computeInvestmentCase, compareScenarios, xirr } from '../src/finance.mjs';

const example = () => ({
  acquisition_date: '2026-01-01', contract_price: 500, acquisition_incidental_cost: 20,
  existing_deposit_assumed: 100, initial_loan_draw: 200, paid_contribution: 80,
  future_events: [
    { date: '2027-01-01', kind: 'REMAINING_CONTRIBUTION', amount: 100, loan_funded: 40 },
    { date: '2028-01-01', kind: 'FINANCING_COST', amount: 30, loan_funded: 0 }
  ],
  exit: { date: '2029-01-01', price: 800, selling_cost: 10, debt_repayment: 240, deposit_repayment: 100 }
});

test('all existing twenty fixtures remain valid', () => {
  for (const c of INVESTMENT_CASES) {
    assert.equal(validateInvestmentCase(c).valid, true);
    const r = computeInvestmentCase(c);
    assert.equal(r.status, 'OK');
    assert.ok(Number.isFinite(r.metrics.xirr));
  }
});

test('hand-calculated ledger separates equity, costs and liabilities', () => {
  const r = computeInvestmentCase(example());
  assert.deepEqual(r.metrics, {
    initial_equity_required: 220, future_additional_equity: 90, peak_cumulative_equity: 310,
    total_economic_cost: 660, pretax_profit: 140, moic: 450 / 310,
    xirr: r.metrics.xirr, break_even_exit_price: 660, funding_gap_date: null
  });
  assert.deepEqual(r.cashflows.map(e => e.amount), [-220, -60, -30, 450]);
  assert.equal(r.cashflows.reduce((sum, cf) => sum + cf.amount, 0), r.metrics.pretax_profit);
  const c = example(); c.paid_contribution = 10000;
  assert.equal(computeInvestmentCase(c).metrics.total_economic_cost, 660);
});

test('funding gap uses explicitly provided cash and never interprets unknown as zero', () => {
  for (const [cash, expected] of [[0, '2026-01-01'], [250, '2027-01-01'], [290, '2028-01-01'], [310, null]]) {
    const c = example(); c.available_cash = cash;
    assert.equal(computeInvestmentCase(c).metrics.funding_gap_date, expected);
  }
  const c = example(); c.available_cash = null;
  assert.equal(computeInvestmentCase(c).metrics.funding_gap_date, null);
  assert.equal(computeInvestmentCase(c).timeline[0].available_cash_remaining, null);
});

test('missing exit and missing or negative monetary inputs fail closed', () => {
  for (const mutate of [c => { c.exit = null; }, c => { c.exit.selling_cost = null; }, c => { c.contract_price = null; }, c => { c.initial_loan_draw = -1; }, c => { delete c.future_events; }]) {
    const c = example(); mutate(c);
    const r = computeInvestmentCase(c);
    assert.equal(r.status, 'NEEDS_REVIEW');
    assert.equal(r.metrics, null);
    assert.ok(r.issues.length > 0);
  }
});

test('calendar dates and chronology are strict', () => {
  for (const invalid of ['2026-02-30', '2026-13-01', 'tomorrow', '2026-1-1']) {
    const c = example(); c.acquisition_date = invalid;
    assert.equal(computeInvestmentCase(c).status, 'NEEDS_REVIEW');
  }
  const before = example(); before.future_events[0].date = '2025-12-31';
  assert.equal(computeInvestmentCase(before).status, 'NEEDS_REVIEW');
  const after = example(); after.future_events[0].date = '2030-01-01';
  assert.equal(computeInvestmentCase(after).status, 'NEEDS_REVIEW');
  const same = example(); same.exit.date = same.acquisition_date;
  assert.equal(computeInvestmentCase(same).status, 'NEEDS_REVIEW');
});

test('financing cannot exceed cost or leave unsupported unpaid liabilities', () => {
  for (const mutate of [c => { c.initial_loan_draw = 600; }, c => { c.future_events[0].loan_funded = 101; }, c => { c.exit.debt_repayment = 200; }, c => { c.exit.deposit_repayment = 0; }]) {
    const c = example(); mutate(c);
    assert.equal(computeInvestmentCase(c).status, 'NEEDS_REVIEW');
  }
});

test('negative exit proceeds require additional cash and can create the peak and gap', () => {
  const c = example(); c.exit.price = 100; c.available_cash = 400;
  const r = computeInvestmentCase(c);
  assert.equal(r.status, 'OK');
  assert.equal(r.metrics.future_additional_equity, 340);
  assert.equal(r.metrics.peak_cumulative_equity, 560);
  assert.equal(r.metrics.funding_gap_date, '2029-01-01');
  assert.equal(r.metrics.pretax_profit, -560);
  assert.equal(r.metrics.xirr, null);
});

test('XIRR rejects invalid dates and missing signs and solves a dated annual return', () => {
  assert.equal(xirr([{ date: '2026-02-30', amount: -100 }, { date: '2027-01-01', amount: 110 }]), null);
  assert.equal(xirr([{ date: '2026-01-01', amount: -100 }]), null);
  assert.equal(xirr([{ date: '2026-01-01', amount: -100 }, { date: '2026-01-01', amount: 110 }]), null);
  assert.ok(Math.abs(xirr([{ date: '2026-01-01', amount: -100 }, { date: '2027-01-01', amount: 110 }]) - 0.1) < 1e-8);
});

test('scenarios disclose assumptions, preserve original input and balance revised debt', () => {
  const c = example(), original = structuredClone(c);
  const r = compareScenarios(c);
  assert.equal(r.status, 'OK');
  assert.equal(r.scenarios.length, 3);
  assert.deepEqual(c, original);
  assert.equal(r.scenarios[0].result.metrics.pretax_profit, 140);
  assert.equal(r.scenarios[1].result.metrics.pretax_profit, 236);
  assert.equal(r.scenarios[2].result.metrics.pretax_profit, 44);
  assert.equal(r.scenarios[2].result.timeline.at(-1).date, '2030-01-01');
  assert.equal(r.scenarios[2].assumptions.contribution_multiplier, 1.1);
});

test('scenario month shifts clamp month-end and impossible assumptions fail visibly', () => {
  const c = example(); c.exit.date = '2029-01-31';
  const r = compareScenarios(c, [{ exit_delay_months: 1 }]);
  assert.equal(r.scenarios[0].result.timeline.at(-1).date, '2029-02-28');
  for (const settings of [{ exit_delay_months: -48 }, { financing_cost_multiplier: -1 }, { exit_price_multiplier: null }]) {
    const result = compareScenarios(c, [settings]);
    assert.equal(result.status, 'NEEDS_REVIEW');
    assert.equal(result.scenarios[0].result.metrics, null);
  }
});
