export const escapeHTML = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 garage:'M3 10 12 3l9 7v11H3V10Zm3 11V11h12v10M6 15h12M6 18h12',
 money:'M3 4h18v16H3zM7 8h3m-3 4h3m-3 4h3m4-8h3m-3 4h3m-3 4h3',
 shelf:'M3 3v18m18-18v18M3 10h18M3 19h18M6 4h4v6H6zm8 10h4v5h-4z',
 game:'M7 7h10l4 12-4 1-3-4h-4l-3 4-4-1L7 7Zm0 4h4m-2-2v4m7-2h.01m2 2h.01',
 board:'M3 4h18v16H3zM7 8h6m-6 4h10m-10 4h7',
 wrench:'m14 5 5-2-1 5-4 2-7 10-3-3 9-9 1-3Zm-9 13h.01',
 plus:'M12 5v14M5 12h14',
 clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
 arrow:'M5 12h14m-5-5 5 5-5 5',
 car:'m3 13 2-6h14l2 6v6h-3v-3H6v3H3v-6Zm0 0h18M7 13h.01m10 0h.01',
 fuel:'M4 21V3h10v18M4 10h10m0 5h3v3a2 2 0 0 0 4 0v-7l-4-5M2 21h14',
 file:'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h8',
 shield:'m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm-4 9 3 3 5-6',
 check:'m5 12 4 4L19 6',
 download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
 edit:'m4 16-1 5 5-1L20 8l-5-5L4 16Zm8-10 5 5',
 trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
 copy:'M9 9h12v12H9zM15 9V3H3v12h6',
 archive:'M3 3h18v5H3zm2 5v13h14V8m-10 4h6',
 close:'m6 6 12 12M6 18 18 6',
 folder:'M3 6h7l2 3h9v12H3V6Z',
 star:'m12 3 3 6 6 1-5 5 1 6-5-3-5 3 1-6-5-5 6-1 3-6Z'
};
export function icon(name,cls='') {return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.wrench}"/></svg>`;}
export function carArt(kind='hatch',large=false) {
 const wagon=kind==='wagon';
 return `<svg class="car-art ${large?'large':''}" viewBox="0 0 540 220" fill="none" aria-hidden="true">
 <defs><linearGradient id="body-${kind}" x1="260" y1="65" x2="260" y2="180" gradientUnits="userSpaceOnUse"><stop stop-color="#3e3e43"/><stop offset="1" stop-color="#202023"/></linearGradient></defs>
 <path d="M18 187H523M44 199h453M81 208h378" stroke="currentColor" opacity=".12"/>
 <path d="M58 161 64 119 99 103l39-52c7-10 18-13 31-14l${wagon?'174 3 59 58':'140 3 78 58'} 69 12c15 3 25 12 27 26l5 27h-38c-2-24-15-39-39-39s-38 15-40 39H170c-1-23-15-39-39-39s-39 17-40 39H60Z" fill="url(#body-${kind})" stroke="#b6b3ad" stroke-width="2"/>
 <path d="m114 98 33-45 58-3 2 48h-93Zm104-48 64 1 43 47H221l-3-48Zm78 3 49 2 40 43h-49l-40-45Z" fill="#121719" stroke="#8b8b87" stroke-width="1.6"/>
 <path d="m213 105 3 55m115-56 8 54M74 114l24-2m282-7 13 6 42 5m-201-4h16m92 0h14" stroke="#b6b3ad" stroke-width="2"/>
 <path d="m63 127 14-2-1 17H60m401-12 10 5 4 10h-13" fill="currentColor" stroke="currentColor"/>
 ${[131,402].map(x=>`<circle cx="${x}" cy="170" r="34" fill="#101013" stroke="#aaa8a1" stroke-width="2"/><circle cx="${x}" cy="170" r="24" fill="#28282c" stroke="#aaa8a1" stroke-width="2"/><circle cx="${x}" cy="170" r="8" stroke="#aaa8a1"/>${Array.from({length:5},(_,i)=>{let a=i*Math.PI*2/5;return `<path d="M${x+Math.cos(a)*11} ${170+Math.sin(a)*11}l${Math.cos(a)*9} ${Math.sin(a)*9}" stroke="#aaa8a1" stroke-width="3"/>`;}).join('')}`).join('')}
 <path d="M174 170h184M76 148h22m340 0h39" stroke="currentColor" stroke-width="2" opacity=".8"/>
 <path d="M40 38h35m-17-17v34M463 41h30m-15-15v30" stroke="currentColor" opacity=".22"/>
 <path d="M40 61v-35h34m422 133v33h-34" stroke="currentColor" opacity=".3"/>
 </svg>`;
}
export function lineChart(points,{unit='',label='Verlauf',color='orange'}={}) {
 if(points.length<2)return '<div class="chart-empty">Für einen Verlauf werden mindestens zwei Messpunkte benötigt.</div>';
 const w=700,h=180,left=48,right=20,top=18,bottom=38;
 let min=Math.min(...points.map(p=>p.value)),max=Math.max(...points.map(p=>p.value));const pad=(max-min)*.2||1;min=Math.max(0,min-pad);max+=pad;
 const coords=points.map((p,i)=>[left+i/(points.length-1)*(w-left-right),h-bottom-(p.value-min)/(max-min)*(h-top-bottom)]);
 const path=coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
 return `<svg class="line-chart ${color}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(label)}"><title>${escapeHTML(label)}</title>${[0,.5,1].map(f=>{const y=top+(h-top-bottom)*f;return `<path d="M${left} ${y}H${w-right}" stroke="#3b3b40" stroke-dasharray="3 5"/><text x="${left-9}" y="${y+4}" text-anchor="end">${(max-(max-min)*f).toLocaleString('de-DE',{maximumFractionDigits:1})}</text>`;}).join('')}<path d="${path} L${w-right} ${h-bottom}H${left}Z" fill="currentColor" opacity=".07"/><path d="${path}" stroke="currentColor" stroke-width="2.5" fill="none"/>${coords.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="3.5" fill="currentColor"><title>${escapeHTML(points[i].label)}: ${points[i].value.toLocaleString('de-DE',{maximumFractionDigits:2})} ${escapeHTML(unit)}</title></circle>`).join('')}<text x="${left}" y="${h-10}">${escapeHTML(points[0].label)}</text><text x="${w-right}" y="${h-10}" text-anchor="end">${escapeHTML(points.at(-1).label)}</text></svg>`;
}
export function barChart(rows) {
 const max=Math.max(1,...rows.map(r=>r.value));
 return `<svg class="bar-chart" viewBox="0 0 700 ${rows.length*42+14}" role="img" aria-label="Ausgaben nach Kategorie">${rows.map((r,i)=>`<text x="0" y="${i*42+22}">${escapeHTML(r.label)}</text><rect x="165" y="${i*42+7}" width="${Math.max(1,r.value/max*390)}" height="22" rx="2" fill="#e96825"/><text x="${174+r.value/max*390}" y="${i*42+23}">${r.value.toLocaleString('de-DE',{style:'currency',currency:'EUR'})}</text>`).join('')}</svg>`;
}
