import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Store} from './lib/store.mjs';
import {InputError,collections,taskStatus,fuelConsumption,requireObject} from './lib/domain.mjs';
import {RaceService} from './lib/races.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.otf':'font/otf','.webmanifest':'application/manifest+json'};
const security={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
function privateAddress(address=''){const ip=address.replace(/^::ffff:/,'');if(ip==='::1')return true;const p=ip.split('.').map(Number);return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(p[0]===127||p[0]===10||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31);}
async function body(req,maxBytes=64*1024*1024){if(!req.headers['content-type']?.startsWith('application/json'))throw new InputError('JSON erwartet.',415);let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw new InputError('Anfrage ist zu groß.',413);chunks.push(chunk);}let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new InputError('Ungültiges JSON.');}return requireObject(parsed);}
export function createApp({dbPath=resolve(root,'data/werkheft.sqlite'),allowedHosts=[],privateLAN=false}={}){
 const store=new Store(dbPath),races=new RaceService(store);
 if(store.repairs.documents||store.repairs.corrections)console.log('Werkheft: bestehende Datenbezüge repariert',store.repairs);
 const hosts=new Set(['localhost','127.0.0.1','[::1]',...allowedHosts]);
 const server=http.createServer(async(req,res)=>{
  const send=(code,data,extra={})=>{res.writeHead(code,{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));};
  try{
   if(privateLAN&&!privateAddress(req.socket.remoteAddress))throw new InputError('Nur Zugriff aus dem privaten Netz erlaubt.',403);
   const host=req.headers.host||'';let authority;try{authority=new URL(`http://${host}`);}catch{throw new InputError('Ungültiger Host.',403);}
   if(authority.host!==host.toLowerCase()||!hosts.has(authority.hostname))throw new InputError('Dieser Host ist nicht freigegeben.',403);
   const url=new URL(req.url,`http://${host}`),path=url.pathname;
   if(path==='/healthz'&&req.method==='GET')return send(200,{ok:true});
   if(path.startsWith('/api/')){
    if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&![`http://${host}`,`https://${host}`].includes(req.headers.origin))throw new InputError('Fremder Ursprung abgewiesen.',403);
    if(path==='/api/state'&&req.method==='GET'){
     const state=store.snapshot();state.tasks=state.tasks.map(t=>({...t,status:taskStatus(t,state.vehicles.find(v=>v.id===t.vehicleId)||{km:0})}));state.huTasks=state.vehicles.filter(v=>v.hu&&!v.archived).map(v=>({id:'hu-'+v.id,kind:'hu',title:'Hauptuntersuchung (HU)',vehicleId:v.id,dueDate:v.hu,dueKm:0,done:false,status:taskStatus({dueDate:v.hu},v)}));state.fuelStats=Object.fromEntries(state.vehicles.map(v=>[v.id,fuelConsumption(state.fuel.filter(f=>f.vehicleId===v.id))]));state.boxes=store.boxes();return send(200,state);
    }
    if(path==='/api/export'&&req.method==='GET')return send(200,store.export(),{'Content-Disposition':'attachment; filename="werkheft-sicherung.json"'});
    if(path==='/api/import'&&req.method==='POST')return send(200,store.import(await body(req)));
    if(path==='/api/demo'&&req.method==='POST'){await body(req);return send(201,store.demo());}
    if(path==='/api/demo'&&req.method==='DELETE')return send(200,store.resetDemo());
    if(path==='/api/race/ranking'&&req.method==='GET')return send(200,races.ranking());
    if(path==='/api/race/start'&&req.method==='POST')return send(201,races.start(await body(req,4096)));
    if(path==='/api/race/finish'&&req.method==='POST')return send(200,races.finish(await body(req,256000)));
    if(path==='/api/boxes'&&req.method==='POST')return send(200,store.saveBox(await body(req,16384)));
    if(path==='/api/boxes'&&req.method==='DELETE')return send(200,store.removeBox(await body(req,4096)));
    const [,type,id,action]=path.split('/').filter(Boolean);
    if(type==='transfer'&&id&&req.method==='GET')return send(200,store.transfer(id),{'Content-Disposition':'attachment; filename="werkheft-fahrzeug.json"'});
    if(type==='readings'&&req.method!=='GET')throw new InputError('Ablesungen nur am Fahrzeug erfassen; sie bleiben unveränderlich.',405);
    if(!collections.includes(type))throw new InputError('Unbekannter API-Pfad.',404);
    if(type==='documents'&&action==='image'&&req.method==='GET'){const doc=store.get('documents',id),match=/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/.exec(doc.data);if(!match)throw new InputError('Bild nicht gefunden.',404);res.writeHead(200,{...security,'Content-Type':match[1],'Cache-Control':'no-store'});res.end(Buffer.from(match[2],'base64'));return;}
    if(action==='history'&&req.method==='GET')return send(200,store.history(type,id));
    if(type==='vehicles'&&action==='correct-km'&&req.method==='POST')return send(200,store.correctKm(id,await body(req)));
    if(type==='vehicles'&&action==='reading'&&req.method==='POST')return send(201,store.addReading(id,await body(req)));
    if(type==='tasks'&&action==='complete'&&req.method==='POST')return send(201,store.completeTask(id,await body(req)));
    if(action)throw new InputError('Unbekannte Aktion.',404);
    if(req.method==='GET'&&id)return send(200,store.get(type,id));
    if(req.method==='POST'&&!id)return send(201,store.create(type,await body(req)));
    if(req.method==='PUT'&&id)return send(200,store.update(type,id,await body(req)));
    if(req.method==='DELETE'&&id)return send(200,store.remove(type,id));
    throw new InputError('Methode nicht erlaubt.',405);
   }
   if(!['GET','HEAD'].includes(req.method))throw new InputError('Methode nicht erlaubt.',405);
   const relative=path==='/'||path==='/garage'?'index.html':decodeURIComponent(path.slice(1)),file=resolve(root,'public',relative),publicRoot=resolve(root,'public')+'/';
   if(!file.startsWith(publicRoot)||!mime[extname(file)])throw new InputError('Nicht gefunden.',404);
   let bytes;try{if(!(await stat(file)).isFile())throw new Error();bytes=await readFile(file);}catch{throw new InputError('Nicht gefunden.',404);}
   res.writeHead(200,{...security,'Content-Type':mime[extname(file)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){if(!res.headersSent)send(error instanceof InputError?error.status:500,{error:error instanceof InputError?error.message:'Interner Fehler. Es wurden keine unvollständigen Änderungen gespeichert.'});else res.end();if(!(error instanceof InputError))console.error('Werkheft: interner Fehler',error.name);}
 });
 server.requestTimeout=30000;server.on('close',()=>store.close());return {server,store};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const port=Number(process.env.PORT||4177),bind=process.env.WERKHEFT_BIND||'127.0.0.1',privateLAN=process.env.WERKHEFT_PRIVATE_LAN==='1';
 if(!['127.0.0.1','::1'].includes(bind)&&!privateLAN)throw new Error('Netzwerkbetrieb muss ausdrücklich mit WERKHEFT_PRIVATE_LAN=1 freigegeben werden.');
 const {server}=createApp({dbPath:process.env.WERKHEFT_DB||resolve(root,'data/werkheft.sqlite'),allowedHosts:(process.env.WERKHEFT_ALLOWED_HOSTS||'').split(',').map(s=>s.trim()).filter(Boolean),privateLAN});
 server.listen(port,bind,()=>console.log(`Werkheft läuft auf http://${bind}:${port} · ${privateLAN?'privates Netz, ohne Login':'nur lokal'}`));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
}
