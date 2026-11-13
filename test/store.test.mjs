import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../lib/store.mjs';
const withStore=fn=>{const s=new Store(':memory:');try{return fn(s);}finally{s.close();}};
const car=s=>s.create('vehicles',{name:'Testauto',km:1000,owner:1});
const entry=(vehicleId,extra={})=>({vehicleId,title:'Ölwechsel',date:'2026-01-31',km:1200,cost:42,notes:'Originalwert',owner:1,...extra});
test('persistent SQLite survives restart',()=>{const dir=mkdtempSync(join(tmpdir(),'werkheft-'));try{let s=new Store(join(dir,'db.sqlite'));car(s);s.close();s=new Store(join(dir,'db.sqlite'));assert.equal(s.all('vehicles')[0].name,'Testauto');s.close();}finally{rmSync(dir,{recursive:true,force:true});}});
test('entries advance odometer, keep audit and reject stale writes',()=>withStore(s=>{
 const v=car(s),r=s.create('entries',entry(v.id));assert.equal(s.get('vehicles',v.id).km,1200);
 const changed=s.update('entries',r.id,{...r,title:'Ölwechsel korrigiert'});assert.equal(changed.revision,2);
 assert.throws(()=>s.update('entries',r.id,{...r,title:'Veraltete Änderung'}),/inzwischen/);
 const history=s.history('entries',r.id);assert.equal(history.length,2);assert.equal(history[0].before.title,'Ölwechsel');
 assert.throws(()=>s.update('vehicles',v.id,{...s.get('vehicles',v.id),km:10}),/Berichtigung/);
 const v2=s.get('vehicles',v.id);s.correctKm(v.id,{km:1190,reason:'Tippfehler korrigiert',revision:v2.revision});assert.equal(s.get('vehicles',v.id).km,1190);assert.ok(s.history('vehicles',v.id)[0].action.includes('Tippfehler'));
}));
test('routine completion is atomic and runs once',()=>withStore(s=>{
 const v=car(s),r=s.create('entries',entry(v.id,{intervalKm:15000,intervalMonths:1})),t=s.all('tasks')[0];
 assert.equal(t.dueKm,16200);assert.equal(t.dueDate,'2026-02-28');
 s.completeTask(t.id,{date:'2026-02-28',km:16500,revision:t.revision,cost:50});
 assert.equal(s.all('entries').length,2);assert.equal(s.get('tasks',t.id).done,true);
 const next=s.all('tasks').find(t=>!t.done);assert.equal(next.dueKm,31500);assert.equal(next.dueDate,'2026-03-28');
 assert.throws(()=>s.completeTask(t.id,{date:'2026-02-28',km:16500,revision:t.revision}));assert.equal(s.all('entries').length,2);
 const v2=car(s);const t2=s.create('tasks',{vehicleId:v2.id,title:'Test',dueKm:2000});
 assert.throws(()=>s.completeTask(t2.id,{date:'bad',km:5000,revision:t2.revision}));assert.equal(s.get('tasks',t2.id).done,false);assert.equal(s.get('vehicles',v2.id).km,1000);
}));
test('relationships and unique VIN are enforced',()=>withStore(s=>{
 const v=car(s);assert.throws(()=>s.create('entries',entry('missing')));
 const a=s.create('vehicles',{name:'A',vin:'WVWZZZ1JZ2W386752',km:1});assert.throws(()=>s.create('vehicles',{name:'B',vin:a.vin,km:1}));
 const r=s.create('entries',entry(v.id));assert.throws(()=>s.create('documents',{vehicleId:a.id,entryId:r.id,title:'Beleg',date:'2026-01-01',data:'data:image/png;base64,YQ=='}));
}));
test('full backup restores revisions, audits and image bytes; failed imports are atomic',()=>withStore(s=>{
 const v=car(s),r=s.create('entries',entry(v.id));s.update('entries',r.id,{...r,notes:'Korrigiert'});
 s.create('documents',{vehicleId:v.id,entryId:r.id,title:'Beleg',date:'2026-01-01',data:'data:image/png;base64,YQ=='});
 const b=s.export();s.import(b);assert.equal(s.all('documents')[0].data,'data:image/png;base64,YQ==');assert.equal(s.history('entries',r.id).length,2);
 const bad=structuredClone(b);bad.tasks.push({id:'broken',vehicleId:'unknown',title:'x',dueKm:5000,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});assert.throws(()=>s.import(bad));assert.equal(s.all('vehicles').length,1);
 const badAudit=structuredClone(b);badAudit.audit[0].beforeJson='no JSON';assert.throws(()=>s.import(badAudit));assert.equal(s.all('documents').length,1);
}));
test('transfer excludes private collections and amounts, retains local copy',()=>withStore(s=>{
 const v=s.create('vehicles',{name:'Auto',km:1000,owner:2,notes:'privat',photo:'data:image/png;base64,YQ=='});
 s.create('entries',entry(v.id));s.create('fuel',{vehicleId:v.id,date:'2026-01-01',km:1001,liters:20,cost:30,full:true});
 const b=s.transfer(v.id);assert.equal(b.fuel,undefined);assert.equal(b.vehicle.notes,undefined);assert.equal(b.vehicle.photo,undefined);assert.equal(b.entries[0].cost,undefined);assert.equal(b.documents,undefined);
 const other=new Store(':memory:');try{other.import(b);assert.equal(other.all('vehicles')[0].owner,3);assert.equal(other.all('entries')[0].owner,1);assert.equal(other.all('fuel').length,0);}finally{other.close();}assert.equal(s.all('vehicles').length,1);
}));
test('delete logs removal and detaches proof without deleting it',()=>withStore(s=>{
 const v=car(s),r=s.create('entries',entry(v.id)),d=s.create('documents',{vehicleId:v.id,entryId:r.id,title:'Beleg',date:'2026-01-01',data:'data:image/png;base64,YQ=='});
 s.remove('entries',r.id);assert.equal(s.get('documents',d.id).entryId,'');assert.equal(s.history('entries',r.id)[0].action,'delete');assert.throws(()=>s.remove('vehicles',v.id));
}));
