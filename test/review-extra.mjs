import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base='http://192.168.178.230:4178';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',args:['--no-sandbox']});
const OUT=process.env.WERKHEFT_REVIEW_OUT||'test-results/review';
const results=[],findings=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'de-DE'});page.on('dialog',d=>d.accept());
 await page.goto(base);await page.locator('#main h1').waitFor();const before=await(await fetch(base+'/api/state')).json();const first=before.vehicles.find(v=>!v.archived);
 await page.locator('[data-action=new][data-type=vehicles]').first().tap();
 const values=await page.locator('#entity-form').evaluate(f=>({name:f.elements.name.value,km:f.elements.km.value,owner:f.elements.owner.value}));
 await page.screenshot({path:OUT+'/22-newvehicle-defaults-mobile.png'});
 assert.equal(values.km,'','F03: new vehicle mileage must be blank');assert.equal(values.owner,'1','F03: owner must be independent');
 if(values.name===''&&Number(values.km)===first.km&&first.km>0)findings.push({id:'F03',severity:'medium',title:'Neues Fahrzeug übernimmt ungefragt Kilometerstand und Besitzer-Nummer eines anderen Fahrzeugs',observed:values,fromVehicle:first.name,expected:'Leerer bzw. neutraler Kilometerstand und unabhängige Besitzer-Nummer, sofern nicht explizit dupliziert.',source:'public/forms.js: openEditor gemeinsame Defaults'});
 await page.locator('#editor [name=name]').fill('Review-MobileAnlage');await page.locator('#editor [name=make]').fill('Toyota');await page.locator('#editor [name=model]').fill('Yaris');await page.locator('#editor [name=km]').fill('15000');await page.locator('#editor [name=owner]').fill('1');await page.locator('[data-action=wizard-next]').tap();await page.locator('[data-action=wizard-next]').tap();await page.locator('#save-button').tap();await page.waitForFunction(()=>!document.querySelector('#editor').open);await page.reload();await page.getByRole('link',{name:'Review-MobileAnlage öffnen',exact:true}).waitFor();const after=await(await fetch(base+'/api/state')).json();assert.equal(after.vehicles.find(v=>v.name==='Review-MobileAnlage').km,15000);results.push({name:'Mobil: vollständige Fahrzeuganlage mit bewusst gesetzten eigenen Werten und Reload',status:'passed'});
 const golf=after.vehicles.find(v=>v.name==='Review-Golf');await page.goto(base+'/?extra=clipboard#fahrzeug/'+golf.id+'/schein');await page.getByRole('heading',{name:'Review-Golf',exact:true}).waitFor();
 const secure=await page.evaluate(()=>isSecureContext);assert.equal(secure,false);
 await page.evaluate(()=>{const original=document.execCommand.bind(document);document.execCommand=(command,...args)=>{const result=original(command,...args);window.__copyProbe={command,result};return result;};});
 await page.getByRole('button',{name:'Fahrgestellnummer (VIN) kopieren',exact:true}).tap();await page.locator('#toast').getByText('Kopiert.',{exact:true}).waitFor();const copy=await page.evaluate(()=>window.__copyProbe);assert.equal(copy.command,'copy');assert.equal(copy.result,true);results.push({name:'LAN-HTTP: Kopier-Schaltfläche verwendet erfolgreich den nativen Fallback',status:'passed',limitation:'Nativer Erfolg gemeldet; kein Zugriff auf die OS-Zwischenablage des Nutzergeräts.'});
 await writeFile(OUT+'/extra-results.json',JSON.stringify({results,findings},null,2));console.log(JSON.stringify({passed:results.length,findings:findings.map(x=>x.id)}));
}finally{await browser.close();}
