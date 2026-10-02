import * as L from './vendor/leaflet/leaflet.mjs';
import {
  MAP_STORAGE_KEY,
  inspectBoundary,
  parseBoundaryFile,
  makePersonalPin,
} from '../src/map_data.mjs';

const esc = (v = '') =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const blank = () => ({ version: 1, pins: [], features: [] });
function readState() {
  const raw = localStorage.getItem(MAP_STORAGE_KEY);
  if (!raw) return blank();
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    throw new Error(
      '저장한 지도 자료를 읽지 못했습니다. 기존 파일은 보존됩니다.',
    );
  }
  if (
    state.version !== 1 ||
    !Array.isArray(state.pins) ||
    !Array.isArray(state.features)
  )
    throw new Error('저장한 지도 자료의 형식을 확인하세요.');
  return state;
}
export function mapWorkspaceHtml({
  projects = [],
  selectedId,
  boundaryCount = 0,
} = {}) {
  const selected = projects.find((p) => p.id === selectedId);
  return (
    '<section class="map-workspace" aria-label="지도 탐색"><div class="map-toolbar"><span class="map-caption">서울</span><span id="map-network-status" class="map-network-status" role="status">배경지도 연결 중</span><div class="map-tools"><button class="secondary" type="button" id="map-seoul">서울 전체</button><button class="secondary" type="button" id="map-fit">표시한 위치</button><button class="secondary" type="button" id="map-retry" hidden>다시 연결</button><button class="secondary" type="button" id="map-options" aria-expanded="false" aria-controls="map-import-panel">지도 자료</button></div></div><div class="zone-legend" aria-label="구역 색상 범례"><span class="zone-legend-item"><i class="zone-legend-swatch zone-legend-swatch--redevelopment"></i>재개발</span><span class="zone-legend-item"><i class="zone-legend-swatch zone-legend-swatch--reconstruction"></i>재건축</span><span class="zone-legend-item"><i class="zone-legend-swatch zone-legend-swatch--other"></i>기타 사업</span><span class="meta">점선: 행정 참고경계 · 단계는 정보몽땅 관찰값</span></div><div id="map-canvas" class="map-canvas" tabindex="0" role="region" aria-label="지도. 드래그로 이동, 휠이나 더하기·빼기로 확대·축소, 방향키로 이동할 수 있습니다."></div><div class="map-view-readout"><span id="map-zoom-level"></span><span>드래그로 이동 · 휠로 확대</span></div><div class="map-status-line"><span id="map-data-status" role="status">' +
    (boundaryCount
      ? '경계 ' + boundaryCount + '개'
      : '배경지도 · 구역 경계 미연결') +
    '</span><a href="#sources">출처·이용조건</a></div><div id="map-source-attribution" class="map-source-attribution"></div><div id="map-import-panel" class="map-import-panel" hidden><div class="map-panel-heading"><h3>내 지도 자료</h3><button type="button" class="quiet-button" id="map-panel-close" aria-label="지도 자료 닫기">닫기 ×</button></div><p class="meta">직접 표시한 위치는 내 참고용입니다. 구역 경계·사업장 공식 위치를 확정하지 않습니다.</p><form id="map-pin-form"><div class="form-grid"><label class="field">연결할 구역<select name="project_id">' +
    projects
      .map(
        (p) =>
          '<option value="' +
          esc(p.id) +
          '" ' +
          (p.id === selectedId ? 'selected' : '') +
          '>' +
          esc(p.canonical_name) +
          '</option>',
      )
      .join('') +
    '</select></label><label class="field">위치 이름<input name="label" maxlength="120" value="' +
    esc(selected?.canonical_name || '') +
    '"></label><label class="field">위도<input name="latitude" type="number" step="any" min="-85" max="85" required placeholder="37.5…"></label><label class="field">경도<input name="longitude" type="number" step="any" min="-180" max="180" required placeholder="126.9…"></label></div><div class="actions"><button class="primary" type="submit">참고 위치 저장</button><button class="secondary" type="button" id="map-place-pin">지도를 눌러 위치 지정</button></div></form><details><summary>검토한 GeoJSON 경계 가져오기</summary><p class="meta">EPSG:4326 FeatureCollection, 2MB 이하. project_id·boundary_kind·source_id·검토일·이용조건이 필요합니다. 출처의 비상업·변경금지 조건을 검사합니다. 제3자 경계를 USER_INPUT으로 바꾸면 안 됩니다.</p><label class="field">경계 파일<input id="map-boundary-file" type="file" accept=".geojson,.json,application/geo+json,application/json"></label><a class="source" href="../data/boundary_import_example.json" download>직접 작성한 참고경계 형식 예시</a></details><button class="secondary" id="map-clear-pins" type="button">직접 표시한 위치 모두 지우기</button></div></section>'
  );
}

