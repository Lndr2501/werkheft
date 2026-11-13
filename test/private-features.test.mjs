import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import {RaceService} from '../lib/races.mjs';
import {createRace,stepRace} from '../public/race-engine.js';

test('empty boxes persist, rename moves contents, colors/order survive backup',()=>{
 const s=new Store(':memory:');try{
  s.saveBox({name:'A',color:'blue'});s.saveBox({name:'B',color:'green'});assert.equal(s.boxes().length,2);
  s.create('shelf',{title:'Schlüssel',box:'A',quantity:1});s.saveBox({oldName:'A',name:'C',color:'orange',beforeName:'B'});assert.equal(s.all('shelf')[0].box,'C');assert.equal(s.boxes()[0].name,'C');assert.throws(()=>s.removeBox({name:'C'}));
  s.saveBox({oldName:'C',name:'C',color:'blue',direction:'right'});assert.equal(s.boxes()[1].name,'C');const backup=s.export();s.import(backup);assert.equal(s.boxes()[1].color,'blue');s.removeBox({name:'B'});assert.equal(s.boxes().length,1);
 }finally{s.close();}
});
test('historical readings do not lower current mileage, contradictory values rejected',()=>{
 const s=new Store(':memory:');try{
  const v=s.create('vehicles',{name:'Auto',km:10000,owner:1});s.addReading(v.id,{date:'2020-01-01',km:4000});s.addReading(v.id,{date:'2021-01-01',km:5000});assert.equal(s.get('vehicles',v.id).km,10000);assert.equal(s.all('readings').length,2);
  assert.throws(()=>s.addReading(v.id,{date:'2019-01-01',km:6000}));assert.throws(()=>s.addReading(v.id,{date:'2099-01-01',km:20000}));const backup=s.export();s.import(backup);assert.equal(s.all('readings').length,2);
 }finally{s.close();}
});
test('Nachtfahrt is deterministic, verifies elapsed time and persists local scores',()=>{
 const s=new Store(':memory:');try{
  const a=createRace(1234),b=createRace(1234);while(!a.done)stepRace(a,['gas']);while(!b.done)stepRace(b,['gas']);assert.deepEqual(a,b);assert.ok(a.tick<=1800);
  const race=new RaceService(s),run=race.start({name:'Testfahrer'});assert.throws(()=>race.finish({id:run.id,events:[]}));race.runs.get(run.id).started-=70000;const result=race.finish({id:run.id,events:[]});assert.ok(result.score>0);assert.equal(race.ranking().rows[0].name,'Testfahrer');assert.throws(()=>race.finish({id:run.id,events:[]}));
  s.import(s.export());assert.equal(new RaceService(s).ranking().rows[0].score,result.score);
 }finally{s.close();}
});
test('private LAN mode serves without login but rejects foreign Host/Origin',async()=>{
 const {server}=createApp({dbPath:':memory:',privateLAN:true,allowedHosts:['192.168.178.230']});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/healthz')).status,200);assert.equal((await fetch(base+'/api/state')).status,200);assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
  assert.equal((await fetch(base+'/api/demo',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://evil.example'},body:'{}'})).status,403);
 }finally{await new Promise(ok=>server.close(ok));}
});
