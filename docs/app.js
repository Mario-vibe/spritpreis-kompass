(async function(){
"use strict";
const MIN=6e4, HOUR=36e5, DAY=864e5, STEP=5, FUT=50;
const FUELNAME={diesel:"Diesel",e10:"Super E10",e5:"Super E5"};
const $=id=>document.getElementById(id);

/* ---------- Formatierung ---------- */
const de=(x,d=1)=>x.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const eur=ct=>de(ct/100,2);
const priceHTML=ct=>{const s=de(ct/100,3);return s.slice(0,-1)+"<sup>"+s.slice(-1)+"</sup>"};
const priceTxt=ct=>de(ct/100,3)+" €";
const hm=t=>new Date(t).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
const wd=t=>new Date(t).toLocaleDateString("de-DE",{weekday:"short"});
const dm=t=>new Date(t).toLocaleDateString("de-DE",{day:"numeric",month:"short"});
const dmy=t=>new Date(t).toLocaleDateString("de-DE",{day:"numeric",month:"long",year:"numeric"});
const sgn=x=>(x>0.05?"+":x<-0.05?"−":"±")+de(Math.abs(x),1)+" ct";
const cls=x=>x>0.05?"up":x<-0.05?"down":"";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function message(html){const m=$("msg");m.innerHTML="<div>"+html+"</div>";m.hidden=false}

/* ---------- Daten laden ---------- */
let S;
try{const r=await fetch("data/site.json?t="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);S=await r.json()}
catch(e){$("v-head").textContent="Keine Daten";message("<b>Die Preisdaten konnten nicht geladen werden.</b> Bitte die Seite später neu laden. ("+esc(e.message)+")");return}
if(S.demo)$("demo-badge").hidden=false;
if(!S.stations.length){$("v-head").textContent="Noch keine Tankstellen eingerichtet";message("In <b>config.json</b> stehen noch keine Tankstellen. Die Anleitung im README erklärt, wie man sie einträgt.");return}

// Genauer Zeitpunkt des letzten Abrufs: nicht abrunden, sonst fällt der zuletzt gemessene Preis heraus
const now=new Date(S.generated*1000);
const ageMin=(Date.now()-S.generated*1000)/MIN;
if(!S.demo&&ageMin>90)message(`<b>Die Daten sind ${ageMin>2880?Math.round(ageMin/1440)+" Tage":Math.round(ageMin/60)+" Stunden"} alt.</b> Der automatische Abruf läuft gerade nicht. Alle Angaben beziehen sich auf den ${dmy(now)}, ${hm(now)} Uhr.`);
const NCYC=S.days||120;
const noon=new Date(now);noon.setHours(12,0,0,0);if(now<noon)noon.setDate(noon.getDate()-1);
const cyc0=noon.getTime();
function cycStart(k){const d=new Date(cyc0);d.setDate(d.getDate()+k);return d.getTime()}
const TAX=S.tax, RS=new Date(TAX.rabatt_start+"T00:00:00").getTime(), RE=new Date(TAX.rabatt_end+"T00:00:00").getTime();
const inRabatt=t=>t>=RS&&t<RE;
const taxAt=(fuel,t)=>(TAX.energy_tax_ct[fuel]||0)-(inRabatt(t)?TAX.cut_ct:0);
const co2=fuel=>TAX.co2_ct[fuel]||0;

/* ---------- Markt (Tageswerte, Lücken mit Vortag gefüllt) ---------- */
const dayKey=t=>{const d=new Date(t);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
// Jede Größe einzeln mit dem letzten bekannten Wert füllen (höchstens 4 Tage), weil EIA und EZB unterschiedliche Feiertage haben
const MK={};
(function(){const F=["brent_usd_bbl","diesel_usd_gal","gasoline_usd_gal","usd_per_eur"];const last={},lastD={};
  const rows=(S.market||[]).slice().sort((a,b)=>a.date<b.date?-1:1);
  rows.forEach(r=>{const t=new Date(r.date+"T12:00:00").getTime();const o={date:r.date};
    F.forEach(f=>{if(r[f]!=null){last[f]=r[f];lastD[f]=t}o[f]=last[f]!=null&&t-lastD[f]<=4*DAY?last[f]:null});
    if(o.usd_per_eur)MK[r.date]=o})})();
const mkDates=Object.keys(MK).sort();
function mkAt(t){const key=dayKey(t);let best=null;for(const d of mkDates){if(d<=key)best=MK[d];else break}return best}
const hasMarket=mkDates.length>20;
const wsKey=fuel=>fuel==="diesel"?"diesel_usd_gal":"gasoline_usd_gal";
function prodCt(fuel,t){const m=mkAt(t);if(!m||m[wsKey(fuel)]==null)return null;return m[wsKey(fuel)]/3.78541/m.usd_per_eur*100}
function brentEur(t){const m=mkAt(t);return m&&m.brent_usd_bbl!=null?m.brent_usd_bbl/m.usd_per_eur:null}
const W=[0.3,0.25,0.2,0.15,0.1];
function lagProd(fuel,t){let s=0;for(let i=0;i<5;i++){const v=prodCt(fuel,Math.min(t,now.getTime())-(2+i)*DAY);if(v==null)return null;s+=W[i]*v}return s}
// erwartete Änderung des Zapfsäulenpreises (ct) zwischen heute und Zyklus k aus Großhandel (Weitergabe 80 %)
function marketShift(fuel,k){if(!hasMarket)return 0;const a=lagProd(fuel,cycStart(0)),b=lagProd(fuel,cycStart(k));return a==null||b==null?0:0.8*1.19*(b-a)}

/* ---------- Preisraster in 5-Minuten-Schritten ---------- */
const KM=S.stations.map(x=>x.km!=null?x.km:1e9);
// Tankstelle kommt für ein Fahrzeug in Frage: nicht unterwegs, Entfernung bekannt, im Umkreis, nicht ausgeschlossen
const vDist=(x,v)=>v.home?(((x.km_by||{})[v.home])??null):x.km;
// "include" legt die Tankstellen eines Fahrzeugs fest; sonst gelten Umkreis (max_km) und Ausschlüsse (exclude)
const eligible=(x,v)=>!x.unterwegs&&vDist(x,v)!=null&&(v.include?v.include.includes(x.id):(!v.max_km||vDist(x,v)<=v.max_km)&&!(v.exclude||[]).includes(x.id));
// Kraftstoff, der nur zu Fahrzeugen mit eigenem Wohnort gehört (Super E10 für Mama): Auswertung nur über deren Tankstellen
function fuelScope(fuel){
  const vf=(S.vehicles||[]).filter(v=>v.fuel===fuel);
  const personal=vf.length>0&&vf.every(v=>v.home);
  const allow=S.stations.map(x=>!personal||vf.some(v=>eligible(x,v)));
  const km=S.stations.map(x=>{const d=personal?vDist(x,vf[0]):x.km;return d!=null?d:1e9});
  return {personal,allow,km,home:personal?vf[0]:null};
}
const STARTS=[];for(let k=-NCYC;k<=FUT+1;k++)STARTS.push(cycStart(k));
function buildFuel(fuel){
  const scope=fuelScope(fuel),ALLOW=scope.allow,KMF=scope.km;
  const ev=S.stations.map(s=>(S.events[s.id]&&S.events[s.id][fuel])||[]);
  const ptr=ev.map(()=>0),cur=ev.map(()=>null);
  const t0=STARTS[0],t1=now.getTime();
  const series=[];let ci=0;
  // 5-Minuten-Raster und zusätzlich genau der Zeitpunkt des letzten Abrufs
  for(let t=t0;t<=t1;t=(t===t1?t1+1:Math.min(t+STEP*MIN,t1))){
    const ts=t/1000;
    const vals=ev.map((e,i)=>{while(ptr[i]<e.length&&e[ptr[i]][0]<=ts){cur[i]=e[ptr[i]][1];ptr[i]++}return cur[i]});
    while(STARTS[ci+1]<=t)ci++;
    // Bei gleichem Preis gewinnt die nähere Tankstelle (ohne Entfernung zählt sie als am weitesten weg)
    let bi=-1;vals.forEach((v,i)=>{if(v==null||!ALLOW[i])return;if(bi<0||v<vals[bi]-0.01||(Math.abs(v-vals[bi])<=0.01&&KMF[i]<KMF[bi]))bi=i});
    if(bi<0)continue;
    series.push({t,k:ci-NCYC,m:Math.round((t-STARTS[ci])/MIN),st:vals,best:vals[bi],bi});
  }
  const byK={};series.forEach(p=>{(byK[p.k]=byK[p.k]||[]).push(p)});
  const daily=[];
  for(let k=-NCYC;k<=0;k++){const a=byK[k];if(!a||!a.length)continue;
    let hi=-1e9,lo=1e9;a.forEach(p=>{hi=Math.max(hi,p.best);lo=Math.min(lo,p.best)});
    daily.push({k,t:cycStart(k),hi,lo:k===0?null:lo,full:a.length>=250});
  }
  return {fuel,series,byK,daily,scope};
}
const fuels=S.fuels.filter(f=>FUELNAME[f]);
const DATA={},FC={};
fuels.forEach(f=>{DATA[f]=buildFuel(f)});
if(!fuels.some(f=>DATA[f].series.length)){$("v-head").textContent="Noch keine Preise gesammelt";message("Der erste Abruf steht noch aus. Nach dem ersten Lauf des automatischen Abrufs erscheinen hier die Preise.");return}

/* ---------- Prognose ---------- */
const q=(arr,p)=>{const a=[...arr].sort((x,y)=>x-y);const i=(a.length-1)*p;const lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo)};
function profiles(F){
  const ks=Object.keys(F.byK).map(Number).filter(k=>k<0&&F.byK[k].length>=250).sort((a,b)=>a-b).slice(-14);
  // Bezugspunkt ist die Tagesspitze, weil manche Tankstellen erst ein paar Minuten nach 12 Uhr erhöhen
  return ks.map(k=>{const arr=[];const a=F.byK[k];const top=Math.max(...a.map(p=>p.best));a.forEach(p=>{arr[Math.round(p.m/STEP)]=p.best-top});
    for(let i=1;i<arr.length;i++)if(arr[i]==null)arr[i]=arr[i-1];return arr});
}
function forecast(F){
  const P=profiles(F);if(!F.series.length)return null;
  const last=F.series[F.series.length-1];const at=(p,i)=>p[Math.min(i,p.length-1)];
  const dToday=F.daily[F.daily.length-1];
  const peak1=(dToday?dToday.hi:last.best)+marketShift(F.fuel,1)+1.19*(taxAt(F.fuel,cycStart(1))-taxAt(F.fuel,cycStart(0)));
  const pts=[];
  if(P.length>=3){
    const sNow=Math.round(last.m/STEP);
    for(let i=sNow+1;i<288;i++){const d=P.map(p=>at(p,i)-at(p,sNow));
      // Preise dürfen außer um 12 Uhr nicht steigen, Prognose daher nie über dem aktuellen Preis
      pts.push({t:STARTS[NCYC]+i*STEP*MIN,y:Math.min(last.best,last.best+q(d,.5)),lo:last.best+q(d,.1),hi:Math.min(last.best,last.best+q(d,.9))})}
    // Um 12:00:00 haben meist noch nicht alle Tankstellen erhöht: bis zur üblichen Erhöhung gilt der bisherige Preis weiter
    const lastFc=pts.length?pts[pts.length-1]:{y:last.best,lo:last.best,hi:last.best};
    let rise=0;while(rise<24&&q(P.map(p=>at(p,rise)),.5)<-2)rise++;
    for(let i=0;i<=sNow+12&&i<288;i++){const d=P.map(p=>at(p,i));
      pts.push(i<rise?{t:cycStart(1)+i*STEP*MIN,y:lastFc.y,lo:lastFc.lo,hi:lastFc.hi}:{t:cycStart(1)+i*STEP*MIN,y:peak1+q(d,.5),lo:peak1+q(d,.1)-1.5,hi:peak1+q(d,.9)+1.5})}
  }
  const full=F.daily.filter(d=>d.lo!=null);
  const lowNow=full.length?full[full.length-1].lo:last.best;
  const days=[];
  for(let k=1;k<=FUT;k++){const t=cycStart(k);
    const base=lowNow+marketShift(F.fuel,k)+1.19*(taxAt(F.fuel,t)-taxAt(F.fuel,cycStart(0)));
    const sd=Math.min(1.3*Math.sqrt(Math.max(0,k-3))+0.8,9);
    days.push({k,t,y:base,lo:base-sd*1.28,hi:base+sd*1.28})}
  return {pts,days,P,peak1};
}
fuels.forEach(f=>{FC[f]=forecast(DATA[f])});

/* ---------- Diagramm-Baukasten (SVG, eine y-Achse) ---------- */
function niceStep(range,target){const raw=range/target;const pow=Math.pow(10,Math.floor(Math.log10(raw)));for(const m of[1,2,2.5,5,10])if(m*pow>=raw)return m*pow;return 10*pow}
function lineChart(el,cfg){
  const Wd=Math.max(300,el.clientWidth),H=cfg.height||(Wd<520?230:280),pad={l:44,r:14,t:14,b:28};
  let ys=[];cfg.series.forEach(s=>s.pts.forEach(p=>ys.push(p[1])));(cfg.bands||[]).forEach(b=>b.pts.forEach(p=>ys.push(p[1],p[2])));
  ys=ys.filter(v=>v!=null&&isFinite(v));if(!ys.length){el.innerHTML='<p class="small muted">Noch zu wenig Daten für dieses Diagramm.</p>';return}
  let y0=Math.min(...ys),y1=Math.max(...ys);const yp=(y1-y0)*.08||1;y0-=yp;y1+=yp;
  const st=Math.max(niceStep(y1-y0,Wd<520?4:5),cfg.minStep||0);y0=Math.floor(y0/st)*st;y1=Math.ceil(y1/st)*st;
  const[x0,x1]=cfg.x;
  const X=v=>pad.l+(v-x0)/(x1-x0)*(Wd-pad.l-pad.r),Y=v=>pad.t+(y1-v)/(y1-y0)*(H-pad.t-pad.b);
  let g="";
  (cfg.ranges||[]).forEach(r=>{const a=X(Math.max(r.x0,x0)),b=X(Math.min(r.x1,x1));if(b>a)g+=`<rect x="${a}" y="${pad.t}" width="${b-a}" height="${H-pad.t-pad.b}" fill="var(--range)"/>`+(r.label?`<text x="${a+6}" y="${pad.t+12}" class="lab">${r.label}</text>`:"")});
  for(let v=y0;v<=y1+1e-9;v+=st)g+=`<line x1="${pad.l}" x2="${Wd-pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${pad.l-6}" y="${Y(v)+4}" text-anchor="end">${cfg.yFmt?cfg.yFmt(v):de(v,0)}</text>`;
  (cfg.xTicks||[]).forEach(tk=>{const x=X(tk.v);if(x<pad.l-1||x>Wd-pad.r+1)return;g+=`<text x="${x}" y="${H-8}" text-anchor="middle">${tk.label}</text>`});
  (cfg.vlines||[]).forEach(v=>{const x=X(v.x);if(x<pad.l||x>Wd-pad.r)return;g+=`<line x1="${x}" x2="${x}" y1="${pad.t}" y2="${H-pad.b}" stroke="${v.strong?"var(--ink-2)":"var(--line)"}" stroke-dasharray="${v.strong?"":"3 3"}"/>`+(v.label?`<text x="${x+4}" y="${pad.t+10}" class="lab">${v.label}</text>`:"")});
  (cfg.bands||[]).forEach(b=>{if(!b.pts.length)return;const d="M"+b.pts.map(p=>X(p[0])+","+Y(p[2])).join("L")+"L"+b.pts.slice().reverse().map(p=>X(p[0])+","+Y(p[1])).join("L")+"Z";g+=`<path d="${d}" fill="${b.color||"var(--band)"}"/>`});
  cfg.series.forEach(s=>{const pts=s.pts.filter(p=>p[1]!=null);if(!pts.length||s.hidden)return;let d="";pts.forEach((p,i)=>{const x=X(p[0]),y=Y(p[1]);if(i===0)d+=`M${x},${y}`;else if(s.step)d+=`H${x}V${y}`;else d+=`L${x},${y}`});
    g+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width||2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash?'stroke-dasharray="5 4"':""}/>`;
    if(s.end){const p=pts[pts.length-1];g+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`}});
  g+=`<line class="xh" x1="0" x2="0" y1="${pad.t}" y2="${H-pad.b}" stroke="var(--ink-3)" visibility="hidden"/><g class="dots"></g>`;
  el.innerHTML=`<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${cfg.aria||""}">${g}<rect x="${pad.l}" y="${pad.t}" width="${Wd-pad.l-pad.r}" height="${H-pad.t-pad.b}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  const svg=el.querySelector("svg"),tip=el.querySelector(".tip"),xh=svg.querySelector(".xh"),dots=svg.querySelector(".dots");
  const all=cfg.series.filter(s=>s.pts.length);
  function nearest(pts,xv){if(!pts.length)return null;let lo=0,hi=pts.length-1;if(xv<pts[0][0]-cfg.tol||xv>pts[hi][0]+cfg.tol)return null;while(hi-lo>1){const m=(lo+hi)>>1;if(pts[m][0]<=xv)lo=m;else hi=m}
    if(cfg.stepTip)return pts[lo][0]<=xv?pts[lo]:pts[hi];return Math.abs(pts[lo][0]-xv)<=Math.abs(pts[hi][0]-xv)?pts[lo]:pts[hi]}
  const hide=()=>{tip.hidden=true;xh.setAttribute("visibility","hidden");dots.innerHTML=""};
  const show=e=>{
    const r=svg.getBoundingClientRect();const sx=(e.clientX-r.left)*Wd/r.width;const xv=x0+(sx-pad.l)/(Wd-pad.l-pad.r)*(x1-x0);
    if(sx<pad.l||sx>Wd-pad.r){hide();return}
    let rows="",dd="";
    all.forEach(s=>{const p=nearest(s.pts,xv);if(!p||p[1]==null)return;
      rows+=`<div class="r"><i class="sw" style="background:${s.color==="transparent"?"var(--band)":s.color}"></i>${s.name}: <b class="num">${cfg.tipFmt?cfg.tipFmt(p[1]):de(p[1],1)}</b></div>`;
      if(!s.hidden)dd+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`});
    if(!rows){hide();return}
    xh.setAttribute("x1",sx);xh.setAttribute("x2",sx);xh.setAttribute("visibility","visible");dots.innerHTML=dd;
    tip.innerHTML=`<div class="t">${cfg.xFmt(xv)}</div>${rows}`;tip.hidden=false;
    const px=(sx/Wd)*r.width,w=tip.offsetWidth;tip.style.top="4px";
    tip.style.left=(px+12+w>r.width?Math.max(0,px-w-12):px+12)+"px";
  };
  svg.addEventListener("pointermove",show);
  svg.addEventListener("pointerdown",show);
  // Mit der Maus verschwindet die Linie beim Verlassen; auf dem Handy bleibt die zuletzt berührte Stelle stehen.
  svg.addEventListener("pointerleave",e=>{if(e.pointerType==="mouse")hide()});
}
// Tippen außerhalb eines Diagramms blendet dort stehengebliebene Linien und Infokästen aus.
document.addEventListener("pointerdown",e=>{
  document.querySelectorAll("svg .xh").forEach(xh=>{const svg=xh.ownerSVGElement;if(svg.contains(e.target))return;
    xh.setAttribute("visibility","hidden");svg.querySelector(".dots").innerHTML="";const tip=svg.parentNode.querySelector(".tip");if(tip)tip.hidden=true})});
