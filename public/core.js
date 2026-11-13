import {escapeHTML,icon} from './visuals.js';
export {escapeHTML as e,icon};
export const state={data:null,vehicleFilter:'all',taskFilter:'all',expenseRange:'year',shelfFilter:'all',query:'',activeArchive:false};
export const $=s=>document.querySelector(s);
export const $$=s=>[...document.querySelectorAll(s)];
export const num=(v,digits=0)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits});
export const money=v=>Number(v||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
export const today=()=>new Date().toLocaleDateString('sv-SE');
export const date=v=>v?new Date(v+'T12:00:00').toLocaleDateString('de-DE'):'–';
export const timestamp=v=>new Date(v).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
export const vehicle=id=>state.data?.vehicles.find(v=>v.id===id);
export const vehicleName=id=>vehicle(id)?.name||'Unbekanntes Fahrzeug';
export function route(){const [page='garage',id='',tab='heft']=location.hash.slice(1).split('/');return {page:page||'garage',id,tab};}
export const matchesVehicle=r=>state.vehicleFilter==='all'||r.vehicleId===state.vehicleFilter;
export const labels={vehicles:'Fahrzeug',entries:'Arbeit',tasks:'Termin',fuel:'Tankung',shelf:'Regaleintrag',documents:'Nachweis',expenses:'Ausgabe',board:'Aushang'};
export async function api(path,{method='GET',body}={}) {
 let res;try{res=await fetch('/api/'+path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new Error('Der lokale Server ist nicht erreichbar. Starte Werkheft und versuche es erneut.');}
 const data=await res.json();if(!res.ok)throw new Error(data.error||'Die Anfrage ist fehlgeschlagen.');return data;
}
export async function refresh(){state.data=await api('state');window.dispatchEvent(new Event('werkheft:refresh'));}
let toastTimer;
export function toast(message,error=false){const box=$('#toast');box.textContent=message;box.className='show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.className='',error?6500:3500);}
export const btn=(text,action,{type='',id='',cls='',extra=''}={})=>`<button class="button ${cls}" data-action="${action}" ${type?`data-type="${escapeHTML(type)}"`:''} ${id?`data-id="${escapeHTML(id)}"`:''} ${extra}>${text}</button>`;
export const empty=(title,description,action='')=>`<div class="empty-state">${icon('wrench')}<h2>${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p>${action}</div>`;
export function vehicleSelect(selected=state.vehicleFilter,{includeAll=true,name='',label='Fahrzeug'}={}){
 return `<select ${name?`name="${name}"`:'id="vehicle-filter"'} aria-label="${escapeHTML(label)}">${includeAll?'<option value="all">Alle Fahrzeuge</option>':''}${state.data.vehicles.map(v=>`<option value="${escapeHTML(v.id)}" ${selected===v.id?'selected':''}>${escapeHTML(v.name)}${v.archived?' · archiviert':''}</option>`).join('')}</select>`;
}
export function download(name,content,type='application/json') {const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
export const odometer=km=>`<span class="odometer" aria-label="${num(km)} Kilometer">${String(Math.round(km)).padStart(6,'0').split('').map(n=>`<span class="digit" aria-hidden="true">${n}</span>`).join('')}<small>km</small></span>`;
export const pill=(status,text)=>`<span class="pill ${status}">${escapeHTML(text||({overdue:'Fällig / überfällig',soon:'Demnächst',planned:'Geplant',done:'Erledigt'}[status]||status))}</span>`;
export function dueText(t){const v=vehicle(t.vehicleId);const km=t.dueKm?(t.dueKm>(v?.km||0)?`noch ${num(t.dueKm-(v?.km||0))} km`:`seit ${num((v?.km||0)-t.dueKm)} km fällig`):'';return [km,t.dueDate?date(t.dueDate):''].filter(Boolean).join(' · ');}
export function calendarFile(tasks){const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[,;]/g,'\\$&');const format=s=>s.replaceAll('-','');const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Werkheft//DE','CALSCALE:GREGORIAN'];for(const t of tasks.filter(t=>!t.done&&t.dueDate))lines.push('BEGIN:VEVENT',`UID:${t.id}@werkheft.local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z')}`,`DTSTART;VALUE=DATE:${format(t.dueDate)}`,`SUMMARY:${esc(vehicleName(t.vehicleId)+': '+t.title)}`,`DESCRIPTION:${esc(t.notes||'')}`,'END:VEVENT');lines.push('END:VCALENDAR');const fold=line=>{let out='',length=0;const encoder=new TextEncoder();for(const ch of line){const size=encoder.encode(ch).length;if(length+size>75){out+='\r\n ';length=1;}out+=ch;length+=size;}return out;};download('werkheft-termine.ics',lines.map(fold).join('\r\n')+'\r\n','text/calendar;charset=utf-8');}
export function costRows(){return [ ...state.data.entries.filter(x=>x.cost).map(x=>({...x,source:'entries'})),...state.data.fuel.map(x=>({...x,title:`Tankung · ${x.type}`,category:'Kraftstoff',source:'fuel'})),...state.data.expenses.map(x=>({...x,source:'expenses'})) ].filter(matchesVehicle).filter(r=>state.expenseRange==='all'||(state.expenseRange==='year'?r.date.slice(0,4)===today().slice(0,4):r.date.slice(0,7)===today().slice(0,7))).sort((a,b)=>b.date.localeCompare(a.date));}
