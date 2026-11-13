import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,taskStatus,addMonths,fuelConsumption,safeURL} from '../lib/domain.mjs';
test('VIN validation and arbitrary code links',()=>{
 assert.equal(validate('vehicles',{name:'Oldtimer',km:0}).vin,'');
 assert.throws(()=>validate('vehicles',{name:'Auto',vin:'<script>'}));
 assert.throws(()=>safeURL('javascript:alert(1)'));
 assert.throws(()=>safeURL('https://user:pass@example.com'));
 assert.equal(safeURL('https://example.com/part'),'https://example.com/part');
});
test('finite positive input and real calendar dates',()=>{
 assert.throws(()=>validate('fuel',{vehicleId:'v',date:'2026-02-30',liters:3,cost:5}));
 assert.throws(()=>validate('fuel',{vehicleId:'v',date:'2026-01-01',liters:-1,cost:5}));
 assert.throws(()=>validate('expenses',{vehicleId:'v',date:'2026-01-01',title:'test',cost:Infinity}));
 assert.throws(()=>validate('tasks',{vehicleId:'v',title:'Kein Ziel'}));
});
test('due status uses either threshold, done overrides',()=>{
 const v={km:10000};
 assert.equal(taskStatus({dueKm:9000,dueDate:'2030-01-01'},v,'2026-01-01'),'overdue');
 assert.equal(taskStatus({dueKm:99000,dueDate:'2026-01-01'},v,'2026-01-01'),'overdue');
 assert.equal(taskStatus({dueKm:12500},v,'2026-01-01'),'soon');
 assert.equal(taskStatus({dueKm:20000,dueDate:'2026-02-01'},v,'2026-01-01'),'planned');
 assert.equal(taskStatus({done:true,dueKm:1},v),'done');
});
test('month addition clamps day rather than rolling over',()=>{
 assert.equal(addMonths('2026-01-31',1),'2026-02-28');
 assert.equal(addMonths('2024-01-31',1),'2024-02-29');
 assert.equal(addMonths('2024-02-29',12),'2025-02-28');
});
test('fuel calculation counts partial fills and needs full anchors',()=>{
 const r=fuelConsumption([{id:'a',km:0,liters:40,full:true,date:'2026-01-01'},{id:'b',km:200,liters:12,full:false,date:'2026-01-05'},{id:'c',km:600,liters:24,full:true,date:'2026-01-10'}]);
 assert.equal(r.average,6);assert.equal(r.points.length,1);assert.equal(r.points[0].liters,36);
 assert.equal(fuelConsumption([{km:100,liters:20,full:false}]).average,null);
});
