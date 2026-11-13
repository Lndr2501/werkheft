import {randomBytes,randomUUID} from 'node:crypto';
import {InputError,requireObject} from './domain.mjs';
import {createRace,stepRace} from '../public/race-engine.js';
export class RaceService {
 constructor(store){this.store=store;this.runs=new Map();}
 start(input){requireObject(input);if(input.name!==undefined&&typeof input.name!=='string')throw new InputError('Ungültiger Fahrername.');const name=typeof input.name==='string'?input.name.trim():'Fahrer';if(!/^[\p{L}\p{N} _-]{2,20}$/u.test(name))throw new InputError('Fahrername: 2–20 Buchstaben oder Zahlen.');for(const [id,r]of this.runs)if(Date.now()-r.started>120000)this.runs.delete(id);if(this.runs.size>=100)throw new InputError('Zu viele offene Läufe.',429);const id=randomUUID(),seed=randomBytes(4).readUInt32LE();this.runs.set(id,{seed,name,started:Date.now()});return {id,seed};}
 finish(input){requireObject(input);if(typeof input.id!=='string')throw new InputError('Ungültige Lauf-ID.');const r=this.runs.get(input.id);if(!r||Date.now()-r.started>120000)throw new InputError('Lauf abgelaufen oder bereits gewertet.',409);const events=input.events;if(!Array.isArray(events)||events.length>2000)throw new InputError('Ungültige Steuerdaten.');let last=-1;for(const e of events){requireObject(e);if(!Number.isInteger(e.tick)||e.tick<last||e.tick>1800||!['left','right','gas','brake','coast'].includes(e.action))throw new InputError('Ungültige Steuerdaten.');last=e.tick;}
  const sim=createRace(r.seed);let i=0;while(!sim.done){const actions=[];while(i<events.length&&events[i].tick===sim.tick)actions.push(events[i++].action);stepRace(sim,actions);}if(sim.tick/30>(Date.now()-r.started)/1000+2)throw new InputError('Laufzeit stimmt nicht mit dem Server überein.');this.runs.delete(input.id);
  const scores=this.scores(),row={name:r.name,score:Math.floor(sim.distance),at:new Date().toISOString()};scores.push(row);this.store.setMeta('raceScores',scores.slice(-5000));return {...row,ranking:this.ranking()};
 }
 scores(){return this.store.getMeta('raceScores',[]);}
 ranking(){const month=new Date().toISOString().slice(0,7),best=new Map();for(const r of this.scores().filter(r=>r.at.startsWith(month)))if(!best.has(r.name)||best.get(r.name).score<r.score)best.set(r.name,r);return {month,rows:[...best.values()].sort((a,b)=>b.score-a.score).slice(0,30).map((r,i)=>({...r,place:i+1}))};}
}
