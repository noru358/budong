import { prepareSearchProjects, searchProjects } from '../src/search.mjs';
import {
  computeInvestmentCase,
  compareScenarios,
  remainingLiabilities,
} from '../src/finance.mjs';
import { getProjectEvidence, safeSourceUrl } from '../src/legal.mjs';
import {
  INVESTMENT_CASES,
  PROJECTS as FIXTURE_PROJECTS,
} from '../src/prototype.mjs';
import {
  createWorkspaceStore,
  inspectWorkspaceBackup,
} from '../src/storage.mjs';
import {
  listSourceUsePolicies,
  evaluateSourceOperation,
} from '../src/source_policy.mjs';
import { mapWorkspaceHtml, mountMapWorkspace } from './map_workspace.mjs';

const app = document.querySelector('#app'),
  nav = document.querySelector('#nav'),
  notice = document.querySelector('#notice');
const esc = (value = '') =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (x) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        x
      ],
  );
const money = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(
        value / 100000000,
      ) + '억'
    : '확인 필요';
const amount = (value) =>
  Number.isFinite(value) ? String(Math.round((value / 10000) * 100) / 100) : '';
const pct = (value) =>
  Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '확인 필요';
const mul = (value) =>
  Number.isFinite(value) ? value.toFixed(2) + '배' : '확인 필요';
const EMPTY = { version: 1, cases: [], recentProjectIds: [] };
const liveResults = new Map();
let health = null,
  mapCleanup = null,
  explorerScope = 'all',
  mapScope = 'all',
  mapRecords = [],
  mapViewState = null,
  sourceRegistry = { sources: [] },
  backupDraft = null;
let store,
  workspace = EMPTY,
  projects = [],
  deep = new Map(),
  boundaries = null,
  boundaryError = '',
  view = 'home',
  current = '',
  caseId = '',
  compareId = null,
  draft = null,
  query = '',
  district = '',
  projectType = '',
  demo = false;
function message(text, error = false) {
  notice.innerHTML = text
    ? '<div class="note ' + (error ? 'error' : '') + '">' + esc(text) + '</div>'
    : '';
}
function readStorage() {
  try {
    workspace = store.load();
    return true;
  } catch (error) {
    message('저장소: ' + error.message, true);
    return false;
  }
}
function persist(action) {
  try {
    workspace = action();
    return true;
  } catch (error) {
    message(
      '저장하지 못했습니다. 입력한 내용은 화면에 남아 있습니다. ' +
        error.message,
      true,
    );
    return false;
  }
}
const projectBy = (id) => projects.find((p) => p.id === id);
const caseBy = (id) => workspace.cases.find((c) => c.id === id);
const sourceLink = (url, label = '근거 원문 보기') =>
  safeSourceUrl(url)
    ? '<a class="source" href="' +
      esc(safeSourceUrl(url)) +
      '" target="_blank" rel="noopener noreferrer">' +
      esc(label) +
      ' ↗</a>'
    : '<span class="meta">원문 링크 확인 필요</span>';
function go(target, params = {}) {
  const hash =
    '#' +
    target +
    (Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : '');
  if (location.hash !== hash) history.pushState(null, '', hash);
  route();
}
function route() {
  const [target, paramString = ''] = location.hash.slice(1).split('?'),
    params = new URLSearchParams(paramString);
  view = ['home', 'map', 'search', 'detail', 'analysis', 'sources'].includes(
    target,
  )
    ? target
    : 'home';
  current = params.get('project') || current || projects[0]?.id;
  caseId = params.get('case') || '';
  if (caseBy(caseId)) current = caseBy(caseId).project_id;
  demo = params.get('demo') === '1';
  draft = null;
  query = params.has('q') ? params.get('q') : query;
  district = params.get('district') || '';
  projectType = params.get('type') || '';
  if (view === 'detail' && projectBy(current))
    persist(() => store.recordRecent(current));
  render();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}
function projectCard(p) {
  return (
    '<article class="project-card ' +
    (p.id === current ? 'selected' : '') +
    '" data-project-row="' +
    esc(p.id) +
    '"><button class="project-select" data-action="select-project" data-id="' +
    esc(p.id) +
    '" aria-pressed="' +
    (p.id === current) +
    '"><span class="project-row-top"><span class="project-location">' +
    esc(p.jurisdiction?.replace('서울특별시 ', '')) +
    '</span><span class="project-stage">' +
    esc(p.current_stage_name_official) +
    '</span></span><span class="name">' +
    esc(p.canonical_name) +
    '</span><span class="project-row-bottom"><span>' +
    esc(p.representative_lot) +
    '</span><span>' +
    esc(p.project_type_name_official) +
    '</span></span></button><button class="project-open" data-action="project" data-id="' +
    esc(p.id) +
    '" aria-label="' +
    esc(p.canonical_name) +
    ' 구역 상세 보기">' +
    icon('arrow') +
    '</button></article>'
  );
}
function icon(name) {
  const paths = {
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    document: '<path d="M6 3h9l3 3v15H6Zm9 0v4h3M9 11h6m-6 4h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16m6-14v16"/>',
  };
  return (
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    (paths[name] || paths.document) +
    '</svg>'
  );
}
function caseRow(c) {
  const p = projectBy(c.project_id),
    r = computeInvestmentCase(c);
  return (
    '<div class="item-row"><div><strong>' +
    esc(c.label || '이름 없는 물건') +
    '</strong><span class="meta">' +
    esc(p?.canonical_name || '구역 확인 필요') +
    '</span><p class="meta">' +
    (r.metrics
      ? '지금 ' +
        money(r.metrics.initial_equity_required) +
        ' · 최대 ' +
        money(r.metrics.peak_cumulative_equity)
      : '초안 · ' + r.issues.length + '개 입력 확인') +
    '</p></div><button class="secondary" data-action="case" data-id="' +
    esc(c.id) +
    '">이어보기</button></div>'
  );
}
function searchForm(q = '', id = 'search-form') {
  return (
    '<form class="searchbox" id="' +
    id +
    '" role="search"><label class="search-input"><span class="sr-only">구역명 또는 대표지번</span>' +
    icon('search') +
    '<input name="query" aria-label="구역명 또는 대표지번" placeholder="구역명, 주소로 검색" value="' +
    esc(q) +
    '" autocomplete="off"></label><button class="primary" type="submit">검색</button></form>'
  );
}
function home() {
  explore();
}
function search() {
  explore();
}
function explorerPreview(p) {
  if (!p) return '<div class="preview-empty">목록에서 구역을 선택하세요.</div>';
  const model = getProjectEvidence(p, deep.get(p.id)),
    snapshot = model.snapshot;
  return (
    '<div class="preview-header"><span class="eyebrow">선택한 구역</span><span class="pill">' +
    esc(p.project_type_name_official) +
    '</span></div><h2>' +
    esc(p.canonical_name) +
    '</h2><p class="preview-address">' +
    icon('pin') +
    esc(p.jurisdiction?.replace('서울특별시 ', '')) +
    ' · ' +
    esc(p.representative_lot) +
    '</p><div class="preview-stage"><span>포털 표시 단계</span><strong>' +
    esc(snapshot.stage_raw || p.current_stage_name_official) +
    '</strong></div><dl class="preview-meta"><div><dt>관찰일</dt><dd>' +
    esc(snapshot.observed_at || '확인 필요') +
    '</dd></div><div><dt>최신성 검증</dt><dd>확인 필요</dd></div></dl><div class="preview-actions"><button class="primary" data-action="project" data-id="' +
    esc(p.id) +
    '">구역 상세 ' +
    icon('arrow') +
    '</button><button class="secondary" data-action="new-case" data-project="' +
    esc(p.id) +
    '">' +
    icon('plus') +
    ' 내 물건</button></div><p class="preview-source">공식 관찰값 · 개별 권리·분양자격 확인 필요</p><button class="secondary preview-map-link" data-action="toggle-map">' +
    icon('map') +
    ' 지도 열기</button>'
  );
}
function selectExplorerProject(id) {
  const p = projectBy(id);
  if (!p) return;
  current = id;
  const preview = document.querySelector('#selected-project');
  if (preview) preview.innerHTML = explorerPreview(p);
  app.querySelectorAll('[data-project-row]').forEach((row) => {
    const active = row.dataset.projectRow === id;
    row.classList.toggle('selected', active);
    row
      .querySelector('.project-select')
      ?.setAttribute('aria-pressed', String(active));
  });
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  params.set('project', id);
  history.replaceState(null, '', '#' + view + '?' + params);
  if (view === 'map') {
    renderMapList();
    mapCleanup?.focusProject?.(id);
  }
  if (innerWidth < 800 && preview)
    preview.scrollIntoView({
      block: 'nearest',
      behavior: matchMedia('(prefers-reduced-motion:reduce)').matches
        ? 'instant'
        : 'smooth',
    });
}
function explore() {
  const rows = query
    ? searchProjects(projects, query, projects.length)
    : projects.map((project) => ({ project }));
  const visible = rows.filter(
    (r) =>
      (!district || r.project.jurisdiction === district) &&
      (!projectType || r.project.project_type_name_official === projectType) &&
      (explorerScope !== 'recent' ||
        workspace.recentProjectIds.includes(r.project.id)),
  );
  if (visible.length && !visible.some((r) => r.project.id === current))
    current = visible[0].project.id;
  const options = (values, selected, label) =>
    '<option value="">' +
    label +
    '</option>' +
    [...new Set(values)]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map(
        (value) =>
          '<option value="' +
          esc(value) +
          '" ' +
          (value === selected ? 'selected' : '') +
          '>' +
          esc(value.replace('서울특별시 ', '')) +
          '</option>',
      )
      .join('');
  app.innerHTML =
    '<div class="explorer-heading"><div><p class="eyebrow">서울 정비사업</p><h1>' +
    '구역 탐색' +
    '</h1></div><span class="snapshot-caption">포털 관찰 ' +
    esc(projects[0]?.stage_snapshot_at) +
    '</span></div><div class="explorer-toolbar">' +
    searchForm(query) +
    '<label class="filter-select"><span class="sr-only">자치구</span><select name="district" id="search-district" aria-label="자치구" form="search-form">' +
    options(
      projects.map((p) => p.jurisdiction),
      district,
      '전체 자치구',
    ) +
    '</select></label><label class="filter-select"><span class="sr-only">사업유형</span><select name="projectType" id="search-type" aria-label="사업유형" form="search-form">' +
    options(
      projects.map((p) => p.project_type_name_official),
      projectType,
      '전체 사업유형',
    ) +
    '</select></label>' +
    (query || district || projectType
      ? '<button class="quiet-button" data-action="clear-search">초기화</button>'
      : '') +
    '<button class="map-toggle secondary" data-action="toggle-map">' +
    icon('map') +
    '지도 열기' +
    '</button></div><div class="explorer-layout"><section class="explorer-results" aria-label="구역 목록"><div class="list-toolbar"><div class="list-tabs"><button data-action="explorer-scope" data-scope="all" class="' +
    (explorerScope === 'all' ? 'active' : '') +
    '">전체 구역</button><button data-action="explorer-scope" data-scope="recent" class="' +
    (explorerScope === 'recent' ? 'active' : '') +
    '">최근 본 구역</button></div><span class="result-count">' +
    visible.length +
    '개</span></div><div class="project-list">' +
    (visible.length
      ? visible
          .map(
            (r) =>
              projectCard(r.project) +
              (r.match_explanation || r.matched
                ? '<p class="match-reason">' +
                  esc(r.match_explanation || r.matched) +
                  '</p>'
                : ''),
          )
          .join('')
      : '<div class="empty"><strong>' +
        (explorerScope === 'recent'
          ? '최근 본 구역이 없습니다'
          : '검색 결과가 없습니다') +
        '</strong><p>이름 일부나 대표지번으로 검색하거나 선택한 조건을 줄여보세요.</p><button class="secondary" data-action="clear-search">전체 구역 보기</button></div>') +
    '</div><p class="list-footnote">이름·주소·사업단계로 구역을 살펴보세요.</p></section><aside class="explorer-preview" id="selected-project" aria-label="선택 구역 요약">' +
    explorerPreview(visible.length ? projectBy(current) : null) +
    '</aside></div>';
}

