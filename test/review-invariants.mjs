import {mock} from 'node:test';
import {Store} from '../lib/store.mjs';
const findings=[];
let store;
try{
 mock.timers.enable({apis:['Date'],now:new Date('2026-01-01T12:00:00Z')});
 store=new Store(':memory:');const vehicle=store.create('vehicles',{name:'Testauto',km:1000,owner:1});
 store.addReading(vehicle.id,{date:'2026-01-01',km:1200});
 const current=store.get('vehicles',vehicle.id);store.correctKm(vehicle.id,{km:1190,revision:current.revision,reason:'Tippfehler bei der Ablesung berichtigt'});
 mock.timers.tick(86400000);
 try{store.addReading(vehicle.id,{date:'2026-01-02',km:1195});findings.push({id:'F02',status:'passed'});}catch(error){findings.push({id:'F02',status:'failed',severity:'medium',title:'Berichtigter Kilometerstand blockiert eine plausible spätere Ablesung',steps:['1. Tag: Ablesung 1200 km','1. Tag: auf 1190 km berichtigen','2. Tag: plausible 1195 km melden'],actualStatus:error.status,actual:error.message,currentKm:store.get('vehicles',vehicle.id).km,oldIncorrectValueStillEffective:store.all('readings').some(r=>r.kind==='reading'&&r.km===1200),source:'lib/store.mjs: addReading/correctKm'});}
}finally{store?.close();mock.timers.reset();}
console.log(JSON.stringify({clock:'simuliert nur in diesem isolierten Testprozess',findings},null,2));
