import {createHash,timingSafeEqual} from 'node:crypto';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {taskStatus} from './domain.mjs';

const vehicleId=z.string().min(1).max(80).describe('Fahrzeug-ID aus list_vehicles');
const paging={limit:z.number().int().min(1).max(50).optional(),offset:z.number().int().min(0).max(100000).optional()};
const readOnly={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const statuses={overdue:0,soon:1,planned:2};
const dataResult=data=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data});
const page=(rows,{limit=20,offset=0})=>dataResult({
  items:rows.slice(offset,offset+limit),
  nextOffset:offset+limit<rows.length?offset+limit:null
});
const digest=value=>createHash('sha256').update(value).digest();

export function mcpAuthorizer(token) {
  if(token===undefined)return null;
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(token))throw new Error('Die MCP-Tokendatei muss ein zufälliges Base64url- oder Hex-Token mit 32–128 Zeichen enthalten.');
  const expected=digest(token);
  return header=>typeof header==='string'&&header.startsWith('Bearer ')&&timingSafeEqual(digest(header.slice(7)),expected);
}

function makeMcp(store,mayWrite) {
  const mcp=new McpServer({name:'werkheft',version:'1.0.0'});
  const tool=(name,description,inputSchema,handler)=>mcp.registerTool(name,{description,inputSchema,annotations:readOnly},handler);
  const getVehicle=id=>{
    const vehicle=store.get('vehicles',id);
    if(vehicle.archived)throw new Error('Dieses Fahrzeug ist archiviert.');
    return vehicle;
  };
  tool('list_vehicles','Aktive Fahrzeuge mit IDs, Modell und aktuellem Kilometerstand.',paging,args=>{
    const rows=store.all('vehicles').filter(v=>!v.archived).map(({id,name,make,model,year,km})=>({id,name,make,model,year,km}));
    return page(rows,args);
  });
  tool('get_vehicle_specs','Technische Stammdaten und nächste HU zu einem aktiven Fahrzeug. Keine VIN, Bilder oder Notizen.',{vehicleId},args=>{
    const {id,name,make,model,year,firstRegistration,km,hsn,tsn,engine,gearbox,color,tires,oil,hu}=getVehicle(args.vehicleId);
    return dataResult({id,name,make,model,year,firstRegistration,km,hsn,tsn,engine,gearbox,color,tires,oil,hu});
  });
  tool('list_service_entries','Arbeiten eines aktiven Fahrzeugs, neueste zuerst. Ohne Freitext, Kosten oder Nachweise.',{vehicleId,...paging},args=>{
    const {id}=getVehicle(args.vehicleId);
    const rows=store.all('entries').filter(r=>r.vehicleId===id)
      .sort((a,b)=>b.date.localeCompare(a.date)||b.km-a.km)
      .map(({title,date,km,category,who})=>({title,date,km,category,who}));
    return page(rows,args);
  });
  tool('list_open_tasks','Offene Wartungstermine und HU eines aktiven Fahrzeugs mit Fälligkeitsstatus.',{vehicleId,...paging},args=>{
    const vehicle=getVehicle(args.vehicleId);
    const rows=store.all('tasks').filter(t=>t.vehicleId===vehicle.id&&!t.done)
      .map(({title,dueDate,dueKm})=>({title,dueDate,dueKm,kind:'maintenance'}));
    if(vehicle.hu)rows.push({title:'Hauptuntersuchung (HU)',dueDate:vehicle.hu,dueKm:0,kind:'hu'});
    return page(rows.map(t=>({...t,status:taskStatus(t,vehicle)})).sort((a,b)=>
      statuses[a.status]-statuses[b.status]||
      (a.dueDate||'9999').localeCompare(b.dueDate||'9999')||
      (a.dueKm||Infinity)-(b.dueKm||Infinity)),args);
  });
  tool('list_mileage_readings','Wirksame manuelle Kilometerablesungen eines aktiven Fahrzeugs, neueste zuerst. Ohne Begründungen und ersetzte Werte.',{vehicleId,...paging},args=>{
    const {id}=getVehicle(args.vehicleId);
    const rows=store.effectiveReadings(id).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))
      .map(({date,km,kind})=>({date,km,kind}));
    return page(rows,args);
  });
  if(mayWrite)mcp.registerTool('add_service_entry',{
    description:'Eine tatsächlich erledigte Arbeit in die Chronik eintragen. Nur nach expliziter Bestätigung von Fahrzeug, Titel, Datum und Kilometerstand aufrufen.',
    inputSchema:{vehicleId,title:z.string().trim().min(1).max(180),date:z.iso.date(),km:z.number().int().min(0).max(9999999),
      who:z.enum(['Selbst gemacht','Werkstatt']).optional(),confirmed:z.literal(true)},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  },args=>{
    const vehicle=getVehicle(args.vehicleId);
    if(args.date>new Date().toISOString().slice(0,10))throw new Error('Das Datum einer abgeschlossenen Arbeit darf nicht in der Zukunft liegen.');
    const who=args.who||'Selbst gemacht';
    const previous=store.all('entries').find(r=>r.vehicleId===vehicle.id&&r.title===args.title&&r.date===args.date&&r.km===args.km&&r.who===who);
    const created=previous||store.create('entries',{vehicleId:vehicle.id,title:args.title,date:args.date,km:args.km,who,owner:vehicle.owner},{auditAction:'create-via-mcp'});
    const {id,title,date,km}=created;
    return dataResult({id,title,date,km,created:!previous});
  });
  return mcp;
}

export async function handleMcp(req,res,payload,store,mayWrite=false) {
  // Stateless: each request has its own SDK transport; no session or SSE channel persists.
  const mcp=makeMcp(store,mayWrite);
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  await mcp.connect(transport);
  res.once('close',()=>{void mcp.close();});
  await transport.handleRequest(req,res,payload);
}
