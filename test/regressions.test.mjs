import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../lib/store.mjs';
import {InputError} from '../lib/domain.mjs';
import {createApp} from '../server.mjs';
import {RaceService} from '../lib/races.mjs';
const proof='data:image/png;base64,YQ==';
function fixture(s){const a=s.create('vehicles',{name:'A',km:1000,owner:1}),b=s.create('vehicles',{name:'B',km:1000,owner:1});const entry=s.create('entries',{vehicleId:a.id,title:'Arbeit',date:'2026-01-01',km:1200,cost:20,owner:1});const docs=[1,2].map(n=>s.create('documents',{vehicleId:a.id,entryId:entry.id,title:'Beleg '+n,date:'2026-01-01',data:proof}));return {a,b,entry,docs};}

test('F01: moving an entry atomically moves linked proof, preserves audit and restores its backup',()=>{
 const s=new Store(':memory:');try{const {a,b,entry,docs}=fixture(s);const unrelated=s.create('documents',{vehicleId:a.id,title:'Nicht zugeordnet',date:'2026-01-01',data:proof});const moved=s.update('entries',entry.id,{...entry,vehicleId:b.id});
  for(const doc of docs){const actual=s.get('documents',doc.id);assert.equal(actual.vehicleId,b.id);assert.equal(actual.entryId,entry.id);assert.equal(actual.data,proof);assert.equal(actual.createdAt,doc.createdAt);assert.equal(actual.revision,doc.revision+1);const audit=s.history('documents',doc.id)[0];assert.equal(audit.before.vehicleId,a.id);assert.equal(audit.after.vehicleId,b.id);}
  assert.equal(s.get('documents',unrelated.id).vehicleId,a.id);assert.throws(()=>s.update('entries',entry.id,{...entry,vehicleId:a.id}),e=>e.status===409);assert.equal(s.get('entries',entry.id).vehicleId,b.id);
  s.import(s.export());assert.equal(s.get('entries',moved.id).vehicleId,b.id);assert.ok(s.all('documents').filter(d=>d.entryId===entry.id).every(d=>d.vehicleId===b.id));
 }finally{s.close();}
});
test('F01: proof-update failure rolls back entry, destination mileage and audit together',()=>{
 const s=new Store(':memory:');try{const {a,b,entry,docs}=fixture(s),audit=s.export().audit.length,put=s.put.bind(s);s.put=(type,...args)=>{if(type==='documents')throw new Error('Injected test failure');return put(type,...args);};
  assert.throws(()=>s.update('entries',entry.id,{...entry,vehicleId:b.id}),/Injected/);assert.equal(s.get('entries',entry.id).vehicleId,a.id);assert.equal(s.get('documents',docs[0].id).vehicleId,a.id);assert.equal(s.get('vehicles',b.id).km,b.km);assert.equal(s.export().audit.length,audit);
 }finally{s.close();}
});
test('F01: startup repairs old mismatched entry/proof links without changing image bytes',()=>{
 const directory=mkdtempSync(join(tmpdir(),'werkheft-repair-')),path=join(directory,'db.sqlite');let s;try{s=new Store(path);const {b,entry,docs}=fixture(s);s.db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({...entry,vehicleId:b.id}),entry.id);s.close();s=new Store(path);
  assert.equal(s.get('documents',docs[0].id).vehicleId,b.id);assert.equal(s.get('documents',docs[0].id).data,proof);assert.equal(s.repairs.documents,2);assert.equal(s.history('documents',docs[0].id)[0].action,'repair-entry-vehicle-link');s.import(s.export());s.close();s=new Store(path);assert.equal(s.repairs.documents,0);
 }finally{s?.close();rmSync(directory,{recursive:true,force:true});}
});
test('F02: correction supersedes the wrong reading across a day boundary, including chained corrections and restore',t=>{
 const s=new Store(':memory:');t.mock.timers.enable({apis:['Date'],now:new Date('2026-01-01T12:00:00Z')});try{const v=s.create('vehicles',{name:'Auto',km:1000,owner:1});const wrong=s.addReading(v.id,{date:'2026-01-01',km:1200});let current=s.get('vehicles',v.id);s.correctKm(v.id,{km:1190,reason:'Tippfehler korrigiert',revision:current.revision});let correction=s.all('readings').at(-1);assert.equal(correction.supersedes,wrong.id);
  current=s.get('vehicles',v.id);s.correctKm(v.id,{km:1180,reason:'Erneut nach Foto korrigiert',revision:current.revision});assert.equal(s.all('readings').at(-1).supersedes,correction.id);s.import(s.export());t.mock.timers.tick(86400000);s.addReading(v.id,{date:'2026-01-02',km:1185});assert.equal(s.get('vehicles',v.id).km,1185);assert.equal(s.get('readings',wrong.id).km,1200);assert.equal(s.effectiveReadings(v.id).length,2);assert.throws(()=>s.addReading(v.id,{date:'2025-12-31',km:1190}),e=>e.status===409);
 }finally{s.close();t.mock.timers.reset();}
});
test('F02: legacy correction without supersedes is reconstructed from its audited previous mileage',t=>{
 const directory=mkdtempSync(join(tmpdir(),'werkheft-old-correction-')),path=join(directory,'db.sqlite');let s;t.mock.timers.enable({apis:['Date'],now:new Date('2026-01-01T12:00:00Z')});try{s=new Store(path);const v=s.create('vehicles',{name:'Auto',km:1000,owner:1});const wrong=s.addReading(v.id,{date:'2026-01-01',km:1200});const current=s.get('vehicles',v.id);s.correctKm(v.id,{km:1190,reason:'Tippfehler korrigiert',revision:current.revision});const correction=s.all('readings').at(-1);delete correction.supersedes;s.db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(correction),correction.id);s.close();s=new Store(path);
  assert.equal(s.get('readings',correction.id).supersedes,wrong.id);assert.equal(s.repairs.corrections,1);t.mock.timers.tick(86400000);s.addReading(v.id,{date:'2026-01-02',km:1195});assert.equal(s.get('vehicles',v.id).km,1195);s.close();s=new Store(path);assert.equal(s.repairs.corrections,0);
 }finally{s?.close();t.mock.timers.reset();rmSync(directory,{recursive:true,force:true});}
});
test('F02: backup rejects cross-vehicle or cyclic correction links without replacing live data',t=>{
 const s=new Store(':memory:');t.mock.timers.enable({apis:['Date'],now:new Date('2026-01-01T12:00:00Z')});try{const {a,b}=fixture(s);const reading=s.addReading(b.id,{date:'2025-12-31',km:500});const own=s.addReading(a.id,{date:'2025-12-31',km:500});const bad=s.export();bad.readings[0]={...bad.readings[0],kind:'correction',supersedes:own.id};assert.throws(()=>s.import(bad),e=>e.status===400);assert.equal(s.get('readings',reading.id).kind,'reading');const cycle=s.export();cycle.readings[0]={...cycle.readings[0],kind:'correction',supersedes:reading.id};assert.throws(()=>s.import(cycle),e=>e.status===400);
 }finally{s.close();t.mock.timers.reset();}
});
test('F05: special handlers reject non-object inputs and malformed race events as InputError',()=>{
 const s=new Store(':memory:');try{const race=new RaceService(s);for(const input of [null,[],true,42,'x'])for(const operation of [()=>s.saveBox(input),()=>s.removeBox(input),()=>race.start(input),()=>race.finish(input)])assert.throws(operation,e=>e instanceof InputError&&e.status===400);const run=race.start({name:'Testfahrer'});for(const event of [null,[],{},true])assert.throws(()=>race.finish({id:run.id,events:[event]}),e=>e instanceof InputError&&e.status===400);
 }finally{s.close();}
});
test('F05: HTTP JSON roots null, array, scalar and malformed nested imports return 400, never 500',async()=>{
 const {server}=createApp({dbPath:':memory:'});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;try{for(const path of ['boxes','race/start','race/finish','import'])for(const body of [null,[],true,42,'x']){const response=await fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,400,path+': '+JSON.stringify(body));}const snapshot=await(await fetch(base+'/api/export')).json();for(const change of [{vehicles:[null]},{boxes:[null]},{raceScores:[null]},{audit:[null]}]){const response=await fetch(base+'/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...snapshot,...change})});assert.equal(response.status,400);}assert.equal((await fetch(base+'/healthz')).status,200);
 }finally{await new Promise(ok=>server.close(ok));}
});
