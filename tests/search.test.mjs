import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {normalizeText, prepareSearchProjects, searchProjects} from "../src/search.mjs";

const seed = JSON.parse(fs.readFileSync(new URL("../data/seoul_seed_v1.json", import.meta.url), "utf8"));
const projects = prepareSearchProjects(seed.projects);

test("real preparation preserves all 44 official names, stages and observation dates without mutating the seed", () => {
  const before = JSON.stringify(seed.projects);
  const prepared = prepareSearchProjects(seed.projects);
  assert.equal(prepared.length, 44);
  for (let i = 0; i < prepared.length; i++) {
    assert.equal(prepared[i].canonical_name, seed.projects[i].canonical_name);
    assert.equal(prepared[i].current_stage_name_official, seed.projects[i].current_stage_official_raw);
    assert.equal(prepared[i].project_type_name_official, seed.projects[i].project_type_official_raw);
    assert.equal(prepared[i].stage_snapshot_at, seed.projects[i].stage_snapshot_at);
    assert.equal(prepared[i].station_search_status, "NOT_CONNECTED");
    assert.deepEqual(prepared[i].station_tokens, []);
  }
  assert.equal(JSON.stringify(seed.projects), before);
});

test("real canonical exact outranks derived names and tolerates Unicode and spacing", () => {
  const p = projects.find(p => p.id === "seoul-11590-02");
  const q = p.canonical_name.normalize("NFD").replace(/ /g, "  ");
  const result = searchProjects(projects, q);
  assert.equal(result[0].project.id, p.id);
  assert.equal(result[0].tier, "canonical_exact");
  assert.equal(normalizeText("개포·경남(통합)"), "개포 경남 통합");
});

test("safe actual abbreviations retain their derivation rather than asserting sourced aliases", () => {
  for (const [q, id] of [["상도 15", "seoul-11590-02"], ["잠실5", "seoul-11710-01"]]) {
    const result = searchProjects(projects, q);
    assert.equal(result[0].project.id, id);
    assert.equal(result[0].tier, "alias_exact");
    assert.equal(result[0].match_origin, "DERIVED_CANONICAL_NAME");
    assert.match(result[0].match_explanation, /공식 명칭에서 축약/);
    assert.equal(result.length, 1);
  }
});

test("prefix and substring find actual project names", () => {
  assert.equal(searchProjects(projects, "상도")[0].tier, "canonical_prefix");
  assert.ok(searchProjects(projects, "삼익맨숀").some(r => r.project.id === "seoul-11710-03" && r.tier === "canonical_substring"));
});

test("real address exact, spacing and lot hyphens remain meaningful", () => {
  const result = searchProjects(projects, "신정동311");
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, "seoul-11470-01");
  assert.equal(result[0].tier, "address_exact");
  assert.equal(result[0].matched, "신정동 311");
  assert.equal(searchProjects(projects, "일원동615-1")[0].project.id, "seoul-11680-06");
  assert.deepEqual(searchProjects(projects, "일원동6151"), []);
});

test("actual project-name typo is useful but does not confuse district numbers", () => {
  const result = searchProjects(projects, "상도15구억");
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, "seoul-11590-02");
  assert.equal(result[0].tier, "alias_fuzzy");
  assert.match(result[0].match_explanation, /유사한 이름/);
  assert.deepEqual(searchProjects(projects, "상도51구억"), []);
});

test("unknown stations and similar addresses do not produce inferred matches", () => {
  assert.deepEqual(searchProjects(projects, "잠실역"), []);
  assert.deepEqual(searchProjects(projects, "신정동 313"), []);
  assert.deepEqual(searchProjects(projects, "신졍동311"), []);
  // A station name literally present in the official project name is valid,
  // but is explained as a name match rather than an inferred nearby station.
  assert.equal(searchProjects(projects, "광흥창역")[0].tier, "canonical_prefix");
});

test("curated alias and station terms require review and source provenance", () => {
  const prepared = prepareSearchProjects(seed.projects, [
    {project_id:"seoul-11710-01", term:"검토전별칭", kind:"ALIAS", review_status:"NEEDS_REVIEW", source_locator:"https://example.invalid/review"},
    {project_id:"seoul-11710-01", term:"근거없는별칭", kind:"ALIAS", review_status:"REVIEWED"},
    {project_id:"seoul-11710-01", term:"검증역", kind:"STATION", review_status:"REVIEWED", source_locator:"https://example.invalid/test-fixture"}
  ]);
  assert.deepEqual(searchProjects(prepared, "검토전별칭"), []);
  assert.deepEqual(searchProjects(prepared, "근거없는별칭"), []);
  const station = searchProjects(prepared, "검증역")[0];
  assert.equal(station.tier, "station_exact");
  assert.equal(station.project.station_search_status, "SOURCE_CONNECTED");
  assert.equal(station.match_origin, "REVIEWED_SOURCE");
});

test("empty input, result limits and stable ambiguous queries are handled", () => {
  assert.deepEqual(searchProjects(projects, "  ()  "), []);
  assert.deepEqual(searchProjects(projects, "상도", 0), []);
  assert.equal(searchProjects(projects, "서울", 3).length, 3);
  assert.deepEqual(searchProjects(projects, "상도"), searchProjects(projects, "상도"));
});
