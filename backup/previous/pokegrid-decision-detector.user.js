// ==UserScript==
// @name         PokeGrid - Detector de Decisiones y Suministros
// @namespace    ivan-pokegrid-tools
// @version      1.2.4
// @description  Avisa si quedan menos de 4 h de Ultra Balls/Ultimate Potions o si una hunt con bonus diario supera a la actual.
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-idle
// @updateURL     https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-decision-detector.meta.js
// @downloadURL   https://losajr.github.io/PokeIdleWorld-Scripts/pokegrid-decision-detector.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__pgDecisionDetectorV124) return;
  window.__pgDecisionDetectorV124 = true;

  const NS='pg-decision-detector-v1';
  const BUTTON_ID=`${NS}-button`, PANEL_ID=`${NS}-panel`, STYLE_ID=`${NS}-style`, TOAST_ID=`${NS}-toast`;
  const POS_KEY=`${NS}:button-position`, PANEL_KEY=`${NS}:panel-state`, TRACK_KEY=`${NS}:tracking`, SEEN_KEY=`${NS}:seen-alerts`;
  const LIMIT_HOURS=4;
  const SAMPLE_MS=20000, DAILY_MS=120000;

  let catalog=[], catalogById=new Map(), trackers=loadJson(TRACK_KEY,{}), alerts=[], panelOpen=false, lastDailyCheck=0, dailyState=null, busy=false, lastError='';
  const MIGRATION_KEY=`${NS}:migration-1.1`;
  try{if(localStorage.getItem(MIGRATION_KEY)!=='1'){trackers={};localStorage.removeItem(TRACK_KEY);localStorage.setItem(MIGRATION_KEY,'1');}}catch{}

  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const finite=(...vs)=>{for(const v of vs){const n=Number(v);if(Number.isFinite(n))return n;}return 0;};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const fmt=(v,d=0)=>Number.isFinite(Number(v))?Number(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function clone(v){try{return structuredClone(v);}catch{return JSON.parse(JSON.stringify(v));}}
  function loadJson(k,f){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v&&typeof v==='object'?v:clone(f);}catch{return clone(f);}}
  function saveJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}

  function ensureStyles(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
      #${BUTTON_ID}{position:fixed;right:16px;bottom:138px;z-index:100080;width:48px;height:48px;padding:0;display:none;place-items:center;border:2px solid #f2b632;border-radius:999px;background:linear-gradient(145deg,#3b270a,#21170c);color:#ffd75c;font:900 23px/1 system-ui;box-shadow:0 8px 28px #000c,0 0 0 0 #ffb52d88;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;animation:${NS}-pulse 1.15s infinite}
      #${BUTTON_ID}.show{display:grid}#${BUTTON_ID}[data-dragging="1"]{cursor:grabbing}
      #${BUTTON_ID} .pgdd-badge{position:absolute;right:-3px;top:-4px;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:#d9413b;color:white;border:2px solid #190f0d;font:850 10px/15px system-ui;text-align:center}
      @keyframes ${NS}-pulse{0%,100%{transform:scale(1);box-shadow:0 8px 28px #000c,0 0 0 0 #ffb52d88}50%{transform:scale(1.07);box-shadow:0 8px 28px #000c,0 0 0 11px #ffb52d00}}
      #${TOAST_ID}{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:100100;display:none;max-width:min(660px,92vw);padding:12px 15px;border:1px solid #d66b42;border-left:5px solid #f3b331;border-radius:10px;background:#28150f;color:#ffe1b0;box-shadow:0 14px 45px #000d;font:750 12px/1.45 system-ui}#${TOAST_ID}.show{display:block}
      #${PANEL_ID}{position:fixed;z-index:100090;display:none;flex-direction:column;width:650px;height:520px;min-width:400px;min-height:240px;max-width:calc(100vw - 8px);max-height:calc(100vh - 8px);background:#101217;color:#edf1f6;border:1px solid #4b4130;border-top:2px solid #f0b331;border-radius:12px;box-shadow:0 20px 65px #000d;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden;resize:both}
      #${PANEL_ID}.show{display:flex}#${PANEL_ID}.maximized{inset:4px!important;width:calc(100vw - 8px)!important;height:calc(100vh - 8px)!important;max-width:none;max-height:none;resize:none;border-radius:8px}#${PANEL_ID}.minimized{height:auto!important;min-height:0;resize:none}#${PANEL_ID}.minimized .pgdd-body{display:none}
      #${PANEL_ID} *{box-sizing:border-box}.pgdd-head{display:flex;align-items:center;gap:8px;padding:9px 11px;background:#171710;border-bottom:1px solid #393324;cursor:move;user-select:none}.pgdd-title{font-size:14px;font-weight:900;color:#ffd568}.pgdd-sub{font-size:10px;color:#9d9789;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pgdd-actions{margin-left:auto;display:flex;gap:5px}
      #${PANEL_ID} button{background:#201f1a;color:#f3eee2;border:1px solid #494536;border-radius:7px;padding:6px 8px;font:700 11px system-ui;cursor:pointer}.pgdd-window{font-size:14px;line-height:1;padding:5px 9px;min-width:32px}.pgdd-body{padding:11px;overflow:auto;flex:1}.pgdd-list{display:flex;flex-direction:column;gap:9px}.pgdd-alert{display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;padding:11px;border:1px solid #6e5224;border-radius:10px;background:#281e0e}.pgdd-alert.critical{border-color:#893d38;background:#2a1514}.pgdd-icon{font-size:25px;text-align:center}.pgdd-alert h3{font-size:12.5px;margin:0;color:#fff2c4}.pgdd-alert p{font-size:10.5px;line-height:1.45;color:#c9b991;margin:4px 0 0}.pgdd-value{text-align:right;color:#ffd66d;font-variant-numeric:tabular-nums}.pgdd-value b{font-size:15px}.pgdd-value small{display:block;font-size:9px;color:#aa9d7e}.pgdd-card{margin-top:10px;border:1px solid #30343b;border-radius:10px;background:#141820;overflow:hidden}.pgdd-card h3{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#8e9aa8;margin:0;padding:9px 10px;border-bottom:1px solid #2a3039;background:#171c24}.pgdd-row{display:grid;grid-template-columns:1fr 95px 95px;gap:8px;padding:9px 10px;border-bottom:1px solid #272d35;font-size:10.5px;align-items:center}.pgdd-row:last-child{border-bottom:0}.pgdd-row strong{color:#e9eef5}.pgdd-muted{color:#82909f;font-size:9.5px;margin-top:2px}.pgdd-right{text-align:right;font-variant-numeric:tabular-nums}.good{color:#72de91}.warn{color:#ffd36a}.bad{color:#ff8b82}.blue{color:#7fc2ff}.pgdd-empty{padding:30px 16px;text-align:center;color:#8d98a5;line-height:1.65}.pgdd-foot{padding:8px 11px;background:#11151b;border-top:1px solid #292f36;color:#77828f;font-size:9.5px;line-height:1.4}
      @media(max-width:620px){#${PANEL_ID}{width:calc(100vw - 12px);height:calc(100vh - 58px);min-width:300px}.pgdd-alert{grid-template-columns:34px 1fr}.pgdd-value{grid-column:2;text-align:left}.pgdd-row{grid-template-columns:1fr 75px}.pgdd-hide-mobile{display:none}}
    `;document.head.appendChild(s);
  }

  async function loadCatalog(){
    if(catalog.length)return catalog;
    let data=window.__poke?.api?.['/game/items.json'];
    if(!data?.items){try{const r=await fetch('/game/items.json',{cache:'force-cache'});if(r.ok)data=await r.json();}catch{}}
    catalog=Array.isArray(data?.items)?data.items:[];catalogById=new Map(catalog.map(item=>[String(item.id),item]));return catalog;
  }

  async function readInventory(){
    await loadCatalog();
    let raw=window.__poke?.ws?.inventory?.items;
    if(!Array.isArray(raw)){
      try{const socket=window.__poke?.sock;if(socket?.readyState===1)socket.send(JSON.stringify({type:'inv-get'}));}catch{}
      await sleep(850);
      raw=window.__poke?.ws?.inventory?.items;
    }
    if(!Array.isArray(raw)) return null;
    return raw.map(entry=>{
      const id=String(entry?.itemId??entry?.id??'');
      const info=catalogById.get(id)||{};
      return{
        id,
        name:info.name||entry?.name||`Item #${id}`,
        quantity:Math.max(0,finite(entry?.quantity,entry?.qty,entry?.amount,entry?.count,entry?.stock,0)),
        category:info.category||entry?.category||''
      };
    });
  }

  function readUltraBall(){
    const balls=window.__poke?.ws?.balls||{};
    const counts=balls?.counts&&typeof balls.counts==='object'?balls.counts:{};
    const ballCatalog=Array.isArray(balls?.catalog)?balls.catalog:[];
    const info=ballCatalog.find(ball=>/\bultra\s*ball\b/.test(norm(ball?.name||'')));
    if(info){
      const id=String(info.id??info.ballId??'');
      return{id,name:info.name||'Ultra Ball',quantity:Math.max(0,finite(counts[id],counts[Number(id)],info.quantity,info.count,0)),source:'balls'};
    }
    // Respaldo por si el catálogo todavía no ha llegado pero counts usa nombres como clave.
    for(const [key,value] of Object.entries(counts)){
      if(/\bultra\s*ball\b/.test(norm(key))) return{id:String(key),name:'Ultra Ball',quantity:Math.max(0,finite(value)),source:'balls'};
    }
    return{id:'',name:'Ultra Ball',quantity:0,source:'balls',unavailable:true};
  }

  function findUltimatePotion(inv){
    const exact=/\bultimate\s*potion\b/;
    const owned=inv.find(item=>exact.test(norm(item.name)));
    if(owned) return{...owned,source:'inventory'};
    const info=catalog.find(item=>exact.test(norm(item?.name||'')));
    return info
      ?{id:String(info.id),name:info.name||'Ultimate Potion',quantity:0,source:'inventory'}
      :{id:'',name:'Ultimate Potion',quantity:0,source:'inventory',unavailable:true};
  }

  function readSupply(inv,kind){
    return kind==='balls'?readUltraBall():findUltimatePotion(inv);
  }

  function sessionInfo(){
    const sess=window.__poke?.sess||{};
    return{
      start:finite(sess.start),
      kills:Math.max(0,finite(sess.kills)),
      ballsUsed:Math.max(0,finite(sess.balls)),
      potionsUsed:Math.max(0,finite(sess.supN)),
      slug:norm(window.__poke?.ws?.['field-init']?.slug||window.__poke?.lastSlug||sess.slug||'')
    };
  }

  function updateTracker(kind,item,session){
    const now=Date.now();
    const nativeUsed=kind==='balls'?session.ballsUsed:session.potionsUsed;
    let t=trackers[kind]||{lastQty:null,lastAt:0,periodStart:now,used:0,lastKills:session.kills,lastNative:nativeUsed,slug:session.slug,itemId:item.id||''};

    // Cambiar de hunt, de objeto detectado o pasar de una lectura inválida a una válida reinicia la muestra.
    if(t.slug!==session.slug||String(t.itemId||'')!==String(item.id||'')){
      t={lastQty:item.quantity,lastAt:now,periodStart:now,used:0,lastKills:session.kills,lastNative:nativeUsed,slug:session.slug,itemId:item.id||''};
    }

    if(t.lastQty==null){
      t.lastQty=item.quantity;t.lastAt=now;t.periodStart=now;t.lastKills=session.kills;t.lastNative=nativeUsed;t.itemId=item.id||'';
    }else{
      const qtyDelta=t.lastQty-item.quantity;
      const nativeDelta=Math.max(0,nativeUsed-finite(t.lastNative));
      const killsDelta=Math.max(0,session.kills-finite(t.lastKills));

      // Una reposición debe iniciar una muestra nueva para no mezclar compra y consumo.
      if(item.quantity>t.lastQty){
        t.periodStart=now;t.used=0;
      }else if(qtyDelta>0){
        // La bajada de la cantidad exacta es la fuente principal.
        const plausibleMax=Math.max(50,killsDelta*8+nativeDelta*3+20);
        if(qtyDelta<=plausibleMax)t.used=finite(t.used)+qtyDelta;
        else{t.periodStart=now;t.used=0;}
      }else if(nativeDelta>0&&item.quantity===t.lastQty){
        // Respaldo: PokeGrid contabiliza bolas lanzadas y curas usadas en la sesión.
        // Solo se usa si la cantidad del inventario aún no se ha refrescado.
        t.used=finite(t.used)+nativeDelta;
      }

      t.lastQty=item.quantity;t.lastAt=now;t.lastKills=session.kills;t.lastNative=nativeUsed;t.itemId=item.id||'';
    }

    const elapsedHours=Math.max(0,(now-finite(t.periodStart,now))/3600000);
    const minUsed=kind==='balls'?5:2;
    const ready=!item.unavailable&&elapsedHours>=5/60&&finite(t.used)>=minUsed;
    const rate=ready?finite(t.used)/elapsedHours:0;
    const hoursLeft=rate>0?item.quantity/rate:Infinity;
    trackers[kind]=t;
    return{kind,item,used:finite(t.used),elapsedHours,ready,rate,hoursLeft,nativeUsed};
  }

  function keys(row){const h=row?.hunt||{},m=h.marker||{},c=h.creature||{};return[...new Set([h.slug,h.name,m.slug,m.hunt,m.name,m.pokemonName,c.slug,c.name].filter(Boolean).map(norm))];}
  function currentSlug(){return norm(window.__poke?.ws?.['field-init']?.slug||window.__poke?.lastSlug||window.__poke?.sess?.slug||'');}
  function currentRow(rows,slug){return rows.find(r=>keys(r).includes(slug))||rows.find(r=>keys(r).some(k=>k&&(slug.includes(k)||k.includes(slug))))||null;}

  async function checkDaily(){
    const core=window.__PGUnifiedHuntCore;
    if(!core?.calculateRecommendations)return{available:false,reason:'Hunt Advisor no disponible'};
    try{
      const result=await core.calculateRecommendations(false),slug=currentSlug(),current=currentRow(result.rows||[],slug);
      if(!current)return{available:false,reason:'Hunt actual no relacionada'};
      if(current.dailyBoosted)return{available:true,ignored:false,current,result};
      const dailyRows=(result.rows||[]).filter(row=>row.dailyBoosted);
      if(!dailyRows.length)return{available:false,reason:result.dailyBonus?.detected?'No hay hunts diarias desbloqueadas':'Tipo diario no detectado'};
      dailyRows.sort((a,b)=>finite(b.xph)-finite(a.xph));
      const best=dailyRows[0],currentXph=finite(current.xph),bestXph=finite(best.xph),ratio=bestXph/Math.max(1,currentXph);
      // Solo se considera una mala decisión cuando la mejor hunt con bonus diario
      // supera realmente la EXP/h estimada de la hunt actual. Una alternativa
      // inferior, aunque esté cerca, se muestra como información pero no genera aviso.
      return{available:true,ignored:bestXph>currentXph,current,best,ratio,currentXph,bestXph,result};
    }catch(error){return{available:false,reason:error?.message||String(error)};}
  }

  function buildAlerts(supplies,daily){
    const next=[];
    for(const supply of supplies){
      if(supply.ready&&supply.hoursLeft<=LIMIT_HOURS){
        next.push({id:supply.kind,type:'supply',critical:supply.hoursLeft<=2,icon:supply.kind==='balls'?'🔵':'🧪',title:`${supply.item.name}: menos de ${LIMIT_HOURS} horas`,message:`Quedan ${fmt(supply.item.quantity)} unidades. Consumo observado: ${fmt(supply.rate,1)}/h durante la hunt actual.`,value:`${fmt(supply.hoursLeft,1)} h`,sub:'tiempo estimado',supply});
      }
    }
    if(daily?.ignored){
      const currentName=daily.current?.hunt?.name||daily.current?.hunt?.creature?.name||'hunt actual';
      const bestName=daily.best?.hunt?.name||daily.best?.hunt?.creature?.name||'hunt con bonus';
      const diff=(daily.ratio-1)*100;
      next.push({id:'daily',type:'daily',critical:false,icon:'✨',title:'Estás ignorando el bonus diario',message:`${bestName} aprovecha el +20 % diario y su EXP/h estimada queda ${Math.abs(diff)<0.05?'prácticamente igual':`${fmt(Math.abs(diff),1)} % ${diff>=0?'por encima':'por debajo'}`} de ${currentName}.`,value:`${diff>=0?'+':''}${fmt(diff,1)} %`,sub:'diferencia EXP/h',daily});
    }
    return next;
  }

  function updateButton(){
    const b=document.getElementById(BUTTON_ID);if(!b)return;
    b.classList.toggle('show',alerts.length>0);b.innerHTML=`⚠️${alerts.length?`<span class="pgdd-badge">${alerts.length}</span>`:''}`;
    b.title=alerts.length?`${alerts.length} aviso${alerts.length===1?'':'s'} activo${alerts.length===1?'':'s'} · clic para abrir · arrastra para mover`:'Sin avisos';
  }

  function notifyNewAlerts(previous,next){
    const before=new Set(previous.map(a=>a.id)),fresh=next.filter(a=>!before.has(a.id));if(!fresh.length)return;
    let toast=document.getElementById(TOAST_ID);if(!toast){toast=document.createElement('div');toast.id=TOAST_ID;document.body.appendChild(toast);}
    toast.innerHTML=`<b>⚠️ Nuevo aviso:</b> ${fresh.map(a=>esc(a.title)).join(' · ')}`;toast.classList.add('show');clearTimeout(toast.__timer);toast.__timer=setTimeout(()=>toast.classList.remove('show'),7000);
  }

  function supplyStatusHtml(s){
    const noConsumptionObserved=!s.item.unavailable&&!s.ready&&s.elapsedHours>=5/60&&finite(s.used)===0;
    const cls=s.ready?(s.hoursLeft<=LIMIT_HOURS?'bad':'good'):noConsumptionObserved?'good':'warn';
    const detail=s.item.unavailable
      ?(s.kind==='balls'?'Esperando el catálogo de Poké Balls del juego…':'No se encontró Ultimate Potion en el catálogo/inventario.')
      :s.ready
        ?`${fmt(s.used)} consumidas en ${fmt(s.elapsedHours*60,0)} min`
        :noConsumptionObserved
          ?`No se ha consumido ninguna durante ${fmt(s.elapsedHours*60,0)} min; actualmente no existe una tasa que calcular.`
          :`Midiendo consumo real: ${fmt(s.used)} usadas; necesita al menos 5 minutos y ${s.kind==='balls'?'5':'2'} consumidas.`;
    const remaining=s.ready&&Number.isFinite(s.hoursLeft)?fmt(s.hoursLeft,1)+' h':noConsumptionObserved?'Sin consumo':'Midiendo';
    return `<div class="pgdd-row"><div><strong>${esc(s.item.name)}</strong><div class="pgdd-muted">${detail}</div></div><div class="pgdd-right blue"><b>${s.item.unavailable?'—':fmt(s.item.quantity)}</b><br><small>disponibles</small></div><div class="pgdd-right ${cls} pgdd-hide-mobile"><b>${remaining}</b><br><small>restantes</small></div></div>`;
  }

  function render(){
    const p=document.getElementById(PANEL_ID);if(!p)return;const content=p.querySelector('.pgdd-content'),sub=p.querySelector('.pgdd-sub');if(!content||!sub)return;
    sub.textContent=alerts.length?`${alerts.length} problema${alerts.length===1?'':'s'} activo${alerts.length===1?'':'s'}`:'Todos los avisos están resueltos';
    const list=alerts.length?alerts.map(a=>`<div class="pgdd-alert ${a.critical?'critical':''}"><div class="pgdd-icon">${a.icon}</div><div><h3>${esc(a.title)}</h3><p>${esc(a.message)}</p></div><div class="pgdd-value"><b>${esc(a.value)}</b><small>${esc(a.sub)}</small></div></div>`).join(''):'<div class="pgdd-empty">No hay problemas activos. El icono desaparecerá al cerrar esta ventana y volverá a mostrarse solamente cuando detecte un aviso.</div>';
    const supplies=window.__pgddLastSupplies||[];
    const daily=dailyState;
    content.innerHTML=`<div class="pgdd-list">${list}</div><div class="pgdd-card"><h3>Seguimiento de suministros</h3>${supplies.map(supplyStatusHtml).join('')||'<div class="pgdd-empty">Esperando inventario…</div>'}</div><div class="pgdd-card"><h3>Bonus diario</h3>${daily?.available?`<div class="pgdd-row"><div><strong>${daily.ignored?'Alternativa encontrada':'Hunt correcta'}</strong><div class="pgdd-muted">${daily.ignored?esc(daily.best?.hunt?.name||daily.best?.hunt?.creature?.name||'Hunt diaria'):'La hunt actual ya aprovecha el bonus o ninguna hunt con bonus ofrece más EXP/h.'}</div></div><div class="pgdd-right ${daily.ignored?'warn':'good'}"><b>${daily.ignored?fmt((daily.ratio-1)*100,1)+' %':'OK'}</b></div><div class="pgdd-right pgdd-hide-mobile"><b>+20 %</b><br><small>diario</small></div></div>`:`<div class="pgdd-empty">${esc(daily?.reason||'Esperando al Hunt Advisor…')}</div>`}</div>`;
  }

  function createPanel(){
    if(document.getElementById(PANEL_ID))return document.getElementById(PANEL_ID);
    const p=document.createElement('section');p.id=PANEL_ID;p.innerHTML=`<div class="pgdd-head"><span class="pgdd-title">⚠️ Detector de decisiones</span><span class="pgdd-sub">Supervisando…</span><div class="pgdd-actions"><button class="pgdd-refresh" title="Actualizar">↻</button><button class="pgdd-window pgdd-min" title="Minimizar">—</button><button class="pgdd-window pgdd-max" title="Maximizar">□</button><button class="pgdd-window pgdd-close" title="Cerrar">×</button></div></div><div class="pgdd-body"><div class="pgdd-content"><div class="pgdd-empty">Cargando…</div></div></div><div class="pgdd-foot">El icono ⚠️ solo aparece cuando existe un problema. El cálculo de suministros utiliza el consumo observado en la hunt actual y se reinicia al cambiar de hunt o reponer existencias.</div>`;document.body.appendChild(p);installPanel(p);restorePanel(p);return p;
  }

  function restorePanel(p){const s=loadJson(PANEL_KEY,{x:80,y:80,width:650,height:520,minimized:false,maximized:false});p.style.left=`${clamp(finite(s.x,80),0,Math.max(0,innerWidth-300))}px`;p.style.top=`${clamp(finite(s.y,80),0,Math.max(0,innerHeight-80))}px`;p.style.width=`${clamp(finite(s.width,650),400,Math.max(400,innerWidth-8))}px`;p.style.height=`${clamp(finite(s.height,520),240,Math.max(240,innerHeight-8))}px`;p.classList.toggle('minimized',!!s.minimized);p.classList.toggle('maximized',!!s.maximized);}
  function savePanel(p){const r=p.getBoundingClientRect();saveJson(PANEL_KEY,{x:r.left,y:r.top,width:r.width,height:r.height,minimized:p.classList.contains('minimized'),maximized:p.classList.contains('maximized')});}
  function installPanel(p){const h=p.querySelector('.pgdd-head');let drag=null;h.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button')||p.classList.contains('maximized'))return;const r=p.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,l:r.left,t:r.top};try{if(e.isTrusted)h.setPointerCapture?.(e.pointerId);}catch{}});h.addEventListener('pointermove',e=>{if(!drag)return;const r=p.getBoundingClientRect();p.style.left=`${clamp(drag.l+e.clientX-drag.x,0,Math.max(0,innerWidth-r.width))}px`;p.style.top=`${clamp(drag.t+e.clientY-drag.y,0,Math.max(0,innerHeight-44))}px`;p.style.right='auto';p.style.bottom='auto';});const finish=()=>{if(!drag)return;drag=null;savePanel(p);};h.addEventListener('pointerup',finish);h.addEventListener('pointercancel',finish);p.querySelector('.pgdd-close').onclick=()=>{savePanel(p);p.classList.remove('show');panelOpen=false;};p.querySelector('.pgdd-min').onclick=()=>{p.classList.toggle('minimized');p.classList.remove('maximized');savePanel(p);};p.querySelector('.pgdd-max').onclick=()=>{p.classList.toggle('maximized');p.classList.remove('minimized');savePanel(p);};p.querySelector('.pgdd-refresh').onclick=()=>check(true);new ResizeObserver(()=>{if(panelOpen&&!p.classList.contains('maximized'))savePanel(p);}).observe(p);}
  function openPanel(){const p=createPanel();p.classList.add('show');panelOpen=true;render();}

  function saveButton(b){const r=b.getBoundingClientRect();saveJson(POS_KEY,{left:r.left,top:r.top});}
  function installDrag(b){const s=loadJson(POS_KEY,null);if(s?.left!=null){b.style.left=`${s.left}px`;b.style.top=`${s.top}px`;b.style.right='auto';b.style.bottom='auto';}let d=null,suppress=0;b.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=b.getBoundingClientRect();d={x:e.clientX,y:e.clientY,l:r.left,t:r.top,m:false};try{if(e.isTrusted)b.setPointerCapture?.(e.pointerId);}catch{}});b.addEventListener('pointermove',e=>{if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>4)d.m=true;if(!d.m)return;b.dataset.dragging='1';b.style.left=`${clamp(d.l+dx,6,Math.max(6,innerWidth-b.offsetWidth-6))}px`;b.style.top=`${clamp(d.t+dy,6,Math.max(6,innerHeight-b.offsetHeight-6))}px`;b.style.right='auto';b.style.bottom='auto';});const end=()=>{if(!d)return;if(d.m){suppress=Date.now()+250;saveButton(b);}d=null;delete b.dataset.dragging;};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('click',e=>{if(Date.now()<suppress){e.preventDefault();e.stopImmediatePropagation();}},true);}

  function ensureButton(){let b=document.getElementById(BUTTON_ID);if(b)return b;b=document.createElement('button');b.id=BUTTON_ID;b.type='button';b.setAttribute('aria-label','Abrir detector de decisiones');b.onclick=openPanel;document.body.appendChild(b);installDrag(b);return b;}

  async function check(forceDaily=false){
    if(busy)return;busy=true;
    try{
      const inv=await readInventory(),session=sessionInfo();
      if(!Array.isArray(inv)) throw new Error('Inventario todavía no disponible');
      const ball=updateTracker('balls',readSupply(inv,'balls'),session),potion=updateTracker('potions',readSupply(inv,'potions'),session);
      window.__pgddLastSupplies=[ball,potion];saveJson(TRACK_KEY,trackers);
      if(forceDaily||Date.now()-lastDailyCheck>=DAILY_MS||!dailyState){dailyState=await checkDaily();lastDailyCheck=Date.now();}
      const previous=alerts;alerts=buildAlerts([ball,potion],dailyState);lastError='';notifyNewAlerts(previous,alerts);updateButton();if(panelOpen)render();publishDecisionHealth();
    }catch(error){lastError=error?.message||String(error);console.error('[Detector de decisiones]',error);publishDecisionHealth();}finally{busy=false;}
  }


  /* Integración de estado con PokeGrid Script Bridge. */
  const HEALTH_SCRIPT_ID='decision-detector';
  let healthClient=null,healthTimer=null;

  function decisionHealthState(){
    const supplies=window.__pgddLastSupplies||[];
    const balls=supplies.find(item=>item.kind==='balls')||null;
    const potions=supplies.find(item=>item.kind==='potions')||null;
    let status='ok',statusText='Detector activo; no hay problemas.';
    if(lastError){status='error';statusText=lastError;}
    else if(busy){status='waiting';statusText='Actualizando suministros y bonus diario.';}
    else if(alerts.length){status='warning';statusText=`${alerts.length} aviso${alerts.length===1?'':'s'} activo${alerts.length===1?'':'s'}.`;}
    else if(!supplies.length){status='waiting';statusText='Esperando inventario y catálogo de Poké Balls.';}
    else if(supplies.some(item=>item.item?.unavailable)){status='warning';statusText='El detector funciona, pero falta localizar algún suministro.';}
    else if(balls?.ready&&potions&&!potions.ready&&finite(potions.used)===0&&potions.elapsedHours>=5/60){status='ok';statusText='Ultra Balls calculadas; no se ha observado consumo de Ultimate Potions.';}
    else if(supplies.some(item=>!item.ready)){status='waiting';statusText='Midiendo el consumo real de suministros.';}
    return {
      status,statusText,
      dependencies:{
        inventory:{ok:Boolean(window.__poke?.ws?.inventory?.items),checkedAt:Date.now()},
        balls:{ok:Boolean(window.__poke?.ws?.balls?.counts&&window.__poke?.ws?.balls?.catalog),checkedAt:Date.now()},
        huntAdvisor:{ok:Boolean(window.__PGUnifiedHuntCore?.calculateRecommendations),checkedAt:Date.now()},
        activeHunt:{ok:Boolean(sessionInfo()?.slug),checkedAt:Date.now()}
      },
      metrics:{
        busy,panelOpen,activeAlerts:alerts.map(alert=>({id:alert.id,title:alert.title,value:alert.value,critical:Boolean(alert.critical)})),
        alertCount:alerts.length,
        ultraBalls:balls?{available:balls.item?.quantity||0,ready:Boolean(balls.ready),rate:balls.rate||0,hoursLeft:Number.isFinite(balls.hoursLeft)?balls.hoursLeft:null,used:balls.used||0,unavailable:Boolean(balls.item?.unavailable)}:null,
        ultimatePotions:potions?{available:potions.item?.quantity||0,ready:Boolean(potions.ready),rate:potions.rate||0,hoursLeft:Number.isFinite(potions.hoursLeft)?potions.hoursLeft:null,used:potions.used||0,unavailable:Boolean(potions.item?.unavailable)}:null,
        daily:{available:Boolean(dailyState?.available),ignored:Boolean(dailyState?.ignored),reason:dailyState?.reason||'',current:dailyState?.current?.hunt?.name||dailyState?.current?.hunt?.creature?.name||'',alternative:dailyState?.best?.hunt?.name||dailyState?.best?.hunt?.creature?.name||'',differencePercent:Number.isFinite(dailyState?.ratio)?(dailyState.ratio-1)*100:null,rule:'alert-only-if-alternative-is-better'},
        lastCheckAt:Date.now(),functionalTest:decisionSelfTest()
      }
    };
  }

  function decisionSelfTest(){
    const inv=window.__poke?.ws?.inventory?.items;
    const balls=window.__poke?.ws?.balls;
    const state=decisionHealthState();
    return{
      ok:Boolean(Array.isArray(inv)&&balls?.counts&&balls?.catalog&&window.__PGUnifiedHuntCore?.calculateRecommendations),
      inventory:Array.isArray(inv),
      balls:Boolean(balls?.counts&&balls?.catalog),
      huntAdvisor:Boolean(window.__PGUnifiedHuntCore?.calculateRecommendations),
      activeHunt:Boolean(sessionInfo()?.slug),
      supplyTracking:Boolean(window.__pgddLastSupplies),
      alertRule:state.metrics?.daily?.rule||''
    };
  }

  window.__PGDecisionDetector=Object.freeze({
    version:'1.2.4',
    getState:decisionHealthState,
    selfTest:decisionSelfTest,
    open:openPanel,
    checkNow:()=>check(true),
    resetTracking:()=>{trackers={};window.__pgddLastSupplies=[];saveJson(TRACK_KEY,trackers);alerts=[];dailyState=null;lastDailyCheck=0;updateButton();if(panelOpen)render();publishDecisionHealth();return{cleared:true};}
  });

  function publishDecisionHealth(){
    if(!healthClient)return;
    try{healthClient.heartbeat(decisionHealthState());}
    catch(error){try{healthClient.reportError(error,'publish-health',{keepStatus:true});}catch{}}
  }

  function connectDecisionHealthBridge(){
    const bridge=window.__pokeGridScripts;if(!bridge?.register)return false;if(healthClient)return true;
    healthClient=bridge.register({id:HEALTH_SCRIPT_ID,name:'Detector de decisiones y suministros',version:'1.2.4',description:'Avisa por Ultra Balls, Ultimate Potions y solo si una hunt con bonus diario supera a la actual.',icon:'⚠️',category:'alerts',status:'waiting',statusText:'Esperando datos de suministros.',staleAfterMs:50000,capabilities:['ultra-ball-hours','ultimate-potion-hours','daily-bonus-warning','functional-test']});
    healthClient.registerCommand('open',()=>{openPanel();return{opened:true};},{label:'Abrir detector'});
    healthClient.registerCommand('check-now',()=>check(true),{label:'Comprobar ahora'});
    healthClient.registerCommand('reset-tracking',()=>window.__PGDecisionDetector.resetTracking(),{label:'Reiniciar medición',dangerous:true});
    try{healthClient.registerTest?.(decisionSelfTest,{label:'Probar detector de decisiones'});}catch{}
    publishDecisionHealth();healthTimer=setInterval(publishDecisionHealth,10000);return true;
  }

  window.addEventListener('pokegrid-health-bridge-ready',connectDecisionHealthBridge);
  const decisionBridgeTimer=setInterval(()=>{if(connectDecisionHealthBridge())clearInterval(decisionBridgeTimer);},1000);
  connectDecisionHealthBridge();


  function start(){if(!document.body)return setTimeout(start,200);ensureStyles();ensureButton();createPanel();check(true);setInterval(()=>check(false),SAMPLE_MS);console.info('[Detector de decisiones] v1.2.4 cargado: pruebas funcionales integradas; reglas de avisos sin cambios.');}
  start();
})();
