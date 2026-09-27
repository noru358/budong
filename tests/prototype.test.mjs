import test from "node:test";
import assert from "node:assert/strict";
import { PROJECTS, INVESTMENT_CASES, searchProjects, computeInvestmentCase, xirr } from "../src/prototype.mjs";

test("fixture counts satisfy Gate 1",()=>{ assert.equal(PROJECTS.length,10); assert.equal(INVESTMENT_CASES.length,20); });
test("canonical exact ranks first",()=>{ const r=searchProjects(PROJECTS,"성수예시1구역"); assert.equal(r[0].project.id,"fx-p01"); assert.equal(r[0].tier,"canonical_exact"); });
test("alias exact works",()=>{ const r=searchProjects(PROJECTS,"성수샘플1"); assert.equal(r[0].project.id,"fx-p01"); });
test("prefix/substring works",()=>{ assert.equal(searchProjects(PROJECTS,"상도")[0].project.id,"fx-p02"); assert.equal(searchProjects(PROJECTS,"예시3")[0].project.id,"fx-p03"); });
test("address/station works",()=>{ assert.equal(searchProjects(PROJECTS,"서울 성동구")[0].project.id,"fx-p01"); assert.equal(searchProjects(PROJECTS,"오목교역")[0].project.id,"fx-p07"); });
test("fuzzy typo works",()=>{ assert.equal(searchProjects(PROJECTS,"성수예시1구억")[0].project.id,"fx-p01"); });

test("finance separates four concepts",()=>{
  const r=computeInvestmentCase(INVESTMENT_CASES[0]);
  assert.equal(r.status,"OK");
  const m=r.metrics;
  assert.ok(m.initial_equity_required>0);
  assert.ok(m.future_additional_equity>0);
  assert.ok(m.peak_cumulative_equity>=m.initial_equity_required);
  assert.ok(m.total_economic_cost>m.peak_cumulative_equity);
});
test("paid contribution is not double counted",()=>{
  const a=structuredClone(INVESTMENT_CASES[0]), b=structuredClone(a); b.paid_contribution+=500000000;
  assert.equal(computeInvestmentCase(a).metrics.total_economic_cost,computeInvestmentCase(b).metrics.total_economic_cost);
});
test("deposit and loan are financing, not economic cost",()=>{
  const a=structuredClone(INVESTMENT_CASES[0]), b=structuredClone(a); b.existing_deposit_assumed+=100000000; b.initial_loan_draw+=100000000;
  assert.equal(computeInvestmentCase(a).metrics.total_economic_cost,computeInvestmentCase(b).metrics.total_economic_cost);
  assert.ok(computeInvestmentCase(b).metrics.initial_equity_required<computeInvestmentCase(a).metrics.initial_equity_required);
});
test("unknown fails closed",()=>{
  const a=structuredClone(INVESTMENT_CASES[0]); a.contract_price=null;
  assert.equal(computeInvestmentCase(a).status,"NEEDS_REVIEW");
  assert.equal(computeInvestmentCase(a).metrics,null);
});
test("xirr requires dated negative and positive flows",()=>{ assert.equal(xirr([{date:"2026-01-01",amount:-1}]),null); });
test("all fixture cases calculate",()=>{ for (const c of INVESTMENT_CASES) { const r=computeInvestmentCase(c); assert.equal(r.status,"OK"); assert.ok(r.metrics.moic>0); assert.ok(Number.isFinite(r.metrics.xirr)); } });
