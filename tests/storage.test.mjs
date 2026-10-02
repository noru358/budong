import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceStore,STORAGE_KEY} from '../src/storage.mjs';
const memory = () => { const data=new Map(); return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,value)}; };
test('incomplete user case survives reopening without turning unknown into zero',()=>{
 const storage=memory(),store=createWorkspaceStore(storage);
 store.saveCase({id:'mine1',project_id:'real1',contract_price:null,exit:null,label:'내 물건'});
 assert.equal(createWorkspaceStore(storage).load().cases[0].contract_price,null);
 const loaded=store.load(); loaded.cases[0].label='외부변경'; assert.equal(store.load().cases[0].label,'내 물건');
});
test('editing replaces only the selected case and deletion persists',()=>{
 const store=createWorkspaceStore(memory());
 store.saveCase({id:'a',project_id:'p',label:'A'});store.saveCase({id:'b',project_id:'p',label:'B'});
 store.saveCase({id:'a',project_id:'p',label:'수정'});
 assert.equal(store.load().cases.length,2);assert.equal(store.load().cases[1].label,'B');
 store.deleteCase('a');assert.deepEqual(store.load().cases.map(c=>c.id),['b']);
});
test('recent projects are unique, ordered and capped',()=>{
 const store=createWorkspaceStore(memory());for(let i=0;i<12;i++)store.recordRecent('p'+i);
 store.recordRecent('p7');assert.equal(store.load().recentProjectIds[0],'p7');assert.equal(store.load().recentProjectIds.length,8);
 assert.equal(new Set(store.load().recentProjectIds).size,8);
});
test('corrupt storage blocks writes and preserves original bytes',()=>{
 const storage=memory();storage.setItem(STORAGE_KEY,'broken');const store=createWorkspaceStore(storage);
 assert.throws(()=>store.saveCase({id:'a',project_id:'p'}),/덮어쓰지/);assert.equal(storage.getItem(STORAGE_KEY),'broken');
 storage.setItem(STORAGE_KEY,JSON.stringify({version:2,cases:[],recentProjectIds:[]}));assert.throws(()=>store.recordRecent('p'),/형식/);
});
test('quota and unavailable storage errors reach the caller',()=>{
 const storage=memory();storage.setItem=()=>{throw new Error('quota exceeded')};
 assert.throws(()=>createWorkspaceStore(storage).saveCase({id:'a',project_id:'p'}),/quota/);
 assert.throws(()=>createWorkspaceStore(null).load(),/로컬 저장/);
});
