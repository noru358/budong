import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../scripts/serve.mjs';

async function withServer(config, callback) {
  const server = createAppServer(config);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('server serves application and blocks private/setup files', async () => {
  await withServer({}, async base => {
    assert.equal((await fetch(base+'/web/')).status,200);
    assert.equal((await fetch(base+'/src/finance.mjs')).status,200);
    for (const p of ['/package.json','/.env','/.git/config','/web/%2e%2e/%2e%2e/.env','/data/%2e%2e/.env']) assert.equal((await fetch(base+p)).status,404);
  });
});
test('health never includes key and missing key blocks live calls', async () => {
  await withServer({}, async base => {
    const health=await (await fetch(base+'/api/health')).json();
    assert.equal(health.live_data_configured,false);
    assert.equal((await fetch(base+'/api/rtms')).status,503);
  });
  await withServer({env:{DATA_GO_KR_SERVICE_KEY:'TEST_PRIVATE_KEY'}}, async base => {
    const raw=await (await fetch(base+'/api/health')).text();
    assert.ok(!raw.includes('TEST_PRIVATE_KEY'));
    assert.equal(JSON.parse(raw).live_data_configured,true);
  });
});
test('live route returns normalized rows and rejects arbitrary endpoints', async () => {
  const fetchImpl=async () => new Response('<response><header><resultCode>000</resultCode></header><body><items><item><umdNm>상도동</umdNm><dealYear>2026</dealYear><dealMonth>9</dealMonth><dealDay>1</dealDay><dealAmount>10,000</dealAmount></item></items></body></response>');
  await withServer({env:{DATA_GO_KR_SERVICE_KEY:'TEST_ONLY_KEY'},fetchImpl}, async base => {
    const r=await fetch(base+'/api/rtms?lawdCd=11590&dealYmd=202609');
    assert.equal(r.status,200);
    const d=await r.json(); assert.equal(d.rows[0].legal_dong,'상도동'); assert.equal(d.rows[0].deal_amount_10k_krw,10000);
    assert.equal((await fetch(base+'/api/rtms?endpoint=https://example.com')).status,400);
  });
});
test('upstream errors redact even a secret-bearing failure', async () => {
  await withServer({env:{DATA_GO_KR_SERVICE_KEY:'TEST_PRIVATE_KEY'},fetchImpl:async()=>{throw new Error('https://apis.data.go.kr/?serviceKey=TEST_PRIVATE_KEY');}}, async base => {
    const r=await fetch(base+'/api/rtms?lawdCd=11590&dealYmd=202609');
    assert.equal(r.status,502); assert.ok(!(await r.text()).includes('TEST_PRIVATE_KEY'));
  });
});
test('provider request error is distinguished from secret configuration and parsing errors', async () => {
  const fetchImpl=async()=>new Response('<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>INVALID_REQUEST_PARAMETER_ERROR</errMsg><returnAuthMsg>잘못된 요청 파라미터 에러</returnAuthMsg><returnReasonCode>10</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',{status:400});
  await withServer({env:{DATA_GO_KR_SERVICE_KEY:'TEST_PRIVATE_KEY'},fetchImpl}, async base => {
    const r=await fetch(base+'/api/rtms?lawdCd=11110&dealYmd=202401');
    assert.equal(r.status,502);
    const body=await r.json();
    assert.equal(body.provider_code,'10');
    assert.ok(body.error.includes('요청 조건'));
    assert.ok(!JSON.stringify(body).includes('TEST_PRIVATE_KEY'));
  });
});
