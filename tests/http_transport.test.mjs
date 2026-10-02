import test from 'node:test';
import assert from 'node:assert/strict';
import {environmentFetch} from '../src/http_transport.mjs';

test('transport rejects unknown destinations, plaintext external calls and credentials on public sources', async()=>{
  for(const url of ['https://example.invalid/','http://apis.data.go.kr/','https://user:password@apis.data.go.kr/','https://cleanup.seoul.go.kr/?serviceKey=TEST_ONLY_KEY']) {
    await assert.rejects(environmentFetch(url));
  }
});
test('local fixture transport refuses redirects without using the external proxy',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{assert.equal(url.hostname,'127.0.0.1');assert.equal(options.redirect,'error');return new Response('fixture');};
    assert.equal(await (await environmentFetch('http://127.0.0.1:1/')).text(),'fixture');
  } finally {globalThis.fetch=original;}
});
