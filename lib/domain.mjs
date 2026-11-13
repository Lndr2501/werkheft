import { randomUUID } from 'node:crypto';

export const collections = ['vehicles', 'entries', 'tasks', 'fuel', 'shelf', 'documents', 'expenses', 'board', 'readings'];
export class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const fail = message => { throw new InputError(message); };
export function requireObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Ein JSON-Objekt wird erwartet.');
  return input;
}
const text = (v, max = 300, required = false) => {
  if (v == null && !required) return '';
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(`Text fehlt oder ist zu lang (max. ${max} Zeichen).`);
  return v.trim();
};
const num = (v, max = 9999999, min = 0) => {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail('Ungültiger Zahlenwert.');
  return n;
};
const date = (v, required = false) => {
  if (!v && !required) return '';
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) fail('Ungültiges Datum.');
  return v;
};
const id = v => text(v, 80, true);
const bool = v => v === true;
export function safeURL(v) {
  if (!v) return '';
  try { const u = new URL(v); if (['https:', 'http:'].includes(u.protocol) && !u.username && !u.password) return u.href; } catch {}
  fail('Links müssen mit https:// oder http:// beginnen und dürfen keine Zugangsdaten enthalten.');
}
export function validate(type, input) {
  if (!collections.includes(type) || !input || typeof input !== 'object' || Array.isArray(input)) fail('Ungültiger Datensatz.');
  const s = (key, max, req) => text(input[key], max, req);
  const n = (key, max, min) => num(input[key], max, min);
  const d = (key, req) => date(input[key], req);
  const vehicleId = () => id(input.vehicleId);
  switch (type) {
    case 'vehicles': {
      const vin = s('vin', 17).toUpperCase();
      if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) fail('Eine VIN hat 17 Zeichen, ohne I, O oder Q. Für ältere Fahrzeuge kann sie leer bleiben.');
      const photo=s('photo',3000000);
      if(photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo)) fail('Ungültiges Fahrzeugfoto.');
      return { name:s('name',100,true), make:s('make',80), model:s('model',80), year:n('year',2100), firstRegistration:d('firstRegistration'), photo, vin, km:n('km'), hsn:s('hsn',20), tsn:s('tsn',20), engine:s('engine',60), gearbox:s('gearbox',60), color:s('color',60), tires:s('tires',100), oil:s('oil',150), hu:d('hu'), notes:s('notes',5000), archived:bool(input.archived), owner:Math.max(1,Math.trunc(n('owner',1000))), accent:['orange','blue','green'].includes(input.accent)?input.accent:'orange' };
    }
    case 'entries': return { vehicleId:vehicleId(), title:s('title',180,true), date:d('date',true), km:n('km'), notes:s('notes',10000), category:s('category',60)||'Wartung', who:input.who==='Werkstatt'?'Werkstatt':'Selbst gemacht', cost:n('cost',1000000), intervalKm:n('intervalKm'), intervalMonths:n('intervalMonths',1200), owner:Math.max(1,Math.trunc(n('owner',1000))) };
    case 'tasks': {
      const dueKm=n('dueKm'), dueDate=d('dueDate');
      if (!dueKm && !dueDate) fail('Bitte Zielkilometerstand oder Fälligkeitsdatum angeben.');
      return {vehicleId:vehicleId(),title:s('title',180,true),notes:s('notes',5000),dueKm,dueDate,intervalKm:n('intervalKm'),intervalMonths:n('intervalMonths',1200),done:bool(input.done)};
    }
    case 'fuel': return {vehicleId:vehicleId(),date:d('date',true),km:n('km'),liters:n('liters',2000,0.01),cost:n('cost',10000,0.01),type:s('type',60)||'Diesel',full:bool(input.full),notes:s('notes',1000)};
    case 'shelf': return {title:s('title',180,true),box:s('box',100,true),part:s('part',100),quantity:n('quantity',100000),url:safeURL(s('url',2000)),notes:s('notes',3000),needed:bool(input.needed),vehicleId:input.vehicleId?id(input.vehicleId):''};
    case 'documents': {
      const data=s('data',8000000,true);
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data)) fail('Nur lokal aufbereitete PNG-, JPEG- oder WebP-Bilder sind erlaubt.');
      return {vehicleId:vehicleId(),entryId:input.entryId?id(input.entryId):'',title:s('title',180,true),date:d('date',true),data};
    }
    case 'expenses': return {vehicleId:vehicleId(),title:s('title',180,true),date:d('date',true),cost:n('cost',1000000,0.01),category:s('category',60)||'Sonstiges',notes:s('notes',3000)};
    case 'readings': return {vehicleId:vehicleId(),date:d('date',true),km:n('km'),notes:s('notes',1000),kind:input.kind==='correction'?'correction':'reading',supersedes:input.kind==='correction'&&input.supersedes?id(input.supersedes):''};
    case 'board': return {title:s('title',180,true),kind:['Angebot','Gesucht','Notiz'].includes(input.kind)?input.kind:'Notiz',price:n('price',1000000),location:s('location',100),notes:s('notes',5000),contact:s('contact',200),closed:bool(input.closed)};
  }
}
export const newId = () => randomUUID();
export function taskStatus(task, vehicle, today = new Date().toISOString().slice(0,10)) {
  if(task.done) return 'done';
  if ((task.dueKm && task.dueKm <= vehicle.km) || (task.dueDate && task.dueDate <= today)) return 'overdue';
  const days = task.dueDate ? (Date.parse(task.dueDate)-Date.parse(today))/86400000 : Infinity;
  if ((task.dueKm && task.dueKm-vehicle.km <= 2500) || days <= 30) return 'soon';
  return 'planned';
}
export function addMonths(day, months) {
  const d = new Date(`${day}T12:00:00Z`), originalDay = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(originalDay,lastDay)); return d.toISOString().slice(0,10);
}
export function fuelConsumption(rows) {
  const sorted=[...rows].sort((a,b)=>a.km-b.km || a.date.localeCompare(b.date));
  let anchor=null, liters=0; const points=[];
  for (const r of sorted) {
    if(anchor) liters+=r.liters;
    if(r.full) {
      if(anchor && r.km>anchor.km) points.push({id:r.id,date:r.date,value:liters/(r.km-anchor.km)*100,distance:r.km-anchor.km,liters});
      anchor=r; liters=0;
    }
  }
  const distance=points.reduce((s,p)=>s+p.distance,0);
  return {points,average:distance?points.reduce((s,p)=>s+p.liters,0)/distance*100:null};
}
