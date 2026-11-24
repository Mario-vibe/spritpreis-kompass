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
try{const r=await fetch("data/site.json",{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);S=await r.json()}
catch(e){$("v-head").textContent="Keine Daten";message("<b>Die Preisdaten konnten nicht geladen werden.</b> Bitte die Seite später neu laden. ("+esc(e.message)+")");return}
if(S.demo)$("demo-badge").hidden=false;
if(!S.stations.length){$("v-head").textContent="Noch keine Tankstellen eingerichtet";message("In <b>config.json</b> stehen noch keine Tankstellen. Die Anleitung im README erklärt, wie man sie einträgt.");return}

const now=new Date(Math.floor(S.generated*1000/(STEP*MIN))*STEP*MIN);
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
const MK={};let lastMk=null;
(S.market||[]).forEach(r=>{if(r.usd_per_eur)MK[r.date]=r});
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
const STARTS=[];for(let k=-NCYC;k<=FUT+1;k++)STARTS.push(cycStart(k));
function buildFuel(fuel){
  const ev=S.stations.map(s=>(S.events[s.id]&&S.events[s.id][fuel])||[]);
  const ptr=ev.map(()=>0),cur=ev.map(()=>null);
  const t0=STARTS[0],t1=now.getTime();
  const series=[];let ci=0;
  for(let t=t0;t<=t1;t+=STEP*MIN){
    const ts=t/1000;
    const vals=ev.map((e,i)=>{while(ptr[i]<e.length&&e[ptr[i]][0]<=ts){cur[i]=e[ptr[i]][1];ptr[i]++}return cur[i]});
    while(STARTS[ci+1]<=t)ci++;
    let bi=-1;vals.forEach((v,i)=>{if(v!=null&&(bi<0||v<vals[bi]))bi=i});
    if(bi<0)continue;
    series.push({t,k:ci-NCYC,m:Math.round((t-STARTS[ci])/MIN),st:vals,best:vals[bi],bi});
  }
  const byK={};series.forEach(p=>{(byK[p.k]=byK[p.k]||[]).push(p)});
  const daily=[];
  for(let k=-NCYC;k<=0;k++){const a=byK[k];if(!a||!a.length)continue;
    let hi=-1e9,lo=1e9;a.forEach(p=>{hi=Math.max(hi,p.best);lo=Math.min(lo,p.best)});
    daily.push({k,t:cycStart(k),hi,lo:k===0?null:lo,full:a.length>=250});
  }
  return {fuel,series,byK,daily};
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
    for(let i=0;i<=sNow+12&&i<288;i++){const d=P.map(p=>at(p,i));
      pts.push({t:cycStart(1)+i*STEP*MIN,y:peak1+q(d,.5),lo:peak1+q(d,.1)-1.5,hi:peak1+q(d,.9)+1.5})}
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
  const st=niceStep(y1-y0,Wd<520?4:5);y0=Math.floor(y0/st)*st;y1=Math.ceil(y1/st)*st;
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
  svg.addEventListener("pointermove",e=>{
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
  });
  svg.addEventListener("pointerleave",hide);
}
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
try{const f=localStorage.getItem("spk-fuel");if(fuels.includes(f))fuel=f}catch(e){}
$("seg").innerHTML=fuels.map(f=>`<button id="fuel-${f}" type="button" data-fuel="${f}" aria-pressed="false">${FUELNAME[f]}</button>`).join("");
const places=[...new Set(S.stations.map(s=>s.place).filter(Boolean))];
if(places.length)$("eyebrow").textContent="Tankstellen in "+places.slice(0,3).join(", ");

function render(){
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
  $("p-where").textContent=[stn[last.bi].name,stn[last.bi].street,stn[last.bi].km!=null?de(stn[last.bi].km,1)+" km":""].filter(Boolean).join(" · ");
  const mtn=Math.max(0,Math.round((cycStart(1)-now.getTime())/MIN));
  $("p-clock").textContent=`Stand ${hm(now)} Uhr · nächste Erhöhung in ${Math.floor(mtn/60)} h ${mtn%60} min`;

  const dLeft=Math.ceil((RE-now.getTime())/DAY);const cutGross=TAX.cut_ct*1.19;
  const rb=$("rabatt");
  if(inRabatt(now.getTime())){rb.hidden=false;rb.innerHTML=`<div><b>Tankrabatt endet in ${dLeft} Tagen.</b> Ab ${dm(RE)} steigt ${name} voraussichtlich um rund ${de(cutGross,0)} Cent je Liter, weil die Energiesteuer wieder um ${de(TAX.cut_ct,2)} Cent höher ist. Am letzten Tag vor 12 Uhr volltanken lohnt sich daher fast sicher. Steht eine Verlängerung fest, wird das Datum in config.json angepasst.</div>`}
  else rb.hidden=true;

  // Tabelle
  $("tbl-time").textContent=`Stand ${hm(now)} Uhr`;
  const today=F.byK[0]||[];
  $("tbl").innerHTML=stn.map((x,i)=>({x,i,p:last.st[i]})).sort((a,b)=>(a.p??1e9)-(b.p??1e9)).map(o=>{
    if(o.p==null)return `<tr><td>${esc(o.x.name)}<div class="small muted">${esc(o.x.street||"")}</div></td><td class="num">${o.x.km!=null?de(o.x.km,1):""}</td><td class="muted" colspan="3">geschlossen oder kein Preis</td></tr>`;
    const yp=s.yRow?s.yRow.st[o.i]:null;const d=yp!=null?o.p-yp:null;
    const peak=Math.max(...today.map(p=>p.st[o.i]).filter(v=>v!=null),o.p);const fell=peak-o.p;
    return `<tr class="${o.i===last.bi?"best":""}"><td>${esc(o.x.name)}${o.i===last.bi?'<span class="tag">günstigste</span>':""}<div class="small muted">${esc(o.x.street||"")}</div></td><td class="num">${o.x.km!=null?de(o.x.km,1):""}</td><td class="p">${priceHTML(o.p)}</td><td class="num ${d==null?"":cls(d)}">${d==null?"–":sgn(d)}</td><td class="num muted">${fell>0.05?"−"+de(fell,0)+" ct":"noch keine Senkung"}</td></tr>`}).join("");

  // 48 Stunden
  const from=now.getTime()-48*HOUR,to=cycStart(1)+(now.getTime()-cyc0)+60*MIN;
  const meas=F.series.filter(p=>p.t>=from).map(p=>[p.t,p.best]);
  const fpts=fc?fc.pts.filter(p=>p.t<=to):[];
  const ticks=[];for(let t=cycStart(-3);t<=to;t+=12*HOUR){const d=new Date(t);ticks.push({v:t,label:d.getHours()===12?"12 Uhr":wd(t)+" 0 Uhr"})}
  const vl=[-2,-1,0,1].map(k=>({x:cycStart(k)}));vl.push({x:now.getTime(),label:"jetzt",strong:true});
  lineChart($("ch-48"),{x:[from,to],aria:"Preisverlauf 48 Stunden und Prognose",stepTip:true,
    series:[{name:"gemessen",color:"var(--s1)",pts:meas,step:true,end:true},{name:"Prognose",color:"var(--s1)",pts:fpts.length?[[last.t,last.best]].concat(fpts.map(p=>[p.t,p.y])):[],step:true,dash:true}],
    bands:[{pts:fpts.map(p=>[p.t,p.lo,p.hi])}],vlines:vl,xTicks:ticks,tol:10*MIN,
    yFmt:v=>de(v/100,2),tipFmt:priceTxt,xFmt:t=>wd(t)+" "+hm(t)+" Uhr"});

  // Tagesprofil
  const prof=k=>(F.byK[k]||[]).map(p=>[p.m,p.best]);
  const avgDay=[];const P=fc?fc.P:[];
  if(P.length>=3&&F.daily.length){const ref=F.daily[F.daily.length-1].hi;const n=Math.max(...P.map(p=>p.length));
    for(let i=0;i<n;i++)avgDay.push([i*STEP,ref+P.reduce((a,p)=>a+p[Math.min(i,p.length-1)],0)/P.length])}
  const hTicks=[0,180,360,540,720,900,1080,1260,1440].map(m=>({v:m,label:((12+m/60)%24)+" Uhr"}));
  lineChart($("ch-day"),{x:[0,1440],aria:"Tagesprofil heute, gestern und Durchschnitt",stepTip:true,
    series:[{name:"Ø 14 Tage",color:"var(--s3)",pts:avgDay},{name:"gestern",color:"var(--s2)",pts:prof(-1),step:true},{name:"heute",color:"var(--s1)",pts:prof(0),step:true,end:true}],
    xTicks:hTicks,tol:10,yFmt:v=>de(v/100,2),tipFmt:priceTxt,xFmt:m=>hm(cyc0+m*MIN)+" Uhr"});

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
    xTicks:mTicks,tol:DAY*.6,yFmt:v=>de(v/100,2),tipFmt:priceTxt,xFmt:dm});

  // Markt
  const pname=fuel==="diesel"?"Diesel-Großhandel":"Benzin-Großhandel";
  $("mk-title").textContent=`Zapfsäule, ${pname} und Rohöl im Vergleich`;
  $("mk-sub").textContent=`Damit Steueränderungen wie der Tankrabatt das Bild nicht verzerren, zeigt die blaue Linie den Zapfsäulenpreis ohne Mehrwertsteuer, Energiesteuer und CO₂-Preis, also Produktkosten plus Marge.`;
  $("mk-legend").innerHTML=`<span><i class="sw" style="background:var(--s1)"></i>Zapfsäule ohne Steuern und Abgaben</span><span><i class="sw" style="background:var(--s2)"></i>${pname} (New York)</span><span><i class="sw" style="background:var(--s3)"></i>Rohöl Brent</span>`;
  const mDays=hist.filter(d=>prodCt(fuel,d.t)!=null&&brentEur(d.t)!=null);
  if(!hasMarket||mDays.length<10){
    $("ch-mk").innerHTML='<p class="small muted">Noch zu wenig Tage mit Preisen und Marktdaten. Das Diagramm erscheint nach etwa zwei Wochen.</p>';
    $("ch-lag").innerHTML="";["st-lag","st-r","st-rb"].forEach(i=>$(i).textContent="–");$("st-text").textContent="";
  }else{
    const net=d=>d.lo/1.19-taxAt(fuel,d.t)-co2(fuel);
    const b0={n:net(mDays[0]),p:prodCt(fuel,mDays[0].t),b:brentEur(mDays[0].t)};
    lineChart($("ch-mk"),{x:[mDays[0].t,mDays[mDays.length-1].t],aria:"Indexvergleich",
      series:[{name:"Brent",color:"var(--s3)",pts:mDays.map(d=>[d.t,brentEur(d.t)/b0.b*100])},{name:pname,color:"var(--s2)",pts:mDays.map(d=>[d.t,prodCt(fuel,d.t)/b0.p*100])},{name:"Zapfsäule ohne Steuern",color:"var(--s1)",pts:mDays.map(d=>[d.t,net(d)/b0.n*100]),end:true}],
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
    const where=stn[el.bi].name+(stn[el.bi].street?", "+stn[el.bi].street:"");
    $("mama").hidden=false;
    $("mama-text").innerHTML=good
      ?`<b style="color:var(--good)">Guter Preis.</b> Super E10 kostet gerade ${priceTxt(el.best)} bei ${esc(where)}, Platz ${es.rank} der letzten ${es.nLows} Tagestiefs.`
      :`Super E10 kostet gerade ${priceTxt(el.best)} bei ${esc(where)}`+(es.nLows>=7?`, Platz ${es.rank} der letzten ${es.nLows} Tagestiefs. Kein besonders günstiger Preis.`:".");
    window.__mama=`Hallo Mama, Super E10 kostet gerade ${priceTxt(el.best)} bei ${where}. Das ist ${good?"günstig":"ein normaler Preis"} im Vergleich zum letzten Monat. Am günstigsten ist es meist kurz vor 12 Uhr.`+(inRabatt(now.getTime())&&dLeft<=21?` Vor dem ${dm(RE)} volltanken, danach wird es rund ${de(cutGross,0)} Cent teurer.`:"");
  }
}
document.querySelectorAll("#seg button").forEach(b=>b.addEventListener("click",()=>{fuel=b.dataset.fuel;try{localStorage.setItem("spk-fuel",fuel)}catch(e){}render()}));
$("mama-copy").addEventListener("click",e=>{const b=e.currentTarget;
  const done=t=>{b.textContent=t;setTimeout(()=>b.textContent="Nachricht kopieren",2500)};
  const fallback=()=>{const t=$("mama-text");t.textContent=window.__mama;const r=document.createRange();r.selectNodeContents(t);const s=getSelection();s.removeAllRanges();s.addRange(r);done("Text markiert, bitte kopieren")};
  if(navigator.clipboard)navigator.clipboard.writeText(window.__mama).then(()=>done("Kopiert"),fallback);else fallback()});
let rt;window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(render,150)});
render();
})();
