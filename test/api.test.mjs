import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {request as httpRequest} from 'node:http';

test('HTTP API security, CRUD, images and errors',async()=>{
 const {server}=createApp({dbPath:':memory:'});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,method='GET',body,headers={})=>fetch(base+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 try {
  const index=await request('/');assert.equal(index.status,200);assert.ok(index.headers.get('Content-Security-Policy').includes("script-src 'self'"));assert.ok((await index.text()).includes('Werkheft'));
  assert.equal((await request('/lib/store.mjs')).status,404);const foreignHostStatus=await new Promise((ok,no)=>{const r=httpRequest(base+'/api/state',{headers:{host:'evil.example'}},res=>{res.resume();ok(res.statusCode);});r.on('error',no);r.end();});assert.equal(foreignHostStatus,403);
  assert.equal((await request('/api/demo','POST',{}, {Origin:'https://evil.example'})).status,403);
  assert.equal((await request('/api/state','GET',undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await fetch(base+'/api/demo',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(base+'/api/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})).status,400);
  assert.equal((await request('/api/vehicles','POST',{name:'Test',km:1234})).status,201);
  const state=await (await request('/api/state')).json();assert.equal(state.vehicles.length,1);assert.deepEqual(state.entries,[]);
  const v=state.vehicles[0];
  const d=await(await request('/api/documents','POST',{vehicleId:v.id,title:'Beleg',date:'2026-01-01',data:'data:image/png;base64,YQ=='})).json();
  const image=await request(`/api/documents/${d.id}/image`);assert.equal(image.headers.get('Content-Type'),'image/png');assert.equal(await image.text(),'a');
  const summary=await(await request('/api/state')).json();assert.equal(summary.documents[0].data,undefined);
  assert.equal((await request('/api/vehicles/'+v.id,'PUT',{...v,name:'Neu'})).status,200);
  assert.equal((await request('/api/vehicles/'+v.id,'PUT',{...v,name:'Alt'})).status,409);
  assert.equal((await request('/api/entries/not-existing')).status,404);
  assert.equal((await request('/api/vehicles/'+v.id,'DELETE')).status,400);
  const backup=await request('/api/export');assert.ok(backup.headers.get('Content-Disposition').includes('attachment'));assert.equal((await backup.json()).format,'werkheft');
 }finally{await new Promise(ok=>server.close(ok));}
});
