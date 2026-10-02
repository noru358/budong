import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchRtmsTrades,
  fetchBuildingTitles,
} from '../src/adapters/data_go_kr.mjs';
import { environmentFetch } from '../src/http_transport.mjs';
import { queryLiveProjectData } from '../src/adapters/live_project_data.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function createAppServer({
  root = ROOT,
  env = process.env,
  fetchImpl = environmentFetch,
} = {}) {
  let activeRequests = 0;
  const mode =
    String(env.BUDONG_USE_MODE || 'PERSONAL').toUpperCase() === 'PERSONAL'
      ? 'PERSONAL'
      : 'COMMERCIAL';
  let tileUrl =
    env.BUDONG_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  let tileOrigin = 'https://tile.openstreetmap.org';
  try {
    const u = new URL(
      tileUrl
        .replaceAll('{z}', '11')
        .replaceAll('{x}', '1')
        .replaceAll('{y}', '1'),
    );
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.search ||
      !tileUrl.includes('{z}') ||
      !tileUrl.includes('{x}') ||
      !tileUrl.includes('{y}')
    )
      throw Error();
    tileOrigin = u.origin;
    if (
      tileOrigin !== 'https://tile.openstreetmap.org' &&
      !(
        env.BUDONG_TILE_REVIEWED === 'true' &&
        String(env.BUDONG_TILE_ATTRIBUTION || '').trim()
      )
    )
      throw Error();
  } catch {
    tileUrl = null;
    tileOrigin = 'https://tile.openstreetmap.org';
  }
  const escape = (value) =>
    String(value || '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET')
      return send(405, { error: '지원하지 않는 요청입니다.' });
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return send(400, { error: '요청 주소를 확인하세요.' });
    }
    // Private geometry is available only on a direct loopback connection.
    // A tunnel/domain or a server bound to a public interface is not private use.
    const loopback = (address) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
    const localPrivate = loopback(req.socket.localAddress) && loopback(req.socket.remoteAddress) &&
      /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host || '') &&
      loopback(res.socket?.server?.address()?.address);
    if (url.pathname === '/api/health')
      return send(200, {
        status: 'ok',
        live_data_configured: Boolean(env.DATA_GO_KR_SERVICE_KEY),
        case_storage: 'browser',
        use_mode: mode,
      });
    if (url.pathname === '/api/map-config')
      return send(200, {
        mode,
        runtime_context: localPrivate ? 'LOCAL_PRIVATE' : 'PUBLIC',
        tile_url: tileUrl,
        attribution:
          tileOrigin === 'https://tile.openstreetmap.org'
            ? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            : escape(env.BUDONG_TILE_ATTRIBUTION),
        source_id:
          tileOrigin === 'https://tile.openstreetmap.org'
            ? 'OSM_STANDARD_TILES'
            : 'CUSTOM_TILE_PROVIDER',
        scope: 'BACKGROUND_MAP_ONLY',
      });
    if (url.pathname.startsWith('/api/')) {
      const projectReference =
        /^\/api\/projects\/([a-zA-Z0-9-]+)\/reference$/.exec(url.pathname);
      if (
        !['/api/rtms', '/api/buildings'].includes(url.pathname) &&
        !projectReference
      )
        return send(404, { error: '지원하지 않는 조회입니다.' });
      if (!env.DATA_GO_KR_SERVICE_KEY)
        return send(503, {
          code: 'MISSING_SERVICE_KEY',
          error: '실데이터 조회 키가 등록되지 않았습니다.',
        });
      if (activeRequests >= 2)
        return send(429, {
          error: '다른 조회를 처리 중입니다. 잠시 후 다시 시도하세요.',
        });
      const values = Object.fromEntries(url.searchParams);
      const allowed = projectReference
        ? [
            'kind',
            'dealYmd',
            'bjdongCd',
            'bun',
            'ji',
            'platGbCd',
            'serviceType',
          ]
        : url.pathname === '/api/rtms'
          ? ['lawdCd', 'dealYmd', 'pageNo']
          : ['sigunguCd', 'bjdongCd', 'bun', 'ji', 'pageNo'];
      if (Object.keys(values).some((k) => !allowed.includes(k)))
        return send(400, { error: '조회 조건을 확인하세요.' });
      activeRequests++;
      try {
        if (projectReference) {
          const seed = JSON.parse(
            await fs.readFile(
              path.join(root, 'data/seoul_seed_v1.json'),
              'utf8',
            ),
          );
          const project = seed.projects.find(
            (p) => p.id === projectReference[1],
          );
          if (!project) return send(404, { error: '구역을 찾지 못했습니다.' });
          const { kind, ...query } = values;
          const result = await queryLiveProjectData({
            project,
            kind,
            query,
            env,
            fetchImpl,
            observedAt: new Date().toISOString(),
          });
          return send(200, result);
        }
        const args = {
          ...values,
          pageNo: values.pageNo || 1,
          numOfRows: 100,
          env,
          fetchImpl,
          observedAt: new Date().toISOString(),
        };
        const rows =
          url.pathname === '/api/rtms'
            ? await fetchRtmsTrades(args)
            : await fetchBuildingTitles(args);
        return send(200, {
          status: rows.length ? 'DATA_RECEIVED' : 'EMPTY_RESULT',
          observed_at: args.observedAt,
          rows,
        });
      } catch (error) {
        const message = String(error?.message || '');
        const validation =
          /must be|digits|positive integer|^Reference (?:query|kind) must|^Project requires|^Unsupported RTMS serviceType/.test(
            message,
          ) && !error?.providerCode;
        // Never send a provider's unfiltered text or a URL containing a key.
        const providerCode = /^\d{1,3}$/.test(String(error?.providerCode ?? ''))
          ? String(error.providerCode)
          : null;
        return send(validation ? 400 : 502, {
          code: validation ? 'INVALID_QUERY' : 'UPSTREAM_ERROR',
          provider_code: providerCode,
          error: validation
            ? '법정동 코드·계약년월·지번 조회 조건을 확인하세요.'
            : providerCode === '10'
              ? '공공데이터 제공기관이 요청 조건을 거절했습니다 (오류 10). 공식 조회 조건을 확인하세요.'
              : '공공데이터 조회에 실패했습니다. 키 승인 상태·네트워크와 서버 스모크 결과를 확인하세요.',
        });
      } finally {
        activeRequests--;
      }
    }
    if (url.pathname === '/') {
      res.writeHead(302, { location: '/web/' });
      return res.end();
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(400, { error: '주소를 확인하세요.' });
    }
    if (pathname === '/data/boundaries_v1.geojson' && (!localPrivate || mode !== 'PERSONAL'))
      return send(403, { error: '행정 참고경계는 로컬 개인용 환경에서만 표시합니다.' });
    if (pathname.endsWith('/')) pathname += 'index.html';
    if (
      !/^\/(web|src|data)\//.test(pathname) ||
      pathname.includes('\\') ||
      pathname.includes('\0') ||
      pathname.split('/').some((part) => part.startsWith('.'))
    )
      return send(404, { error: '파일을 찾지 못했습니다.' });
    const full = path.resolve(root, '.' + pathname);
    const rootPath = path.resolve(root);
    const type = TYPES[path.extname(full)];
    if (!full.startsWith(rootPath + path.sep) || !type)
      return send(404, { error: '파일을 찾지 못했습니다.' });
    try {
      const real = await fs.realpath(full);
      if (!real.startsWith(rootPath + path.sep))
        return send(404, { error: '파일을 찾지 못했습니다.' });
      if (real === path.resolve(root, 'data/boundaries_v1.geojson') && (!localPrivate || mode !== 'PERSONAL'))
        return send(403, { error: '행정 참고경계는 로컬 개인용 환경에서만 표시합니다.' });
      const body = await fs.readFile(real);
      res.writeHead(200, {
        'content-type': type,
        'cache-control': real === path.resolve(root, 'data/boundaries_v1.geojson') ? 'no-store' : 'no-cache',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'content-security-policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: " +
          tileOrigin +
          "; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      });
      res.end(body);
    } catch {
      send(404, { error: '파일을 찾지 못했습니다.' });
    }
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.BUDONG_HOST || '127.0.0.1';
  const server = createAppServer();
  server.on('error', (error) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? '포트가 사용 중입니다. 실행 중인 서버를 확인하세요.'
        : '서버를 시작하지 못했습니다.',
    );
    process.exitCode = 1;
  });
  server.listen(port, host, () =>
    console.log(`budong 개인 V5 서버 시작 (port ${port})`),
  );
}
