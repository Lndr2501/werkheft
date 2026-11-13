import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { collections, validate, newId, InputError, addMonths, requireObject } from './domain.mjs';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true,mode:0o700});
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (type TEXT NOT NULL, id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_type ON records(type);
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, type TEXT NOT NULL, recordId TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL, beforeJson TEXT, afterJson TEXT);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    this.repairs=this.repairConsistency();
  }
  repairConsistency() {
    return this.atomic(()=>{
      let documents=0;
      const mismatched=this.db.prepare(`SELECT proof.data, json_extract(entry.data,'$.vehicleId') AS vehicleId
        FROM records AS proof JOIN records AS entry ON entry.id=json_extract(proof.data,'$.entryId')
        WHERE proof.type='documents' AND entry.type='entries'
          AND json_extract(proof.data,'$.vehicleId')<>json_extract(entry.data,'$.vehicleId')`).all();
      for(const row of mismatched){
        const doc=JSON.parse(row.data);
        this.put('documents',{...doc,vehicleId:row.vehicleId},doc.id,{auditAction:'repair-entry-vehicle-link'});documents++;
      }
      return {documents,corrections:this.repairLegacyCorrections()};
    });
  }
  repairLegacyCorrections() {
    // Old releases stored the correction's previous mileage only in the audit.
    // Link it only when the adjacent audit records prove which value was corrected.
    let repaired=0;const rows=this.all('readings'),superseded=new Set(rows.map(r=>r.supersedes).filter(Boolean));
    for(let i=0;i<rows.length;i++){
      const correction=rows[i];if(correction.kind!=='correction'||correction.supersedes)continue;
      const creation=this.db.prepare("SELECT seq FROM audit WHERE type='readings' AND recordId=? AND action='create' ORDER BY seq LIMIT 1").get(correction.id);
      if(!creation)continue;
      const event=this.db.prepare('SELECT * FROM audit WHERE seq<? ORDER BY seq DESC LIMIT 1').get(creation.seq);
      if(!event||event.type!=='vehicles'||event.recordId!==correction.vehicleId||!event.action.startsWith('km-correction:'))continue;
      let before,after;try{before=JSON.parse(event.beforeJson);after=JSON.parse(event.afterJson);}catch{continue;}
      if(!before||!after||after.km!==correction.km)continue;
      const target=rows.slice(0,i).reverse().find(r=>r.vehicleId===correction.vehicleId&&r.km===before.km&&!superseded.has(r.id));
      if(!target)continue;
      rows[i]=this.put('readings',{...correction,supersedes:target.id},correction.id,{auditAction:'link-legacy-km-correction'});
      superseded.add(target.id);repaired++;
    }
    return repaired;
  }
  effectiveReadings(vehicleId) {
    const rows=this.all('readings').filter(r=>r.vehicleId===vehicleId),superseded=new Set(rows.map(r=>r.supersedes).filter(Boolean));
    return rows.filter(r=>!superseded.has(r.id));
  }
  getMeta(key,fallback=null){const r=this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key);return r?JSON.parse(r.value):fallback;}
  setMeta(key,value){this.db.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run(key,JSON.stringify(value));}
  boxes(){const saved=this.getMeta('shelfBoxes',[]),names=[...new Set(this.all('shelf').map(x=>x.box))];return [...saved,...names.filter(n=>!saved.some(b=>b.name===n)).map(name=>({name,color:'orange'}))];}
  saveBox(input){
    requireObject(input);
    const name=typeof input.name==='string'?input.name.trim():'',old=typeof input.oldName==='string'?input.oldName.trim():'';
    if(!name||name.length>100||!['orange','blue','green'].includes(input.color||'orange'))throw new InputError('Kistenname oder Farbe ungültig.');
    const boxes=this.boxes(),existing=boxes.find(b=>b.name===old);if(old&&!existing)throw new InputError('Kiste nicht gefunden.',404);if(name!==old&&boxes.some(b=>b.name===name))throw new InputError('Dieser Kistenname ist schon vergeben.',409);
    return this.atomic(()=>{let next=boxes.filter(b=>b.name!==old);const position=existing?boxes.indexOf(existing):boxes.length;next.splice(position,0,{name,color:input.color||'orange'});if(input.direction){const i=next.findIndex(b=>b.name===name),j=Math.max(0,Math.min(next.length-1,i+(input.direction==='left'?-1:1)));[next[i],next[j]]=[next[j],next[i]];}
      if(input.beforeName&&input.beforeName!==name){const i=next.findIndex(b=>b.name===name),j=next.findIndex(b=>b.name===input.beforeName);if(j>=0){const [moved]=next.splice(i,1);next.splice(next.findIndex(b=>b.name===input.beforeName),0,moved);}}
      for(const r of this.all('shelf').filter(r=>r.box===old))this.put('shelf',{...r,box:name},r.id);this.setMeta('shelfBoxes',next);return {ok:true};});
  }
  removeBox(input){requireObject(input);const name=input.name;if(this.all('shelf').some(r=>r.box===name))throw new InputError('Kiste erst leeren oder die Einträge verschieben.',409);this.setMeta('shelfBoxes',this.boxes().filter(b=>b.name!==name));return {ok:true};}
  addReading(id,input){requireObject(input);const v=this.get('vehicles',id),r=validate('readings',{...input,vehicleId:id,kind:'reading'}),today=new Date().toISOString().slice(0,10);if(r.date>today)throw new InputError('Eine Ablesung darf nicht in der Zukunft liegen.');if(r.date===today&&r.km<v.km)throw new InputError('Ein niedrigerer aktueller Stand braucht eine begründete Berichtigung.',409);if(r.km>v.km&&r.date<today)throw new InputError('Ein früherer Stand kann nicht über dem aktuellen liegen.',409);
    const rows=[...this.effectiveReadings(id),...this.all('entries').filter(x=>x.vehicleId===id)];if(rows.some(x=>x.date<r.date&&x.km>r.km||x.date>r.date&&x.km<r.km))throw new InputError('Der Stand widerspricht einer früheren oder späteren Ablesung.',409);
    return this.atomic(()=>{const result=this.put('readings',r);if(r.km>v.km)this.put('vehicles',{...v,km:r.km},id);return result;});
  }
  documentsForEntry(id) {return this.db.prepare("SELECT data FROM records WHERE type='documents' AND json_extract(data,'$.entryId')=?").all(id).map(r=>JSON.parse(r.data));}
  all(type) { return this.db.prepare('SELECT data FROM records WHERE type=? ORDER BY rowid').all(type).map(r=>JSON.parse(r.data)); }
  get(type,id) { const r=this.db.prepare('SELECT data FROM records WHERE type=? AND id=?').get(type,id); if(!r) throw new InputError('Eintrag nicht gefunden.',404); return JSON.parse(r.data); }
  atomic(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result=fn();this.db.exec('COMMIT');return result; } catch(e) {this.db.exec('ROLLBACK');throw e;} }
  snapshot({documents=false}={}) {
    const out={};
    for(const type of collections) out[type]=this.all(type).map(r=>type==='documents'&&!documents?{...r,data:undefined}:r);
    return {...out,demo:this.db.prepare('SELECT value FROM metadata WHERE key=?').get('demo')?.value==='true'};
  }
  audit(type,id,action,before,after) {
    this.db.prepare('INSERT INTO audit(type,recordId,action,at,beforeJson,afterJson) VALUES(?,?,?,?,?,?)').run(type,id,action,new Date().toISOString(),before?JSON.stringify(before):null,after?JSON.stringify(after):null);
  }
  checkReferences(type,r) {
    if(r.vehicleId) this.get('vehicles',r.vehicleId);
    if(type==='documents'&&r.entryId) { const entry=this.get('entries',r.entryId);if(entry.vehicleId!==r.vehicleId) throw new InputError('Nachweis und Arbeit gehören nicht zum selben Fahrzeug.'); }
    if(type==='readings'&&r.supersedes){const previous=this.get('readings',r.supersedes);if(previous.id===r.id||previous.vehicleId!==r.vehicleId)throw new InputError('Ungültiger Bezug der Kilometer-Berichtigung.');}
    if(type==='vehicles'&&r.vin&&this.all('vehicles').some(v=>v.vin===r.vin&&v.id!==r.id)) throw new InputError('Diese VIN ist schon in Deiner Garage.',409);
    if(type==='fuel') {
      const rows=this.all('fuel').filter(f=>f.id!==r.id&&f.vehicleId===r.vehicleId);
      if(rows.some(f=>f.km===r.km)) throw new InputError('Bei diesem Kilometerstand gibt es bereits eine Tankung.',409);
      if(rows.some(f=>(f.date<r.date&&f.km>r.km)||(f.date>r.date&&f.km<r.km))) throw new InputError('Datum und Kilometerstand widersprechen einer anderen Tankung. Bitte prüfen; ein Tacho läuft nicht rückwärts.',409);
    }
  }
  put(type,input,existingId=null,{allowLower=false,auditAction}={}) {
    const before=existingId?this.get(type,existingId):null;
    const now=new Date().toISOString();
    const r={...validate(type,input),id:existingId||newId(),createdAt:before?.createdAt||now,updatedAt:now,revision:(before?.revision||0)+1};
    if(before&&input.revision!==before.revision) throw new InputError('Dieser Eintrag wurde inzwischen geändert. Bitte neu laden.',409);
    this.checkReferences(type,r);
    if(type==='vehicles'&&before&&r.km<before.km&&!allowLower) throw new InputError('Ein niedrigerer Kilometerstand braucht eine begründete Berichtigung.',409);
    this.db.prepare('INSERT INTO records(type,id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(type,r.id,JSON.stringify(r));
    this.audit(type,r.id,auditAction||(before?'update':'create'),before,r);
    if(type==='entries'&&before&&before.vehicleId!==r.vehicleId){
      for(const doc of this.documentsForEntry(r.id))
        this.put('documents',{...doc,vehicleId:r.vehicleId},doc.id,{auditAction:'entry-vehicle-moved'});
    }
    if(['entries','fuel'].includes(type)) {
      const v=this.get('vehicles',r.vehicleId);
      if(r.km>v.km) this.put('vehicles',{...v,km:r.km},v.id);
    }
    return r;
  }
  create(type,input) {
    return this.atomic(()=>{
      const r=this.put(type,input);
      if(type==='entries'&&(r.intervalKm||r.intervalMonths)) this.put('tasks',{vehicleId:r.vehicleId,title:r.title,notes:r.notes,dueKm:r.intervalKm?r.km+r.intervalKm:0,dueDate:r.intervalMonths?addMonths(r.date,r.intervalMonths):'',intervalKm:r.intervalKm,intervalMonths:r.intervalMonths});
      return r;
    });
  }
  update(type,id,input) { return this.atomic(()=>this.put(type,input,id)); }
  remove(type,id) {
    return this.atomic(()=>{
      const before=this.get(type,id);
      if(type==='vehicles') throw new InputError('Fahrzeuge werden archiviert, nicht gelöscht.');
      if(type==='entries') for(const d of this.documentsForEntry(id)) this.put('documents',{...d,entryId:''},d.id);
      this.db.prepare('DELETE FROM records WHERE type=? AND id=?').run(type,id);
      this.audit(type,id,'delete',before,null);
      return {ok:true};
    });
  }
  correctKm(id,input) {
    requireObject(input);
    const reason=typeof input.reason==='string'?input.reason.trim():'';
    if(reason.length<8||reason.length>1000) throw new InputError('Bitte einen Grund mit 8–1000 Zeichen angeben.');
    return this.atomic(()=>{
      const v=this.get('vehicles',id);
      const target=this.effectiveReadings(id).filter(r=>r.km===v.km).at(-1);
      const result=this.put('vehicles',{...v,km:input.km,revision:input.revision},id,{allowLower:true});
      this.audit('vehicles',id,`km-correction: ${reason}`,v,result);
      this.put('readings',{vehicleId:id,date:new Date().toISOString().slice(0,10),km:result.km,notes:reason,kind:'correction',supersedes:target?.id||''});return result;
    });
  }
  completeTask(id,input) {
    requireObject(input);
    return this.atomic(()=>{
      const task=this.get('tasks',id);
      if(task.done) throw new InputError('Diese Arbeit ist schon erledigt.',409);
      if(input.revision!==task.revision) throw new InputError('Der Termin wurde inzwischen geändert. Bitte neu laden.',409);
      const entry=this.put('entries',{...input,title:task.title,notes:input.notes??task.notes,vehicleId:task.vehicleId,intervalKm:0,intervalMonths:0});
      this.put('tasks',{...task,done:true},id);
      if(task.intervalKm||task.intervalMonths) this.put('tasks',{...task,done:false,dueKm:task.intervalKm?entry.km+task.intervalKm:0,dueDate:task.intervalMonths?addMonths(entry.date,task.intervalMonths):''});
      return entry;
    });
  }
  history(type,id) {
    return this.db.prepare('SELECT * FROM audit WHERE type=? AND recordId=? ORDER BY seq DESC').all(type,id).map(r=>({...r,before:r.beforeJson?JSON.parse(r.beforeJson):null,after:r.afterJson?JSON.parse(r.afterJson):null,beforeJson:undefined,afterJson:undefined}));
  }
  export() {
    return {format:'werkheft',version:1,exportedAt:new Date().toISOString(),...this.snapshot({documents:true}),boxes:this.boxes(),raceScores:this.getMeta('raceScores',[]),audit:this.db.prepare('SELECT * FROM audit ORDER BY seq').all()};
  }
  transfer(id) {
    const v=this.get('vehicles',id);
    // Sharing is deliberately a separate allowlisted export, never a filtered full backup.
    const vehicle=Object.fromEntries(['name','make','model','year','firstRegistration','vin','km','hsn','tsn','engine','gearbox','color','tires','oil','hu','owner','accent'].map(k=>[k,v[k]]));
    const entries=this.all('entries').filter(r=>r.vehicleId===id).map(r=>({title:r.title,date:r.date,km:r.km,category:r.category,who:r.who,owner:r.owner,notes:r.notes}));
    return {format:'werkheft-transfer',version:1,exportedAt:new Date().toISOString(),vehicle,entries};
  }
  import(input) {
    if(input?.version!==1) throw new InputError('Unbekannte Sicherungsversion.');
    if(input.format==='werkheft-transfer') return this.atomic(()=>{
      const vehicle=this.put('vehicles',{...input.vehicle,archived:false,owner:(Number(input.vehicle?.owner)||1)+1});
      if(!Array.isArray(input.entries)||input.entries.length>10000) throw new InputError('Ungültiges Fahrzeugheft.');
      for(const e of input.entries) this.put('entries',{...e,cost:0,vehicleId:vehicle.id});
      return {ok:true,vehicleId:vehicle.id};
    });
    if(input.format!=='werkheft') throw new InputError('Keine Werkheft-Sicherung.');
    // Validate the complete backup before replacing anything. Import is transactional.
    const rows={},ids=new Set();
    for(const type of collections) {
      if(type==='readings'&&input[type]===undefined)input={...input,readings:[]};
      if(!Array.isArray(input[type])||input[type].length>10000) throw new InputError(`Ungültige Sammlung: ${type}.`);
      rows[type]=input[type].map(raw=>{
        requireObject(raw);
        if(typeof raw.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(raw.id)||ids.has(raw.id)) throw new InputError('Ungültige oder doppelte ID.');
        ids.add(raw.id);
        for(const key of ['createdAt','updatedAt']) if(typeof raw[key]!=='string'||!Number.isFinite(Date.parse(raw[key]))) throw new InputError('Ungültiger Zeitstempel.');
        return {...validate(type,raw),id:raw.id,createdAt:raw.createdAt,updatedAt:raw.updatedAt,revision:Number.isSafeInteger(raw.revision)&&raw.revision>0?raw.revision:1};
      });
    }
    const vehicles=new Set(rows.vehicles.map(r=>r.id)),entries=new Map(rows.entries.map(r=>[r.id,r]));
    const vins=rows.vehicles.filter(v=>v.vin).map(v=>v.vin);
    if(new Set(vins).size!==vins.length) throw new InputError('Doppelte VIN in Sicherung.');
    for(const type of collections) for(const r of rows[type]) {
      if(r.vehicleId&&!vehicles.has(r.vehicleId)) throw new InputError('Fahrzeugbezug fehlt in Sicherung.');
      if(r.entryId&&entries.get(r.entryId)?.vehicleId!==r.vehicleId) throw new InputError('Arbeitsbezug fehlt in Sicherung.');
    }
    const readingMap=new Map(rows.readings.map(r=>[r.id,r])),done=new Set();
    for(const reading of rows.readings){
      const path=new Set();let node=reading;
      while(node&&!done.has(node.id)){
        if(path.has(node.id))throw new InputError('Zyklischer Bezug der Kilometer-Berichtigungen.');
        path.add(node.id);
        if(!node.supersedes)break;
        const previous=readingMap.get(node.supersedes);
        if(!previous||previous.vehicleId!==node.vehicleId||node.kind!=='correction')throw new InputError('Ungültiger Bezug der Kilometer-Berichtigung.');
        node=previous;
      }
      for(const id of path)done.add(id);
    }
    const boxes=input.boxes||[],scores=input.raceScores||[];
    if(!Array.isArray(boxes)||boxes.length>1000||boxes.some(b=>!b||typeof b!=='object'||Array.isArray(b)||typeof b.name!=='string'||!b.name.trim()||b.name.length>100||!['orange','blue','green'].includes(b.color)))throw new InputError('Ungültige Kisten.');
    if(!Array.isArray(scores)||scores.length>5000||scores.some(s=>!s||typeof s!=='object'||Array.isArray(s)||typeof s.name!=='string'||s.name.length>20||!Number.isFinite(s.score)||s.score<0||typeof s.at!=='string'||!Number.isFinite(Date.parse(s.at))))throw new InputError('Ungültige Spielstände.');
    if(!Array.isArray(input.audit)||input.audit.length>100000) throw new InputError('Ungültiger Änderungsverlauf.');
    const audit=input.audit.map(a=>{
      requireObject(a);
      if(!collections.includes(a.type)||typeof a.recordId!=='string'||a.recordId.length>80||typeof a.action!=='string'||a.action.length>1100||!Number.isFinite(Date.parse(a.at))) throw new InputError('Ungültiger Verlaufseintrag.');
      for(const k of ['beforeJson','afterJson']) if(a[k]!==null) { if(typeof a[k]!=='string'||a[k].length>8100000) throw new InputError('Ungültiger Verlauf.');try{JSON.parse(a[k]);}catch{throw new InputError('Ungültiger Verlauf.');} }
      return a;
    });
    return this.atomic(()=>{
      this.db.exec('DELETE FROM records; DELETE FROM audit;');
      for(const type of collections) for(const r of rows[type]) this.db.prepare('INSERT INTO records VALUES(?,?,?)').run(type,r.id,JSON.stringify(r));
      for(const a of audit) this.db.prepare('INSERT INTO audit(type,recordId,action,at,beforeJson,afterJson) VALUES(?,?,?,?,?,?)').run(a.type,a.recordId,a.action,a.at,a.beforeJson,a.afterJson);
      this.setMeta('shelfBoxes',boxes);this.setMeta('raceScores',scores);
      this.repairLegacyCorrections();
      this.db.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run('demo',String(input.demo===true));return {ok:true};
    });
  }
  demo() {
    if(this.all('vehicles').length) throw new InputError('Die Beispielgarage kann nur in eine leere Garage geladen werden.',409);
    return this.atomic(()=>{
      const today=new Date().toISOString().slice(0,10);
      const days=n=>new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10);
      const golf=this.put('vehicles',{name:'Golf IV 1.9 TDI',make:'Volkswagen',model:'Golf IV',year:2002,vin:'WVWZZZ1JZ2W386752',km:184200,engine:'ALH',hsn:'0603',tsn:'402',tires:'195/65 R15 91H',oil:'5W-40 · VW 505 00 · 4,3 l',color:'LC9Z · Black Magic',hu:days(48),owner:2,notes:'Beispielfahrzeug – keine echten Nutzerdaten.'});
      const bmw=this.put('vehicles',{name:'BMW 320i Touring',make:'BMW',model:'E46 Touring',year:2004,km:212480,engine:'M54B22',oil:'5W-30 · BMW LL-01 · 6,5 l',tires:'205/55 R16',hu:days(240),owner:1,accent:'blue'});
      for(const x of [
        {title:'Bremsen hinten erneuert',date:days(-7),km:184200,notes:'Scheiben und Beläge erneuert. Sichtkontrolle und Probefahrt durchgeführt.',cost:146.8,category:'Bremsen'},
        {title:'Ölwechsel & Ölfilter',date:days(-95),km:176500,notes:'Motoröl und Filter ersetzt. Freigabe gemäß Handbuch geprüft.',cost:54.9,category:'Wartung'},
        {title:'Kupplung ersetzt',date:days(-420),km:171300,who:'Werkstatt',cost:890,category:'Reparatur'}
      ])this.put('entries',{...x,vehicleId:golf.id,owner:2});
      this.put('entries',{vehicleId:bmw.id,title:'Sommerreifen montiert',date:days(-30),km:211600,cost:0,category:'Räder',owner:1});
      this.put('tasks',{vehicleId:golf.id,title:'Zahnriemen & Wasserpumpe',dueKm:182800,notes:'Intervall und passenden Riemensatz anhand der Motorkennung prüfen.'});
      this.put('tasks',{vehicleId:golf.id,title:'Ölwechsel & Ölfilter',dueKm:186500,intervalKm:10000,intervalMonths:12,dueDate:days(270)});
      this.put('tasks',{vehicleId:bmw.id,title:'Innenraumfilter erneuern',dueDate:days(12),intervalMonths:12});
      for(const [km,liters,cost,ago] of [[181900,48.2,77.6,48],[182650,44.3,71.72,32],[183430,46.1,73.3,17],[184200,44.8,72.1,7]])this.put('fuel',{vehicleId:golf.id,date:days(-ago),km,liters,cost,full:true,type:'Diesel'});
      for(const x of [{title:'Drehmomentschlüssel',box:'Werkzeug',quantity:1,part:'40–200 Nm'},{title:'Motoröl 5W-40',box:'Flüssigkeiten',quantity:5,notes:'Liter · VW-Freigabe prüfen'},{title:'Ölfilter',box:'Golf IV',quantity:0,needed:true,part:'Passend zu ALH'},{title:'Nitrilhandschuhe',box:'Verbrauchsmaterial',quantity:1}])this.put('shelf',x);
      this.put('expenses',{vehicleId:golf.id,title:'Kfz-Versicherung',date:days(-15),cost:245,category:'Versicherung'});
      this.put('board',{title:'Winterräder vor dem Einlagern reinigen',kind:'Notiz',notes:'Profiltiefe notieren und Reifenposition markieren.'});
      this.db.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run('demo','true');return {ok:true};
    });
  }
  resetDemo() {
    if(this.db.prepare('SELECT value FROM metadata WHERE key=?').get('demo')?.value!=='true') throw new InputError('Keine Beispielgarage aktiv.');
    return this.atomic(()=>{this.db.exec('DELETE FROM records; DELETE FROM audit; DELETE FROM metadata;');return {ok:true};});
  }
  close() { this.db.close(); }
}