function mapSelection(p) {
  if (!p)
    return '<p class="map-selection-empty">구역을 선택하면 위치 연결 상태를 확인할 수 있습니다.</p>';
  const records = mapRecords.filter((r) => r.project_id === p.id);
  return (
    '<div class="map-selection-heading"><span class="eyebrow">선택한 구역</span><strong>' +
    esc(p.canonical_name) +
    '</strong><span class="meta">' +
    esc(p.representative_lot) +
    '</span></div>' +
    '<p class="map-location-state ' +
    (records.length ? 'connected' : '') +
    '">' +
    (records.length
      ? esc([...new Set(records.map((r) => r.label))].join(' · '))
      : '위치 미연결 · 이 구역은 아직 지도에 표시되지 않습니다.') +
    '</p>' +
    '<div class="map-selection-actions"><button class="primary" data-action="project" data-id="' +
    esc(p.id) +
    '">구역 상세</button><button class="secondary" data-action="map-mark" data-id="' +
    esc(p.id) +
    '">참고 위치 지정</button></div>'
  );
}
function renderMapList() {
  const rows = (
    query
      ? searchProjects(projects, query, projects.length).map((r) => r.project)
      : projects
  ).filter(
    (p) =>
      (!district || p.jurisdiction === district) &&
      (!projectType || p.project_type_name_official === projectType),
  );
  const located = new Set(mapRecords.map((r) => r.project_id));
  const visible = rows.filter(
    (p) => mapScope !== 'located' || located.has(p.id),
  );
  document.querySelector('#map-result-count').textContent =
    '표시된 구역 ' + located.size + ' · 전체 ' + projects.length;
  document.querySelectorAll('[data-action="map-scope"]').forEach((b) => {
    b.classList.toggle('active', b.dataset.scope === mapScope);
    b.setAttribute('aria-pressed', String(b.dataset.scope === mapScope));
  });
  document.querySelector('#map-project-list').innerHTML = visible.length
    ? visible
        .map(
          (p) =>
            '<button class="map-project-row ' +
            (current === p.id ? 'selected' : '') +
            '" data-action="select-project" data-id="' +
            esc(p.id) +
            '" aria-pressed="' +
            (current === p.id) +
            '"><span class="map-row-address">' +
            esc(p.jurisdiction.replace('서울특별시 ', '')) +
            ' · ' +
            esc(p.representative_lot) +
            '</span><strong>' +
            esc(p.canonical_name) +
            '</strong><span class="map-row-state ' +
            (located.has(p.id) ? 'connected' : '') +
            '">' +
            (located.has(p.id) ? '지도에 표시됨' : '위치 미연결') +
            '</span></button>',
        )
        .join('')
    : '<div class="map-list-empty"><strong>' +
      (mapScope === 'located'
        ? '표시할 위치가 없습니다'
        : '검색 결과가 없습니다') +
      '</strong><p>' +
      (mapScope === 'located'
        ? '전체 구역에서 선택한 뒤 참고 위치를 지정하거나 검토한 경계를 가져오세요.'
        : '검색어를 줄이거나 탐색 화면에서 조건을 바꿔보세요.') +
      '</p><button class="secondary" data-action="map-scope" data-scope="all">전체 구역 보기</button></div>';
  document.querySelector('#map-selected-project').innerHTML = mapSelection(
    projectBy(current),
  );
}
function map() {
  const filterOptions = (values, selected, label) =>
    '<option value="">' +
    label +
    '</option>' +
    [...new Set(values)]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map(
        (value) =>
          '<option value="' +
          esc(value) +
          '" ' +
          (value === selected ? 'selected' : '') +
          '>' +
          esc(value.replace('서울특별시 ', '')) +
          '</option>',
      )
      .join('');
  app.innerHTML =
    '<div class="map-page-heading"><div><h1>지도</h1><p>위치와 경계를 지도 위에서 살펴보세요.</p></div><button class="secondary" data-action="map-to-list">' +
    icon('back') +
    ' 구역 목록</button></div>' +
    '<div class="map-page-layout"><aside class="map-sidebar" aria-label="지도 구역 선택">' +
    searchForm(query) +
    '<div class="map-sidebar-filters"><select id="search-district" name="district" form="search-form" aria-label="자치구">' +
    filterOptions(
      projects.map((p) => p.jurisdiction),
      district,
      '전체 자치구',
    ) +
    '</select><select id="search-type" name="projectType" form="search-form" aria-label="사업유형">' +
    filterOptions(
      projects.map((p) => p.project_type_name_official),
      projectType,
      '전체 사업유형',
    ) +
    '</select></div><div class="map-list-tabs"><button data-action="map-scope" data-scope="all">전체 구역</button><button data-action="map-scope" data-scope="located">지도에 표시된 구역</button></div><p id="map-result-count" class="map-result-count"></p><div id="map-project-list" class="map-project-list"></div><section id="map-selected-project" class="map-selection" aria-label="선택 구역 위치"></section></aside><div class="map-page-surface">' +
    mapWorkspaceHtml({ projects, selectedId: current }) +
    '</div></div>';
  renderMapList();
  mapCleanup = mountMapWorkspace({
    projects,
    selectedId: current,
    boundaries,
    viewState: mapViewState,
    onSelect: selectExplorerProject,
    onViewChange: (value) => {
      mapViewState = value;
    },
    onData: (records) => {
      mapRecords = records;
      if (view === 'map') renderMapList();
    },
  });
}

function reviewTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    : '확인 필요';
}
function evidenceEvent(e) {
  return (
    '<article class="evidence"><div><h3>' +
    esc(e.event_name_official) +
    '</h3><p class="meta">고시·사건일 ' +
    esc(e.event_date || '확인 필요') +
    (e.notice_number ? ' · ' + esc(e.notice_number) : '') +
    '</p><p class="meta">' +
    esc(e.evidence_label || e.certainty || '확인 필요') +
    '</p>' +
    (e.evidence_reviewed_at
      ? '<p class="meta">고시 정보·본문 재확인일 ' +
        esc(reviewTime(e.evidence_reviewed_at)) +
        ' (한국시간)</p>'
      : '') +
    (e.provenance
      ? '<div class="evidence-provenance"><span>법적 효력일 <strong>' +
        esc(e.provenance.effective_date || '원문 확인 필요') +
        '</strong></span><span>첨부자료 <strong>' +
        (e.provenance.attachments_reviewed
          ? '검토 기록 있음'
          : '추가 검토 필요') +
        '</strong></span></div>'
      : '') +
    (e.correction_of
      ? '<p class="meta">정정 대상 원고시: ' + esc(e.correction_of) + '</p>'
      : '') +
    (e.issues?.length
      ? '<p class="meta">' +
        [
          ...new Set(
            e.issues.map(
              (issue) =>
                ({
                  SOURCE_LOCATOR_MISSING: '원문 링크 확인 필요',
                  UNSAFE_SOURCE_URL: '원문 주소 확인 필요',
                  EVENT_DATE_MISSING: '법적 효력일 확인 필요',
                  NOTICE_NUMBER_MISSING: '고시번호 확인 필요',
                  CORRECTION_TARGET_NEEDS_REVIEW:
                    '정정 대상 원고시 연결 확인 필요',
                })[issue] || '근거 문서의 연결·효력 추가 확인 필요',
            ),
          ),
        ]
          .map(esc)
          .join(' · ') +
        '</p>'
      : '') +
    '</div>' +
    sourceLink(e.source_url) +
    '</article>'
  );
}
function detail() {
  const p = projectBy(current);
  if (!p) {
    app.innerHTML =
      '<div class="empty"><h1>구역을 선택하세요</h1><button class="primary" data-action="navigate" data-view="search">구역 검색</button></div>';
    return;
  }
  const model = getProjectEvidence(p, deep.get(p.id)),
    s = model.snapshot,
    own = workspace.cases.filter((c) => c.project_id === p.id);
  app.innerHTML =
    '<div class="breadcrumb"><button class="quiet-button" data-action="navigate" data-view="home">' +
    icon('back') +
    ' 구역 탐색</button><span>' +
    esc(p.jurisdiction?.replace('서울특별시 ', '')) +
    '</span><span>' +
    esc(p.project_type_name_official) +
    '</span></div><div class="detail-title"><div><h1>' +
    esc(p.canonical_name) +
    '</h1><p class="meta">' +
    icon('pin') +
    esc(p.representative_lot) +
    '</p></div><button class="primary" data-action="new-case" data-project="' +
    esc(p.id) +
    '">' +
    icon('plus') +
    ' 물건 추가</button></div><div class="detail-shortcuts" aria-label="구역 상세 바로가기"><button data-action="section" data-target="project-overview" class="active">사업현황</button><button data-action="section" data-target="legal-evidence">고시·근거</button><button data-action="section" data-target="own-properties">내 물건 <span>' +
    own.length +
    '</span></button><button data-action="section" data-target="reference-data">참고자료</button></div><div class="detail-layout"><div class="detail-main"><section class="detail-section" id="project-overview"><div class="section-heading"><h2>사업현황</h2>' +
    sourceLink(s.source_url, '정보몽땅 원문') +
    '</div><div class="official-stage"><span>포털 표시 단계</span><strong>' +
    esc(s.stage_raw || p.current_stage_name_official) +
    '</strong></div><p class="definition">' +
    esc(
      s.explanation?.plain_explanation ||
        '공식 사업단계의 의미와 다음 절차를 원문으로 확인하세요.',
    ) +
    '</p><dl class="date-list"><div><dt>포털 관찰일</dt><dd>' +
    esc(s.observed_at || '확인 필요') +
    '</dd></div><div><dt>현재단계 법적 효력일</dt><dd>원문 확인 필요</dd></div><div><dt>현재단계 최신성 검증</dt><dd>확인 필요</dd></div></dl><p class="evidence-disclaimer">현재단계 표시 ≠ 자동으로 법적 효력일. 개별 고시의 재확인이 현재단계 최신성·첨부자료 전체 검토·개별 물건의 권리 확인을 뜻하지 않습니다.</p></section><section class="detail-section" id="legal-evidence"><div class="section-heading"><h2>고시·공식 근거</h2><span class="meta">등록 이력 ' +
    model.legal_events.length +
    '건</span></div>' +
    (model.legal_events.length
      ? model.legal_events.map(evidenceEvent).join('')
      : '<div class="empty compact">확인한 원문 이력이 아직 연결되지 않았습니다. 날짜를 추정하지 않습니다.</div>') +
    (model.policy_events.length
      ? '<h3 class="subsection-title">정책·행정 절차</h3>' +
        model.policy_events.map(evidenceEvent).join('')
      : '') +
    (model.governance_events.length
      ? '<h3 class="subsection-title">사업시행 방식·시행자</h3>' +
        model.governance_events
          .map(
            (e) =>
              '<article class="evidence"><div><h3>' +
              esc(e.event_name_official) +
              '</h3><p>' +
              esc(e.actor_name) +
              '</p><p class="meta">' +
              esc(e.evidence_label || e.legal_effect_status || '확인 필요') +
              '</p></div>' +
              sourceLink(e.source_url) +
              '</article>',
          )
          .join('')
      : '') +
    '</section><section class="detail-section" id="own-properties"><div class="section-heading"><h2>이 구역의 내 물건</h2><span class="meta">사용자 입력·가정</span></div>' +
    (own.length
      ? own.map(caseRow).join('')
      : '<div class="empty compact"><strong>아직 입력한 물건이 없습니다</strong><p>내가 찾은 가격과 자금 일정을 입력하면 필요한 자기자금과 손익을 비교할 수 있습니다.</p><button class="secondary" data-action="new-case-inline" data-project="' +
        esc(p.id) +
        '">첫 물건 입력</button></div>') +
    '</section><section class="detail-section" id="reference-data">' +
    livePanel(p) +
    '</section></div><aside class="detail-aside"><section class="aside-section"><div class="section-heading"><h2 id="rights-review">권리·규제 확인</h2><span class="pill">미확인</span></div>' +
    rightsChecklist(model) +
    '<p class="meta">' +
    esc(model.rights.note || '개별 자료를 확인하세요.') +
    '</p><p class="meta">사업단계만으로 입주권이나 분양자격을 확정하지 않습니다.</p></section>' +
    projectContext(model) +
    '<section class="aside-section"><h2>위치·구역 경계</h2><p class="meta">대표지번은 위치 확인의 참고입니다. 사용자가 연결한 위치·참고 경계와 공식 정비구역 경계는 구분합니다.</p><button class="secondary" data-action="navigate" data-view="map">' +
    icon('map') +
    ' 지도 열기</button></section></aside></div>';
}
function projectContext(model) {
  const context = model.project_context,
    governance = model.governance_summary;
  return (
    (context
      ? '<section class="aside-section"><h2>사업유형</h2><h3>' +
        esc(context.raw || '유형과 절차') +
        '</h3><p class="meta">' +
        esc(context.plain_explanation || '') +
        '</p><details class="plain-details"><summary>절차와 적용 법령</summary><p class="meta">' +
        esc(context.route_note || '') +
        '</p>' +
        (context.source_links || [])
          .map((link) => sourceLink(link.url, link.label))
          .join('') +
        '<p class="meta">일반 법령 안내입니다. 이 구역의 사실이나 개별 물건의 권리를 입증하지 않습니다.</p></details></section>'
      : '') +
    (governance
      ? '<section class="aside-section"><h2>시행방식</h2><p class="meta">' +
        esc(governance.note || '') +
        '</p>' +
        (governance.source_links || [])
          .map((link) => sourceLink(link.url, link.label))
          .join('') +
        '</section>'
      : '')
  );
}
function rightsChecklist(model) {
  const checklist = model.rights?.checklist;
  if (!checklist?.length) return '';
  return (
    '<div class="rights-checklist">' +
    checklist
      .map(
        (item) =>
          '<details class="plain-details"><summary><span>' +
          esc(item.label) +
          '</span><span class="review-label">원문 확인 필요</span></summary><p class="meta">' +
          esc(item.note) +
          '</p></details>',
      )
      .join('') +
    '</div>'
  );
}
function defaultTradeMonth() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === 'year').value),
    month = Number(parts.find((p) => p.type === 'month').value);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return previous.toISOString().slice(0, 7);
}
function livePanel(p) {
  const available = health?.live_data_configured === true,
    parcel = String(p.representative_lot || '').match(
      /(?:^|\s)(산)?\s*(\d+)(?:-(\d+))?\s*$/,
    ),
    bun = parcel?.[2]?.padStart(4, '0') || '',
    ji = (parcel?.[3] || '0').padStart(4, '0');
  return (
    '<div class="section-heading"><h2>주변·필지 참고자료</h2><span class="pill">' +
    (available ? '조회 가능' : '인증키 연결 필요') +
    '</span></div><p class="meta">' +
    (available
      ? '조회 범위와 구역 귀속은 별도로 확인하세요.'
      : '서버에 공공데이터 인증키를 연결하면 조회할 수 있습니다. 내 물건 입력·계산은 지금 사용할 수 있습니다.') +
    '</p><details><summary>주변 주택 실거래</summary><p class="meta">이 구역이 속한 자치구의 월별 거래입니다. 정비구역 내부 거래나 입주권 가격으로 확정하지 않습니다. 최대 20페이지·2,000건을 조회합니다.</p><form id="rtms-form" class="reference-form"><label>거래 유형<select name="serviceType" aria-label="거래 유형"><option value="RH">연립·다세대</option><option value="APT">아파트</option><option value="SH">단독·다가구</option></select></label><label>계약년월<input aria-label="계약년월" type="month" name="month" value="' +
    defaultTradeMonth() +
    '" required></label><button class="primary" ' +
    (available ? '' : 'disabled') +
    '>거래 조회</button></form><div id="rtms-result">' +
    (liveResults.get(p.id + ':rtms') || '') +
    '</div></details><details><summary>대표지번·개별 필지 건축물대장</summary><p class="meta">대표지번에서 본번·부번을 채웠습니다. 조회할 물건의 법정동 코드와 지번을 직접 확인하세요. 대표지번 조회가 개별 매물이나 법적 권리 검증을 뜻하지 않습니다.</p><form id="buildings-form"><div class="form-grid">' +
    field('bjdongCd', '법정동 코드', '', '5자리 코드를 직접 확인', 'text') +
    field('bun', '본번', bun, '4자리', 'text') +
    field('ji', '부번', ji, '부번 없음: 0000', 'text') +
    '<label class="field">대지 구분<select name="platGbCd" aria-label="대지 구분"><option value="0" ' +
    (!parcel?.[1] ? 'selected' : '') +
    '>일반 대지</option><option value="1" ' +
    (parcel?.[1] ? 'selected' : '') +
    '>산</option><option value="2">블록</option></select><small>원문 지번과 대조하세요.</small></label></div><button class="primary" ' +
    (available ? '' : 'disabled') +
    '>건축물 조회</button></form><div id="buildings-result">' +
    (liveResults.get(p.id + ':buildings') || '') +
    '</div></details>'
  );
}
function liveTable(data, type) {
  if (!data.rows?.length)
    return '<div class="note">응답된 자료가 없습니다. 조회 조건과 데이터 제공 범위를 확인하세요. 물건이나 거래가 없다는 법적 결론을 뜻하지 않습니다.</div>';
  const rows = data.rows;
  return (
    '<p class="meta">' +
    (type === 'rtms'
      ? data.request?.service_type === 'SH'
        ? '단독·다가구: 연면적 표시'
        : '아파트·연립·다세대: 전용면적 표시'
      : '필지 건축물대장 참고') +
    '</p><div class="reference-coverage"><strong>' +
    (data.coverage === 'PARTIAL_CAP'
      ? '일부 자료 · 조회 상한 도달'
      : '요청 범위 조회 결과') +
    '</strong><span>' +
    esc(data.reference_label || '주변·필지 참고자료') +
    '</span><p class="meta">조회 ' +
    (data.rows?.length || 0) +
    '건 / 제공 총 ' +
    esc(data.total_count ?? '확인 필요') +
    '건 · ' +
    esc(data.page_count ?? 1) +
    '페이지 · 구역 귀속 검증 아님</p></div><p class="meta">조회 ' +
    esc(data.observed_at) +
    ' · ' +
    rows.length +
    '건 · ' +
    esc(rows[0]?.source_id) +
    '</p><div class="table-wrap"><table><thead><tr>' +
    (type === 'rtms'
      ? '<th>거래일</th><th>법정동·지번</th><th>건물</th><th>금액 (만원)</th><th>면적 (㎡)</th><th>취소 정보</th>'
      : '<th>대지 위치</th><th>건물</th><th>주용도</th><th>연면적 (㎡)</th>') +
    '</tr></thead><tbody>' +
    rows
      .map((r) =>
        type === 'rtms'
          ? '<tr><td>' +
            esc(r.deal_date || '확인 필요') +
            '</td><td>' +
            esc((r.legal_dong || '') + ' ' + (r.jibun || '')) +
            '</td><td>' +
            esc(r.building_name || '미제공') +
            '</td><td>' +
            esc(r.deal_amount_10k_krw ?? '미제공') +
            '</td><td>' +
            esc(
              (data.request?.service_type === 'SH'
                ? r.total_floor_area_m2
                : r.exclusive_area_m2) ?? '미제공',
            ) +
            '</td><td>' +
            esc(r.cancellation_date || '응답에 없음') +
            '</td></tr>'
          : '<tr><td>' +
            esc(r.plat_plc || r.road_name_address || '미제공') +
            '</td><td>' +
            esc(r.building_name || '미제공') +
            '</td><td>' +
            esc(r.main_purpose_name || r.main_purpose || '미제공') +
            '</td><td>' +
            esc(r.total_area_m2 ?? '미제공') +
            '</td></tr>',
      )
      .join('') +
    '</tbody></table></div>'
  );
}
async function queryLive(form, type) {
  const p = projectBy(current);
  if (!p) return;
  const fd = new FormData(form),
    params = new URLSearchParams({ kind: type });
  if (type === 'rtms') {
    params.set('dealYmd', String(fd.get('month')).replace('-', ''));
    params.set('serviceType', String(fd.get('serviceType') || 'RH'));
  } else
    for (const key of ['bjdongCd', 'bun', 'ji', 'platGbCd'])
      params.set(key, String(fd.get(key) || '').trim());
  const target = document.querySelector('#' + type + '-result'),
    button = form.querySelector('button');
  button.disabled = true;
  target.innerHTML =
    '<p class="meta">요청 범위의 공공데이터를 조회하고 있습니다.</p>';
  try {
    const response = await fetch(
      '/api/projects/' + encodeURIComponent(p.id) + '/reference?' + params,
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '조회에 실패했습니다.');
    const html = liveTable(data, type);
    liveResults.set(p.id + ':' + type, html);
    if (document.contains(target)) target.innerHTML = html;
  } catch (error) {
    if (document.contains(target))
      target.innerHTML =
        '<div class="note error">' + esc(error.message) + '</div>';
  } finally {
    button.disabled = false;
  }
}
const FIELD_NAMES = {
  acquisition_date: '취득일',
  contract_price: '매매가',
  acquisition_incidental_cost: '취득 부대비용',
  existing_deposit_assumed: '승계 보증금',
  initial_loan_draw: '초기 대출',
  paid_contribution: '기납부 분담금',
  available_cash: '가용 자기자금',
  'exit.date': '매도일',
  'exit.price': '예상 매도가',
  'exit.selling_cost': '매도 비용',
  'exit.debt_repayment': '대출 원금 상환',
  'exit.deposit_repayment': '보증금 반환',
};
function issueLabel(field) {
  if (FIELD_NAMES[field]) return FIELD_NAMES[field];
  const event = String(field || '').match(
    /^future_events\[(\d+)\](?:\.(\w+))?$/,
  );
  if (event)
    return (
      Number(event[1]) +
      1 +
      '번째 지급 일정' +
      (event[2]
        ? ' · ' +
          ({
            date: '지급일',
            kind: '지급 항목',
            amount: '지급액',
            loan_funded: '대출 충당액',
          }[event[2]] || '입력')
        : '')
    );
  return (
    { exit: '매도 조건', future_events: '향후 지급 일정', case: '물건 입력' }[
      field
    ] || '입력 조건'
  );
}
function issueInputName(field) {
  const event = String(field || '').match(
    /^future_events\[(\d+)\](?:\.(\w+))?$/,
  );
  if (event)
    return (
      'event_' +
      event[1] +
      '_' +
      ({ loan_funded: 'loan' }[event[2]] || event[2] || 'date')
    );
  if (field === 'exit') return 'exit_date';
  return String(field || 'label').replace(/^exit\./, 'exit_');
}
function issuesList(issues) {
  return (
    '<ul>' +
    issues
      .map(
        (i) =>
          '<li><button class="linkbutton" type="button" data-action="focus-field" data-field="' +
          esc(i.field || 'label') +
          '">' +
          esc(issueLabel(i.field)) +
          '</button>: ' +
          esc(i.message || i) +
          '</li>',
      )
      .join('') +
    '</ul>'
  );
}
function focusField(field) {
  const form = document.querySelector('#case-form');
  if (!form) return;
  const input =
    form.elements.namedItem(issueInputName(field)) ||
    form.querySelector('[data-action=add-event]');
  if (input) {
    input.focus({ preventScroll: true });
    input.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
}
function applyValidation(issues) {
  const form = document.querySelector('#case-form');
  if (!form) return;
  form.querySelectorAll('[data-validation-message]').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((input) => {
    input.removeAttribute('aria-invalid');
    const hints = (input.getAttribute('aria-describedby') || '')
      .split(' ')
      .filter((id) => !id.startsWith('input_error_'))
      .join(' ');
    if (hints) input.setAttribute('aria-describedby', hints);
    else input.removeAttribute('aria-describedby');
  });
  issues.forEach((issue, index) => {
    const input = form.elements.namedItem(issueInputName(issue.field));
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    const error = document.createElement('small');
    error.id = 'input_error_' + index;
    error.className = 'field-error';
    error.dataset.validationMessage = 'true';
    error.textContent = issue.message;
    input.insertAdjacentElement('afterend', error);
    input.setAttribute(
      'aria-describedby',
      [input.getAttribute('aria-describedby') || '', error.id]
        .filter(Boolean)
        .join(' '),
    );
  });
}

function metricCards(c, r) {
  const m = r.metrics;
  if (!m)
    return (
      '<div class="note warning"><strong>입력 내용을 확인해야 계산할 수 있습니다.</strong>' +
      issuesList(r.issues) +
      '<p>빈칸을 0으로 계산하지 않았습니다. 확인한 값과 사용자 가정을 입력하거나 초안으로 저장하세요.</p></div>'
    );
  const items = [
    ['지금 필요한 내 돈', money(m.initial_equity_required)],
    ['앞으로 추가로 필요한 돈', money(m.future_additional_equity)],
    ['최대 누적 자기자금', money(m.peak_cumulative_equity)],
    ['전체 매입·사업비용', money(m.total_economic_cost)],
    ['기준 시나리오 세전손익', money(m.pretax_profit)],
    [
      '가장 중요한 미확인사항',
      c.unresolved_items?.[0] || '권리·분양자격 및 입력 근거 확인 필요',
    ],
  ];
  return (
    '<div class="kpis">' +
    items
      .map(
        ([label, value], i) =>
          '<div class="kpi ' +
          (i === 5 ? 'review' : '') +
          '"><span>' +
          label +
          '</span><strong>' +
          esc(value) +
          '</strong></div>',
      )
      .join('') +
    '</div><p class="meta">보증금·대출은 자금 조달로 처리하며 경제적 비용에서 빼지 않습니다. 기납부 분담금은 매매가에 포함된 정보로 기록하고 비용에 다시 더하지 않습니다.</p>'
  );
}
function inputDetails(c) {
  const entries = [
    ['매매가', c.contract_price],
    ['취득 부대비용', c.acquisition_incidental_cost],
    ['승계 보증금', c.existing_deposit_assumed],
    ['초기 대출', c.initial_loan_draw],
    ['기납부 분담금 (매매가 포함·별도 합산 없음)', c.paid_contribution],
    ['가용 자기자금', c.available_cash],
    ['예상 매도가', c.exit?.price],
    ['매도 비용', c.exit?.selling_cost],
  ];
  return (
    '<details><summary>가격 구성·입력 근거·미확인사항</summary><div class="table-wrap"><table><tbody>' +
    entries
      .map(
        ([name, value]) =>
          '<tr><th>' + name + '</th><td>' + money(value) + '</td></tr>',
      )
      .join('') +
    '</tbody></table></div><h3>사용자 입력 근거·가정</h3>' +
    (c.user_assumptions?.length
      ? '<ul>' +
        c.user_assumptions.map((s) => '<li>' + esc(s) + '</li>').join('') +
        '</ul>'
      : '<p class="meta">입력 근거가 기록되지 않았습니다. 가격·비용·일정은 사용자 입력값이며 확인된 공식 사실로 취급하지 않습니다.</p>') +
    '<h3>확인할 사항</h3><ul>' +
    (c.unresolved_items?.length
      ? c.unresolved_items
      : ['권리·분양자격 및 계산 입력 근거 확인 필요']
    )
      .map((s) => '<li>' + esc(s) + '</li>')
      .join('') +
    '</ul></details>'
  );
}
function timeline(r, c) {
  if (!r.metrics) return '';
  return (
    '<details open><summary>자금 시간표·수익 지표</summary><p class="table-scroll-hint">표를 좌우로 움직여 모든 항목을 확인하세요.</p><div class="table-wrap" tabindex="0" role="region" aria-label="자금 시간표. 좌우로 움직여 모든 열을 확인하세요."><table class="finance-table timeline-table"><thead><tr><th>날짜</th><th>항목</th><th>자기자금 투입</th><th>현금흐름</th><th>누적 자기자금</th><th>가용자금 잔액</th></tr></thead><tbody>' +
    r.timeline
      .map(
        (e) =>
          '<tr><td>' +
          esc(e.date) +
          '</td><td>' +
          esc(e.label) +
          '</td><td>' +
          money(e.equity_required) +
          '</td><td>' +
          money(e.cashflow) +
          '</td><td>' +
          money(e.cumulative_equity) +
          '</td><td>' +
          money(e.available_cash_remaining) +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table></div><p class="meta">매도 시점의 누적값은 회수액을 반영합니다. 최대 필요자금은 그 이전 최고 투입액도 포함합니다.</p><div class="stats"><span>MOIC <strong>' +
    mul(r.metrics.moic) +
    '</strong></span><span>날짜별 XIRR <strong>' +
    pct(r.metrics.xirr) +
    '</strong></span><span>손익분기 매도가 <strong>' +
    money(r.metrics.break_even_exit_price) +
    '</strong></span></div><p>자금 부족 시점: ' +
    esc(
      c.available_cash == null
        ? '가용자금 입력 필요'
        : r.metrics.funding_gap_date || '입력한 자금·일정 내 부족 없음',
    ) +
    '</p><p class="meta">세금은 사용자가 입력한 부대비용에만 반영됩니다. 자동 세무 계산이나 투자 추천은 제공하지 않습니다.</p></details>'
  );
}
function scenarioTable(c) {
  const result = compareScenarios(c);
  if (!result.scenarios.length) return '';
  return (
    '<details><summary>가정에 따라 어떻게 달라지나요?</summary><p class="meta">분담금·금융비·매도가·매도시점을 바꾼 사용자 가정입니다. 미래 가격이나 사업기간을 예측한 값이 아닙니다. 기간 변화는 금융비를 자동 증액하지 않습니다.</p><p class="table-scroll-hint">표를 좌우로 움직여 모든 항목을 확인하세요.</p><div class="table-wrap" tabindex="0" role="region" aria-label="시나리오 비교표. 좌우로 움직여 모든 열을 확인하세요."><table class="finance-table scenario-table"><thead><tr><th>가정</th><th>분담금</th><th>금융비</th><th>매도가</th><th>매도시점</th><th>최대 내 돈</th><th>세전손익</th><th>XIRR</th></tr></thead><tbody>' +
    result.scenarios
      .map(
        (s) =>
          '<tr><th>' +
          esc(s.label) +
          '</th><td>' +
          ((s.assumptions.contribution_multiplier - 1) * 100).toFixed(0) +
          '%</td><td>' +
          ((s.assumptions.financing_cost_multiplier - 1) * 100).toFixed(0) +
          '%</td><td>' +
          ((s.assumptions.exit_price_multiplier - 1) * 100).toFixed(0) +
          '%</td><td>' +
          s.assumptions.exit_delay_months +
          '개월</td><td>' +
          money(s.result.metrics?.peak_cumulative_equity) +
          '</td><td>' +
          money(s.result.metrics?.pretax_profit) +
          '</td><td>' +
          pct(s.result.metrics?.xirr) +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table></div>' +
    result.scenarios
      .filter((s) => !s.result.metrics)
      .map(
        (s) =>
          '<div class="note warning">' +
          esc(s.label) +
          issuesList(s.result.issues) +
          '</div>',
      )
      .join('') +
    '</details>'
  );
}
function comparePanel(active) {
  const options = workspace.cases
    .map(
      (c) =>
        '<option value="' +
        esc(c.id) +
        '">' +
        esc(c.label) +
        ' · ' +
        esc(projectBy(c.project_id)?.canonical_name || c.project_id) +
        '</option>',
    )
    .join('');
  if (!workspace.cases.length) return '';
  const other =
    compareId === null
      ? workspace.cases.find((c) => c.id !== active?.id)
      : caseBy(compareId);
  compareId = other?.id || '';
  const selectedOptions = (id, empty = false) =>
    (empty ? '<option value="">비교할 물건 선택</option>' : '') +
    options.replace(
      'value="' + esc(id) + '"',
      'value="' + esc(id) + '" selected',
    );
  let table = '';
  if (active && other && active.id !== other.id) {
    const a = computeInvestmentCase(active),
      b = computeInvestmentCase(other);
    const fields = [
      ['지금 필요한 내 돈', 'initial_equity_required', money],
      ['앞으로 추가 내 돈', 'future_additional_equity', money],
      ['최대 누적 자기자금', 'peak_cumulative_equity', money],
      ['전체 경제적 비용', 'total_economic_cost', money],
      ['세전손익', 'pretax_profit', money],
      ['MOIC', 'moic', mul],
      ['XIRR', 'xirr', pct],
      ['손익분기 매도가', 'break_even_exit_price', money],
    ];
    table =
      '<p class="table-scroll-hint">표를 좌우로 움직여 모든 항목을 확인하세요.</p><div class="table-wrap" tabindex="0" role="region" aria-label="물건 비교표. 좌우로 움직여 모든 열을 확인하세요."><table class="finance-table comparison-table"><thead><tr><th>지표</th><th>' +
      esc(active.label) +
      '</th><th>' +
      esc(other.label) +
      '</th></tr></thead><tbody>' +
      fields
        .map(
          ([label, key, format]) =>
            '<tr><th>' +
            label +
            '</th><td>' +
            format(a.metrics?.[key]) +
            '</td><td>' +
            format(b.metrics?.[key]) +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table></div>' +
      (!a.metrics || !b.metrics
        ? '<p class="meta">미완성 물건은 확인 필요로 표시합니다. 입력을 마친 뒤 수치를 비교하세요.</p>'
        : '');
  }
  return (
    '<section class="comparison-panel"><div class="heading"><h2>내가 고르는 물건 비교</h2><span class="pill">사용자 입력·가정</span></div>' +
    (workspace.cases.length < 2
      ? '<p class="meta">두 번째 물건을 추가하면 같은 지표로 나란히 비교할 수 있습니다.</p>'
      : '<p class="meta">기준 물건과 비교할 물건을 선택하세요. 같은 물건을 선택하면 비교표를 표시하지 않습니다.</p>') +
    '<div class="compare-select"><label>기준 물건<select id="compare-a">' +
    selectedOptions(active?.id) +
    '</select></label><label>비교 물건<select id="compare-b">' +
    selectedOptions(compareId, true) +
    '</select></label></div>' +
    table +
    '</section>'
  );
}
function analysis() {
  if (draft) {
    editor();
    return;
  }
  const c = caseBy(caseId) || workspace.cases[0];
  if (demo) {
    const c = INVESTMENT_CASES[0],
      p = FIXTURE_PROJECTS.find((p) => p.id === c.project_id),
      r = computeInvestmentCase(c);
    app.innerHTML =
      '<div class="page-heading"><div><p class="eyebrow">계산 예시</p><h1>물건 분석·비교 <span class="badge">FIXTURE</span></h1></div><button class="secondary" data-action="navigate" data-view="home">실제 구역 탐색</button></div><div class="note warning">가상 구역·가상 물건의 계산 예시입니다. 실제 매물이나 공식 가격 자료가 아닙니다.</div><h2>' +
      esc(p.canonical_name) +
      ' · ' +
      esc(c.label) +
      '</h2>' +
      metricCards(c, r) +
      timeline(r, c) +
      scenarioTable(c);
    return;
  }
  if (c) current = c.project_id;
  app.innerHTML =
    '<div class="page-heading"><div><p class="eyebrow">개인 분석 보관함</p><h1>내 물건</h1></div><button class="primary" data-action="new-case" data-project="' +
    esc(current) +
    '">' +
    icon('plus') +
    ' 물건 추가</button></div>' +
    (c
      ? '<div class="analysis-layout"><aside class="case-library"><div class="section-heading"><h2>저장한 물건</h2><span class="meta">' +
        workspace.cases.length +
        '개</span></div>' +
        workspace.cases
          .slice()
          .reverse()
          .map(
            (item) =>
              '<button class="case-choice ' +
              (item.id === c.id ? 'selected' : '') +
              '" data-action="case" data-id="' +
              esc(item.id) +
              '"><strong>' +
              esc(item.label) +
              '</strong><span>' +
              esc(
                projectBy(item.project_id)?.canonical_name || item.project_id,
              ) +
              '</span></button>',
          )
          .join('') +
        '<p class="meta library-note">이 브라우저에 저장합니다.<br>입력한 값과 가정으로 계산합니다.</p></aside><div class="analysis-main"><div class="analysis-title"><div><p class="meta">' +
        esc(projectBy(c.project_id)?.canonical_name || c.project_id) +
        '</p><h2>' +
        esc(c.label) +
        '</h2><span class="meta">사용자 입력·가정 · ' +
        esc(
          c.updated_at
            ? new Date(c.updated_at).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })
            : '저장 시점 확인 필요',
        ) +
        '</span></div><button class="secondary" data-action="edit-case" data-id="' +
        esc(c.id) +
        '">입력 수정</button></div>' +
        metricCards(c, computeInvestmentCase(c)) +
        comparePanel(c) +
        timeline(computeInvestmentCase(c), c) +
        inputDetails(c) +
        scenarioTable(c) +
        '<div class="analysis-utilities"><button class="quiet-button" data-action="project" data-id="' +
        esc(c.project_id) +
        '">' +
        icon('document') +
        ' 구역 근거 확인</button><button class="quiet-button" data-action="export">내 물건 파일로 보관</button><button class="danger" data-action="delete-case" data-id="' +
        esc(c.id) +
        '">물건 삭제</button></div></div></div>'
      : '<div class="empty analysis-empty"><div class="empty-icon">' +
        icon('document') +
        '</div><h2>아직 저장한 물건이 없습니다</h2><p>구역을 고른 뒤 내가 찾은 가격과 자금 일정을 입력하세요.</p><button class="primary" data-action="navigate" data-view="home">구역 탐색</button><button class="secondary" data-action="demo">계산 예시</button></div>') +
    backupPanel();
}
function backupPanel() {
  return (
    '<details class="backup-panel" ' +
    (backupDraft ? 'open' : '') +
    '><summary>내 물건 백업·복원</summary><p class="meta">2MB 이하 budong JSON 백업을 검사한 뒤 물건을 합칩니다. 같은 물건 ID가 있으면 현재 값을 유지합니다. 지도 위치·경계는 이 파일에서 복원하지 않습니다.</p><label class="field">백업 파일<input id="backup-file" type="file" accept=".json,application/json"></label><div id="backup-summary" role="status">' +
    (backupDraft
      ? '<p class="meta">' + esc(backupDraft.summary) + '</p>'
      : '') +
    '</div><div class="actions"><button class="secondary" type="button" data-action="backup-export">내 물건 파일로 보관</button><button class="primary" type="button" data-action="backup-import" ' +
    (backupDraft ? '' : 'disabled') +
    '>검사한 물건 복원</button></div></details>'
  );
}
async function prepareBackup(file) {
  backupDraft = null;
  const target = document.querySelector('#backup-summary'),
    button = document.querySelector('[data-action=backup-import]');
  if (button) button.disabled = true;
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024)
      throw Error('백업 파일은 2MB 이하로 가져오세요.');
    const text = await file.text(),
      checked = inspectWorkspaceBackup(text, {
        knownProjectIds: projects.map((p) => p.id),
      }),
      existing = new Set(workspace.cases.map((c) => c.id)),
      newCount = checked.state.cases.filter((c) => !existing.has(c.id)).length;
    backupDraft = {
      text,
      newCount,
      summary:
        '총 ' +
        checked.case_count +
        '개 · 새로 복원 ' +
        newCount +
        '개 · 기존 ID 유지 ' +
        (checked.case_count - newCount) +
        '개 · 지도 자료 제외',
    };
    if (document.contains(target))
      target.innerHTML = '<p class="meta">' + esc(backupDraft.summary) + '</p>';
    if (button) button.disabled = false;
  } catch (error) {
    if (document.contains(target))
      target.innerHTML =
        '<p class="backup-error">' + esc(error.message) + '</p>';
  }
}
function sources() {
  const policies = listSourceUsePolicies(sourceRegistry),
    mode = health?.use_mode === 'COMMERCIAL' ? 'COMMERCIAL' : 'PERSONAL';
  app.innerHTML =
    '<div class="breadcrumb"><button class="quiet-button" data-action="navigate" data-view="home">' +
    icon('back') +
    ' 구역 탐색</button></div><div class="page-heading"><div><p class="eyebrow">' +
    (mode === 'COMMERCIAL' ? '상업 모드' : '개인 비상업 모드') +
    '</p><h1>출처·이용조건</h1></div><span class="pill">출처별 조건</span></div><p class="lead">원문 열람, 데이터 가공, 지도 표시와 상업적 이용의 조건을 나눠 확인합니다. 개인 이용 허용이 변경·재배포 허용을 뜻하지 않습니다.</p><div class="source-policy-list">' +
    policies
      .map((policy) => {
        const raw = sourceRegistry.sources.find(
            (item) => item.source_id === policy.source_id,
          ),
          original = evaluateSourceOperation(raw, {
            mode,
            operation: 'view_original',
          });
        return (
          '<section class="source-policy-row"><div><h2>' +
          esc(policy.name) +
          '</h2><p class="meta">' +
          esc(policy.source_id) +
          ' · ' +
          esc(policy.license_id) +
          '</p></div><dl><div><dt>개인</dt><dd>' +
          esc(policy.labels.personal) +
          '</dd></div><div><dt>상업</dt><dd>' +
          esc(policy.labels.commercial) +
          '</dd></div><div><dt>가공</dt><dd>' +
          esc(policy.labels.modification) +
          '</dd></div></dl><p class="meta">' +
          esc(policy.scope_note) +
          '</p>' +
          (policy.attribution_required
            ? '<p class="meta">출처표시: ' +
              esc(policy.attribution_text) +
              '</p>'
            : '') +
          '<div class="source-policy-links"><span class="meta">조건 검토 ' +
          esc(policy.reviewed_at || '확인 필요') +
          '</span>' +
          (original.enabled && policy.catalog_url
            ? sourceLink(policy.catalog_url, '원문 열기')
            : '') +
          (policy.conditions_url
            ? sourceLink(policy.conditions_url, '이용조건')
            : '') +
          '</div></section>'
        );
      })
      .join('') +
    '</div>';
}

