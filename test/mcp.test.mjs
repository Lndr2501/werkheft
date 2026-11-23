import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {request} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createApp} from '../server.mjs';

async function start(t,options={}) {
  const app=createApp({dbPath:':memory:',...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  return {...app,url:new URL(`http://127.0.0.1:${app.server.address().port}/mcp`)};
}

const token=randomBytes(32).toString('hex'),writeToken=randomBytes(32).toString('hex');
const connector=(url,token)=>new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}});
const rpc=(url,options={})=>fetch(url,{
  method:'POST',
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),
  ...options,
  headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...options.headers}
});

test('connector is disabled by default and rejects unsafe tokens',async t=>{
  assert.throws(()=>createApp({dbPath:':memory:',mcpToken:'1234'}),/Tokendatei/);
  assert.throws(()=>createApp({dbPath:':memory:',mcpWriteToken:writeToken}),/separates Token/);
  assert.throws(()=>createApp({dbPath:':memory:',mcpToken:token,mcpWriteToken:token}),/separates Token/);
  const {url}=await start(t);
  assert.equal((await rpc(url,{headers:{Authorization:`Bearer ${token}`}})).status,404);
  const state=await fetch(new URL('/api/state',url)).then(r=>r.json());
  assert.equal(state.mcpEnabled,false);
});