export function mountMapWorkspace({
  projects = [],
  selectedId,
  boundaries,
  onSelect = () => {},
  onData = () => {},
  onViewChange = () => {},
  viewState = null,
} = {}) {
  const node = document.getElementById('map-canvas');
  if (!node) return () => {};
  let disposed = false;
  const map = L.map(node, {
    zoomControl: false,
    scrollWheelZoom: true,
    minZoom: 9,
    maxZoom: 19,
    attributionControl: true,
  }).setView([37.548, 126.99], 11);
  if (
    viewState &&
    Array.isArray(viewState.center) &&
    viewState.center.every(Number.isFinite) &&
    Number.isFinite(viewState.zoom)
  )
    map.setView(viewState.center, viewState.zoom);
  L.control
    .zoom({ position: 'topright', zoomInTitle: '확대', zoomOutTitle: '축소' })
    .addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
  const syncView = () => {
    if (disposed) return;
    const center = map.getCenter();
    const value = { center: [center.lat, center.lng], zoom: map.getZoom() };
    node.dataset.zoom = String(value.zoom);
    node.dataset.center = value.center.join(',');
    document.getElementById('map-zoom-level').textContent =
      '확대 ' + value.zoom;
    onViewChange(value);
  };
  map.on('moveend zoomend', syncView);
  syncView();
  map.attributionControl.setPrefix(
    '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>',
  );
  const group = L.featureGroup().addTo(map),
    status = document.getElementById('map-data-status');
  let state,
    context,
    placing = false,
    tileLayer = null;
  const projectLayers = new Map();
  const boundaryLayers = [];
  const clusters = L.layerGroup().addTo(map);
  let activeId = selectedId, visibleIds = null;
  const colorFor = (project) => {
    const type = project?.project_type_name_official || project?.project_type_official_raw || '';
    return type.includes('재건축') ? '#7c3aed' : type.includes('재개발') ? '#2563eb' : '#087f8c';
  };
  const syncPresentation = () => {
    clusters.clearLayers();
    const byBorough = new Map();
    for (const item of boundaryLayers) {
      const visible = !visibleIds || visibleIds.has(item.project.id);
      const selected = activeId === item.project.id;
      item.layer.setStyle({ color: selected ? '#0f172a' : colorFor(item.project),
        weight: selected ? 4 : 2, fillColor: colorFor(item.project), fillOpacity: selected ? 0.25 : 0.13 });
      item.layer.eachLayer((path) => {
        const el = path.getElement();
        el?.classList.toggle('is-selected', selected);
        if (el) { el.dataset.projectId = item.project.id; el.setAttribute('tabindex', '0');
          el.setAttribute('role', 'button'); el.setAttribute('aria-label', item.project.canonical_name + ' 구역 선택');
          el.setAttribute('aria-pressed', String(selected));
          el.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); onSelect(item.project.id); } }; }
      });
      item.layer.unbindTooltip();
      if (visible && (map.getZoom() >= 14 || (map.getZoom() === 13 && selected))) {
        const label = document.createElement('div');
        label.innerHTML = '<span class="zone-label-name">' + esc(item.labelName || item.project.canonical_name) + '</span>' +
          '<span class="zone-label-stage">' + esc(item.project.current_stage_official_raw || '단계 미연결') + '</span>' +
          '<span class="zone-label-kind">' + esc(item.kindLabel) + '</span>';
        item.layer.bindTooltip(label, { permanent: true, interactive: true, direction: 'center', opacity: 1,
          className: 'zone-label zone-label--' + (colorFor(item.project) === '#2563eb' ? 'redevelopment' : colorFor(item.project) === '#7c3aed' ? 'reconstruction' : 'other') + (selected ? ' zone-label--selected' : '') });
        item.layer.openTooltip();
      }
      if (visible) {
        const key = item.project.jurisdiction;
        if (!byBorough.has(key)) byBorough.set(key, []);
        byBorough.get(key).push(item);
      }
    }
    if (map.getZoom() <= 12) for (const [borough, items] of byBorough) {
      const area = L.featureGroup(items.map((i) => i.layer));
      const count = new Set(items.map((i) => i.project.id)).size;
      const marker = L.marker(area.getBounds().getCenter(), { icon: L.divIcon({
        className: 'zone-cluster' + (items.some((i) => i.project.id === activeId) ? ' is-selected' : ''), iconSize: [88, 58],
        html: '<span class="zone-cluster-name">' + esc(borough.replace('서울특별시 ', '')) +
          '</span><strong class="zone-cluster-count">' + count + '</strong>' }),
        title: borough + ' 경계 연결 ' + count + '구역 · 눌러 확대' });
      marker.on('click', () => map.fitBounds(area.getBounds(), { padding: [55, 55], maxZoom: 15 }));
      marker.addTo(clusters);
    }
  };
  map.on('zoomend', syncPresentation);
  const inform = (message) => {
    if (!disposed) status.textContent = message;
  };
  const persist = () => {
    try {
      localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      inform(
        '지도 자료를 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.',
      );
      return false;
    }
  };
  const renderLayers = () => {
    group.clearLayers();
    projectLayers.clear();
    boundaryLayers.length = 0;
    const records = [];
    let hidden = 0;
    const attributions = new Set();
    for (const pin of state.pins) {
      try {
        makePersonalPin(pin, projects);
      } catch {
        hidden++;
        continue;
      }
      const label = document.createElement('span');
      label.textContent = pin.label + ' · 직접 표시한 위치';
      const marker = L.circleMarker([pin.latitude, pin.longitude], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#1768e8',
        fillOpacity: 1,
      })
        .bindTooltip(label)
        .addTo(group);
      marker.on('click', () => onSelect(pin.project_id));
      if (!projectLayers.has(pin.project_id))
        projectLayers.set(pin.project_id, L.featureGroup());
      projectLayers.get(pin.project_id).addLayer(marker);
      records.push({
        project_id: pin.project_id,
        kind: 'USER_ASSUMPTION',
        label: '직접 표시한 참고 위치',
      });
    }
    for (const feature of [
      ...(boundaries?.features || []),
      ...state.features,
    ]) {
      const review = inspectBoundary(feature, context);
      if (!review.enabled) {
        hidden++;
        continue;
      }
      if (feature.properties.attribution)
        attributions.add(feature.properties.attribution);
      const own = review.kind === 'USER_DRAWN',
        official = review.kind === 'OFFICIAL';
      const project = projects.find((p) => p.id === feature.properties.project_id);
      const kindLabel = own ? '직접 작성한 참고경계' : official ? '원문 대조 경계' : feature.properties.source_id === 'SEOUL_URBAN_PLAN_GEOJSON' ? '서울시 행정 참고경계' : '행정 참고경계';
      const layer = L.geoJSON(feature, {
        style: { color: colorFor(project), fillColor: colorFor(project), weight: 2,
          fillOpacity: 0.13, dashArray: official ? undefined : '6 4',
          className: 'zone-boundary zone-boundary--' + (official ? 'official' : own ? 'user' : 'reference') },
      }).addTo(group);
      if (!projectLayers.has(project.id)) projectLayers.set(project.id, L.featureGroup());
      projectLayers.get(project.id).addLayer(layer);
      records.push({ project_id: project.id, kind: review.kind, label: kindLabel, source_id: feature.properties.source_id,
        fetched_at: feature.properties.fetched_at, source_url: feature.properties.source_url,
        source_as_of: feature.properties.source_as_of, legal_boundary_verified: feature.properties.legal_boundary_verified === true });
      boundaryLayers.push({ layer, project, kindLabel, labelName: feature.properties.source_name });
      layer.on('click', () => onSelect(project.id)).on('mouseover', () => {
        layer.setStyle({ weight: 4, fillOpacity: 0.23 });
        layer.eachLayer((p) => p.getElement()?.classList.add('is-hovered'));
      }).on('mouseout', () => {
        layer.eachLayer((p) => p.getElement()?.classList.remove('is-hovered'));
        syncPresentation();
      });
    }
    syncPresentation();
    inform(
      '위치 ' +
        state.pins.length +
        '개 · 경계 ' +
        group.getLayers().filter((l) => l instanceof L.GeoJSON).length +
        '개' +
        (hidden ? ' · 이용조건/검토 미충족 ' + hidden + '개 제외' : '') +
        ' · ' +
        (context.mode === 'COMMERCIAL' ? '상업 모드' : '개인 비상업 모드'),
    );
    const footer = document.getElementById('map-source-attribution');
    footer.textContent = [...attributions].join(' · ');
    onData(records);
  };
  const listeners = [];
  const listen = (id, event, handler) => {
    const target = document.getElementById(id);
    if (target) {
      target.addEventListener(event, handler);
      listeners.push(() => target.removeEventListener(event, handler));
    }
  };
  const ready = (async () => {
    try {
      const [registry, config] = await Promise.all([
        fetch('../data/source_registry.json').then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        }),
        fetch('/api/map-config').then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        }),
      ]);
      if (disposed) return;
      context = {
        projects,
        sources: registry.sources,
        mode: config.mode || 'PERSONAL',
        runtimeContext: config.runtime_context || 'PUBLIC',
      };
      state = readState();
      if (config.tile_url) {
        tileLayer = L.tileLayer(config.tile_url, {
          maxZoom: 19,
          minZoom: 9,
          keepBuffer: 0,
          updateWhenIdle: true,
          attribution: config.attribution,
        });
        const network = document.getElementById('map-network-status');
        const retry = document.getElementById('map-retry');
        let loaded = 0,
          failed = 0;
        tileLayer.on('loading', () => {
          node.dataset.tilesLoading = 'true';
          loaded = 0;
          failed = 0;
          network.textContent = '배경지도 연결 중';
        });
        tileLayer.on('tileload', () => {
          loaded++;
          network.textContent = failed
            ? '일부 지도 연결 실패'
            : '배경지도 연결됨';
        });
        tileLayer.on('tileerror', () => {
          failed++;
          network.textContent = loaded
            ? '일부 지도 연결 실패'
            : '배경지도 연결 실패';
          retry.hidden = false;
        });
        tileLayer.on('load', () => {
          node.dataset.tilesLoading = 'false';
          retry.hidden = failed === 0;
        });
        tileLayer.addTo(map);
      } else {
        document.getElementById('map-network-status').textContent =
          '배경지도 설정 확인 필요';
      }
      renderLayers();
      if (!viewState) {
        const selected = projectLayers.get(selectedId);
        if (selected?.getLayers().length)
          map.fitBounds(selected.getBounds(), {
            padding: [40, 40],
            maxZoom: 16,
          });
      }
    } catch {
      inform(
        '지도 설정 또는 저장 자료를 읽지 못했습니다. 기존 자료를 덮어쓰지 않습니다.',
      );
    }
  })();
  listen('map-retry', 'click', () => tileLayer?.redraw());
  listen('map-seoul', 'click', () => map.setView([37.548, 126.99], 11));
  listen('map-fit', 'click', () =>
    group.getLayers().length
      ? map.fitBounds(group.getBounds(), { padding: [35, 35], maxZoom: 16 })
      : inform('지도 자료에서 참고 위치를 먼저 표시하세요.'),
  );
  listen('map-options', 'click', (event) => {
    const panel = document.getElementById('map-import-panel');
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    map.invalidateSize();
  });
  listen('map-panel-close', 'click', () => {
    document.getElementById('map-import-panel').hidden = true;
    document
      .getElementById('map-options')
      .setAttribute('aria-expanded', 'false');
    document.getElementById('map-options').focus();
  });
  listen('map-place-pin', 'click', () => {
    placing = true;
    node.classList.add('placing-pin');
    document.getElementById('map-import-panel').hidden = true;
    document
      .getElementById('map-options')
      .setAttribute('aria-expanded', 'false');
    inform(
      '지도를 한 번 눌러 위치를 지정하세요. 공식 위치로 확정하지 않습니다.',
    );
    node.focus();
  });
  listen('map-canvas', 'keydown', (event) => {
    if (event.key !== 'Escape' || !placing) return;
    placing = false;
    node.classList.remove('placing-pin');
    document.getElementById('map-import-panel').hidden = false;
    document
      .getElementById('map-options')
      .setAttribute('aria-expanded', 'true');
    inform('위치 지정을 취소했습니다.');
  });
  map.on('click', (event) => {
    if (!placing) return;
    placing = false;
    node.classList.remove('placing-pin');
    document.getElementById('map-import-panel').hidden = false;
    document
      .getElementById('map-options')
      .setAttribute('aria-expanded', 'true');
    const form = document.getElementById('map-pin-form');
    form.elements.latitude.value = event.latlng.lat.toFixed(7);
    form.elements.longitude.value = event.latlng.lng.toFixed(7);
    inform('참고 위치 좌표를 채웠습니다. 저장 버튼으로 보관하세요.');
    form.querySelector('button').focus();
  });
  listen('map-pin-form', 'submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await ready;
    if (disposed || !state || !context) return;
    try {
      const fd = new FormData(event.target),
        pin = makePersonalPin(
          {
            project_id: fd.get('project_id'),
            label: fd.get('label'),
            latitude: Number(fd.get('latitude')),
            longitude: Number(fd.get('longitude')),
          },
          projects,
        );
      const candidate = {
        ...state,
        pins: [
          ...state.pins.filter((p) => p.project_id !== pin.project_id),
          pin,
        ],
      };
      const previous = state;
      state = candidate;
      if (!persist()) {
        state = previous;
        return;
      }
      renderLayers();
      map.setView([pin.latitude, pin.longitude], 14);
    } catch (error) {
      inform(error.message);
    }
  });
  listen('map-boundary-file', 'change', async (event) => {
    await ready;
    const file = event.target.files[0];
    if (disposed || !file || !state || !context) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw Error('경계 파일은 2MB 이하로 가져오세요.');
      const collection = parseBoundaryFile(await file.text(), context);
      if (disposed) return;
      const previous = state;
      state = { ...state, features: collection.features };
      if (!persist()) {
        state = previous;
        return;
      }
      renderLayers();
      if (group.getLayers().length)
        map.fitBounds(group.getBounds(), { padding: [35, 35], maxZoom: 16 });
    } catch (error) {
      inform(error.message);
    }
  });
  listen('map-clear-pins', 'click', async () => {
    await ready;
    if (disposed || !state) return;
    const previous = state;
    state = { ...state, pins: [] };
    if (!persist()) {
      state = previous;
      return;
    }
    renderLayers();
  });
  const resize = new ResizeObserver(() => {
    if (!disposed) map.invalidateSize();
  });
  resize.observe(node);
  const cleanup = () => {
    disposed = true;
    resize.disconnect();
    listeners.forEach((remove) => remove());
    map.stop();
    map.remove();
  };
  cleanup.focusProject = async (id) => {
    await ready;
    if (disposed) return false;
    activeId = id;
    syncPresentation();
    const layer = projectLayers.get(id);
    if (!layer?.getLayers().length) {
      inform(
        '선택한 구역의 위치가 미연결입니다. 참고 위치를 지정할 수 있습니다.',
      );
      return false;
    }
    map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 16 });
    inform('선택한 구역의 참고 위치·경계로 이동했습니다.');
    return true;
  };
  cleanup.setVisibleProjects = (ids) => {
    visibleIds = new Set(ids);
    group.clearLayers();
    for (const [id, layers] of projectLayers) if (visibleIds.has(id)) {
      layers.eachLayer((layer) => group.addLayer(layer));
    }
    syncPresentation();
  };
  cleanup.openPanel = (id) => {
    const panel = document.getElementById('map-import-panel');
    panel.hidden = false;
    document
      .getElementById('map-options')
      .setAttribute('aria-expanded', 'true');
    const form = document.getElementById('map-pin-form');
    if (projects.some((p) => p.id === id)) {
      form.elements.project_id.value = id;
      form.elements.label.value = projects.find(
        (p) => p.id === id,
      ).canonical_name;
    }
    form.elements.latitude.focus();
  };
  return cleanup;
}