function barChart(el,vals,best){
  const Wd=Math.max(280,el.clientWidth),H=190,pad={l:36,r:8,t:16,b:26};
  const n=vals.length,bw=(Wd-pad.l-pad.r)/n;const y0=Math.min(0,...vals.map(v=>v.r)),y1=1;
  const Y=v=>pad.t+(y1-v)/(y1-y0)*(H-pad.t-pad.b);
  let g="";[0,.5,1].forEach(v=>{g+=`<line x1="${pad.l}" x2="${Wd-pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${pad.l-6}" y="${Y(v)+4}" text-anchor="end">${de(v,1)}</text>`});
  vals.forEach((v,i)=>{const x=pad.l+i*bw+2,w=bw-4,top=Y(Math.max(v.r,0)),bot=Y(Math.min(v.r,0));
    g+=`<rect x="${x}" y="${top}" width="${w}" height="${Math.max(1,bot-top)}" rx="3" fill="${i===best?"var(--s1)":"var(--line)"}"><title>${v.lag} Tage: r = ${de(v.r,2)}</title></rect><text x="${x+w/2}" y="${H-8}" text-anchor="middle">${v.lag}</text>`;
    if(i===best)g+=`<text x="${x+w/2}" y="${top-5}" text-anchor="middle" class="lab">${de(v.r,2)}</text>`});
  el.innerHTML=`<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Korrelation nach Verzögerung in Tagen">${g}</svg><div class="small muted" style="text-align:center">Verzögerung in Tagen</div>`;
}
/* ---------- Rechenhilfen "lohnt die Fahrt?" ---------- */
const MIN_GAIN=0.5; // ab diesem Gewinn je Tankfüllung (€) gilt ein Umweg als lohnend, überall gleich
// rows: [{x: Tankstelle, i: Index, p: Preis}]. Fahrzeuge mit "home" rechnen mit eigenen Entfernungen (km_by).
function makeCalc(rows,VEH){
  const RF=S.road_factor||1.3;
  const dist=(o,v)=>vDist(o.x,v);
  // in Frage kommen: nicht unterwegs, Entfernung bekannt, im Umkreis und nicht ausdrücklich ausgeschlossen
  const inRange=(o,v)=>eligible(o.x,v);
  const REF=new Map(VEH.map(v=>{const n=rows.filter(o=>o.p!=null&&inRange(o,v));
    return [v,n.length?n.reduce((a,o)=>(dist(o,v)<dist(a,v)||(dist(o,v)===dist(a,v)&&KM[o.i]<KM[a.i]))?o:a):null]}));
  // Kosten einer Tankfüllung samt Hin- und Rückfahrt ab Wohnort (Luftlinie × Straßenfaktor), in €
  const total=(o,v)=>{const km=2*dist(o,v)*RF,l=km*v.l_per_100km/100;
    return {km,l,fuel:v.fill_l*o.p/100,drive:l*o.p/100,sum:(v.fill_l+l)*o.p/100}};
  // Vorteil gegenüber der nächstgelegenen Tankstelle (positiv = günstiger als die nächstgelegene)
  const trip=(o,v)=>{const r=REF.get(v);if(!r||o.p==null||!inRange(o,v))return null;
    return {net:total(r,v).sum-total(o,v).sum}};
  // Sinnvollste Tankstelle = geringste Gesamtkosten; ein Vorteil unter MIN_GAIN gegenüber der
  // nächstgelegenen zählt nicht, dann bleibt es bei der nächstgelegenen
  const pick=v=>{const r=REF.get(v);if(!r)return null;
    const b=rows.filter(o=>o.p!=null&&inRange(o,v)).map(o=>({o,t:o.i===r.i?{net:0}:trip(o,v)})).filter(z=>z.t)
      .sort((a,b)=>(b.t.net-a.t.net)||(dist(a.o,v)-dist(b.o,v)))[0];
    return b.o.i!==r.i&&b.t.net<MIN_GAIN?{v,o:r,net:0,ref:r}:{v,o:b.o,net:b.t.net,ref:r}};
  return {RF,dist,inRange,REF,total,trip,pick};
}
/* ---------- Kästchen je Tankstelle: Kürzel in Markenfarbe, bei Bedarf mit Zusatzsymbol ---------- */
const TYPE_ICON={
  supermarkt:{t:"Supermarkt-Tankstelle",svg:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 11.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6"/>'},
  automat:{t:"Tankautomat",svg:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'},
  autobahn:{t:"Autobahn / unterwegs",svg:'<path d="M5 21 9 3"/><path d="M19 21 15 3"/><path d="M12 5v3"/><path d="M12 12v3"/><path d="M12 18v2"/>'}
};
const typeIcon=t=>TYPE_ICON[t]?`<span class="sb-k" title="${TYPE_ICON[t].t}"><svg viewBox="0 0 24 24" aria-hidden="true">${TYPE_ICON[t].svg}</svg></span>`:"";
function badge(x){
  const b=(S.brands||{})[String(x.name||"").toLowerCase()]||{k:String(x.name||"?").replace(/[^A-Za-zÄÖÜäöü]/g,"").slice(0,2).toUpperCase(),bg:"#8a979a",fg:"#ffffff"};
  return `<span class="sb" style="background:${esc(b.bg)};color:${esc(b.fg)}" aria-hidden="true">${esc(b.k)}${typeIcon(x.type)}</span>`;
}
function corr(a,b){const n=a.length;if(n<5)return NaN;const ma=a.reduce((x,y)=>x+y)/n,mb=b.reduce((x,y)=>x+y)/n;let s=0,sa=0,sb=0;for(let i=0;i<n;i++){s+=(a[i]-ma)*(b[i]-mb);sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2}return s/Math.sqrt(sa*sb)}

/* ---------- Auswertung ---------- */
function sameTimeAgo(F,days){const t=now.getTime()-days*DAY;let best=null;for(const p of F.series){if(p.t<=t)best=p;else break}return best&&t-best.t<=30*MIN?best:null}
function stats(F){
  const last=F.series[F.series.length-1];
  const y=sameTimeAgo(F,1);const wk=[1,2,3,4,5,6,7].map(d=>sameTimeAgo(F,d)).filter(Boolean);
  const wAvg=wk.length?wk.reduce((a,p)=>a+p.best,0)/wk.length:null;
  const lows=F.daily.filter(d=>d.lo!=null).slice(-30).map(d=>d.lo);
  const rank=lows.filter(v=>v<last.best).length+1;
  return {last,dY:y?last.best-y.best:null,dW:wAvg!=null?last.best-wAvg:null,rank,nLows:lows.length,yRow:y};
}
function verdict(F,fc){
  const s=stats(F),cur=s.last.best;
  const nextNoon=cycStart(1);const before=fc?fc.pts.filter(p=>p.t<nextNoon):[];
  const minP=before.length?before.reduce((a,p)=>p.y<a.y?p:a):null;
  const minsToNoon=(nextNoon-now.getTime())/MIN;const save=minP?cur-minP.y:0;
  let c,state,head,sub;
  if(minsToNoon<=90){c="good";state="Jetzt tanken";head="Jetzt ist der günstigste Zeitpunkt des Tages";
    sub="Um 12 Uhr dürfen die Tankstellen wieder erhöhen."+(fc&&fc.P.length>=3?` Erwartet wird danach ein Preis um ${eur(fc.peak1)} €.`:"")}
  else if(!minP){c="warn";state="Noch zu wenig Verlauf";head="Für eine Prognose fehlen noch einige Tage Daten";
    sub="Faustregel bis dahin: kurz vor 12 Uhr ist es meist am günstigsten, kurz nach 12 Uhr am teuersten."}
  else if(save>=3){c="warn";state="Besser warten";head=`Bis ${hm(minP.t)} Uhr voraussichtlich ${de(save,0)} Cent günstiger`;
    sub="Nach der 12-Uhr-Erhöhung fallen die Preise über den Nachmittag und Abend. Der übliche Tiefpunkt liegt kurz vor 12 Uhr."}
  else{c="good";state="Jetzt tanken ist in Ordnung";head="Bis morgen Mittag ist kaum noch Ersparnis zu erwarten";
    sub=`Erwartete Ersparnis bis vor 12 Uhr: unter ${de(Math.max(save,0)+0.5,0)} Cent je Liter.`}
  if(s.nLows>=20&&s.rank<=6)sub+=" Der Preis gehört zu den günstigsten der letzten 30 Tage.";
  return {c,state,head,sub,s};
}

/* ---------- Seite füllen ---------- */
let fuel=fuels[0];
let curScope=null; // Entfernungsbasis des gewählten Kraftstoffs (für das Tankstellen-Fenster)
// Tankmenge je Fahrzeug: Anteil der Tankgröße, wie viel getankt wird (nicht: wie viel noch drin ist).
// "voll" = 90 % des Tanks, weil selten ganz leer getankt wird. Gemerkt pro Gerät.
const FRACS=[["¼",0.25,"ein Viertel"],["½",0.5,"einen halben"],["¾",0.75,"drei Viertel"],["voll",0.9,"einen vollen"]];
let fillFrac={};try{fillFrac=JSON.parse(localStorage.getItem("spk-fill")||"{}")||{}}catch(e){}
function applyFill(){(S.vehicles||[]).forEach(v=>{if(!v.tank_l){v.fill_l=v.fill_l||30;return}
  const f=FRACS.some(a=>a[1]===fillFrac[v.name])?fillFrac[v.name]:0.5;v.frac=f;v.fill_l=Math.round(v.tank_l*f*10)/10})}
const litTxt=l=>de(l,l%1?1:0)+" l";
function fillRow(v){
  if(!v.tank_l)return `<b>${esc(v.name)}:</b> `;
  return `<div class="fill-row"><b>${esc(v.name)}</b><span class="verb">tankt</span><span class="seg seg-s" role="group" aria-label="Tankmenge ${esc(v.name)}">`+
    FRACS.map(([t,f,lang])=>`<button type="button" data-v="${esc(v.name)}" data-f="${f}" aria-pressed="${v.frac===f}" aria-label="${esc(v.name)} tankt ${lang} Tank">${t}</button>`).join("")+
    `</span><span class="lit">= ${litTxt(v.fill_l)}</span></div>`}
let tblAll=false; // Tabelle: bei Mamas Kraftstoff alle Tankstellen zeigen statt nur ihre
let mkHidden={ws:false,brent:false};
try{const h=JSON.parse(localStorage.getItem("spk-mk-hidden")||"{}");mkHidden={ws:!!h.ws,brent:!!h.brent}}catch(e){}
try{const f=localStorage.getItem("spk-fuel");if(fuels.includes(f))fuel=f}catch(e){}
$("seg").innerHTML=fuels.map(f=>`<button id="fuel-${f}" type="button" data-fuel="${f}" aria-pressed="false">${FUELNAME[f]}</button>`).join("");
const places=[...new Set(S.stations.map(s=>s.place).filter(Boolean))];
if(places.length)$("eyebrow").textContent="Tankstellen in "+places.slice(0,3).join(", ");

function render(){
  applyFill();
  const F=DATA[fuel],fc=FC[fuel],name=FUELNAME[fuel];
  document.querySelectorAll("#seg button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.fuel===fuel));
  if(!F.series.length){$("v-head").textContent=`Noch keine Preise für ${name}`;return}
  const v=verdict(F,fc),s=v.s,last=s.last,stn=S.stations;
  const st=$("v-state");st.className="state "+v.c;st.textContent="● "+v.state;
  $("v-head").textContent=v.head;$("v-sub").textContent=v.sub;
  $("c-yday").textContent=s.dY==null?"–":sgn(s.dY);$("c-yday").className="v num "+(s.dY==null?"":cls(s.dY));
  $("c-week").textContent=s.dW==null?"–":sgn(s.dW);$("c-week").className="v num "+(s.dW==null?"":cls(s.dW));
  $("c-rank").textContent=s.nLows>=7?`${s.rank}. von ${s.nLows+1}`:"–";
  $("p-fuel").textContent=`${name} · günstigster Preis`;
  $("p-price").innerHTML=priceHTML(last.best)+'<span style="font-size:.4em"> €</span>';
  // km im Preisfeld: bei Mamas Kraftstoff ab ihrem Wohnort, sonst ab deinem
  const pkm=(x,sc)=>{if(sc.personal){const d=vDist(x,sc.home);return d!=null?de(d,1)+" km ab "+sc.home.name:""}return x.km!=null?de(x.km,1)+" km":""};
  $("p-where").innerHTML=badge(stn[last.bi])+"<span>"+esc([stn[last.bi].name,[stn[last.bi].street,stn[last.bi].place].filter(Boolean).join(", "),pkm(stn[last.bi],F.scope)].filter(Boolean).join(" · "))+"</span>";
  const mtn=Math.max(0,Math.round((cycStart(1)-now.getTime())/MIN));
  $("p-clock").textContent=`Stand ${hm(now)} Uhr · nächste Erhöhung in ${Math.floor(mtn/60)} h ${mtn%60} min`;

  const dLeft=Math.ceil((RE-now.getTime())/DAY);const cutGross=TAX.cut_ct*1.19;
  const rb=$("rabatt");
  if(inRabatt(now.getTime())){rb.hidden=false;rb.innerHTML=`<div><b>Tankrabatt endet in ${dLeft} Tagen.</b> Ab ${dm(RE)} steigt ${name} voraussichtlich um rund ${de(cutGross,0)} Cent je Liter, weil die Energiesteuer wieder um ${de(TAX.cut_ct,2)} Cent höher ist. Am letzten Tag vor 12 Uhr volltanken lohnt sich daher fast sicher. Steht eine Verlängerung fest, wird das Datum in config.json angepasst.</div>`}
  else rb.hidden=true;

  // Tabelle
  $("tbl-time").textContent=`Stand ${hm(now)} Uhr`;
  const today=F.byK[0]||[];
  const rows=stn.map((x,i)=>({x,i,p:last.st[i]}));
  // Lohnt die Fahrt? Je Fahrzeug: Bezug ist die nächstgelegene geöffnete Tankstelle ab dessen Wohnort.
  const VEH=(S.vehicles||[]).filter(v=>v.fuel===fuel);
  const C=makeCalc(rows,VEH),RF=C.RF;
  const eur2=x=>(x>=0?"+":"−")+de(Math.abs(x),2)+" €";
  const kmTxt=(o,v)=>de(C.dist(o,v),1)+" km";
  // Spalten je Fahrzeug: Gesamtkosten im Vergleich zur sinnvollsten Tankstelle (negativ = teurer)
  const PICK=new Map(VEH.map(v=>[v,C.pick(v)]));
  const parts=(o,v)=>{const t=C.total(o,v);return {name:o.x.name+" "+(o.x.place||""),p:o.p,km:C.dist(o,v),kmRound:t.km,l:t.l,fuel:t.fuel,drive:t.drive,sum:t.sum}};
  const gainCell=(o,v)=>{const pk=PICK.get(v);
    if(!pk||!C.inRange(o,v))return `<td class="gain flat">–</td>`; // unterwegs, nicht in der Auswahl oder ohne Entfernung
    const me=parts(o,v),best=parts(pk.o,v),d=best.sum-me.sum;
    const c={v:v.name,fill:v.fill_l,l100:v.l_per_100km,rf:RF,me,best,isBest:o.i===pk.o.i,d};
    const txt=o.i===pk.o.i?"beste Wahl":Math.abs(d)<MIN_GAIN?"fast gleich":eur2(d);
    return `<td class="gain calc ${o.i===pk.o.i?"pos":d<=-MIN_GAIN?"neg":"flat"}" tabindex="0" data-calc="${esc(JSON.stringify(c))}">${txt}</td>`};
  $("tbl-head").innerHTML="<th>Tankstelle</th><th>"+(F.scope.personal?"km ab "+esc(F.scope.home.name):"km")+"</th><th>jetzt</th><th>ggü. gestern</th><th>seit 12 Uhr</th>"+VEH.map(v=>`<th title="Kosten je Tankfüllung (${litTxt(v.fill_l)}) samt Hin- und Rückfahrt, verglichen mit der sinnvollsten Tankstelle">${esc(v.name)}</th>`).join("");
  const nCols=5+VEH.length;
  // Gehört der Kraftstoff nur zu Fahrzeugen mit eigenem Wohnort (Mama), zeigt die Tabelle nur deren Tankstellen
  const personal=VEH.length>0&&VEH.every(v=>v.home);
  const shown=personal&&!tblAll?rows.filter(o=>VEH.some(v=>C.inRange(o,v))):rows;
  // Sortierung: Preis aufsteigend, bei gleichem Preis die nähere zuerst; Tankstellen ohne Preis ans Ende, ebenfalls nach Entfernung
  curScope=F.scope;
  const SC=F.scope,kmCell=o=>{const d=SC.km[o.i];return d>=1e9?"":de(d,1)};
  $("tbl").innerHTML=shown.slice().sort((a,b)=>((a.p??1e9)-(b.p??1e9))||(SC.km[a.i]-SC.km[b.i])).map(o=>{
    const addr=`<div class="small muted">${esc([o.x.street,o.x.place].filter(Boolean).join(", "))}${o.x.unterwegs?" · unterwegs":""}</div>`;
    if(o.p==null)return `<tr><td><div class="st calc st-info" tabindex="0" data-st="${o.i}">${badge(o.x)}<div>${esc(o.x.name)}${addr}</div></div></td><td class="num">${kmCell(o)}</td><td class="muted" colspan="${nCols-2}">geschlossen oder kein Preis</td></tr>`;
    const yp=s.yRow?s.yRow.st[o.i]:null;const d=yp!=null?o.p-yp:null;
    const peak=Math.max(...today.map(p=>p.st[o.i]).filter(v=>v!=null),o.p);const fell=peak-o.p;
    return `<tr class="${o.i===last.bi?"best":""}"><td><div class="st calc st-info" tabindex="0" data-st="${o.i}">${badge(o.x)}<div>${esc(o.x.name)}${o.i===last.bi?'<span class="tag">günstigste</span>':""}${addr}</div></div></td><td class="num">${kmCell(o)}</td><td class="p">${priceHTML(o.p)}</td><td class="num ${d==null?"":cls(d)}">${d==null?"–":sgn(d)}</td><td class="num muted">${fell>0.05?"−"+de(fell,0)+" ct":"noch keine Senkung"}</td>${VEH.map(v=>gainCell(o,v)).join("")}</tr>`}).join("");
  const shownTypes=[...new Set(shown.map(o=>o.x.type).filter(t=>TYPE_ICON[t]))];
  $("tbl-legend").innerHTML=shownTypes.map(t=>`<span>${typeIcon(t)}${TYPE_ICON[t].t}</span>`).join("");$("tbl-legend").hidden=!shownTypes.length;
  const allBtn=$("tbl-all");
  if(personal){allBtn.hidden=false;allBtn.textContent=tblAll?`Nur ${VEH.map(v=>v.name).join(" und ")}s Tankstellen zeigen`:`Alle ${rows.length} Tankstellen zeigen`;allBtn.setAttribute("aria-pressed",tblAll)}
  else allBtn.hidden=true;
  // Empfehlung über der Tabelle
  const hint=$("tbl-hint"),note=$("tbl-note");
  if(VEH.length){
    // Gleiche Einschätzung wie im Feld rechts oben: sinnvollste Tankstelle (mit Fahrtkosten),
    // verglichen mit der Fahrt zur günstigsten Tankstelle
    const cheapRow=rows.find(o=>o.i===last.bi);
    const lines=VEH.map(v=>{const r=C.REF.get(v);
      if(!r)return `<div>${fillRow(v)}${v.home&&!rows.some(o=>C.dist(o,v)!=null)?"Entfernungen noch nicht berechnet.":"Keine geöffnete Tankstelle im Umkreis."}</div>`;
      const pk=C.pick(v),x=pk.o.x;
      const best=`<b>${esc(x.name)} ${esc(x.place||"")}</b> (${kmTxt(pk.o,v)}, ${priceTxt(pk.o.p)})`;
      if(pk.o.i===last.bi)return `<div>${fillRow(v)}Am sinnvollsten ist ${best}, zugleich die günstigste.</div>`;
      const cheapTxt=`${esc(cheapRow.x.name)} ${esc(cheapRow.x.place||"")}`;
      const tc=C.trip(cheapRow,v);
      if(!tc)return `<div>${fillRow(v)}Am sinnvollsten ist ${best}. Die günstigste (${cheapTxt}) liegt ${cheapRow.x.unterwegs?"nur unterwegs":"außerhalb der Auswahl"}.</div>`;
      const d=pk.net-tc.net;
      return `<div>${fillRow(v)}Am sinnvollsten ist ${best}. `+(d>=0
        ?`Gegenüber der Fahrt zur günstigsten (${cheapTxt}) <b>${eur2(d)}</b> je Tankfüllung.</div>`
        :`Die Fahrt zur günstigsten (${cheapTxt}) brächte nur ${eur2(-d)} je Tankfüllung, das lohnt kaum.</div>`)});
    hint.innerHTML=lines.join("");hint.hidden=false;
    const homeV=VEH.filter(v=>v.home);
    note.textContent=`Spalte${VEH.length>1?"n":""} ${VEH.map(v=>v.name).join(" und ")}: Kosten je Tankfüllung (${VEH.map(v=>v.name+" "+litTxt(v.fill_l)).join(", ")}) samt Hin- und Rückfahrt ab Wohnort (Luftlinie × ${de(RF,1)}), verglichen mit der sinnvollsten Tankstelle. Ein Vorteil unter ${de(MIN_GAIN,2)} € gegenüber der nächstgelegenen zählt nicht. Zeit und Verschleiß sind nicht eingerechnet. Für Tankstellen „unterwegs“ entfällt die Rechnung.`
      +homeV.map(v=>` ${v.name}: Entfernungen ab ihrem Wohnort${v.include?`, nur ihre ${v.include.length} Tankstellen`:v.max_km?`, nur Tankstellen bis ${v.max_km} km`:""}${(v.exclude||[]).length?`, ohne ${(v.exclude||[]).map(id=>{const x=S.stations.find(t=>t.id===id);return x?x.name+" "+(x.place||""):""}).filter(Boolean).join(", ")}`:""}.`).join("");
    note.hidden=false;
  }else{hint.hidden=true;note.hidden=true}
  // Feld rechts oben: sinnvollste Tankstelle je Fahrzeug, also das beste Ergebnis nach Fahrtkosten.
  const smart=$("p-smart");
  const picks=VEH.map(v=>C.pick(v)).filter(Boolean);
  if(picks.length){
    const groups=[];picks.forEach(p=>{const g=groups.find(g=>g.o.i===p.o.i);if(g)g.ps.push(p);else groups.push({o:p.o,ps:[p]})});
    const names=a=>a.map(p=>esc(p.v.name)).join(" und ");
    const cheap=rows.find(o=>o.i===last.bi);
    if(groups.length===1&&groups[0].o.i===last.bi){
      smart.innerHTML=`<div class="p-same"><span>Auch mit Fahrtkosten die <b>sinnvollste Wahl</b> für ${names(groups[0].ps)}.</span></div>`;
    }else{
      smart.innerHTML=`<hr class="p-sep"><span class="lbl">Sinnvollste Tankstelle mit Fahrtkosten</span>`+groups.map(g=>{
        const x=g.o.x;
        const same=g.o.i===last.bi;
        const pre=p=>g.ps.length>1?esc(p.v.name)+": ":"";
        const vs=same?"":g.ps.map(p=>{const tc=C.trip(cheap,p.v);if(!tc)return "";const d=p.net-tc.net;
          return d>=0?`${pre(p)}<b>${eur2(d)}</b> je Tankfüllung gegenüber der Fahrt zur günstigsten`:`${pre(p)}Die Fahrt zur günstigsten brächte nur ${eur2(-d)} je Tankfüllung, das lohnt kaum`}).filter(Boolean).join(". ");
        const kmLabel=g.ps.every(p=>p.v.home)?(d=>d!=null?de(d,1)+" km ab "+g.ps[0].v.name:"")(vDist(x,g.ps[0].v)):g.ps.every(p=>!p.v.home)&&x.km!=null?de(x.km,1)+" km":"";
        return `<div class="price second">${priceHTML(g.o.p)}<span style="font-size:.4em"> €</span></div>
          <div class="where">${badge(x)}<span>${esc([x.name,[x.street,x.place].filter(Boolean).join(", "),kmLabel].filter(Boolean).join(" · "))}</span></div>
          <div class="p-note">für ${names(g.ps)}${same?", zugleich die günstigste":vs?`. ${vs}.`:""}</div>`}).join(`<hr class="p-sep">`);
    }
    smart.hidden=false;
  }else smart.hidden=true;

  // 48 Stunden
  const from=now.getTime()-48*HOUR,to=cycStart(1)+(now.getTime()-cyc0)+60*MIN;
  const meas=F.series.filter(p=>p.t>=from).map(p=>[p.t,p.best]);
  const fpts=fc?fc.pts.filter(p=>p.t<=to):[];
  const ticks=[];for(let t=cycStart(-3);t<=to;t+=12*HOUR){const d=new Date(t);ticks.push({v:t,label:d.getHours()===12?"12 Uhr":wd(t)+" 0 Uhr"})}
  const vl=[-2,-1,0,1].map(k=>({x:cycStart(k)}));vl.push({x:now.getTime(),label:"Stand "+hm(now),strong:true});
  lineChart($("ch-48"),{x:[from,to],aria:"Preisverlauf 48 Stunden und Prognose",stepTip:true,
    series:[{name:"gemessen",color:"var(--s1)",pts:meas,step:true,end:true},{name:"Prognose",color:"var(--s1)",pts:fpts.length?[[last.t,last.best]].concat(fpts.map(p=>[p.t,p.y])):[],step:true,dash:true}],
    bands:[{pts:fpts.map(p=>[p.t,p.lo,p.hi])}],vlines:vl,xTicks:ticks,tol:10*MIN,
    minStep:1,yFmt:v=>de(v/100,2),tipFmt:priceTxt,xFmt:t=>new Date(t).toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"})+", "+hm(t)+" Uhr"});

  // Tagesprofil
  const prof=k=>(F.byK[k]||[]).map(p=>[p.m,p.best]);
  const avgDay=[];const P=fc?fc.P:[];
  if(P.length>=3&&F.daily.length){const ref=F.daily[F.daily.length-1].hi;const n=Math.max(...P.map(p=>p.length));
    for(let i=0;i<n;i++)avgDay.push([i*STEP,ref+P.reduce((a,p)=>a+p[Math.min(i,p.length-1)],0)/P.length])}
  const hTicks=[0,180,360,540,720,900,1080,1260,1440].map(m=>({v:m,label:((12+m/60)%24)+" Uhr"}));
  lineChart($("ch-day"),{x:[0,1440],aria:"Tagesprofil heute, gestern und Durchschnitt",stepTip:true,
    series:[{name:"Ø 14 Tage",color:"var(--s3)",pts:avgDay},{name:"gestern",color:"var(--s2)",pts:prof(-1),step:true},{name:"heute",color:"var(--s1)",pts:prof(0),step:true,end:true}],
    xTicks:hTicks,tol:10,minStep:1,yFmt:v=>de(v/100,2),tipFmt:priceTxt,xFmt:m=>hm(cyc0+m*MIN)+" Uhr"});

  // Rückblick und Ausblick
  const hist=F.daily.filter(d=>d.lo!=null);
  const lf=hist.length?hist[0].t:cycStart(-7),lt=cycStart(FUT);
  const mTicks=[];const md=new Date(lf);md.setDate(1);md.setMonth(md.getMonth()+1);md.setHours(0,0,0,0);
  while(md.getTime()<=lt){mTicks.push({v:md.getTime(),label:md.toLocaleDateString("de-DE",{month:"short"})});md.setMonth(md.getMonth()+1)}
  const fd=fc?fc.days:[];const lastH=hist[hist.length-1];
  lineChart($("ch-long"),{x:[lf,lt],aria:"Tagesspanne und Ausblick",
    series:[{name:"Tagestief",color:"var(--s1)",pts:hist.map(d=>[d.t,d.lo]),end:true},{name:"Tageshoch",color:"transparent",hidden:true,pts:hist.map(d=>[d.t,d.hi])},
      {name:"Ausblick Tagestief",color:"var(--s1)",dash:true,pts:lastH?[[lastH.t,lastH.lo]].concat(fd.map(d=>[d.t,d.y])):[]}],
    bands:[{pts:hist.map(d=>[d.t,d.lo,d.hi])},{pts:fd.map(d=>[d.t,d.lo,d.hi]),color:"var(--range)"}],
    ranges:[{x0:RS,x1:RE,label:"Tankrabatt"}],
    vlines:[{x:now.getTime(),label:"heute",strong:true}].concat(RE>lf&&RE<lt?[{x:RE,label:dm(RE)}]:[]),
    xTicks:mTicks,tol:DAY*.6,minStep:1,yFmt:v=>de(v/100,2),tipFmt:priceTxt,xFmt:dm});

  // Markt
  const pname=fuel==="diesel"?"Diesel-Großhandel":"Benzin-Großhandel";
  $("mk-title").textContent=`Zapfsäule, ${pname} und Rohöl im Vergleich`;
  $("mk-sub").textContent=`Damit Steueränderungen wie der Tankrabatt das Bild nicht verzerren, zeigt die blaue Linie den Zapfsäulenpreis ohne Mehrwertsteuer, Energiesteuer und CO₂-Preis, also Produktkosten plus Marge.`;
  // Großhandel und Brent lassen sich per Klick auf die Legende aus- und einblenden
  const tog=(k,color,label)=>`<button type="button" class="lg-toggle" id="mk-tog-${k}" data-k="${k}" aria-pressed="${!mkHidden[k]}" title="${mkHidden[k]?"Einblenden":"Ausblenden"}"><i class="sw" style="background:${color}"></i>${label}</button>`;
  $("mk-legend").innerHTML=`<span><i class="sw" style="background:var(--s1)"></i>Zapfsäule ohne Steuern und Abgaben</span>${tog("ws","var(--s2)",pname+" (New York)")}${tog("brent","var(--s3)","Rohöl Brent")}`;
  $("mk-legend").querySelectorAll(".lg-toggle").forEach(b=>b.addEventListener("click",()=>{mkHidden[b.dataset.k]=!mkHidden[b.dataset.k];try{localStorage.setItem("spk-mk-hidden",JSON.stringify(mkHidden))}catch(e){}render();const n=$("mk-tog-"+b.dataset.k);if(n)n.focus()}));
  const rel=S.market_meta&&S.market_meta.eia_release;
  $("mk-source").innerHTML=S.demo?"Beispieldaten, keine echten Marktwerte.":
    `Rohöl und Großhandel: Source: U.S. Energy Information Administration${rel?" ("+new Date(rel+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})+")":""}. Spot-Preise Europe Brent und New York Harbor, von der EIA bezogen von Refinitiv (LSEG). Wechselkurs: Europäische Zentralbank. Die EIA ergänzt ihre Werte wöchentlich, die letzten Tage fehlen daher meist.`;
  const mDays=hist.filter(d=>prodCt(fuel,d.t)!=null&&brentEur(d.t)!=null);
  if(!hasMarket||mDays.length<10){
    $("ch-mk").innerHTML='<p class="small muted">Noch zu wenig Tage mit Preisen und Marktdaten. Das Diagramm erscheint nach etwa zwei Wochen.</p>';
    $("ch-lag").innerHTML="";["st-lag","st-r","st-rb"].forEach(i=>$(i).textContent="–");$("st-text").textContent="";
  }else{
    const net=d=>d.lo/1.19-taxAt(fuel,d.t)-co2(fuel);
    const b0={n:net(mDays[0]),p:prodCt(fuel,mDays[0].t),b:brentEur(mDays[0].t)};
    lineChart($("ch-mk"),{x:[mDays[0].t,mDays[mDays.length-1].t],aria:"Indexvergleich",
      series:[mkHidden.brent?null:{name:"Brent",color:"var(--s3)",pts:mDays.map(d=>[d.t,brentEur(d.t)/b0.b*100])},mkHidden.ws?null:{name:pname,color:"var(--s2)",pts:mDays.map(d=>[d.t,prodCt(fuel,d.t)/b0.p*100])},{name:"Zapfsäule ohne Steuern",color:"var(--s1)",pts:mDays.map(d=>[d.t,net(d)/b0.n*100]),end:true}].filter(Boolean),
      xTicks:mTicks,tol:DAY*.6,yFmt:v=>de(v,0),tipFmt:v=>de(v,1),xFmt:dm});
    if(mDays.length<40){$("ch-lag").innerHTML='<p class="small muted">Für die Verzögerungsanalyse werden mindestens 40 Tage gebraucht.</p>';["st-lag","st-r","st-rb"].forEach(i=>$(i).textContent="–");$("st-text").textContent=""}
    else{
      const dn=[],idx=[];for(let i=1;i<mDays.length;i++){if(mDays[i].k-mDays[i-1].k!==1)continue;if(inRabatt(mDays[i].t)!==inRabatt(mDays[i-1].t))continue;idx.push(i);dn.push(net(mDays[i])-net(mDays[i-1]))}
      const dP=(t,L)=>prodCt(fuel,t-L*DAY)-prodCt(fuel,t-(L+1)*DAY), dB=(t,L)=>brentEur(t-L*DAY)-brentEur(t-(L+1)*DAY);
      const lags=[];for(let L=0;L<=10;L++)lags.push({lag:L,r:corr(dn,idx.map(i=>dP(mDays[i].t,L)))});
      const ok=lags.filter(l=>isFinite(l.r));const bi=lags.indexOf(ok.reduce((a,l)=>l.r>a.r?l:a,ok[0]));
      const rbv=corr(dn,idx.map(i=>dB(mDays[i].t,lags[bi].lag)));
      barChart($("ch-lag"),lags.map(l=>({lag:l.lag,r:isFinite(l.r)?l.r:0})),bi);
      $("st-lag").textContent=`${lags[bi].lag} Tage`;$("st-r").textContent=de(lags[bi].r,2);$("st-rb").textContent=isFinite(rbv)?de(rbv,2):"–";
      $("st-text").textContent=`Der Zapfsäulenpreis folgt dem Großhandel am stärksten mit etwa ${lags[bi].lag} Tagen Verzögerung. Werte unter 0,3 bedeuten einen schwachen Zusammenhang; mit jedem Tag mehr Daten wird die Aussage verlässlicher.`;
    }
  }

  // Info für Mama (immer Super E10)
  if(DATA.e10&&DATA.e10.series.length){
    const E=DATA.e10,es=stats(E),el=es.last,good=es.nLows>=14&&es.rank<=Math.ceil(es.nLows*0.25);
    const where=[stn[el.bi].name,stn[el.bi].street,stn[el.bi].place].filter(Boolean).join(", ");
    $("mama").hidden=false;
    $("mama-text").innerHTML=good
      ?`<b style="color:var(--good)">Guter Preis.</b> Super E10 kostet gerade ${priceTxt(el.best)} bei ${esc(where)}, Platz ${es.rank} der letzten ${es.nLows} Tagestiefs.`
      :`Super E10 kostet gerade ${priceTxt(el.best)} bei ${esc(where)}`+(es.nLows>=7?`, Platz ${es.rank} der letzten ${es.nLows} Tagestiefs. Kein besonders günstiger Preis.`:".");
    const MV=(S.vehicles||[]).find(v=>v.fuel==="e10"&&v.home);
    let tip="",tipHTML="";
    if(MV){const pk=makeCalc(stn.map((x,i)=>({x,i,p:el.st[i]})),[MV]).pick(MV);
      if(pk){const w=[pk.o.x.name,pk.o.x.street,pk.o.x.place].filter(Boolean).join(", ");
        const why=pk.o.i!==pk.ref.i?` Das lohnt sich trotz Umweg, etwa ${de(pk.net,2)} € gespart bei ${de(MV.fill_l,MV.fill_l%1?1:0)} Litern.`:" Ein Umweg zu einer günstigeren Tankstelle lohnt sich bei "+de(MV.fill_l,MV.fill_l%1?1:0)+" Litern gerade nicht.";
        tip=` Für dich am sinnvollsten: ${w} für ${priceTxt(pk.o.p)}.${why}`;
        tipHTML=`<br><b>Für Mama am sinnvollsten:</b> ${esc(w)}, ${priceTxt(pk.o.p)}.${esc(why)}`}}
    $("mama-text").innerHTML+=tipHTML;
    window.__mama=`Hallo Mama, Super E10 kostet gerade ${priceTxt(el.best)} bei ${where}. Das ist ${good?"günstig":"ein normaler Preis"} im Vergleich zum letzten Monat. Am günstigsten ist es meist kurz vor 12 Uhr.`+tip+(inRabatt(now.getTime())&&dLeft<=21?` Vor dem ${dm(RE)} volltanken, danach wird es rund ${de(cutGross,0)} Cent teurer.`:"");
  }
}
/* ---------- Info-Fenster mit der Rechnung "lohnt die Fahrt?" ---------- */
const calcTip=document.createElement("div");calcTip.className="calc-tip";calcTip.hidden=true;calcTip.setAttribute("role","tooltip");document.body.appendChild(calcTip);
let calcFor=null,calcAt=0;
function calcHTML(c){
  const e=x=>de(x,2)+" €";
  const row=(k,v,cl="")=>`<div class="ct-row ${cl}"><span>${k}</span><span>${v}</span></div>`;
  // jede Rechnung in einem eigenen Kästchen mit eigener Überschrift
  const box=(t,head)=>`<div class="ct-box"><div class="ct-head">${head}</div>`
    +row(`Tankfüllung: ${de(c.fill,0)} l × ${de(t.p/100,3)} €`,e(t.fuel))
    +`<div class="ct-calc">Hin und zurück: 2 × ${de(t.km,1)} km × ${de(c.rf,1)} ≈ ${de(t.kmRound,1)} km, ${de(c.l100,0)} l/100 km ≈ ${de(t.l,2)} l</div>`
    +row("Kraftstoff für die Fahrt",e(t.drive))
    +row("Summe",e(t.sum),"ct-sum")+`</div>`;
  let h=`<div class="ct-title">${esc(c.v)} · ${esc(c.me.name)}</div>`;
  if(c.isBest)return h+box(c.me,"Diese Tankstelle")+`<p>Das ist die sinnvollste Tankstelle für ${esc(c.v)}.</p>`;
  h+=box(c.me,"Diese Tankstelle")+box(c.best,`Sinnvollste: ${esc(c.best.name)}`);
  if(c.d<0)h+=`<div class="ct-row ct-result neg"><span>Nachteil diese Tankstelle</span><span>${e(-c.d)}</span></div>`;
  else h+=`<div class="ct-row ct-result"><span>Vorteil diese Tankstelle</span><span>${e(c.d)}</span></div>`
    +`<p>Weniger als ${de(MIN_GAIN,2)} € gegenüber der nächstgelegenen Tankstelle: Der Umweg lohnt kaum, deshalb ist sie nicht die sinnvollste.</p>`;
  return h;
}
/* ---------- Öffnungszeiten (Tankerkönig) ---------- */
const WD=["Mo","Di","Mi","Do","Fr","Sa","So"];
const WD_LONG=["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
// Text wie "Mo-Fr", "Samstag, Sonntag, Feiertag", "täglich ausser Sonn- und Feiertagen" -> Wochentage 0..6 (Mo..So)
function parseDays(text){
  const t=String(text||"").toLowerCase();
  if(/täglich\s+au(ss|ß)er\s+sonn/.test(t))return [0,1,2,3,4,5];
  if(/täglich|mo\s*-\s*so|montag\s*-\s*sonntag/.test(t))return [0,1,2,3,4,5,6];
  const idx=w=>{const k=["mo","di","mi","do","fr","sa","so"];for(let i=0;i<7;i++)if(w.startsWith(k[i]))return i;return -1};
  const days=new Set();
  t.split(/[,;\/]|\bund\b/).map(x=>x.trim()).filter(Boolean).forEach(part=>{
    const m=part.split(/\s*[-–]\s*/);
    if(m.length===2){let a=idx(m[0]),b=idx(m[1]);if(a>=0&&b>=0){for(let i=a;;i=(i+1)%7){days.add(i);if(i===b)break}}}
    else{const i=idx(part);if(i>=0)days.add(i)}
  });
  return [...days].sort();
}
const toMin=s=>{const m=/^(\d{1,2}):(\d{2})/.exec(s||"");return m?(+m[1])*60+(+m[2]):null};
const fmtMin=m=>String(Math.floor(m/60)%25).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
// Zeitfenster je Wochentag in Minuten; Ende 00:00 oder 23:59 gilt als Mitternacht, über Mitternacht wird geteilt
function weekSlots(h){
  const W=[[],[],[],[],[],[],[]];
  if(!h)return null;
  if(h.whole_day){W.forEach(d=>d.push([0,1440]));return W}
  let any=false;
  (h.times||[]).forEach(t=>{const days=parseDays(t.text),a=toMin(t.start);let b=toMin(t.end);if(a==null||b==null||!days.length)return;any=true;
    if(b===0||b===1439)b=1440;
    days.forEach(d=>{if(b>a)W[d].push([a,b]);else{W[d].push([a,1440]);W[(d+1)%7].push([0,b])}})});
  if(!any)return null;
  W.forEach(d=>d.sort((x,y)=>x[0]-y[0]));return W;
}
// Status zum Zeitpunkt now: open24 | open | soon | closed | unknown
function hoursStatus(x,now){
  const W=weekSlots(x.hours);if(!W)return {state:"unknown"};
  if(x.hours.whole_day)return {state:"open24"};
  const d=(now.getDay()+6)%7,m=now.getHours()*60+now.getMinutes();
  const cur=W[d].find(([a,b])=>a<=m&&m<b);
  if(cur){let end=cur[1],dd=d,guard=0;
    // nahtlos in den nächsten Tag übergehend (z. B. bis 24:00 und ab 00:00) als durchgehend werten
    while(end===1440&&guard<7){const n=W[(dd+1)%7].find(([a])=>a===0);if(!n)break;dd=(dd+1)%7;end=n[1];guard++}
    if(guard>=7)return {state:"open24"};
    const left=(dd-d)*1440+end-m;
    return {state:left<=60?"soon":"open",end,left,nextDay:dd!==d};
  }
  for(let k=0;k<8;k++){const dd=(d+k)%7;const slot=W[dd].find(([a])=>k>0||a>m);if(slot)return {state:"closed",opens:slot[0],inDays:k,day:dd}}
  return {state:"closed"};
}
function stationHTML(i){
  const x=S.stations[i];const now=new Date();const st=hoursStatus(x,now);
  const typ={supermarkt:"Supermarkt-Tankstelle",automat:"Tankautomat",autobahn:"Autobahn / unterwegs"}[x.type]||"";
  const kmTxt=[];if(x.km!=null)kmTxt.push(de(x.km,1)+" km");
  if(curScope&&curScope.personal){const d=vDist(x,curScope.home);if(d!=null)kmTxt.splice(0,1,de(d,1)+" km ab "+curScope.home.name)}
  const sub=[[x.street,x.place].filter(Boolean).join(", "),typ,...kmTxt].filter(Boolean).join(" · ");
  let pill;
  if(st.state==="open24")pill=`<span class="si-pill ok"><i></i><span>Geöffnet · rund um die Uhr</span></span>`;
  else if(st.state==="open")pill=`<span class="si-pill ok"><i></i><span>Geöffnet · bis ${fmtMin(st.end)}${st.nextDay?" (morgen)":""}</span></span>`;
  else if(st.state==="soon")pill=`<span class="si-pill warn"><i></i><span>Geöffnet · schließt in ${st.left} Min. (${fmtMin(st.end)})</span></span>`;
  else if(st.state==="closed"&&st.opens!=null){const when=st.inDays===0?"heute":st.inDays===1?"morgen":"am "+WD_LONG[st.day];pill=`<span class="si-pill no"><i></i><span>Geschlossen · öffnet ${when} um ${fmtMin(st.opens)}</span></span>`}
  else if(st.state==="closed")pill=`<span class="si-pill no"><i></i><span>Geschlossen</span></span>`;
  else pill=`<span class="si-pill unk"><i></i><span>Öffnungszeiten nicht bekannt</span></span>`;
  let rows="";
  const today=(now.getDay()+6)%7;
  if(x.hours&&x.hours.whole_day)rows=`<div class="ct-row today"><span>täglich</span><span>00:00–24:00</span></div>`;
  else if(x.hours&&(x.hours.times||[]).length){
    const list=x.hours.times.map(t=>({t,days:parseDays(t.text)})).sort((a,b)=>(a.days[0]??9)-(b.days[0]??9)||toMin(a.t.start)-toMin(b.t.start));
    rows=list.map(({t,days})=>{const e=toMin(t.end);const end=e===0?"24:00":String(t.end).slice(0,5);
      return `<div class="ct-row${days.includes(today)?" today":""}"><span>${esc(t.text)}</span><span>${esc(String(t.start).slice(0,5))}–${esc(end)}</span></div>`}).join("");
  }
  const special=x.hours&&(x.hours.override||[]).length?`<p>Abweichende Öffnungszeiten gemeldet: ${esc(x.hours.override.map(o=>o.text||"").filter(Boolean).join(", ")||"siehe Tankerkönig")}.</p>`:"";
  return `<div class="si-head">${badge(x)}<div><div class="ct-title">${esc(x.name)} ${esc(x.place||"")}</div><div class="si-sub">${esc(sub)}</div></div></div>`
    +pill
    +(rows?`<div class="ct-box si-box"><div class="ct-head">Öffnungszeiten</div>${rows}</div>`:"")
    +special
    +`<p>${x.type==="automat"?"Tankautomat: Bezahlung mit Karte. ":""}Angaben des Betreibers über Tankerkönig, ohne Gewähr. Feiertage sind im Status nicht berücksichtigt.</p>`;
}
function showCalc(td){
  let html;const isSt=td.dataset.st!=null;
  if(isSt)html=stationHTML(+td.dataset.st);
  else{let c;try{c=JSON.parse(td.dataset.calc)}catch(e){return}html=calcHTML(c)}
  if(td!==calcFor)calcAt=Date.now();
  calcTip.innerHTML=html;calcTip.classList.toggle("si",isSt);calcTip.hidden=false;calcFor=td;
  const r=td.getBoundingClientRect(),w=calcTip.offsetWidth,h=calcTip.offsetHeight,vw=document.documentElement.clientWidth;
  let left=isSt?Math.min(Math.max(8,r.left),vw-w-8):Math.min(Math.max(8,r.right-w),vw-w-8);let top=r.bottom+6;
  if(top+h>window.innerHeight-8&&r.top-h-6>8)top=r.top-h-6;
  calcTip.style.left=(left+window.scrollX)+"px";calcTip.style.top=(top+window.scrollY)+"px";
}
function hideCalc(){calcTip.hidden=true;calcFor=null}
const tblBody=$("tbl");
// Überfahren gibt es nur mit der Maus; bei Finger oder Stift öffnet und schließt allein das Antippen
let lastPointer="mouse";
document.addEventListener("pointerdown",e=>{lastPointer=e.pointerType||"mouse"},true);
document.addEventListener("pointermove",e=>{if(e.pointerType==="mouse")lastPointer="mouse"},true);
tblBody.addEventListener("mouseover",e=>{if(lastPointer!=="mouse")return;const td=e.target.closest(".calc");if(!td){if(calcFor)hideCalc();return}if(td!==calcFor)showCalc(td)});
tblBody.addEventListener("mouseleave",()=>{if(lastPointer==="mouse")hideCalc()});
tblBody.addEventListener("focusin",e=>{const td=e.target.closest(".calc");if(td)showCalc(td)});
tblBody.addEventListener("focusout",hideCalc);
// Beim Antippen am Handy öffnen Maus- und Fokus-Ereignisse das Fenster schon kurz vor dem Klick.
// Ein Klick schließt es deshalb nur, wenn es nicht gerade eben (vor weniger als 0,6 s) geöffnet wurde.
tblBody.addEventListener("click",e=>{const td=e.target.closest(".calc");if(!td)return;
  if(td===calcFor&&Date.now()-calcAt>600)hideCalc();else showCalc(td);e.stopPropagation()});
document.addEventListener("click",hideCalc);
document.addEventListener("keydown",e=>{if(e.key==="Escape")hideCalc()});
window.addEventListener("scroll",()=>{if(calcFor)showCalc(calcFor)},{passive:true});
$("tbl-all").addEventListener("click",()=>{tblAll=!tblAll;render()});
$("tbl-hint").addEventListener("click",e=>{const b=e.target.closest("button[data-f]");if(!b)return;
  fillFrac[b.dataset.v]=+b.dataset.f;try{localStorage.setItem("spk-fill",JSON.stringify(fillFrac))}catch(e){}
  render();const n=[...$("tbl-hint").querySelectorAll("button[data-f]")].find(x=>x.dataset.v===b.dataset.v&&x.dataset.f===b.dataset.f);if(n)n.focus()});
document.querySelectorAll("#seg button").forEach(b=>b.addEventListener("click",()=>{fuel=b.dataset.fuel;try{localStorage.setItem("spk-fuel",fuel)}catch(e){}render()}));
$("mama-copy").addEventListener("click",e=>{const b=e.currentTarget;
  const done=t=>{b.textContent=t;setTimeout(()=>b.textContent="Nachricht kopieren",2500)};
  const fallback=()=>{const t=$("mama-text");t.textContent=window.__mama;const r=document.createRange();r.selectNodeContents(t);const s=getSelection();s.removeAllRanges();s.addRange(r);done("Text markiert, bitte kopieren")};
  if(navigator.clipboard)navigator.clipboard.writeText(window.__mama).then(()=>done("Kopiert"),fallback);else fallback()});
let rt;window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(render,150)});
/* ---------- Aktualisieren ----------
   Als Web-App auf dem Startbildschirm bleibt die Seite im Hintergrund geöffnet und lädt nicht von selbst neu.
   Deshalb beim Zurückkehren in die App und alle 2 Minuten prüfen, ob neue Daten veröffentlicht wurden. */
let checking=false;
// Veraltete Seite aus dem Zwischenspeicher erkennen: Die veröffentlichte Version steht in data/version.json.
// Weicht sie ab, die Seite unter einer neuen Adresse (?v=…) laden, die garantiert nicht zwischengespeichert ist.
async function checkVersion(){
  const mine=(document.querySelector('meta[name="app-version"]')||{}).content;
  if(!mine||mine==="dev")return false;
  try{const r=await fetch("data/version.json?t="+Date.now(),{cache:"no-store"});if(!r.ok)return false;
    const v=(await r.json()).v;
    if(v&&v!==mine&&new URLSearchParams(location.search).get("v")!==v){location.replace(location.pathname+"?v="+encodeURIComponent(v)+location.hash);return true}
  }catch(e){}
  return false;
}
async function checkUpdate(){
  if(checking)return;checking=true;
  if(await checkVersion())return;
  try{// zuerst die winzige Zeitstempel-Datei (ca. 30 Bytes), nur falls sie fehlt die ganze Preisdatei
    let r=await fetch("data/stamp.json?t="+Date.now(),{cache:"no-store"});
    if(!r.ok)r=await fetch("data/site.json?t="+Date.now(),{cache:"no-store"});
    // neu laden bei neuen Preisen (generated) oder neu aufgebauter Seite, z. B. nach geänderten Einstellungen (built)
    if(r.ok){const n=await r.json();if(n.generated!==S.generated||(n.built&&n.built!==S.built)){location.reload();return}}
  }catch(e){}
  checking=false;
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkUpdate()});
window.addEventListener("pageshow",e=>{if(e.persisted)checkUpdate()});
setInterval(()=>{if(document.visibilityState==="visible")checkUpdate()},120000);
$("reload").addEventListener("click",()=>{const b=$("reload");b.disabled=true;b.textContent="Lädt …";location.reload()});
render();
checkVersion();
})();