test('enabled connector requires a bearer token and respects origin and host checks',async t=>{
  const {url}=await start(t,{mcpToken:token,privateLAN:true});
  const denied=await rpc(url);
  assert.equal(denied.status,401);
  assert.match(denied.headers.get('www-authenticate'),/^Bearer/);
  assert.equal((await rpc(url,{headers:{Authorization:'Bearer wrong'}})).status,401);
  const auth={Authorization:`Bearer ${token}`};
  assert.equal((await rpc(url,{headers:{...auth,Origin:'https://example.org'}})).status,403);
  assert.equal((await rpc(url,{headers:{...auth,'Sec-Fetch-Site':'cross-site'}})).status,403);
  const hostStatus=await new Promise((resolve,reject)=>{
    const req=request(url,{method:'POST',headers:{...auth,Host:'example.org'}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.end();
  });
  assert.equal(hostStatus,403);
  const get=await fetch(url,{headers:auth});
  assert.equal(get.status,405);
  assert.equal(get.headers.get('allow'),'POST');
  assert.equal((await rpc(url,{headers:auth,body:'{'})).status,400);
  assert.equal((await rpc(url,{headers:auth,body:JSON.stringify({oversize:'a'.repeat(65536)})})).status,413);
  const state=await fetch(new URL('/api/state',url)).then(r=>r.text());
  assert.equal(JSON.parse(state).mcpEnabled,true);
  assert.ok(!state.includes(token));
});

test('SDK client can only read paginated, minimized vehicle data',async t=>{
  const {store,url}=await start(t,{mcpToken:token});
  const {id}=store.create('vehicles',{name:'Testauto',km:120,vin:'WVWZZZ1JZ2W386752',notes:'private notes',engine:'Testmotor',hu:'2025-01-01'});
  const other=store.create('vehicles',{name:'Anderes Auto'});
  const archived=store.create('vehicles',{name:'Archiviert',archived:true});
  store.create('entries',{vehicleId:id,title:'Ältere Arbeit',date:'2024-01-01',km:90});
  store.create('entries',{vehicleId:id,title:'Ölwechsel',date:'2025-01-01',km:110,cost:42,notes:'private entry'});
  store.create('entries',{vehicleId:other.id,title:'Fremde Arbeit',date:'2025-01-01',km:50});
  store.create('tasks',{vehicleId:id,title:'Offene Arbeit',dueKm:110,notes:'private task'});
  store.create('tasks',{vehicleId:id,title:'Erledigte Arbeit',dueDate:'2025-01-01',done:true});
  store.addReading(id,{date:'2025-02-01',km:120,notes:'private reading'});
  const current=store.get('vehicles',id);
  store.correctKm(id,{km:115,revision:current.revision,reason:'private correction'});
  store.create('documents',{vehicleId:id,date:'2025-01-01',title:'Private Rechnung',data:'data:image/png;base64,AAAA'});
  const {exportedAt:_,...before}=store.export();

  const client=new Client({name:'werkheft-test',version:'1.0.0'});
  await client.connect(connector(url,token));
  try{
    const {tools}=await client.listTools();
    assert.deepEqual(tools.map(t=>t.name).sort(),['get_vehicle_specs','list_mileage_readings','list_open_tasks','list_service_entries','list_vehicles']);
    assert.ok(tools.every(t=>t.annotations.readOnlyHint&&!t.annotations.openWorldHint));
    const call=(name,args={})=>client.callTool({name,arguments:args});
    const vehicles=(await call('list_vehicles',{limit:1})).structuredContent;
    assert.deepEqual(vehicles.items.map(v=>v.id),[id]);
    assert.equal(vehicles.nextOffset,1);
    assert.deepEqual((await call('list_vehicles',{offset:1})).structuredContent.items.map(v=>v.id),[other.id]);
    const specs=(await call('get_vehicle_specs',{vehicleId:id})).structuredContent;
    assert.equal(specs.engine,'Testmotor');
    assert.equal(specs.km,115);
    for(const key of ['vin','photo','notes'])assert.ok(!Object.hasOwn(specs,key));
    const entries=(await call('list_service_entries',{vehicleId:id,limit:1})).structuredContent;
    assert.deepEqual(entries,{items:[{title:'Ölwechsel',date:'2025-01-01',km:110,category:'Wartung',who:'Selbst gemacht'}],nextOffset:1});
    const tasks=(await call('list_open_tasks',{vehicleId:id})).structuredContent;
    assert.deepEqual(tasks.items.map(t=>[t.title,t.status]),[['Hauptuntersuchung (HU)','overdue'],['Offene Arbeit','overdue']]);
    assert.ok(tasks.items.every(t=>!Object.hasOwn(t,'notes')));
    const miles=(await call('list_mileage_readings',{vehicleId:id})).structuredContent;
    assert.equal(miles.items.length,1);
    assert.equal(miles.items[0].km,115);
    assert.ok(!Object.hasOwn(miles.items[0],'notes'));
    assert.equal((await call('get_vehicle_specs',{vehicleId:archived.id})).isError,true);
    assert.equal((await call('list_vehicles',{limit:500})).isError,true);
    assert.equal((await call('delete_vehicle',{vehicleId:id})).isError,true);
    const {exportedAt:_,...after}=store.export();
    assert.deepEqual(after,before);
  }finally{await client.close();}
});

test('separate write token can only append confirmed service entries without duplicates',async t=>{
  const {store,url}=await start(t,{mcpToken:token,mcpWriteToken:writeToken});
  const {id}=store.create('vehicles',{name:'Testauto',km:1000,owner:3});
  const reader=new Client({name:'reader',version:'1.0.0'});
  const writer=new Client({name:'writer',version:'1.0.0'});
  await reader.connect(connector(url,token));
  await writer.connect(connector(url,writeToken));
  try{
    assert.equal((await reader.listTools()).tools.some(t=>t.name==='add_service_entry'),false);
    assert.equal((await writer.listTools()).tools.some(t=>t.name==='add_service_entry'),true);
    const args={vehicleId:id,title:'Ölwechsel',date:'2025-01-01',km:1100,confirmed:true};
    const call=(client,arguments_)=>client.callTool({name:'add_service_entry',arguments:arguments_});
    assert.equal((await call(reader,args)).isError,true);
    assert.equal((await call(writer,{...args,confirmed:false})).isError,true);
    assert.equal((await call(writer,{...args,date:'9999-01-01'})).isError,true);
    assert.equal(store.all('entries').length,0);
    const added=(await call(writer,args)).structuredContent;
    const duplicate=(await call(writer,args)).structuredContent;
    assert.equal(added.created,true);
    assert.equal(duplicate.created,false);
    assert.equal(duplicate.id,added.id);
    assert.equal(store.all('entries').length,1);
    assert.equal(store.get('entries',added.id).owner,3);
    assert.equal(store.get('vehicles',id).km,1100);
    assert.equal(store.history('entries',added.id)[0].action,'create-via-mcp');
  }finally{await Promise.all([reader.close(),writer.close()]);}
});
