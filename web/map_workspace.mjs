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
    '<section class="map-workspace" aria-label="지도 탐색"><div class="map-toolbar"><span class="map-caption">서울 · 배경지도</span><div class="map-tools"><button class="secondary" type="button" id="map-seoul">서울 전체</button><button class="secondary" type="button" id="map-fit">표시한 위치</button><button class="secondary" type="button" id="map-options" aria-expanded="false" aria-controls="map-import-panel">지도 자료</button></div></div><div id="map-canvas" class="map-canvas" aria-label="서울 배경지도. 구역 경계와 사용자 위치는 별도로 표시합니다."></div><div class="map-status-line"><span id="map-data-status" role="status">' +
    (boundaryCount
      ? '경계 ' + boundaryCount + '개'
      : '배경지도 · 구역 경계 미연결') +
    '</span><a href="#sources">출처·이용조건</a></div><div id="map-source-attribution" class="map-source-attribution"></div><div id="map-import-panel" class="map-import-panel" hidden><h3>내 지도 자료</h3><p class="meta">직접 표시한 위치는 내 참고용입니다. 구역 경계·사업장 공식 위치를 확정하지 않습니다.</p><form id="map-pin-form"><div class="form-grid"><label class="field">연결할 구역<select name="project_id">' +
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
} = {}) {
  const node = document.getElementById('map-canvas');
  if (!node) return () => {};
  const map = L.map(node, {
    zoomControl: false,
    scrollWheelZoom: false,
    attributionControl: true,
  }).setView([37.548, 126.99], 11);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(
    '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>',
  );
  const group = L.featureGroup().addTo(map),
    status = document.getElementById('map-data-status');
  let disposed = false,
    state,
    context,
    placing = false;
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
      const layer = L.geoJSON(feature, {
        style: {
          color: official ? '#175fc7' : own ? '#7061ac' : '#bd6e17',
          weight: 2,
          fillOpacity: 0.12,
          dashArray: official ? undefined : '6 4',
        },
      }).addTo(group);
      const label = document.createElement('span');
      label.textContent =
        (projects.find((p) => p.id === feature.properties.project_id)
          ?.canonical_name || '구역') +
        ' · ' +
        (official
          ? '검토 기록이 있는 경계'
          : own
            ? '직접 작성한 참고경계'
            : '행정 참고경계');
      layer
        .bindTooltip(label)
        .on('click', () => onSelect(feature.properties.project_id));
    }
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
      };
      state = readState();
      if (config.tile_url) {
        const tiles = L.tileLayer(config.tile_url, {
          maxZoom: 19,
          minZoom: 9,
          keepBuffer: 0,
          updateWhenIdle: true,
          attribution: config.attribution,
        }).addTo(map);
        let loaded = false;
        tiles.on('tileload', () => {
          loaded = true;
        });
        tiles.on('tileerror', () => {
          if (!loaded)
            inform(
              '배경지도를 불러오지 못했습니다. 내 위치·경계 자료는 계속 사용할 수 있습니다.',
            );
        });
      }
      renderLayers();
      const selectedPin = state.pins.find((p) => p.project_id === selectedId);
      if (selectedPin)
        map.setView([selectedPin.latitude, selectedPin.longitude], 14);
    } catch {
      inform(
        '지도 설정 또는 저장 자료를 읽지 못했습니다. 기존 자료를 덮어쓰지 않습니다.',
      );
    }
  })();
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
  listen('map-place-pin', 'click', () => {
    placing = true;
    inform(
      '지도를 한 번 눌러 위치를 지정하세요. 공식 위치로 확정하지 않습니다.',
    );
    node.focus();
  });
  map.on('click', (event) => {
    if (!placing) return;
    placing = false;
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
    if (!state || !context) return;
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
    if (!file || !state || !context) return;
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
    if (!state) return;
    const previous = state;
    state = { ...state, pins: [] };
    if (!persist()) {
      state = previous;
      return;
    }
    renderLayers();
  });
  const resize = new ResizeObserver(() => map.invalidateSize());
  resize.observe(node);
  return () => {
    disposed = true;
    resize.disconnect();
    listeners.forEach((remove) => remove());
    map.remove();
  };
}
