import {spawn} from 'node:child_process';

// urllib uses the platform's HTTPS proxy and trust store. Credentials travel
// through stdin, never command arguments, console output or generated files.
const BRIDGE = String.raw`
import sys, json, urllib.request, urllib.error, ssl, os, socket, re
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
try:
    request = json.load(sys.stdin)
    context = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or None)
    opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=context))
    req = urllib.request.Request(request['url'], headers=request.get('headers', {}))
    try:
        response = opener.open(req, timeout=request.get('timeout', 20))
    except urllib.error.HTTPError as error:
        response = error
    body = response.read(4 * 1024 * 1024 + 1)
    if len(body) > 4 * 1024 * 1024:
        raise ValueError('response limit')
    charset = response.headers.get_content_charset()
    if not charset:
        meta = re.search(br'<meta[^>]+charset\s*=\s*["\x27]?([a-zA-Z0-9_-]+)', body[:8192], re.I)
        charset = meta.group(1).decode('ascii') if meta else 'utf-8'
    if charset.lower().replace('_', '-') not in ['utf-8', 'utf8', 'utf-8-sig', 'euc-kr', 'cp949', 'ks-c-5601-1987', 'iso-8859-1', 'us-ascii']:
        raise UnicodeError('unsupported response charset')
    text = body.decode(charset)
    print(json.dumps({'status':response.code, 'body':text, 'content_type':response.headers.get('Content-Type','')}))
except Exception as error:
    # Exception strings can include the credential-bearing request URL.
    reason = getattr(error, 'reason', error)
    kind = 'TEXT_ENCODING_ERROR' if isinstance(reason, (UnicodeError, LookupError)) else 'TLS_ERROR' if isinstance(reason, ssl.SSLError) else 'TIMEOUT' if isinstance(reason, (TimeoutError, socket.timeout)) else 'NETWORK_ERROR'
    print(json.dumps({'error':kind}))
`;

export async function environmentFetch(url, options = {}) {
  const target = new URL(url);
  const publicHosts = new Set(['apis.data.go.kr','cleanup.seoul.go.kr','data.seoul.go.kr','www.eum.go.kr','news.seoul.go.kr','www.songpa.go.kr','www.data.go.kr','data.go.kr']);
  const local = ['127.0.0.1','localhost','[::1]'].includes(target.hostname);
  if ((!local && (target.protocol !== 'https:' || !publicHosts.has(target.hostname))) || (local && !['http:','https:'].includes(target.protocol)) || target.username || target.password) {
    throw new Error('지원하지 않는 데이터 목적지입니다.');
  }
  if (target.hostname !== 'apis.data.go.kr' && [...target.searchParams.keys()].some(name => /servicekey|api_key|token/i.test(name))) throw new Error('인증키를 이 목적지로 전송할 수 없습니다.');
  if (local) return fetch(target, {...options, redirect:'error'});
  if (!process.env.HTTPS_PROXY && !process.env.https_proxy) return fetch(target, {...options, redirect:'error'});
  const signal = options.signal;
  if (signal?.aborted) throw new Error('API 요청이 중단되었습니다.');
  const payload = await new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', BRIDGE], {stdio:['pipe', 'pipe', 'pipe']});
    let output = '', size = 0, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) { child.kill(); reject(error); } else resolve(value);
    };
    const abort = () => finish(new Error('API 요청이 중단되었습니다.'));
    const timer = setTimeout(() => finish(new Error('API 요청 시간이 초과되었습니다.')), 25000);
    signal?.addEventListener('abort', abort, {once:true});
    child.on('error', () => finish(new Error('API 프록시 전송을 시작하지 못했습니다.')));
    child.stderr.on('data', () => {});
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) return finish(new Error('API 응답 크기를 초과했습니다.'));
      output += chunk.toString();
    });
    child.on('close', code => {
      if (code !== 0) return finish(new Error('API 프록시 전송에 실패했습니다.'));
      try { finish(null, JSON.parse(output)); } catch { finish(new Error('API 프록시 응답을 읽지 못했습니다.')); }
    });
    child.stdin.on('error', () => finish(new Error('API 프록시 전송에 실패했습니다.')));
    child.stdin.end(JSON.stringify({url:target.href, headers:Object.fromEntries(new Headers(options.headers)), timeout:20}));
  });
  if (payload.error) throw new Error(payload.error === 'TEXT_ENCODING_ERROR' ? '공식 자료의 문자 인코딩을 읽지 못했습니다.' : payload.error === 'TLS_ERROR' ? 'API TLS 인증서 검증에 실패했습니다.' : payload.error === 'TIMEOUT' ? 'API 요청 시간이 초과되었습니다.' : 'API 네트워크 연결에 실패했습니다. 환경의 도메인 허용·프록시 설정을 확인하세요.');
  return new Response(payload.body, {status:payload.status, headers:{'content-type':payload.content_type}});
}