function newDraft(projectId) {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ||
      'case-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    project_id: projectId,
    label: '',
    acquisition_date: null,
    contract_price: null,
    acquisition_incidental_cost: null,
    existing_deposit_assumed: null,
    initial_loan_draw: null,
    paid_contribution: null,
    available_cash: null,
    future_events: [],
    exit: null,
    user_assumptions: [],
    unresolved_items: ['권리산정기준일·조합원 지위·분양자격 원문 확인 필요'],
    input_kind: 'USER_ASSUMPTION',
  };
}
function field(name, label, value, hint = '', type = 'number') {
  const hintId = 'field_hint_' + name,
    amountId = 'field_amount_' + name;
  return (
    '<label class="field"><span class="field-label">' +
    label +
    (type === 'number' ? '<span class="field-unit">만원</span>' : '') +
    '</span><input name="' +
    esc(name) +
    '" type="' +
    type +
    '" aria-describedby="' +
    esc(hintId) +
    (type === 'number' ? ' ' + esc(amountId) : '') +
    '" ' +
    (type === 'number' ? 'min="0" step="0.01" inputmode="decimal"' : '') +
    ' value="' +
    esc(type === 'number' ? amount(value) : value || '') +
    '">' +
    (type === 'number'
      ? '<small class="input-amount" id="' +
        esc(amountId) +
        '">' +
        (Number.isFinite(value)
          ? new Intl.NumberFormat('ko-KR').format(value) + '원'
          : '') +
        '</small>'
      : '') +
    '<small id="' +
    esc(hintId) +
    '">' +
    hint +
    '</small></label>'
  );
}
function editor() {
  const c = draft,
    p = projectBy(c.project_id);
  app.className = 'view-analysis view-editor';
  app.innerHTML =
    '<div class="page-heading"><h1>내 물건 ' +
    (caseBy(c.id) ? '수정' : '추가') +
    '</h1><button class="secondary" data-action="cancel-edit">취소</button></div><p>' +
    esc(p?.canonical_name || '구역 확인 필요') +
    '</p><p class="editor-instructions">확인된 값 또는 명시한 사용자 가정을 입력하세요. 모르는 값은 비워두고 초안으로 저장할 수 있습니다. 없는 보증금·대출·비용은 직접 0을 입력하세요. 금액 단위는 <strong>만원</strong>입니다.</p><div class="editor-layout"><aside class="form-waypoints" aria-label="입력 단계">' +
    ['취득 조건', '추가 자금', '매도 조건', '근거·가정']
      .map(
        (label, i) =>
          '<button type="button" class="' +
          (i === 0 ? 'active' : '') +
          '" data-action="section" data-target="form-step-' +
          (i + 1) +
          '"><span>' +
          (i + 1) +
          '</span>' +
          label +
          '</button>',
      )
      .join('') +
    '<p>모르는 값은 비워두고 초안으로 저장하세요.</p></aside><form id="case-form" novalidate><fieldset class="form-group" id="form-step-1"><legend>1. 무엇을 사나요?</legend><div class="form-grid">' +
    field('label', '물건 이름', c.label, '예: 상도15 OO빌라 2층', 'text') +
    field(
      'acquisition_date',
      '취득 예정일',
      c.acquisition_date,
      '현재 확정 날짜 또는 계산에 사용할 가정',
      'date',
    ) +
    field(
      'contract_price',
      '매매가',
      c.contract_price,
      '프리미엄이 포함된 전체 매매가격',
    ) +
    field(
      'acquisition_incidental_cost',
      '취득 부대비용',
      c.acquisition_incidental_cost,
      '취득세·중개보수·기타 취득비용 합계',
    ) +
    field(
      'existing_deposit_assumed',
      '승계 보증금',
      c.existing_deposit_assumed,
      '없는 경우 0, 경제적 비용과 별도',
    ) +
    field(
      'initial_loan_draw',
      '초기 대출금',
      c.initial_loan_draw,
      '없는 경우 0, 매도 때 원금 상환',
    ) +
    field(
      'paid_contribution',
      '기납부 분담금',
      c.paid_contribution,
      '매매가에 포함된 정보. 비용에 중복 합산하지 않음',
    ) +
    field(
      'available_cash',
      '가용 자기자금',
      c.available_cash,
      '선택. 자금 부족 시점을 확인할 내 현금',
    ) +
    '</div></fieldset><fieldset class="form-group" id="form-step-2"><legend>2. 나중에 얼마가 더 필요한가요?</legend><p class="meta">예상 분담금과 금융비용을 날짜별로 입력하세요. 대출로 충당하는 금액은 지급액을 초과할 수 없습니다. 원금 중도상환·보증금 반환은 대출 충당을 0으로 입력하고, 상환 수수료는 별도 비용으로 넣으세요. 일정을 비워두면 향후 비용 없음이라는 사용자 가정으로 기록합니다.</p><div id="event-rows">' +
    c.future_events
      .map(
        (e, i) =>
          '<div class="event-row" data-event="' +
          i +
          '"><label>지급 예정일<input type="date" name="event_' +
          i +
          '_date" value="' +
          esc(e.date) +
          '"></label><label>항목<select name="event_' +
          i +
          '_kind">' +
          [
            ['REMAINING_CONTRIBUTION', '잔여 분담금'],
            ['FINANCING_COST', '금융비용'],
            ['OTHER_COST', '기타 비용'],
            ['DEBT_REPAYMENT', '대출 원금 중도상환'],
            ['DEPOSIT_RETURN', '보증금 중간 반환'],
          ]
            .map(
              ([v, label]) =>
                '<option value="' +
                v +
                '" ' +
                (e.kind === v ? 'selected' : '') +
                '>' +
                label +
                '</option>',
            )
            .join('') +
          '</select></label><label>금액 (만원)<input type="number" min="0" step="0.01" name="event_' +
          i +
          '_amount" value="' +
          amount(e.amount) +
          '"></label><label>대출 충당 (만원)<input type="number" min="0" step="0.01" name="event_' +
          i +
          '_loan" value="' +
          amount(e.loan_funded) +
          '"></label><button class="secondary" type="button" data-action="remove-event" data-index="' +
          i +
          '" aria-label="' +
          (i + 1) +
          '번째 지급 일정 삭제">삭제</button></div>',
      )
      .join('') +
    '</div><button class="secondary" type="button" data-action="add-event">지급 일정 추가</button></fieldset><fieldset class="form-group" id="form-step-3"><legend>3. 어떤 조건에 매도하나요?</legend><p class="meta">예상 매도가와 날짜는 사용자 가정입니다. 현재 형식은 매도 시 남아 있는 대출 원금·보증금을 모두 정산합니다. 중간 상환·반환을 차감한 잔여액을 입력하세요. 신규 보증금·리파이낸싱은 현재 형식에서 지원하지 않습니다.</p><div class="form-grid">' +
    field(
      'exit_date',
      '매도 예정일',
      c.exit?.date,
      '취득·지급 일정 이후 날짜',
      'date',
    ) +
    field(
      'exit_price',
      '예상 매도가',
      c.exit?.price,
      '주변 가격을 자동으로 추정하지 않습니다',
    ) +
    field(
      'exit_selling_cost',
      '매도 비용',
      c.exit?.selling_cost,
      '세금·중개비 등 입력한 비용만 반영',
    ) +
    field(
      'exit_debt_repayment',
      '매도 시 대출 원금 상환',
      c.exit?.debt_repayment,
      '초기·향후 대출 합계에서 중도상환을 차감한 잔여액',
    ) +
    field(
      'exit_deposit_repayment',
      '매도 시 보증금 반환',
      c.exit?.deposit_repayment,
      '승계 보증금에서 중간 반환을 차감한 잔여액',
    ) +
    '</div><button class="secondary" type="button" data-action="fill-liabilities">입력한 대출·보증금으로 상환액 채우기</button></fieldset><fieldset class="form-group" id="form-step-4"><legend>4. 가정과 확인할 것</legend><div class="form-grid"><label class="field">입력 근거·사용자 가정<small>가격 출처, 분담금 근거, 계산을 위한 가정</small><textarea name="assumptions">' +
    esc((c.user_assumptions || []).join('\n')) +
    '</textarea></label><label class="field">미확인사항<small>한 줄에 하나씩. 가장 중요한 항목을 첫 줄에</small><textarea name="unresolved">' +
    esc((c.unresolved_items || []).join('\n')) +
    '</textarea></label></div></fieldset><div class="actions editor-actions"><button class="primary" type="submit">저장하고 분석</button><button class="secondary" type="button" data-action="preview">저장 전 계산 확인</button></div><div id="preview-result" aria-live="polite"></div><p class="meta">이 브라우저의 localStorage에 저장합니다. 브라우저 데이터 삭제 시 사라지므로 저장 후 파일로 보관할 수 있습니다.</p></form></div>';
}
function capture() {
  const form = document.querySelector('#case-form');
  if (!form) return draft;
  const fd = new FormData(form),
    get = (name) => String(fd.get(name) ?? '').trim(),
    num = (name) => (get(name) === '' ? null : Number(get(name)) * 10000);
  const old = draft;
  draft = {
    ...draft,
    label: get('label') || '이름 없는 물건',
    acquisition_date: get('acquisition_date') || null,
    contract_price: num('contract_price'),
    acquisition_incidental_cost: num('acquisition_incidental_cost'),
    existing_deposit_assumed: num('existing_deposit_assumed'),
    initial_loan_draw: num('initial_loan_draw'),
    paid_contribution: num('paid_contribution'),
    available_cash: num('available_cash'),
    future_events: old.future_events.map((_, i) => ({
      date: get('event_' + i + '_date') || null,
      kind: get('event_' + i + '_kind'),
      amount: num('event_' + i + '_amount'),
      loan_funded: num('event_' + i + '_loan'),
    })),
    user_assumptions: get('assumptions')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    unresolved_items: get('unresolved')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  draft.exit = [
    'exit_date',
    'exit_price',
    'exit_selling_cost',
    'exit_debt_repayment',
    'exit_deposit_repayment',
  ].some((name) => get(name) !== '')
    ? {
        date: get('exit_date') || null,
        price: num('exit_price'),
        selling_cost: num('exit_selling_cost'),
        debt_repayment: num('exit_debt_repayment'),
        deposit_repayment: num('exit_deposit_repayment'),
      }
    : null;
  return draft;
}
function render() {
  if (mapCleanup) {
    mapCleanup();
    mapCleanup = null;
  }
  app.className = 'view-' + view;
  document.body.classList.toggle('map-mode', view === 'map');
  document.querySelector('#workspace-count').textContent = String(
    workspace.cases.length,
  );
  nav.querySelectorAll('button').forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.view === (view === 'search' ? 'home' : view),
    );
    button.setAttribute(
      'aria-current',
      button.dataset.view === (view === 'search' ? 'home' : view)
        ? 'page'
        : 'false',
    );
  });
  (({ home, search, map, detail, analysis, sources })[view] || home)();
}
nav.addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  if (button) go(button.dataset.view);
});
app.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.id === 'rtms-form') {
    queryLive(event.target, 'rtms');
    return;
  }
  if (event.target.id === 'buildings-form') {
    queryLive(event.target, 'buildings');
    return;
  }
  if (event.target.id === 'search-form') {
    const data = new FormData(event.target);
    query = String(data.get('query') || '').trim();
    district = String(data.get('district') || '');
    projectType = String(data.get('projectType') || '');
    go(view === 'map' ? 'map' : 'search', {
      project: current,
      q: query,
      ...(district ? { district } : {}),
      ...(projectType ? { type: projectType } : {}),
    });
  }
  if (event.target.id === 'case-form') {
    capture();
    draft.updated_at = new Date().toISOString();
    const id = draft.id;
    if (persist(() => store.saveCase(draft))) {
      const result = computeInvestmentCase(draft);
      message(
        result.metrics
          ? '물건을 저장했습니다. 입력한 가정으로 계산한 결과입니다.'
          : '초안으로 저장했습니다. 확인할 입력을 아래에 표시합니다.',
      );
      go('analysis', { case: id });
    }
  }
});
app.addEventListener('change', (event) => {
  if (
    event.target.closest('#case-form') &&
    /^event_\d+_kind$/.test(event.target.name) &&
    ['DEBT_REPAYMENT', 'DEPOSIT_RETURN'].includes(event.target.value)
  ) {
    const loan = event.target.form.elements.namedItem(
      event.target.name.replace('_kind', '_loan'),
    );
    if (loan) loan.value = '0';
  }
  if (event.target.id === 'backup-file') prepareBackup(event.target.files[0]);
  if (['search-district', 'search-type'].includes(event.target.id))
    document.querySelector('#search-form').requestSubmit();
  if (event.target.id === 'compare-a')
    go('analysis', { case: event.target.value });
  if (event.target.id === 'compare-b') {
    compareId = event.target.value;
    analysis();
  }
});

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'backup-import' && backupDraft) {
    const added = backupDraft.newCount;
    if (
      persist(() =>
        store.importBackup(backupDraft.text, {
          knownProjectIds: projects.map((p) => p.id),
        }),
      )
    ) {
      backupDraft = null;
      message(
        '물건 ' +
          added +
          '개를 복원했습니다. 기존 ID의 현재 값과 지도 자료는 유지했습니다.',
      );
      go('analysis');
    }
  }
  if (action === 'select-project') {
    if (innerWidth < 800 && view !== 'map')
      go('detail', { project: button.dataset.id });
    else selectExplorerProject(button.dataset.id);
  }
  if (action === 'explorer-scope') {
    explorerScope = button.dataset.scope;
    render();
  }
  if (['toggle-map', 'map-to-list'].includes(action)) {
    go(action === 'toggle-map' ? 'map' : 'home', {
      project: current,
      q: query,
      ...(district ? { district } : {}),
      ...(projectType ? { type: projectType } : {}),
    });
  }
  if (action === 'map-scope') {
    mapScope = button.dataset.scope;
    renderMapList();
  }
  if (action === 'map-mark') mapCleanup?.openPanel?.(button.dataset.id);
  if (action === 'clear-search') {
    query = '';
    district = '';
    projectType = '';
    explorerScope = 'all';
    go('search', { q: '' });
  }
  if (action === 'section') {
    const group = button.closest('.form-waypoints,.detail-shortcuts');
    if (group)
      group
        .querySelectorAll('button')
        .forEach((item) => item.classList.toggle('active', item === button));
    const target = document.getElementById(button.dataset.target);
    if (target) {
      target.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
      const focus = target.querySelector('input,select,textarea') || target;
      if (!focus.matches('input,select,textarea,button,a'))
        focus.setAttribute('tabindex', focus.getAttribute('tabindex') || '-1');
      focus.focus({ preventScroll: true });
    }
  }
  if (action === 'navigate') go(button.dataset.view);
  if (action === 'project') go('detail', { project: button.dataset.id });
  if (action === 'case') go('analysis', { case: button.dataset.id });
  if (action === 'demo') go('analysis', { demo: '1' });
  if (['new-case', 'new-case-inline'].includes(action)) {
    const p = projectBy(button.dataset.project) || projectBy(current);
    if (!p) {
      go('search');
      return;
    }
    current = p.id;
    view = 'analysis';
    demo = false;
    draft = newDraft(p.id);
    render();
    document.querySelector('[name=label]').focus();
  }
  if (action === 'edit-case') {
    draft = structuredClone(caseBy(button.dataset.id));
    editor();
    document.querySelector('[name=label]').focus();
  }
  if (action === 'cancel-edit') {
    draft = null;
    render();
  }
  if (action === 'delete-case') {
    const c = caseBy(button.dataset.id);
    if (
      window.confirm('“' + c.label + '”을 이 브라우저에서 삭제할까요?') &&
      persist(() => store.deleteCase(c.id))
    ) {
      message('물건을 삭제했습니다.');
      go('analysis');
    }
  }
  if (action === 'add-event') {
    capture();
    draft.future_events.push({
      date: null,
      kind: 'REMAINING_CONTRIBUTION',
      amount: null,
      loan_funded: null,
    });
    editor();
    focusField('future_events[' + (draft.future_events.length - 1) + '].date');
  }
  if (action === 'remove-event') {
    capture();
    draft.future_events.splice(Number(button.dataset.index), 1);
    editor();
    document.querySelector('[data-action=add-event]').focus();
  }
  if (action === 'fill-liabilities') {
    capture();
    if (
      draft.initial_loan_draw == null ||
      draft.existing_deposit_assumed == null ||
      draft.future_events.some(
        (e) =>
          e.loan_funded == null ||
          (['DEBT_REPAYMENT', 'DEPOSIT_RETURN'].includes(e.kind) &&
            e.amount == null),
      )
    ) {
      message(
        '초기 대출·승계 보증금·일정별 대출 충당액을 먼저 입력하세요.',
        true,
      );
      return;
    }
    const remaining = remainingLiabilities(draft);
    if (
      !Number.isFinite(remaining.debt) ||
      !Number.isFinite(remaining.deposit) ||
      remaining.debt < 0 ||
      remaining.deposit < 0
    ) {
      message('중간 상환·반환을 포함한 금액을 먼저 확인하세요.', true);
      return;
    }
    draft.exit = {
      ...(draft.exit || {}),
      debt_repayment: remaining.debt,
      deposit_repayment: remaining.deposit,
    };
    editor();
    focusField('exit.debt_repayment');
    message(
      '중간 상환·반환을 차감한 잔여 대출과 보증금을 상환액에 채웠습니다. 금융기관 상환 조건을 확인하세요.',
    );
  }
  if (action === 'preview') {
    capture();
    const result = computeInvestmentCase(draft);
    document.querySelector('#preview-result').innerHTML = metricCards(
      draft,
      result,
    );
    applyValidation(result.issues);
    if (result.issues.length) focusField(result.issues[0].field);
    else
      document.querySelector('#preview-result').scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      });
  }
  if (action === 'focus-field') {
    if (!document.querySelector('#case-form')) {
      const c = caseBy(caseId) || workspace.cases[0];
      if (c) {
        draft = structuredClone(c);
        editor();
        applyValidation(computeInvestmentCase(draft).issues);
      }
    }
    focusField(button.dataset.field);
  }
  if (['export', 'backup-export'].includes(action)) {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
        type: 'application/json',
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'budong-my-cases.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
app.addEventListener('input', (event) => {
  const input = event.target;
  if (!input.closest('#case-form') || input.type !== 'number') return;
  const hint = document.getElementById('field_amount_' + input.name);
  if (hint)
    hint.textContent =
      input.value !== '' && Number.isFinite(input.valueAsNumber)
        ? new Intl.NumberFormat('ko-KR').format(input.valueAsNumber * 10000) +
          '원'
        : '';
});
document
  .querySelector('#demo-shortcut')
  .addEventListener('click', () => go('analysis', { demo: '1' }));
window.addEventListener('hashchange', route);
try {
  try {
    store = createWorkspaceStore(window.localStorage);
  } catch {
    store = createWorkspaceStore(null);
  }
  readStorage();
  const load = async (path) => {
    const response = await fetch(path);
    if (!response.ok)
      throw new Error('자료를 불러오지 못했습니다 (' + response.status + ').');
    return response.json();
  };
  const [seed, detailData, registryData] = await Promise.all([
    load('../data/seoul_seed_v1.json'),
    load('../data/deep_validation_v1.json'),
    load('../data/source_registry.json'),
  ]);
  sourceRegistry = registryData;
  projects = prepareSearchProjects(seed.projects);
  deep = new Map(detailData.targets.map((t) => [t.project_id, t]));
  route();
  fetch('/api/health')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      health = data;
      document.querySelector('.private').textContent =
        health?.use_mode === 'COMMERCIAL' ? '상업 검토' : '개인 검토';
      if (['detail', 'sources'].includes(view)) render();
    })
    .catch(() => {});
  fetch('../data/boundaries_v1.geojson')
    .then(async (response) => {
      if (response.status === 404) return;
      if (!response.ok) throw new Error('경계 파일 응답 확인 필요');
      const data = await response.json();
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features))
        throw new Error('경계 파일 형식 확인 필요');
      boundaries = data;
      if (['home', 'search', 'map'].includes(view)) render();
    })
    .catch((error) => {
      boundaryError = error.message;
      if (['home', 'search', 'map'].includes(view)) render();
    });
} catch (error) {
  app.innerHTML =
    '<h1>구역 자료를 불러오지 못했습니다</h1><div class="note error">' +
    esc(error.message) +
    '</div><button class="primary" data-action="reload">다시 불러오기</button>';
  app.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="reload"]')) location.reload();
  });
}
