import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

// Intentionally cannot target the production port.
const BASE='http://192.168.178.230:4178';
assert.equal(new URL(BASE).port,'4178');
const OUT=resolve(process.env.WERKHEFT_REVIEW_OUT||'test-results/review');await mkdir(OUT,{recursive:true});
const results=[],findings=[],browserErrors=[],externalRequests=[];
let browser,page,expectedBrowserError=false;
const today=new Date().toISOString().slice(0,10),days=n=>new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshot=()=>api('state').then(r=>r.body);
async function api(path,{method='GET',body,headers={},raw}={}){const r=await fetch(BASE+'/api/'+path,{method,headers:{...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw!==undefined?raw:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={text};}return {status:r.status,body:data};}
async function create(type,body){const r=await api(type,{method:'POST',body});assert.equal(r.status,201,r.body.error);return r.body;}
async function test(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});console.log('FAIL '+name+': '+error.message);if(page&&!page.isClosed())try{await page.screenshot({path:OUT+'/failure-'+results.length+'.png',fullPage:true});}catch{}try{await page?.locator('dialog[open] [data-action=close-dialog]').first().click({timeout:1000});}catch{}}}
let navigation=0;
async function go(hash){await page.goto(BASE+'/?review='+navigation+++'#'+hash);await page.locator('#main h1').waitFor();}
async function proof(name,fullPage=true){await page.screenshot({path:OUT+'/'+name+'.png',fullPage});}
async function save(){await page.locator('#editor button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);}
async function waitState(predicate){for(let i=0;i<30;i++){const s=await snapshot();if(predicate(s))return s;await new Promise(ok=>setTimeout(ok,100));}throw new Error('Gespeicherter Zustand wurde nicht sichtbar.');}
let golf,van,bmw,entry,part,doc,fixtureImage;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
 const desktop=await browser.newContext({viewport:{width:1440,height:1000},locale:'de-DE',reducedMotion:'reduce',acceptDownloads:true});desktop.setDefaultTimeout(10000);
 function observe(p){p.on('pageerror',e=>browserErrors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!expectedBrowserError)browserErrors.push(m.text());});p.on('request',r=>{if(!r.url().startsWith(BASE)&&!r.url().startsWith('blob:'+BASE)&&!r.url().startsWith('data:'))externalRequests.push(r.url());});p.on('dialog',d=>{if(d.type()==='alert')browserErrors.push('Unexpected alert: '+d.message());d.accept();});}
 page=await desktop.newPage();observe(page);
 const emptyBackup={format:'werkheft',version:1,vehicles:[],entries:[],tasks:[],fuel:[],shelf:[],documents:[],expenses:[],board:[],readings:[],boxes:[],raceScores:[],audit:[],demo:false};assert.equal((await api('import',{method:'POST',body:emptyBackup})).status,200);
 await test('Leere Testinstanz, Desktop-Start und Formularvalidierung',async()=>{
  const s=await snapshot();assert.equal(s.vehicles.length,0,'Testinstanz darf keine vorhandenen Daten enthalten.');await go('garage');await proof('01-empty-desktop');await page.locator('[data-action=new][data-type=vehicles]').first().click();await page.locator('[data-action=wizard-next]').click();assert.equal(await page.locator('[data-panel="0"]').isVisible(),true);assert.equal(await page.locator('[name=name]:invalid').count(),1);await proof('02-required-field');await page.locator('[data-action=close-dialog]').first().click();
 });
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=250;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,400,250);x.fillStyle='#111';x.font='20px sans-serif';x.fillText('TESTKUNDE – KEINE ECHTEN DATEN',15,45);x.fillText('TESTRECHNUNG 94,95 EUR',15,180);return c.toDataURL('image/png');});fixtureImage=resolve(OUT,'fixture-proof.png');await writeFile(fixtureImage,Buffer.from(image.split(',')[1],'base64'));
 golf=await create('vehicles',{name:'Review-Golf',make:'Volkswagen',model:'Golf IV',year:2002,vin:'WVWZZZ1JZ2W386752',km:184200,owner:2,notes:'PRIVATE FAHRZEUGNOTIZ NICHT WEITERGEBEN',hsn:'0603',tsn:'402',engine:'ALH',oil:'5W-40 · 4,3 l',hu:days(14)});
 van=await create('vehicles',{name:'Review-Transporter',make:'Volkswagen',model:'T5',km:50000,owner:1});
 bmw=await create('vehicles',{name:'Review-BMW archiviert',make:'BMW',model:'E46',km:212000,owner:1,archived:true,accent:'blue'});
 entry=await create('entries',{vehicleId:golf.id,title:'Ölwechsel & Filter',date:days(-60),km:176500,notes:'Öl und Filter ersetzt. <img src=x onerror="window.__reviewXSS=1">',who:'Selbst gemacht',category:'Wartung',cost:94.95,intervalKm:10000,intervalMonths:12,owner:2});
 await create('tasks',{vehicleId:golf.id,title:'Zahnriemen prüfen',dueKm:183000,notes:'Intervall in den Herstellerunterlagen prüfen.'});
 await create('tasks',{vehicleId:van.id,title:'Innenraumfilter',dueDate:days(7),intervalMonths:12});
 for(const [km,liters,cost,ago,full]of [[181900,40,64,-45,true],[182100,12,19.2,-30,false],[182600,30,48,-15,true],[184200,96,153.6,0,true]])await create('fuel',{vehicleId:golf.id,date:days(ago),km,liters,cost,type:'Diesel',full});
 await api('vehicles/'+golf.id+'/reading',{method:'POST',body:{date:days(-100),km:172000,notes:'Historische Test-Ablesung'}});
 for(const [name,color]of [['Werkzeug','blue'],['Golf','green'],['Leere Kiste','orange']])assert.equal((await api('boxes',{method:'POST',body:{name,color}})).status,200);
 part=await create('shelf',{title:'Drehmomentschlüssel',box:'Werkzeug',quantity:1,part:'ABC-123',url:'https://example.test/werkzeug'});
 await create('shelf',{title:'Ölfilter',box:'Golf',quantity:0,needed:true});
 doc=await create('documents',{vehicleId:golf.id,entryId:entry.id,title:'Testrechnung Ölfilter',date:days(-60),data:image});
 await create('expenses',{vehicleId:golf.id,title:'Review-Versicherung',date:today,cost:245,category:'Versicherung'});
 await create('board',{title:'Winterräder vormerken',kind:'Notiz',notes:'Nur Testdaten, nicht veröffentlicht.'});
 await test('Desktop: gefüllte Garage, Karten, Aufgaben und HTML-Escaping',async()=>{await go('garage');assert.equal(await page.getByRole('link',{name:'Review-Golf öffnen',exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'Review-BMW archiviert öffnen',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.__reviewXSS),undefined);await proof('03-dashboard-desktop');});
 await test('API-Schutz: Host, Origin, MIME, JSON und Ressourcen',async()=>{
  const foreign=await new Promise((ok,no)=>{const r=httpRequest(BASE+'/api/state',{headers:{Host:'evil.example'}},res=>{res.resume();ok(res.statusCode);});r.on('error',no);r.end();});assert.equal(foreign,403);
  assert.equal((await api('state',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await api('vehicles',{method:'POST',headers:{Origin:'https://evil.example'},body:{name:'Nicht speichern'}})).status,403);
  assert.equal((await api('vehicles',{method:'POST',raw:'{broken'})).status,400);
  assert.equal((await api('vehicles',{method:'POST',raw:'{}',headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await api('vehicles/does-not-exist')).status,404);
  assert.equal((await api('auth/login',{method:'POST',body:{}})).status,404);
  assert.equal((await fetch(BASE+'/../lib/store.mjs')).status,404);
 });
 await test('API-Validierung: VIN, Fremdbezug, negative Werte und Link-Schema',async()=>{
  assert.equal((await api('vehicles',{method:'POST',body:{name:'Ungültig',vin:'I'.repeat(17),km:0}})).status,400);
  assert.equal((await api('vehicles',{method:'POST',body:{name:'Duplikat',vin:golf.vin,km:0}})).status,409);
  assert.equal((await api('entries',{method:'POST',body:{vehicleId:'missing',title:'x',date:today,km:1}})).status,404);
  assert.equal((await api('fuel',{method:'POST',body:{vehicleId:golf.id,date:today,km:184300,liters:-1,cost:1}})).status,400);
  assert.equal((await api('fuel',{method:'POST',body:{vehicleId:golf.id,date:today,km:184200,liters:20,cost:30}})).status,409);
  assert.equal((await api('shelf',{method:'POST',body:{title:'Unsicher',box:'Golf',quantity:1,url:'javascript:alert(1)'}})).status,400);
  assert.equal((await api('documents',{method:'POST',body:{vehicleId:van.id,entryId:entry.id,title:'Falsche Zuordnung',date:today,data:image}})).status,400);
  assert.equal((await api('documents',{method:'POST',body:{vehicleId:golf.id,title:'SVG',date:today,data:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400);
 });
 await test('Desktop: Tankbuch, Teilfüllung und Fahrzeugfilter',async()=>{await go('tanken');await page.locator('#vehicle-filter').selectOption(golf.id);const s=await snapshot();assert.equal(s.fuelStats[golf.id].points.length,2);assert.ok(Math.abs(s.fuelStats[golf.id].average-6)<1e-8);assert.match(await page.locator('.mini-stat strong').innerText(),/6,00/);await proof('04-tankbook-desktop');});
 await test('Desktop: echte konkurrierende Änderung zeigt 409 statt Überschreiben',async()=>{
  await go('chronik');const row=page.locator('.entry-row').filter({has:page.getByRole('heading',{name:'Ölwechsel & Filter',exact:true})});await row.locator('[data-action=edit]').click();const current=(await api('entries/'+entry.id)).body;const update=await api('entries/'+entry.id,{method:'PUT',body:{...current,notes:'Parallel vom zweiten Gerät geändert'}});assert.equal(update.status,200);
  await page.locator('#editor [name=notes]').fill('Dieser alte Entwurf darf nicht überschreiben');expectedBrowserError=true;await page.locator('#save-button').click();await page.locator('#form-error').getByText('inzwischen geändert',{exact:false}).waitFor();expectedBrowserError=false;assert.equal((await api('entries/'+entry.id)).body.notes,'Parallel vom zweiten Gerät geändert');await proof('05-conflict-desktop');await page.locator('[data-action=close-dialog]').first().click();await page.reload();
 });
 await test('Desktop: Routine erledigen ist atomar und nicht doppelt ausführbar',async()=>{
  const t=(await snapshot()).tasks.find(t=>t.vehicleId===van.id&&!t.done);await go('termine');await page.locator(`[data-action=complete][data-id="${t.id}"]`).click();await page.locator('#editor [name=km]').fill('50100');await page.locator('#editor [name=cost]').fill('25.50');await save();const s=await snapshot();assert.equal(s.tasks.find(x=>x.id===t.id).done,true);assert.equal(s.tasks.filter(x=>x.vehicleId===van.id&&!x.done).length,1);assert.equal((await api('tasks/'+t.id+'/complete',{method:'POST',body:{revision:t.revision,date:today,km:50100}})).status,409);await proof('06-tasks-desktop');
 });
 await test('Desktop: neue historische Ablesung, aktueller Stand unverändert',async()=>{
  await go('fahrzeug/'+golf.id+'/staende');await page.locator('[data-action=km]').first().click();await page.locator('#editor [name=readingDate]').fill(days(-90));await page.locator('#editor [name=km]').fill('173500');await page.locator('#editor #km-form button:not([type=button])').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);assert.equal((await api('vehicles/'+golf.id)).body.km,184200);await proof('07-mileage-desktop');
 });
 await test('Desktop: Kisten-/Teile-Drag-and-drop und Umbenennen',async()=>{
  await go('regal');await page.locator(`[data-shelf-drag="${part.id}"]`).dragTo(page.locator('.shelf-box[data-box="Golf"] .box-header'));await waitState(s=>s.shelf.find(x=>x.id===part.id).box==='Golf');
  await page.locator('[data-box-drag="Golf"]').dragTo(page.locator('.shelf-box[data-box="Werkzeug"] .box-header'));await waitState(s=>s.boxes[0].name==='Golf');
  await page.getByRole('button',{name:'Kiste Golf ändern',exact:true}).click();await page.locator('#box-form [name=name]').fill('Golf-Teile');await page.locator('#box-form [name=color]').selectOption('blue');await save();const s=await snapshot();assert.equal(s.shelf.find(x=>x.id===part.id).box,'Golf-Teile');assert.equal(s.boxes[0].color,'blue');assert.ok(s.boxes.some(b=>b.name==='Leere Kiste'));await proof('08-shelf-desktop');
 });
 await test('Desktop: Upload, lokale Schwärzung und gespeicherte Bildpixel',async()=>{
  await go('nachweise');await page.locator('[data-action=new][data-type=documents]').first().click();await page.locator('#editor [name=title]').fill('Review: geschwärzter Beleg');await page.locator('#editor [name=vehicleId]').selectOption(golf.id);await page.locator('#editor [name=entryId]').selectOption(entry.id);await page.locator('#image-file').setInputFiles(fixtureImage);await page.locator('#redaction-tools:not([hidden])').waitFor();const rect=await page.locator('#redaction-canvas').boundingBox();await page.mouse.move(rect.x+5,rect.y+5);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.95,rect.y+rect.height*.35);await page.mouse.up();await proof('09-proof-redaction-desktop',false);await save();
  const d=(await snapshot()).documents.find(d=>d.title==='Review: geschwärzter Beleg');assert.ok(d);const stored=(await api('documents/'+d.id)).body;assert.ok(stored.data.startsWith('data:image/jpeg;base64,'));assert.notEqual(stored.data,image);
  const pixel=await page.evaluate(async id=>{const im=new Image();await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src='/api/documents/'+id+'/image';});const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return {black:x.getImageData(20,20,1,1).data[0],white:x.getImageData(390,240,1,1).data[0]};},d.id);assert.ok(pixel.black<10);assert.ok(pixel.white>240);
 });
 await test('Desktop: Fahrzeug-Wizard mit Foto und Speicherung nach Reload',async()=>{
  await go('garage');await page.locator('[data-action=new][data-type=vehicles]').first().click();await page.locator('#editor [name=name]').fill('Review-Neuanlage');await page.locator('#editor [name=make]').fill('Volvo');await page.locator('#editor [name=model]').fill('244');await page.locator('#editor [name=firstRegistration]').fill('1980-05-12');await page.locator('#editor [name=year]').fill('1980');await page.locator('#editor [name=km]').fill('1000');await page.locator('[data-action=wizard-next]').click();await page.locator('[data-action=wizard-next]').click();await page.locator('#image-file').setInputFiles(fixtureImage);await page.locator('#photo-preview img').waitFor();await save();await page.reload();await page.getByRole('link',{name:'Review-Neuanlage öffnen',exact:true}).waitFor();const v=(await snapshot()).vehicles.find(v=>v.name==='Review-Neuanlage');assert.ok(v.photo.startsWith('data:image/jpeg;base64,'));
 });
 await test('Desktop: Archivierung und Wiederherstellung behalten Daten',async()=>{
  await go('fahrzeug/'+van.id);await page.locator('[data-action=archive]').click();await waitState(s=>s.vehicles.find(v=>v.id===van.id).archived);await go('inaktiv');await page.getByRole('link',{name:'Review-Transporter öffnen',exact:true}).waitFor();await page.getByRole('link',{name:'Review-Transporter öffnen',exact:true}).click();await page.locator('[data-action=archive]').click();await waitState(s=>!s.vehicles.find(v=>v.id===van.id).archived);assert.ok((await snapshot()).entries.some(r=>r.vehicleId===van.id));
 });
 await test('Desktop: Buchhaltung, CSV und Kalender-ICS',async()=>{
  await go('zahlen');await page.locator('#vehicle-filter').selectOption('all');await proof('10-costs-desktop');let pending=page.waitForEvent('download');await page.locator('[data-action=export-costs]').click();let dl=await pending;const csvPath=resolve(OUT,'costs.csv');await dl.saveAs(csvPath);assert.ok((await readFile(csvPath,'utf8')).includes('Review-Versicherung'));
  await go('termine');pending=page.waitForEvent('download');await page.locator('[data-action=calendar]').click();dl=await pending;const icsPath=resolve(OUT,'tasks.ics');await dl.saveAs(icsPath);const text=await readFile(icsPath,'utf8');assert.ok(text.includes('BEGIN:VEVENT'));assert.ok(text.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
 });
 await test('Desktop: vollständige Sicherung und echter UI-Restore',async()=>{
  await go('einstellungen');let pending=page.waitForEvent('download');await page.locator('[data-action=backup]').click();const dl=await pending,path=resolve(OUT,'fixture-backup.json');await dl.saveAs(path);const data=JSON.parse(await readFile(path,'utf8'));assert.ok(data.documents.every(d=>d.data));assert.ok(data.readings.length);assert.ok(data.boxes.some(b=>b.name==='Leere Kiste'));const before=hash(data.vehicles);
  await page.locator('[data-action=import]').click();await page.locator('#import-file').setInputFiles(path);await page.getByText('Import abgeschlossen.',{exact:false}).waitFor();assert.equal(hash((await snapshot()).vehicles),before);
  const broken={...data,documents:data.documents.map((d,i)=>i===0?{...d,vehicleId:van.id}:d)};const response=await api('import',{method:'POST',body:broken});assert.equal(response.status,400);assert.equal(hash((await snapshot()).vehicles),before);
 });
 await test('Desktop: Weitergabe und PDF enthalten keine privaten Kosten-/Fahrzeugfelder',async()=>{
  const transfer=(await api('transfer/'+golf.id)).body;assert.equal(transfer.documents,undefined);assert.equal(transfer.fuel,undefined);assert.equal(transfer.vehicle.notes,undefined);assert.equal(transfer.vehicle.photo,undefined);assert.ok(transfer.entries.every(e=>!('cost'in e)));await writeFile(resolve(OUT,'fixture-transfer.json'),JSON.stringify(transfer,null,2));
  await go('fahrzeug/'+golf.id);await page.evaluate(()=>{window.print=()=>{window.__reviewPrinted=true;};});await page.locator('[data-action=print]').click();assert.equal(await page.evaluate(()=>window.__reviewPrinted),true);const text=await page.locator('#print-area').innerText();assert.ok(!text.includes('PRIVATE FAHRZEUGNOTIZ'));assert.ok(!text.includes('Review-Versicherung'));await page.pdf({path:resolve(OUT,'fixture-vehicle.pdf'),format:'A4'});
 });
 await test('Desktop: Brett und globale Teilenummer-Suche',async()=>{
  await go('schrottplatz');await page.locator('[data-action=new][data-type=board]').click();await page.locator('#editor [name=title]').fill('Review-Verkaufsnotiz');await page.locator('#editor [name=kind]').selectOption('Angebot');await page.locator('#editor [name=notes]').fill('Privat im Heimnetz.');await save();await page.getByRole('heading',{name:'Review-Verkaufsnotiz',exact:true}).waitFor();await page.locator('#search').fill('ABC-123');await page.getByText('1 Treffer für',{exact:false}).waitFor();await proof('11-search-desktop');await page.keyboard.press('Escape');
 });
 await test('Desktop: Nachtfahrt tatsächlich bis zur Server-Wertung spielen',async()=>{
  await go('games/nachtfahrt');await page.locator('#night-name').fill('ReviewDesktop');const finished=page.waitForResponse(r=>r.url().endsWith('/api/race/finish'),{timeout:75000});await page.locator('[data-action=game-night-start]').click();await page.locator('#night-name:disabled').waitFor();await page.keyboard.down('ArrowUp');const response=await finished;await page.keyboard.up('ArrowUp');assert.equal(response.status(),200);const r=await response.json();assert.ok(r.score>0);await page.getByRole('heading',{name:r.score.toLocaleString('de-DE')+' Meter',exact:true}).waitFor();await proof('12-nightdrive-desktop');
 });
 const mobile=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE',isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});const desktopPage=page;mobile.setDefaultTimeout(10000);page=await mobile.newPage();observe(page);
 await test('Mobil: 14 Ansichten, Touch-Navigation und kein horizontaler Seitenüberlauf',async()=>{
  for(const r of ['garage','inaktiv','termine','chronik','tanken','zahlen','regal','nachweise','schrottplatz','wissen','einstellungen','fahrzeug/'+golf.id+'/heft','fahrzeug/'+golf.id+'/schein','fahrzeug/'+golf.id+'/staende']){await go(r);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=390,'Überlauf in '+r);}await go('garage');await proof('13-dashboard-mobile');await page.getByRole('link',{name:'Regal',exact:true}).tap();await page.getByRole('heading',{name:'Dein Regal',exact:true}).waitFor();await proof('14-shelf-mobile');
 });
 await test('Mobil: Dialoge, Kistenfarbe und Bedienung ohne Drag-and-drop',async()=>{
  await page.getByRole('button',{name:'Kiste Leere Kiste ändern',exact:true}).tap();await page.locator('#box-form [name=color]').selectOption('green');await save();assert.equal((await snapshot()).boxes.find(b=>b.name==='Leere Kiste').color,'green');
  await go('fahrzeug/'+golf.id+'/schein');await page.locator('[data-action=edit][data-type=vehicles]').first().tap();assert.equal(await page.locator('#editor [name=name]').inputValue(),'Review-Golf');await page.locator('[data-action=wizard-next]').tap();await proof('15-vehicle-dialog-mobile',false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=390);await page.locator('[data-action=close-dialog]').first().tap();
 });
 await test('Mobil: Beleg per echter Touch-Geste schwärzen',async()=>{
  await go('nachweise');await page.locator('[data-action=new][data-type=documents]').first().tap();await page.locator('#editor [name=title]').fill('Review: Touch-Beleg');await page.locator('#editor [name=vehicleId]').selectOption(golf.id);await page.locator('#image-file').setInputFiles(fixtureImage);const canvas=page.locator('#redaction-canvas');await page.locator('#redaction-tools:not([hidden])').waitFor();await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox(),cdp=await mobile.newCDPSession(page);const start={x:r.x+4,y:r.y+4},end={x:r.x+r.width*.85,y:r.y+r.height*.3};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await proof('16-proof-redaction-mobile',false);await save();const saved=(await snapshot()).documents.find(d=>d.title==='Review: Touch-Beleg');assert.ok(saved);const pixel=await page.evaluate(async id=>{const image=new Image();await new Promise((ok,no)=>{image.onload=ok;image.onerror=no;image.src='/api/documents/'+id+'/image';});const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return x.getImageData(20,20,1,1).data[0];},saved.id);assert.ok(pixel<10,'Touch-Schwärzung muss in gespeicherten Pixeln sichtbar sein.');
 });
 await test('Mobil: Memory, Quiz und Reaktion per Touch',async()=>{
  await go('games/memory');await page.locator('.memory-card').first().tap();await page.locator('.memory-card.flipped').waitFor();assert.equal(await page.locator('.memory-card.flipped').count(),1);await proof('17-memory-mobile');
  await go('games/quiz');for(const answer of [1,0,1,2,1]){await page.locator(`[data-action=game-answer][data-index="${answer}"]`).tap();await page.locator('[data-action=game-next-quiz]').tap();}await page.getByText('5 von 5 richtig.',{exact:true}).waitFor();
  await go('games/reaktion');await page.locator('[data-action=game-react]').tap();await page.locator('.reaction-pad.ready').waitFor({timeout:5000});await page.locator('[data-action=game-react]').tap();await page.locator('.reaction-pad.result').waitFor();
 });
 await test('Mobil: Nachtfahrt-Touchsteuerung und echte Wertung',async()=>{
  await go('games/nachtfahrt');await page.locator('#night-name').fill('ReviewMobil');const finished=page.waitForResponse(r=>r.url().endsWith('/api/race/finish'),{timeout:75000});await page.locator('[data-action=game-night-start]').tap();await page.locator('#night-name:disabled').waitFor();await page.locator('[data-night-control=right]').tap();await page.locator('[data-night-control=gas]').tap();await page.locator('[data-night-control=left]').tap();const r=await finished;assert.equal(r.status(),200);await proof('18-nightdrive-mobile');
 });
 await test('Mobil schmal: 320px, Formulare und gemischte Inhalte',async()=>{await page.setViewportSize({width:320,height:740});for(const r of ['garage','regal','zahlen','fahrzeug/'+golf.id+'/heft','wissen']){await go(r);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=320,'Überlauf bei 320px: '+r);}await proof('19-320px-mobile');});
 page=desktopPage;
 await test('Fehlerzustand: API offline, klare Meldung und erfolgreicher Wiederholversuch',async()=>{
  expectedBrowserError=true;await desktop.route('**/api/state',r=>r.abort());await page.goto(BASE);await page.getByRole('heading',{name:'Das Garagentor klemmt.',exact:true}).waitFor();await proof('20-offline-recovery');await desktop.unroute('**/api/state');await page.locator('[data-action=reload]').click();await page.getByRole('heading',{name:'Garage',exact:true}).waitFor();expectedBrowserError=false;
 });
 await test('Exploration: Arbeit mit Beleg zu anderem Fahrzeug verschieben',async()=>{
  const backup=(await api('export')).body;try{
   await go('chronik');await page.locator(`[data-action=edit][data-type=entries][data-id="${entry.id}"]`).click();await page.locator('#editor [name=vehicleId]').selectOption(van.id);await save();const s=await snapshot(),moved=s.entries.find(e=>e.id===entry.id),linked=s.documents.filter(d=>d.entryId===entry.id);const broken=linked.filter(d=>d.vehicleId!==moved.vehicleId);const exported=(await api('export')).body,restore=await api('import',{method:'POST',body:exported});
   if(broken.length||restore.status!==200){findings.push({id:'F01',severity:'high',title:'Fahrzeugwechsel einer Arbeit lässt Belege am alten Fahrzeug und erzeugt nicht importierbare Sicherung',affectedDocuments:broken.length,restoreStatus:restore.status,error:restore.body.error,source:'lib/store.mjs: checkReferences/put (entries) und import',proof:'21-entry-move-broken-proof.png'});await go('fahrzeug/'+van.id+'/chronik');await proof('21-entry-move-broken-proof');throw new Error(`${broken.length} inkonsistente Nachweise; eigener Backup-Import liefert ${restore.status}: ${restore.body.error}`);}
  }finally{assert.equal((await api('import',{method:'POST',body:backup})).status,200,'Testdaten nach Exploration wiederherstellen');}
 });
 await test('Browserkonsole und Drittanbieter-Netzwerk',async()=>{assert.deepEqual(browserErrors,[]);assert.deepEqual(externalRequests,[]);});
 const final=(await api('export')).body;await writeFile(resolve(OUT,'before-restart.sha256'),hash(final.vehicles)+'\n'+hash(final.entries)+'\n'+hash(final.documents)+'\n');
 await writeFile(resolve(OUT,'live-results.json'),JSON.stringify({base:BASE,productionUntouched:true,results,findings,browserErrors,externalRequests,counts:{passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length}},null,2));
 console.log('SUMMARY '+JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,findings:findings.map(f=>f.id)}));
}finally{await browser?.close();}
