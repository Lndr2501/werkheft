import {state,$,$$,e,icon,api,refresh,toast,today,date,timestamp,num,money,vehicle,vehicleName,vehicleSelect,labels,btn} from './core.js';
let current=null;
const categories=['Wartung','Reparatur','Bremsen','Motor','Elektrik','Fahrwerk','Räder','Karosserie','Inspektion','HU'];
const attr=s=>e(s);
function field(name,label,value='',{type='text',required=false,placeholder='',full=false,min,max,step}={}) {
 return `<label class="field ${full?'full-width':''}"><span>${e(label)}${required?' *':''}</span><input name="${name}" type="${type}" value="${attr(value)}" ${required?'required':''} ${placeholder?`placeholder="${attr(placeholder)}"`:''} ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`max="${max}"`:''} ${step!==undefined?`step="${step}"`:''} ${type==='text'?'maxlength="300"':''}></label>`;
}
const numberField=(name,label,value='',opts={})=>field(name,label,value===0&&!opts.required?'':value??'',{type:'number',min:0,max:9999999,step:1,...opts});
const dateField=(name,label,value=today(),required=true)=>field(name,label,value,{type:'date',required,min:'1900-01-01',max:'2199-12-31'});
const area=(name,label,value='',max=10000)=>`<label class="field full-width"><span>${e(label)}</span><textarea name="${name}" maxlength="${max}" rows="3">${e(value)}</textarea></label>`;
const check=(name,label,value=false)=>`<label class="checkbox-field full-width"><input type="checkbox" name="${name}" ${value?'checked':''}><span>${e(label)}</span></label>`;
const select=(name,label,values,value,full=false)=>`<label class="field ${full?'full-width':''}"><span>${e(label)}</span><select name="${name}">${values.map(v=>`<option value="${attr(v)}" ${v===value?'selected':''}>${e(v)}</option>`).join('')}</select></label>`;
const vehicleField=id=>`<label class="field full-width"><span>Fahrzeug *</span>${vehicleSelect(id,{includeAll:false,name:'vehicleId'})}</label>`;
function titleBar(title,tag='WERKHEFT · EINTRAGEN') {return `<div class="dialog-header"><div><span class="eyebrow">${e(tag)}</span><h2 id="dialog-title">${e(title)}</h2></div><button class="icon-btn" data-action="close-dialog" aria-label="Schließen">${icon('close')}</button></div>`;}
function show(html,{simple=false}={}) {$('#dialog-content').innerHTML=html;$('#editor').showModal();if(simple)current=null;}
export function closeDialog(force=false) {
 if(!force&&current?.dirty&&!confirm('Nicht gespeicherte Änderungen verwerfen?'))return;
 $('#editor').close();current=null;$('#dialog-content').innerHTML='';
}
export async function openEditor(type,id='',defaults={}) {
 if(!labels[type])return;
 if(!['vehicles','shelf','board'].includes(type)&&!state.data.vehicles.length){toast('Lege zuerst ein Fahrzeug an.');return openEditor('vehicles');}
 let record=id?state.data[type].find(x=>x.id===id):null;
 if(id&&!record){toast('Eintrag nicht gefunden.',true);return;}
 if(type==='documents'&&id)record=await api(`documents/${id}`);
 const routeId=location.hash.split('/')[1];
 const v=vehicle(defaults.vehicleId||record?.vehicleId||routeId||state.vehicleFilter)||state.data.vehicles.find(v=>!v.archived)||state.data.vehicles[0];
 const r={date:today(),vehicleId:type==='vehicles'?undefined:v?.id,km:type==='vehicles'?'':v?.km,who:'Selbst gemacht',owner:type==='vehicles'?1:v?.owner||1,category:'Wartung',full:true,quantity:1,box:'Werkzeug',...record,...defaults};
 current={type,id,record:r,dirty:false,step:0,image:r.data||r.photo||'',busyImage:false,taskId:defaults.taskId};
 let content='';
 if(type==='vehicles')content=`<div class="wizard-steps"><button type="button" data-action="wizard" data-step="0" class="active">01 · FAHRZEUG</button><button type="button" data-action="wizard" data-step="1">02 · NUMMERN</button><button type="button" data-action="wizard" data-step="2">03 · FOTO & DETAILS</button></div>
 <div class="wizard-panel" data-panel="0"><div class="form-grid">${field('name','Name / Spitzname',r.name,{required:true,full:true,placeholder:'z. B. Golf IV 1.9 TDI'})}${field('make','Marke',r.make,{placeholder:'Volkswagen'})}${field('model','Modell',r.model,{placeholder:'Golf IV'})}${dateField('firstRegistration','Erstzulassung',r.firstRegistration||'',false)}${numberField('year','Baujahr',r.year,{max:2100,min:1886})}${numberField('km','Aktueller Kilometerstand',r.km,{required:true})}${numberField('owner','Besitzer-Nummer',r.owner||1,{min:1,max:1000})}</div><p class="help-text">Kein Kennzeichen nötig. Du kannst fehlende Stammdaten später ergänzen.</p></div>
 <div class="wizard-panel" data-panel="1" hidden><div class="form-grid">${field('vin','Fahrgestellnummer (VIN)',r.vin,{full:true,placeholder:'17 Zeichen · optional bei älteren Fahrzeugen'})}${field('hsn','HSN',r.hsn)}${field('tsn','TSN',r.tsn)}${field('engine','Motorcode',r.engine)}${field('gearbox','Getriebecode',r.gearbox)}${field('color','Farbcode',r.color)}${field('tires','Reifengröße',r.tires)}${field('oil','Ölsorte, Freigabe & Füllmenge',r.oil,{full:true})}</div></div>
 <div class="wizard-panel" data-panel="2" hidden><div class="form-grid">${dateField('hu','Nächste HU',r.hu||'',false)}${select('accent','Garagenfarbe',['orange','blue','green'],r.accent||'orange')}${area('notes','Fahrzeugnotizen',r.notes,5000)}<label class="field full-width"><span>Fahrzeugfoto · optional</span><input type="file" id="image-file" accept="image/jpeg,image/png,image/webp"><small class="muted">Wird lokal verkleinert und ohne Metadaten gespeichert. Maximal 15 MB Eingabe.</small></label><div class="full-width" id="photo-preview">${r.photo?`<img class="image-preview" src="${attr(r.photo)}" alt="Fahrzeugfoto">`:''}</div></div></div>`;
 if(type==='entries')content=`<div class="form-grid">${vehicleField(r.vehicleId)}${field('title','Was wurde gemacht?',r.title,{full:true,required:true,placeholder:'z. B. Ölwechsel & Ölfilter'})}${dateField('date','Tag der Arbeit',r.date)}${numberField('km','Kilometerstand',r.km,{required:true})}${select('category','Bereich',categories,r.category)}${select('who','Durchgeführt von',['Selbst gemacht','Werkstatt'],r.who)}${numberField('cost','Kosten in €',r.cost,{step:.01,max:1000000})}${numberField('owner','Besitzer-Nummer',r.owner,{min:1,max:1000})}${area('notes','Notizen, Teile & Besonderheiten',r.notes)}${!id&&!r.taskId?`<p class="form-section full-width">Beim nächsten Mal dran denken</p>${numberField('intervalKm','Wiederholen nach … km',r.intervalKm)}${numberField('intervalMonths','Wiederholen nach … Monaten',r.intervalMonths,{max:1200})}<p class="help-text full-width">Ein Intervall legt den nächsten Termin an. Nach „Erledigt“ wird eine Routine weitergeführt.</p>`:''}</div>${id?'<p class="help-text">Jede Änderung bleibt im Verlauf sichtbar. Beim Fahrzeugwechsel ziehen zugeordnete Nachweise mit; bestehende Termine werden nicht automatisch verändert.</p>':''}`;
 if(type==='tasks')content=`<div class="form-grid">${vehicleField(r.vehicleId)}${field('title','Geplante Arbeit',r.title,{required:true,full:true})}${numberField('dueKm','Fällig bei … km',r.dueKm)}${dateField('dueDate','Oder am …',r.dueDate||'',false)}<p class="help-text full-width">Kilometerstand oder Datum angeben. Sind beide gesetzt, zählt das zuerst erreichte Ziel.</p>${numberField('intervalKm','Routine · alle … km',r.intervalKm)}${numberField('intervalMonths','Routine · alle … Monate',r.intervalMonths,{max:1200})}${area('notes','Arbeitszettel / benötigte Teile',r.notes,5000)}</div>`;
 if(type==='fuel')content=`<div class="form-grid">${vehicleField(r.vehicleId)}${dateField('date','Datum',r.date)}${numberField('km','Kilometerstand',r.km,{required:true})}${numberField('liters','Getankte Menge in Litern',r.liters,{required:true,min:.01,max:2000,step:.01})}${numberField('cost','Gesamtbetrag in €',r.cost,{required:true,min:.01,max:10000,step:.01})}${select('type','Kraftstoff',['Diesel','Super E5','Super E10','Super Plus','LPG','CNG','Sonstiges'],r.type||'Diesel')}${check('full','Vollgetankt (für die Verbrauchsberechnung)',r.full)}${area('notes','Tankstelle / Notiz',r.notes,1000)}</div><p class="help-text">Teilfüllungen werden bis zur nächsten Volltankung aufaddiert. Die erste Volltankung ist der Startpunkt, noch kein Verbrauchswert.</p>`;
 if(type==='shelf')content=`<div class="form-grid">${field('title','Teil oder Werkzeug',r.title,{required:true,full:true})}${field('box','Kiste',r.box,{required:true,placeholder:'Werkzeug, Flüssigkeiten, Golf …'})}${numberField('quantity','Bestand / Menge',r.quantity,{max:100000,step:.01})}${field('part','Teilenummer / Größe',r.part,{full:true})}${field('url','Eigener Link · ohne Affiliate-Zusatz',r.url,{full:true,type:'url',placeholder:'https://…'})}<label class="field full-width"><span>Fahrzeug · optional</span><select name="vehicleId"><option value="">Keinem Fahrzeug zugeordnet</option>${state.data.vehicles.map(v=>`<option value="${attr(v.id)}" ${r.vehicleId===v.id?'selected':''}>${e(v.name)}</option>`).join('')}</select></label>${check('needed','Auf die Einkaufsliste setzen',r.needed)}${area('notes','Notizen',r.notes,3000)}</div><p class="help-text">Jeder Shop oder gar kein Link. Werkheft verändert Deine Links nicht und fügt keine Partnerkennung hinzu.</p>`;
 if(type==='expenses')content=`<div class="form-grid">${vehicleField(r.vehicleId)}${field('title','Bezeichnung',r.title,{required:true,full:true})}${dateField('date','Datum',r.date)}${numberField('cost','Betrag in €',r.cost,{required:true,min:.01,max:1000000,step:.01})}${select('category','Kategorie',['Versicherung','Steuer','Parken','Pflege','Zubehör','Sonstiges'],record?.category||'Sonstiges',true)}${area('notes','Notizen',r.notes,3000)}</div><p class="help-text">Kosten aus Arbeiten und Tankungen erscheinen automatisch in der Buchhaltung. Hier nur zusätzliche Ausgaben eintragen.</p>`;
 if(type==='board')content=`<div class="form-grid">${select('kind','Art',['Notiz','Angebot','Gesucht'],r.kind||'Notiz')}${numberField('price','Preis in € · optional',r.price,{max:1000000,step:.01})}${field('title','Überschrift',r.title,{required:true,full:true})}${field('location','Ort',r.location)}${field('contact','Kontakt · optional',r.contact)}${area('notes','Beschreibung',r.notes,5000)}${check('closed','Erledigt / geschlossen',r.closed)}</div><p class="help-text">Dein privates schwarzes Brett. Keine Veröffentlichung im Internet, kein fremder Marktplatz.</p>`;
 if(type==='documents')content=`<div class="form-grid">${vehicleField(r.vehicleId)}${field('title','Bezeichnung',r.title,{required:true,full:true,placeholder:'z. B. Rechnung Bremsenteile'})}${dateField('date','Belegdatum',r.date)}<label class="field"><span>Zugehörige Arbeit · optional</span><select name="entryId" id="document-entry">${entryOptions(r.vehicleId,r.entryId)}</select></label><label class="field full-width"><span>Foto / Rechnung als Bild ${id?'ersetzen':'*'}</span><input type="file" id="image-file" accept="image/jpeg,image/png,image/webp" ${id?'':'required'}></label></div><div class="info-banner warning"><div>${icon('shield')}</div><p>Ziehe vor dem Speichern schwarze Rechtecke über Namen, Adressen und andere private Angaben. Nur das neu gerenderte Bild wird übertragen, nicht die Originaldatei oder ihre Metadaten.</p></div><div id="redaction-tools" ${r.data?'':'hidden'}><p class="help-text">Mit Maus oder Finger Bereiche markieren. Die Schwärzung wird fest in die Bildpixel eingebrannt.</p><div class="redaction-area"><canvas id="redaction-canvas" aria-label="Beleg schwärzen: Rechteck über private Angaben ziehen"></canvas></div><button type="button" class="button small" data-action="undo-redaction">Letzten Balken entfernen</button></div><p class="help-text">Nur PNG, JPEG oder WebP; maximal 15 MB. PDF-Rechnungen zuerst lokal als Bild exportieren. Schwärzung bitte vor dem Speichern visuell prüfen.${id?' Achtung: Bereits früher gespeicherte Bildstände bleiben im lokalen Änderungsverlauf und in bestehenden Sicherungen erhalten. Nachträgliches Schwärzen löscht sie dort nicht.':''}</p>`;
 const wizard=type==='vehicles';
 show(`${titleBar(r.taskId?'Arbeit erledigt':`${labels[type]} ${id?'bearbeiten':'eintragen'}`)}<form id="entity-form"><div class="dialog-body">${content}</div><p class="form-error" role="alert" id="form-error"></p><div class="dialog-actions">${wizard?'<button type="button" class="button ghost left" data-action="wizard-back" hidden>← Zurück</button>':''}<button type="button" class="button ghost" data-action="close-dialog">Abbrechen</button>${wizard?'<button type="button" class="button primary" data-action="wizard-next">Weiter →</button>':''}<button type="submit" class="button primary" id="save-button" ${wizard?'hidden':''}>${icon('check')} ${r.taskId?'Erledigt & eintragen':'Speichern'}</button></div></form>`);
 $('#entity-form').addEventListener('submit',save);
 $('#entity-form').addEventListener('input',()=>{if(current)current.dirty=true;});
 $('#entity-form').addEventListener('change',()=>{if(current)current.dirty=true;});
 $('#entity-form [name=vehicleId]')?.addEventListener('change',ev=>{
   const selected=vehicle(ev.target.value);
   if($('#document-entry'))$('#document-entry').innerHTML=entryOptions(selected.id,'');
   if(!id){const km=$('#entity-form [name=km]');if(km)km.value=selected.km;const owner=$('#entity-form [name=owner]');if(owner)owner.value=selected.owner;}
 });
 $('#image-file')?.addEventListener('change',prepareImage);
 if(type==='documents'&&r.data)setupRedaction(r.data);
 const first=$('#entity-form input:not([type=file]),#entity-form select');first?.focus();
}
function entryOptions(vehicleId,selected){return '<option value="">Keine Zuordnung</option>'+state.data.entries.filter(x=>x.vehicleId===vehicleId).sort((a,b)=>b.date.localeCompare(a.date)).map(x=>`<option value="${attr(x.id)}" ${selected===x.id?'selected':''}>${e(x.title)} · ${date(x.date)}</option>`).join('');}
export function wizard(step) {
 if(!current||current.type!=='vehicles')return;
 const s=Math.max(0,Math.min(2,step));
 if(s>current.step) {
   const inputs=$$(`[data-panel="${current.step}"] input`);for(const input of inputs)if(!input.checkValidity()){input.reportValidity();return;}
 }
 current.step=s;$$('[data-panel]').forEach(el=>el.hidden=Number(el.dataset.panel)!==s);$$('.wizard-steps button').forEach((el,i)=>el.classList.toggle('active',i===s));
 $('[data-action=wizard-back]').hidden=s===0;$('[data-action=wizard-next]').hidden=s===2;$('#save-button').hidden=s!==2;
 $(`[data-panel="${s}"] input`)?.focus();
}
export function wizardNext(delta){if(current)wizard(current.step+delta);}
async function save(ev) {
 ev.preventDefault();if(!current)return;
 const c=current,form=ev.currentTarget,submit=$('#save-button');
 if(c.busyImage){$('#form-error').textContent='Das Bild wird noch aufbereitet. Bitte kurz warten.';return;}
 const body=Object.fromEntries(new FormData(form));
 for(const el of form.querySelectorAll('input[type=checkbox]'))body[el.name]=el.checked;
 for(const el of form.querySelectorAll('input[type=number]'))body[el.name]=el.value===''?0:Number(el.value);
 if(c.id)body.revision=c.record.revision;
 if(c.type==='vehicles'){body.photo=c.image;body.archived=c.record.archived||false;}
 if(c.type==='documents') {if(!c.image){$('#form-error').textContent='Bitte ein Bild auswählen.';return;}body.data=c.image;}
 if(c.type==='entries'){body.intervalKm=c.record.intervalKm||body.intervalKm||0;body.intervalMonths=c.record.intervalMonths||body.intervalMonths||0;}
 if(c.type==='tasks')body.done=c.record.done||false;
 submit.disabled=true;$('#form-error').textContent='';
 try {
   if(c.taskId){const t=state.data.tasks.find(t=>t.id===c.taskId);await api(`tasks/${c.taskId}/complete`,{method:'POST',body:{...body,revision:t.revision}});}
   else await api(`${c.type}${c.id?'/'+c.id:''}`,{method:c.id?'PUT':'POST',body});
   closeDialog(true);await refresh();toast(c.taskId?'Arbeit eingetragen. Die nächste Routine ist geplant.':`${labels[c.type]} gespeichert.`);
 }catch(err){$('#form-error').textContent=err.message;submit.disabled=false;}
}
async function prepareImage(ev) {
 const file=ev.target.files?.[0];if(!file||!current)return;
 const c=current;c.busyImage=true;
 try {
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw new Error('Bitte ein PNG-, JPEG- oder WebP-Bild unter 15 MB wählen.');
   const src=URL.createObjectURL(file),img=new Image();
   try {await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(new Error('Das Bild konnte nicht gelesen werden.'));img.src=src;});}finally{URL.revokeObjectURL(src);}
   if(current!==c)return;
   const ratio=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const data=canvas.toDataURL('image/jpeg',.85);
   if(data.length>2800000)throw new Error('Bild ist zu groß. Bitte vorher verkleinern.');
   c.image=data;c.dirty=true;
   if(c.type==='documents')setupRedaction(data);
   else $('#photo-preview').innerHTML=`<img class="image-preview" src="${attr(data)}" alt="Lokal aufbereitetes Fahrzeugfoto">`;
   $('#form-error').textContent='';
 }catch(err){if(current===c){$('#form-error').textContent=err.message;ev.target.value='';}}finally{c.busyImage=false;}
}
function setupRedaction(data) {
 const c=current,img=new Image();img.onload=()=>{
   if(current!==c)return;
   const canvas=$('#redaction-canvas'),ctx=canvas.getContext('2d');canvas.width=img.width;canvas.height=img.height;$('#redaction-tools').hidden=false;
   c.masks=[];let start=null;
   const point=ev=>{const rect=canvas.getBoundingClientRect();return [(ev.clientX-rect.left)/rect.width*canvas.width,(ev.clientY-rect.top)/rect.height*canvas.height];};
   c.redraw=(pending)=>{ctx.drawImage(img,0,0);ctx.fillStyle='#000';for(const r of [...c.masks,...(pending?[pending]:[])])ctx.fillRect(...r);};
   c.redraw();
   canvas.onpointerdown=ev=>{start=point(ev);canvas.setPointerCapture(ev.pointerId);};
   canvas.onpointermove=ev=>{if(!start)return;const p=point(ev);c.redraw([Math.min(start[0],p[0]),Math.min(start[1],p[1]),Math.abs(p[0]-start[0]),Math.abs(p[1]-start[1])]);};
   canvas.onpointerup=ev=>{if(!start)return;const p=point(ev),rect=[Math.min(start[0],p[0]),Math.min(start[1],p[1]),Math.abs(p[0]-start[0]),Math.abs(p[1]-start[1])];start=null;if(rect[2]>2&&rect[3]>2)c.masks.push(rect);c.redraw();c.image=canvas.toDataURL('image/jpeg',.9);c.dirty=true;};
   canvas.onpointercancel=()=>{start=null;c.redraw();};
 };img.src=data;
}
export function undoRedaction(){if(!current?.masks)return;current.masks.pop();current.redraw();current.image=$('#redaction-canvas').toDataURL('image/jpeg',.9);current.dirty=true;}
export async function showHistory(type,id) {
 const history=await api(`${type}/${id}/history`);
 const names={name:'Name',km:'Kilometerstand',title:'Titel',notes:'Notizen',date:'Datum',who:'Durchgeführt von',cost:'Kosten',dueKm:'Fällig bei km',dueDate:'Fällig am',vin:'VIN',owner:'Besitzer',archived:'Archiviert',liters:'Liter',full:'Vollgetankt',intervalKm:'Intervall km',intervalMonths:'Intervall Monate',photo:'Fahrzeugfoto',data:'Belegbild'};
 const format=(k,v)=>['photo','data'].includes(k)?(v?'[Bild]':'[Kein Bild]'):typeof v==='boolean'?(v?'Ja':'Nein'):String(v??'–');
 show(`${titleBar('Änderungsverlauf','WERKHEFT · PROTOKOLL')}<div class="dialog-body"><div class="info-banner">${icon('shield')}<p>Vom lokalen Server protokolliert. Nachträgliche Änderungen bleiben sichtbar. Das ist kein fälschungssicherer oder signierter Nachweis.</p></div>${history.length?history.map(h=>{const changes=Object.keys(h.after||h.before||{}).filter(k=>!['id','createdAt','updatedAt','revision','vehicleId','entryId','status'].includes(k)&&JSON.stringify(h.before?.[k])!==JSON.stringify(h.after?.[k]));return `<div class="history-item"><time>${timestamp(h.at)}</time><strong>${e(h.action==='create'?'Angelegt':h.action==='delete'?'Entfernt':h.action.startsWith('km-correction')?h.action.replace('km-correction: ','Berichtigung: '):'Geändert')}</strong><pre>${changes.map(k=>`${e(names[k]||k)}: ${h.before?e(format(k,h.before[k]))+' → ':''}${e(format(k,h.after?.[k]))}`).join('\n')}</pre></div>`;}).join(''):'<p>Kein Verlauf vorhanden.</p>'}</div><div class="dialog-actions"><button class="button" data-action="close-dialog">Schließen</button></div>`,{simple:true});
}
export function completeTask(id){const task=state.data.tasks.find(t=>t.id===id);return openEditor('entries','',{vehicleId:task.vehicleId,title:task.title,notes:task.notes,taskId:id});}
export function showKm(id) {
 const v=vehicle(id);if(!v)return;
 current={dirty:false,type:'km'};
 show(`${titleBar('Kilometerstand melden',v.name)}<form id="km-form"><div class="dialog-body"><p>Zuletzt gemeldet: <strong class="mono">${num(v.km)} km</strong></p><div class="form-grid">${dateField('readingDate','Tag der Ablesung',today())}${numberField('km','Kilometerstand an diesem Tag',v.km,{required:true})}${area('reason','Nur bei Berichtigung: Warum ist der Stand niedriger?','',1000)}</div><p class="help-text">Stände von früher kannst Du mit ihrem Ablesedatum nachtragen. Ein niedrigerer aktueller Stand braucht eine begründete Berichtigung. Ablesedatum und Erfassungszeit bleiben sichtbar.</p></div><p class="form-error" id="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button ghost" data-action="close-dialog">Abbrechen</button><button class="button primary">Stand speichern</button></div></form>`);
 $('#km-form').onsubmit=async ev=>{ev.preventDefault();const form=ev.currentTarget,b=Object.fromEntries(new FormData(form)),km=Number(b.km),button=form.querySelector('button:not([type=button])');button.disabled=true;try {if(km<v.km&&b.readingDate===today())await api(`vehicles/${id}/correct-km`,{method:'POST',body:{km,reason:b.reason,revision:v.revision}});else await api(`vehicles/${id}/reading`,{method:'POST',body:{km,date:b.readingDate,notes:b.reason}});closeDialog(true);await refresh();toast('Kilometerstand gespeichert.');}catch(err){$('#form-error').textContent=err.message;button.disabled=false;}};
}
export async function showDocument(id) {
 const d=state.data.documents.find(d=>d.id===id);if(!d)return;
 show(`${titleBar(d.title,vehicleName(d.vehicleId))}<div class="dialog-body"><img class="image-preview" src="/api/documents/${attr(id)}/image" alt="${attr(d.title)}"><p class="help-text">${date(d.date)} · lokal gespeicherter Nachweis</p></div><div class="dialog-actions"><a class="button" href="/api/documents/${attr(id)}/image" download="werkheft-nachweis.jpg">${icon('download')} Herunterladen</a><button class="button" data-action="close-dialog">Schließen</button></div>`,{simple:true});
}
export function openBoxEditor(name='') {
 const box=state.data.boxes?.find(b=>b.name===name);current={type:'box',dirty:false};
 show(`${titleBar(box?'Kiste ändern':'Neue Kiste','WERKHEFT · REGAL')}<form id="box-form"><div class="dialog-body"><div class="form-grid">${field('name','Kistenname',name,{required:true,full:true})}${select('color','Farbe',['orange','blue','green'],box?.color||'orange',true)}</div><p class="help-text">Umbenennen verschiebt alle enthaltenen Einträge mit. Leere Kisten bleiben im Regal erhalten.</p></div><p class="form-error" id="form-error" role="alert"></p><div class="dialog-actions">${box?`<button class="button danger left" type="button" data-action="box-remove" data-box="${e(name)}">Leere Kiste entfernen</button>`:''}<button class="button ghost" type="button" data-action="close-dialog">Abbrechen</button><button class="button primary" type="submit">Speichern</button></div></form>`);
 const form=$('#box-form');form.oninput=()=>{if(current)current.dirty=true;};form.onsubmit=async ev=>{ev.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;try{await api('boxes',{method:'POST',body:{...Object.fromEntries(new FormData(form)),oldName:name}});closeDialog(true);await refresh();toast('Kiste gespeichert.');}catch(err){$('#form-error').textContent=err.message;submit.disabled=false;}};
}
$('#editor').addEventListener('cancel',ev=>{ev.preventDefault();closeDialog();});
$('#editor').addEventListener('click',ev=>{if(ev.target===$('#editor')){const r=ev.target.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)closeDialog();}});
