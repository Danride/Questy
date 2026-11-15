/* Questy 2.0 — Stage 3: strict daily marathons.
 * Calendar day is determined by dateKey(), the same day source as daily quests.
 * No Q rewards, no paid day revival, no catching up a missed day. */
const MARATHON_SAVE_KEY='questy_marathons_v1';
const MARATHON_STORAGE_KEYS=[MARATHON_SAVE_KEY];
let marathonData={v:1,entries:{},updatedAt:0};
let marathonSelected=null;
let marathonReady=false;
let marathonBusy=false;

function marathonById(id){return QUESTY_MARATHONS.find(m=>m.id===id)||null;}
function marathonDayNumber(key){
  if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;
  const p=key.split('-').map(Number), ms=Date.UTC(p[0],p[1]-1,p[2]);
  const d=new Date(ms);
  if(d.getUTCFullYear()!==p[0]||d.getUTCMonth()!==p[1]-1||d.getUTCDate()!==p[2])return NaN;
  return ms/86400000;
}
function marathonDayKey(index){
  return new Date(index*86400000).toISOString().slice(0,10);
}
function marathonEntry(id){
  if(!marathonData.entries[id])marathonData.entries[id]={active:null,history:[]};
  return marathonData.entries[id];
}
function marathonSanitize(data){
  const clean={v:1,entries:{},updatedAt:Math.max(0,Number(data&&data.updatedAt)||0)};
  for(const m of QUESTY_MARATHONS){
    const prev=data&&data.entries&&data.entries[m.id];
    const entry={active:null,history:[]};
    if(prev && typeof prev==='object'){
      if(Array.isArray(prev.history)){
        entry.history=prev.history.filter(h=>h && ['success','failed'].includes(h.status) &&
          Number.isFinite(marathonDayNumber(h.startDate)) &&
          Number.isFinite(marathonDayNumber(h.finishedDate))
        ).slice(-10).map(h=>({status:h.status,startDate:h.startDate,
          finishedDate:h.finishedDate,completed:Math.min(m.tasks.length,Math.max(0,Math.floor(Number(h.completed)||0)))}));
      }
      const a=prev.active;
      if(a && Number.isFinite(marathonDayNumber(a.startDate))){
        const completed=Math.floor(Number(a.completed)||0);
        if(completed>=0&&completed<m.tasks.length){
          entry.active={startDate:a.startDate,completed,doneDates:
            Array.isArray(a.doneDates)?a.doneDates.filter(k=>Number.isFinite(marathonDayNumber(k))).slice(0,completed):[]};
        }
      }
    }
    clean.entries[m.id]=entry;
  }
  return clean;
}
function marathonApplyRecord(raw){
  let parsed;
  try{parsed=JSON.parse(raw);}catch(e){return;}
  if(!parsed || typeof parsed!=='object')return;
  marathonData=marathonSanitize(parsed);
}
function marathonRecordFor(){return marathonData;}
function marathonSave(){adventureWrite(MARATHON_SAVE_KEY,marathonData);}
function marathonExpectedDay(active){return marathonDayNumber(active.startDate)+active.completed;}
function marathonExpire(id,today=dateKey()){
  const m=marathonById(id),e=m && marathonEntry(id);
  if(!e || !e.active)return false;
  const todayNum=marathonDayNumber(today);
  if(!Number.isFinite(todayNum))return false;
  const expected=marathonExpectedDay(e.active);
  if(todayNum<=expected)return false;
  e.history.push({status:'failed',startDate:e.active.startDate,finishedDate:today,completed:e.active.completed});
  e.history=e.history.slice(-10);
  e.active=null;
  marathonSave();
  return true;
}
function marathonRefresh(today=dateKey()){
  let changed=false;
  for(const m of QUESTY_MARATHONS) if(marathonExpire(m.id,today))changed=true;
  if(changed && typeof renderAchievements==='function')renderAchievements();
  return changed;
}
function marathonStart(id){
  const m=marathonById(id);
  if(!m || m.premium || marathonBusy)return false; // No false Voices unlocks.
  marathonRefresh();
  const e=marathonEntry(id);
  if(e.active)return false;
  e.active={startDate:dateKey(),completed:0,doneDates:[]};
  marathonSave();
  showToast('Марафон начат. Сегодня доступно первое задание.');
  renderMarathons();
  return true;
}
function marathonComplete(id){
  const m=marathonById(id);
  if(!m||m.premium||marathonBusy)return false;
  marathonRefresh();
  const e=marathonEntry(id),active=e.active;
  if(!active)return false;
  const today=dateKey(),num=marathonDayNumber(today),due=marathonExpectedDay(active);
  if(num!==due)return false;
  // A single synchronous transaction per day; repeat clicks cannot complete tomorrow's stage.
  marathonBusy=true;
  try{
    active.doneDates.push(today);
    active.completed++;
    const success=active.completed===m.tasks.length;
    if(success){
      e.history.push({status:'success',startDate:active.startDate,finishedDate:today,completed:active.completed});
      e.history=e.history.slice(-10);
      e.active=null;
    }
    marathonSave();
    if(success){
      showToast('Марафон завершён!');
      if(typeof renderAchievements==='function')renderAchievements();
    }else showToast('День выполнен. Следующий этап откроется завтра.');
    return true;
  }finally{
    marathonBusy=false;
    renderMarathons();
  }
}
function marathonCompletedCount(){
  return QUESTY_MARATHONS.reduce((n,m)=>n+marathonEntry(m.id).history.filter(h=>h.status==='success').length,0);
}
function marathonStatus(m){
  const e=marathonEntry(m.id);
  if(m.premium)return 'Премиум · голоса VK';
  if(e.active)return 'В процессе · '+e.active.completed+'/'+m.tasks.length;
  const last=e.history[e.history.length-1];
  if(!last)return 'Не начат';
  return last.status==='failed'?'Последняя попытка провалена':'Пройден';
}
function marathonDetailHtml(m){
  const e=marathonEntry(m.id),active=e.active,today=marathonDayNumber(dateKey());
  let content='<div class="marathon-detail"><div class="av-tags"><span>'+m.tasks.length+' дней</span><span>'+
    (m.mode==='duo'?'Для пары':'Для одного')+'</span></div>';
  if(m.premium){
    content+='<div class="av-locked"><strong>Платный марафон</strong><p>Покупки голосами VK подключим на четвёртом этапе. Сейчас марафон недоступен.</p></div>';
  }else if(!active){
    content+='<p class="marathon-hint">Один этап в день. Пропущенный день завершает попытку провалом, без восстановления за Q или рекламу.</p>'+
      '<button type="button" class="av-primary" data-marathon-action="start" data-marathon-id="'+m.id+'">'+
      (e.history.length?'Начать заново':'Начать марафон')+'</button>';
  }else{
    const expected=marathonExpectedDay(active),locked=today<expected;
    content+='<div class="marathon-progress">Выполнено '+active.completed+' из '+m.tasks.length+' дней</div>';
    if(locked)content+='<p class="marathon-hint">Следующий этап откроется '+marathonDayKey(expected)+'. Возвращайся завтра.</p>';
    else if(today===expected)content+='<div class="marathon-today"><span>День '+(active.completed+1)+'</span>'+
      '<p>'+escapeHtml(m.tasks[active.completed])+'</p>'+
      '<button type="button" class="av-primary" data-marathon-action="complete" data-marathon-id="'+m.id+'">Выполнил</button></div>';
  }
  if(e.history.length){
    content+='<details class="marathon-history"><summary>История попыток ('+e.history.length+')</summary><ol>'+
      e.history.slice().reverse().map(h=>'<li>'+escapeHtml(h.startDate)+' — '+escapeHtml(h.finishedDate)+
        ' · '+(h.status==='failed'?'Провал':'Успех')+' ('+h.completed+'/'+m.tasks.length+')</li>').join('')+'</ol></details>';
  }
  return content+'</div>';
}
function renderMarathons(){
  const host=document.getElementById('marathonApp');
  if(!host||!marathonReady)return;
  marathonRefresh();
  host.innerHTML='<div class="marathon-heading"><h2>Марафоны</h2><p>Задания открываются по одному в день. Пропустишь день — попытка завершится.</p></div>'+
    '<div class="marathon-list">'+QUESTY_MARATHONS.map(m=>{
      const opened=marathonSelected===m.id;
      return '<article class="marathon-card"><div class="marathon-card-head"><div><h3>'+escapeHtml(m.title)+'</h3>'+
        '<span>'+m.tasks.length+' дней · '+(m.mode==='duo'?'Пара':'Один')+'</span></div>'+
        '<button type="button" data-marathon-action="select" data-marathon-id="'+m.id+'">'+(opened?'Свернуть':'Открыть')+'</button></div>'+
        '<p>'+escapeHtml(m.description)+'</p><div class="marathon-status">'+escapeHtml(marathonStatus(m))+'</div>'+
        (opened?marathonDetailHtml(m):'')+'</article>';
    }).join('')+'</div>';
}
function initMarathons(){
  const host=document.getElementById('marathonApp');
  if(!host||marathonReady)return;
  marathonReady=true;
  host.addEventListener('click',event=>{
    const button=event.target.closest('button[data-marathon-action]');
    if(!button || !host.contains(button))return;
    const id=button.dataset.marathonId,act=button.dataset.marathonAction;
    if(!marathonById(id))return;
    if(act==='select'){
      marathonSelected=marathonSelected===id?null:id;
      renderMarathons();
    }else if(act==='start')marathonStart(id);
    else if(act==='complete')marathonComplete(id);
  });
  renderMarathons();
}
