/* Questy 2.0 / stage 2: adventure browser and narrative engine.
 * Uses existing classic-script globals: balance, saveBalance, requestRewardedAd,
 * storageGetMultiple, queueStorageSet, updateBalanceUI and escapeHtml.
 * Premium access MUST come from verified purchases (planned stage 4). */
const ADVENTURE_SKIP_PRICES = Object.freeze({normal:200, hard:350, special:500});
const ADVENTURE_FAV_KEY = 'questy_adventure_favorites_v1';
const ADVENTURE_QUICK_KEY = 'questy_quick_results_v1';
const ADVENTURE_STORY_PREFIX = 'questy_story_v1_';
const ADVENTURE_STORAGE_KEYS = [ADVENTURE_FAV_KEY, ADVENTURE_QUICK_KEY, WEEKLY_STORIES_KEY, WEEKLY_Q_OWNED_KEY].concat(QUESTY_STORIES.map(s => ADVENTURE_STORY_PREFIX + s.id));
const ADVENTURE_MODES = {solo:'Один', duo:'Пара', group:'Компания'};
const ADVENTURE_DIFFICULTIES = {easy:'Легко', medium:'Средне', hard:'Сложно'};
const adventureView = {page:'catalog', kind:null, id:null, query:'', type:'all', mode:'all', difficulty:'all', duration:'all', access:'all', status:'all', skipOpen:false, confirmRestart:false};
let adventureFavorites = {v:1,ids:[],updatedAt:0};
let adventureQuickResults = {v:1,done:{},updatedAt:0};
const adventureStoryProgress = Object.create(null);
let adventureBusy = false;
let adventureInitialized = false;

function adventureEscape(value){ return escapeHtml(value == null ? '' : String(value)); }
function adventureProgressKey(id){ return ADVENTURE_STORY_PREFIX + id; }
function adventureNow(){ return Date.now(); }
function adventureStoryById(id){ return QUESTY_STORIES.find(s => s.id === id) || null; }
function adventureQuickById(id){ return QUESTY_CHALLENGES.find(q => q.id === id) || null; }
function adventureFreshProgress(story){
  return {v:1,node:story.start,path:[],endings:[],runs:0,startedAt:0,updatedAt:0,active:false,lastEnd:null};
}
function adventureParseJson(raw){
  if(typeof raw !== 'string' || !raw.trim()) return null;
  try{ return JSON.parse(raw); }catch(e){return null;}
}
function adventureSanitizeFavorites(value){
  if(!value || !Array.isArray(value.ids)) return {v:1,ids:[],updatedAt:0};
  const valid = new Set(QUESTY_CHALLENGES.map(q => q.id).concat(QUESTY_STORIES.map(s => s.id)));
  return {v:1,ids:[...new Set(value.ids.filter(id => typeof id === 'string' && valid.has(id)))].slice(0,75),updatedAt:Math.max(0,Number(value.updatedAt)||0)};
}
function adventureSanitizeQuick(value){
  const done = {};
  if(value && value.done && typeof value.done === 'object'){
    for(const q of QUESTY_CHALLENGES){
      const entry = value.done[q.id];
      if(!entry) continue;
      const count = Math.min(10000,Math.max(0,Math.floor(Number(entry.count)||0)));
      if(count) done[q.id] = {count,last:Math.max(0,Number(entry.last)||0)};
    }
  }
  return {v:1,done,updatedAt:Math.max(0,Number(value && value.updatedAt)||0)};
}
function adventureSanitizeStory(story,value){
  const fresh = adventureFreshProgress(story);
  if(!value || typeof value !== 'object') return fresh;
  const node = story.nodes[value.node] ? value.node : story.start;
  const path = Array.isArray(value.path) ? value.path.filter(item =>
    item && typeof item.id === 'string' && story.nodes[item.id] &&
    (item.kind === 'done' || item.kind === 'skipped' || item.kind === 'choice')
  ).slice(-18).map(item => ({
    id:item.id,kind:item.kind,choice:Number.isInteger(item.choice)?item.choice:null,
    at:Math.max(0,Number(item.at)||0)
  })) : [];
  const endings = Array.isArray(value.endings) ?
    [...new Set(value.endings.filter(id=>story.nodes[id] && story.nodes[id].type==='ending'))].slice(0,10) : [];
  const isEnding = story.nodes[node].type === 'ending';
  return {
    v:1,node,path,endings,runs:Math.min(10000,Math.max(0,Math.floor(Number(value.runs)||0))),
    startedAt:Math.max(0,Number(value.startedAt)||0),
    updatedAt:Math.max(0,Number(value.updatedAt)||0),
    active:!!value.active && !isEnding,
    lastEnd:(value.lastEnd && story.nodes[value.lastEnd] && story.nodes[value.lastEnd].type === 'ending') ? value.lastEnd : null
  };
}
function adventureApplyRecord(key,raw){
  const parsed = adventureParseJson(raw);
  if(!parsed) return;
  if(key === ADVENTURE_FAV_KEY){ adventureFavorites = adventureSanitizeFavorites(parsed); return; }
  if(key === ADVENTURE_QUICK_KEY){ adventureQuickResults = adventureSanitizeQuick(parsed); return; }
  if(key === WEEKLY_STORIES_KEY || key === WEEKLY_Q_OWNED_KEY){ weeklyApplyRecord(key,raw); return; }
  const id = key.slice(ADVENTURE_STORY_PREFIX.length);
  const story = adventureStoryById(id);
  if(story) adventureStoryProgress[id] = adventureSanitizeStory(story,parsed);
}
function adventureRecordFor(key){
  if(key===ADVENTURE_FAV_KEY) return adventureFavorites;
  if(key===ADVENTURE_QUICK_KEY) return adventureQuickResults;
  if(key===WEEKLY_STORIES_KEY || key===WEEKLY_Q_OWNED_KEY) return weeklyRecordFor(key);
  return adventureStoryProgress[key.slice(ADVENTURE_STORY_PREFIX.length)] || {updatedAt:0};
}
function adventureWrite(key,value){
  value.updatedAt = adventureNow();
  const raw = JSON.stringify(value);
  try{localStorage.setItem('g_'+key,raw);}catch(e){console.warn('[Adventure local save]',e);}
  queueStorageSet(key,raw);
}
function adventureReadLocal(){
  ADVENTURE_STORAGE_KEYS.forEach(key=>{
    let raw=null;
    try{raw=localStorage.getItem('g_'+key);}catch(e){}
    if(raw) adventureApplyRecord(key,raw);
  });
  for(const story of QUESTY_STORIES){
    if(!adventureStoryProgress[story.id]) adventureStoryProgress[story.id] = adventureFreshProgress(story);
  }
  weeklyEnsureCurrent();
}
async function syncAdventureStateFromVK(){
  try{
    const result = await storageGetMultiple(ADVENTURE_STORAGE_KEYS);
    for(const key of ADVENTURE_STORAGE_KEYS){
      if(pendingSaves.has(key)) continue; // never replace a pending local mutation
      const incoming=adventureParseJson(result[key]);
      if(!incoming) continue;
      const current=adventureRecordFor(key);
      const incomingUpdated = Number(incoming.updatedAt)||0;
      if(incomingUpdated > (Number(current.updatedAt)||0)){
        adventureApplyRecord(key,result[key]);
        try{localStorage.setItem('g_'+key,result[key]);}catch(e){}
      }else if(incomingUpdated < (Number(current.updatedAt)||0)){
        // Last-write-wins fallback only; paid transactions need server-side authority.
        queueStorageSet(key,JSON.stringify(current));
      }
    }
    if(adventureView.page==='catalog') renderAdventureCards();
    else renderAdventures();
  }catch(e){ console.warn('[Adventure VK sync]',e); }
}
function initAdventureLibrary(){
  if(adventureInitialized) return;
  adventureInitialized=true;
  adventureReadLocal();
  const root=document.getElementById('adventureApp');
  if(!root) return;
  root.addEventListener('click',adventureClick);
  root.addEventListener('input',event=>{
    if(event.target.id==='adventureSearch'){
      adventureView.query=event.target.value.slice(0,80);
      renderAdventureCards();
    }
  });
  root.addEventListener('change',event=>{
    const el=event.target;
    if(el && el.dataset && el.dataset.avFilter){
      const filter=el.dataset.avFilter;
      const options={
        type:['all','quick','story'],mode:['all','solo','duo','group'],
        difficulty:['all','easy','medium','hard'],duration:['all','short','medium','long'],
        access:['all','free','premium'],status:['all','progress','done','favorites']
      };
      if(options[filter] && options[filter].includes(el.value)){
        adventureView[filter]=el.value;
        renderAdventureCards();
      }
    }
  });
  renderAdventures();
}
function adventureStatus(kind,id){
  if(kind==='quick') return adventureQuickResults.done[id] ? 'done' : 'new';
  const p=adventureStoryProgress[id];
  if(p && p.active) return 'progress';
  return p && p.runs>0 ? 'done' : 'new';
}
function adventureIsPremiumLocked(story){
  // Never trust a local "owned" flag. Purchase validation is reserved for stage 4.
  return !!story.premium;
}
function adventureCatalogItems(){
  const query=adventureView.query.trim().toLocaleLowerCase('ru');
  const items=QUESTY_CHALLENGES.map(q=>({kind:'quick',item:q})).concat(
    QUESTY_STORIES.map(s=>({kind:'story',item:s}))
  );
  return items.filter(({kind,item})=>{
    // Only the three weekly stories are offered to new players.
    // Stories already started, completed or purchased remain in the library.
    if(kind==='story' && !weeklyCanAccess(item) && !(item.premium && adventureView.access==='premium')) return false;
    if(adventureView.type!=='all' && kind!==adventureView.type) return false;
    if(adventureView.mode!=='all' && item.mode!==adventureView.mode) return false;
    if(adventureView.difficulty!=='all' && item.difficulty!==adventureView.difficulty) return false;
    if(adventureView.access==='free' && kind==='story' && item.premium) return false;
    if(adventureView.access==='premium' && (kind!=='story' || !item.premium)) return false;
    if(adventureView.duration==='short' && item.minutes>10) return false;
    if(adventureView.duration==='medium' && (item.minutes<=10 || item.minutes>25)) return false;
    if(adventureView.duration==='long' && item.minutes<=25) return false;
    const status=adventureStatus(kind,item.id);
    if(adventureView.status==='done' && !(status==='done' || (kind==='story' && adventureStoryProgress[item.id] && adventureStoryProgress[item.id].runs>0))) return false;
    if(adventureView.status==='progress' && status!=='progress') return false;
    if(adventureView.status==='favorites' && !adventureFavorites.ids.includes(item.id)) return false;
    if(query && !(item.title+' '+(item.description||item.text||'')+' '+(item.genre||'')).toLocaleLowerCase('ru').includes(query)) return false;
    return true;
  }).sort((a,b)=>{
    const favourite=Number(adventureFavorites.ids.includes(b.item.id))-Number(adventureFavorites.ids.includes(a.item.id));
    if(favourite) return favourite;
    const playing=Number(adventureStatus(b.kind,b.item.id)==='progress')-Number(adventureStatus(a.kind,a.item.id)==='progress');
    if(playing) return playing;
    return Number(a.kind==='story' && a.item.premium)-Number(b.kind==='story' && b.item.premium);
  });
}
function adventureFilterSelect(name,label,options){
  return '<label class="av-filter"><span>'+label+'</span><select data-av-filter="'+name+'" aria-label="'+label+'">'+
    options.map(row=>'<option value="'+row[0]+'"'+(adventureView[name]===row[0]?' selected':'')+'>'+row[1]+'</option>').join('')+
    '</select></label>';
}
function renderAdventureCatalog(){
  const root=document.getElementById('adventureApp');
  if(!root)return;
  root.innerHTML='<div class="av-catalog">'+
    '<div class="av-lead"><span class="av-star">✦</span><h2>Выбери приключение</h2><p>Испытания для одного, пары и компании. Без регистрации участников.</p></div>'+
    ((adventureView.type==='all'||adventureView.type==='story') && adventureView.status==='all' && adventureView.access!=='premium' ? weeklyOfferHtml() : '')+
    '<label class="av-search-label" for="adventureSearch">Поиск приключений</label>'+
    '<input id="adventureSearch" class="av-search" type="search" maxlength="80" placeholder="Название или жанр..." value="'+adventureEscape(adventureView.query)+'">'+
    '<div class="av-filters">'+
      adventureFilterSelect('type','Тип',[['all','Все'],['quick','Быстрые'],['story','Истории']])+
      adventureFilterSelect('mode','Игроки',[['all','Все'],['solo','Один'],['duo','Пара'],['group','Компания']])+
      adventureFilterSelect('difficulty','Сложность',[['all','Любая'],['easy','Легко'],['medium','Средне'],['hard','Сложно']])+
      adventureFilterSelect('duration','Время',[['all','Любое'],['short','До 10 мин'],['medium','11–25 мин'],['long','От 26 мин']])+
      adventureFilterSelect('access','Доступ',[['all','Любой'],['free','Бесплатно'],['premium','Премиум']])+
      adventureFilterSelect('status','Статус',[['all','Все'],['progress','Продолжить'],['done','Пройденные'],['favorites','Избранное']])+
    '</div><div class="av-count" id="adventureCount"></div><div class="av-grid" id="adventureResults"></div></div>';
  renderAdventureCards();
}
function renderAdventureCards(){
  const list=document.getElementById('adventureResults');
  if(!list || adventureView.page!=='catalog')return;
  const items=adventureCatalogItems();
  document.getElementById('adventureCount').textContent=items.length+' '+plural(items.length,'приключение','приключения','приключений')+' найдено';
  if(!items.length){
    list.innerHTML='<div class="av-empty">Ничего не найдено. Измени фильтры или поисковый запрос.</div>';
    return;
  }
  list.innerHTML=items.map(({kind,item})=>{
    const fav=adventureFavorites.ids.includes(item.id);
    const status=adventureStatus(kind,item.id);
    const premium=kind==='story' && item.premium;
    const label=kind==='quick'?'Испытание':'История';
    const state=status==='progress'?'В процессе':status==='done'?'Пройдено':premium?'Премиум':'Бесплатно';
    return '<article class="av-card">'+
      '<div class="av-card-top"><span class="av-type">'+label+'</span>'+
      '<button class="av-fav'+(fav?' is-fav':'')+'" data-av-action="favorite" data-kind="'+kind+'" data-id="'+item.id+'" aria-label="'+(fav?'Убрать из избранного':'Добавить в избранное')+'" aria-pressed="'+fav+'">'+(fav?'★':'☆')+'</button></div>'+
      '<h3>'+adventureEscape(item.title)+'</h3>'+
      '<p>'+adventureEscape(kind==='story'?item.description:item.text)+'</p>'+
      '<div class="av-tags"><span>'+ADVENTURE_MODES[item.mode]+'</span><span>'+item.minutes+' мин</span><span>'+ADVENTURE_DIFFICULTIES[item.difficulty]+'</span></div>'+
      '<div class="av-card-bottom"><span class="av-status'+(premium?' av-premium':'')+'">'+(premium && status==='new'?'✦ ':'')+state+'</span>'+
      '<button class="av-open" data-av-action="open" data-kind="'+kind+'" data-id="'+item.id+'">'+(status==='progress'?'Продолжить':'Открыть')+'</button></div>'+
    '</article>';
  }).join('');
}
function adventureDetailHeader(title,subtitle){
  return '<div class="av-detail-head"><button type="button" class="av-back" data-av-action="back">← Каталог</button>'+
    '<div class="av-detail-title"><h2>'+adventureEscape(title)+'</h2><p>'+adventureEscape(subtitle)+'</p></div></div>';
}
function adventureOpen(kind,id){
  if(kind==='quick' && !adventureQuickById(id))return;
  if(kind==='story' && !adventureStoryById(id))return;
  adventureView.page='detail';adventureView.kind=kind;adventureView.id=id;
  adventureView.skipOpen=false;adventureView.confirmRestart=false;
  renderAdventures();
}
function adventureBack(){
  adventureView.page='catalog';adventureView.kind=null;adventureView.id=null;
  adventureView.skipOpen=false;adventureView.confirmRestart=false;
  renderAdventures();
}
function renderAdventureQuick(quick){
  const record=adventureQuickResults.done[quick.id];
  return adventureDetailHeader(quick.title,'Быстрое испытание · '+ADVENTURE_MODES[quick.mode])+
    '<div class="av-story-shell"><div class="av-step-kicker">'+adventureEscape(quick.genre)+' · '+quick.minutes+' мин</div>'+
    '<p class="av-step-text">'+adventureEscape(quick.text)+'</p>'+
    (record?'<p class="av-note">Уже выполнено: '+record.count+' '+plural(record.count,'раз','раза','раз')+'. Можно повторить.</p>':'')+
    '<div class="av-actions"><button class="av-primary" data-av-action="quick-done">Выполнил</button>'+
    '<button class="av-secondary" data-av-action="back">Не сейчас</button></div>'+
    '<p class="av-footnote">Выполнение подтверждается твоим нажатием. Q за него не начисляются.</p></div>';
}
function adventureStartStory(story){
  if(adventureIsPremiumLocked(story)){ showToast('Покупки премиальных историй подключим на этапе 4'); return; }
  if(!weeklyCanAccess(story)){ showToast('Открой историю в подборке недели'); return; }
  const p=adventureStoryProgress[story.id];
  if(p.active && story.nodes[p.node] && story.nodes[p.node].type!=='ending'){
    adventureView.page='play';adventureView.skipOpen=false;
    renderAdventures();return;
  }
  p.node=story.start;p.path=[];p.active=true;p.startedAt=adventureNow();
  adventureWrite(adventureProgressKey(story.id),p);
  adventureView.page='play';adventureView.skipOpen=false;adventureView.confirmRestart=false;
  renderAdventures();
}
function adventureRestartStory(story){
  if(adventureIsPremiumLocked(story) || !weeklyCanAccess(story))return;
  if(adventureView.page==='play' && !adventureView.confirmRestart){
    adventureView.confirmRestart=true;renderAdventures();return;
  }
  const p=adventureStoryProgress[story.id];
  p.node=story.start;p.path=[];p.active=true;p.startedAt=adventureNow();
  adventureWrite(adventureProgressKey(story.id),p);
  adventureView.confirmRestart=false;adventureView.skipOpen=false;
  adventureView.page='play';renderAdventures();
}
function renderAdventureStoryPreview(story){
  const p=adventureStoryProgress[story.id];
  const locked=adventureIsPremiumLocked(story) || !weeklyCanAccess(story);
  const endings=p.endings.map(id=>story.nodes[id].title).join(', ');
  return adventureDetailHeader(story.title,story.genre+' · '+ADVENTURE_MODES[story.mode])+
    '<div class="av-story-shell">'+
    '<div class="av-tags"><span>'+story.minutes+' мин</span><span>'+ADVENTURE_DIFFICULTIES[story.difficulty]+'</span>'+
    '<span>'+(story.premium?'Премиум · голоса VK':weeklyStoryOfferLabel(story))+'</span></div>'+
    '<p class="av-step-text">'+adventureEscape(story.description)+'</p>'+
    '<p class="av-note">История из нескольких этапов с выборами и двумя концовками. Действия выполняются в реальной жизни и подтверждаются кнопкой.</p>'+
    (p.runs?'<p class="av-note">Пройдено '+p.runs+' '+plural(p.runs,'раз','раза','раз')+'. Открытые концовки: '+adventureEscape(endings)+'.</p>':'')+
    (locked?weeklyUnlockPanel(story):
    '<div class="av-actions"><button class="av-primary" data-av-action="start">'+(p.active?'Продолжить':p.runs?'Пройти снова':'Начать')+'</button>'+
    '<button class="av-secondary" data-av-action="back">К библиотеке</button></div>')+
    '</div>';
}
function adventureStepHistory(story,p){
  if(!p.path.length && !p.endings.length)return '';
  const history=p.path.map((entry,index)=>{
    const node=story.nodes[entry.id];
    const note=entry.kind==='skipped'?'Пропущено':entry.kind==='choice'?'Решение':'Выполнено';
    const choice=entry.kind==='choice' && node.options && node.options[entry.choice] ? ': '+node.options[entry.choice].label : '';
    return '<li><span>'+String(index+1)+'. '+adventureEscape(node.title)+'</span><p>'+adventureEscape(node.text)+'</p><small>'+note+adventureEscape(choice)+'</small></li>';
  }).join('');
  const endings=p.endings.map(id=>'<li><span>'+adventureEscape(story.nodes[id].title)+'</span><small>Открыта концовка</small></li>').join('');
  return '<details class="av-history"><summary>История прохождения ('+p.path.length+')</summary><ol>'+history+endings+'</ol></details>';
}
function renderAdventurePlaying(story){
  const p=adventureStoryProgress[story.id];
  const node=story.nodes[p.node];
  if(!p.active && node.type!=='ending'){
    adventureView.page='detail';return renderAdventureStoryPreview(story);
  }
  const count=p.path.length;
  let body=adventureDetailHeader(story.title,'Сюжетное приключение · '+ADVENTURE_MODES[story.mode]);
  body+='<div class="av-story-shell"><div class="av-step-kicker">'+(node.type==='ending'?'Финал':'Этап '+(count+1))+'</div>';
  body+='<h3>'+adventureEscape(node.title)+'</h3><p class="av-step-text">'+adventureEscape(node.text)+'</p>';
  if(node.type==='ending'){
    body+='<p class="av-note">Приключение завершено. Открыто концовок: '+p.endings.length+' из 2.</p>'+
      '<div class="av-actions"><button class="av-primary" data-av-action="replay">Пройти ещё раз</button>'+
      '<button class="av-secondary" data-av-action="back">К библиотеке</button></div>';
  }else if(node.type==='choice'){
    body+='<div class="av-choice-hint">Выбери, как продолжится история:</div><div class="av-actions">'+
      node.options.map((o,i)=>'<button class="av-choice" data-av-action="choice" data-choice="'+i+'">'+adventureEscape(o.label)+'</button>').join('')+
      '<button class="av-secondary" data-av-action="pause">Отложить</button></div>';
  }else{
    const price=ADVENTURE_SKIP_PRICES[node.difficulty]||200;
    body+='<div class="av-actions"><button class="av-primary" data-av-action="done"'+(adventureBusy?' disabled':'')+'>Выполнил</button>'+
      '<button class="av-secondary" data-av-action="ask-skip"'+(adventureBusy?' disabled':'')+'>Пропустить</button>'+
      '<button class="av-secondary" data-av-action="pause">Отложить</button></div>';
    if(adventureView.skipOpen){
      body+='<div class="av-skip-panel"><strong>Пропустить этап?</strong><p>Стоимость: '+price+' Q или один подтверждённый просмотр рекламы. Пропуск не считается выполнением.</p>'+
      '<div class="av-actions"><button class="av-primary" data-av-action="skip-q"'+(adventureBusy||balance<price?' disabled':'')+'>За '+price+' Q</button>'+
      '<button class="av-secondary" data-av-action="skip-ad"'+(adventureBusy?' disabled':'')+'>Смотреть рекламу</button>'+
      '<button class="av-secondary" data-av-action="cancel-skip">Отмена</button></div></div>';
    }
  }
  if(adventureView.confirmRestart){
    body+='<div class="av-skip-panel"><strong>Начать сначала?</strong><p>Текущие решения будут сброшены. Ранее открытые концовки сохранятся.</p>'+
      '<div class="av-actions"><button class="av-primary" data-av-action="confirm-restart">Да, начать заново</button>'+
      '<button class="av-secondary" data-av-action="cancel-restart">Отмена</button></div></div>';
  }
  if(node.type!=='ending') body+='<button class="av-restart" data-av-action="replay">↻ Начать историю заново</button>';
  body+=adventureStepHistory(story,p);
  return body+'</div>';
}
function renderAdventures(){
  const root=document.getElementById('adventureApp');
  if(!root || !adventureInitialized)return;
  if(adventureView.page==='catalog'){renderAdventureCatalog();return;}
  const kind=adventureView.kind,id=adventureView.id;
  const item=kind==='story'?adventureStoryById(id):adventureQuickById(id);
  if(!item){adventureBack();return;}
  if(kind==='quick') root.innerHTML=renderAdventureQuick(item);
  else if(adventureView.page==='play') root.innerHTML=renderAdventurePlaying(item);
  else root.innerHTML=renderAdventureStoryPreview(item);
}
function adventureCommitStep(story,kind,next,choiceIndex){
  const p=adventureStoryProgress[story.id];
  const node=story.nodes[p.node];
  if(!p.active || !node || !story.nodes[next] || kind==='choice' && node.type!=='choice') return;
  if(kind==='choice'){
    if(!Number.isInteger(choiceIndex)||!node.options[choiceIndex]||node.options[choiceIndex].next!==next)return;
  }else if(node.type!=='task'||node.next!==next)return;
  p.path.push({id:p.node,kind,choice:kind==='choice'?choiceIndex:null,at:adventureNow()});
  p.node=next;
  const ending=story.nodes[next];
  if(ending.type==='ending'){
    p.runs+=1;p.active=false;p.lastEnd=next;
    if(!p.endings.includes(next))p.endings.push(next);
  }
  adventureWrite(adventureProgressKey(story.id),p);
  adventureView.skipOpen=false;adventureView.confirmRestart=false;
  renderAdventures();
}
function adventureCompleteQuick(){
  const q=adventureQuickById(adventureView.id);
  if(!q)return;
  const entry=adventureQuickResults.done[q.id]||{count:0,last:0};
  entry.count+=1;entry.last=adventureNow();
  adventureQuickResults.done[q.id]=entry;
  adventureWrite(ADVENTURE_QUICK_KEY,adventureQuickResults);
  showToast('Испытание отмечено как выполненное');
  renderAdventures();
}
async function adventureSkip(method){
  if(adventureBusy || adventureView.kind!=='story' || adventureView.page!=='play')return;
  const story=adventureStoryById(adventureView.id);
  if(!story || adventureIsPremiumLocked(story) || !weeklyCanAccess(story))return;
  const p=adventureStoryProgress[story.id];
  const node=p && story.nodes[p.node];
  if(!p.active||!node||node.type!=='task')return;
  const nodeId=p.node,price=ADVENTURE_SKIP_PRICES[node.difficulty]||200;
  adventureBusy=true;renderAdventures();
  try{
    if(method==='ad'){
      const result=await requestRewardedAd('Посмотреть рекламу и пропустить этот этап?');
      if(result!=='success'){
        showToast(result==='error'?'Реклама недоступна':'Пропуск отменён');
        return;
      }
    } else if(method!=='q') return;
    // Another event or VK state sync must not charge a different stage.
    if(p.node!==nodeId || !p.active || adventureView.id!==story.id)return;
    if(method==='q'){
      if(!Number.isFinite(balance) || balance<price){showToast('Недостаточно Q');return;}
      balance-=price;
      saveBalance();updateBalanceUI();updateMiningUI();
    }
    adventureCommitStep(story,'skipped',node.next,null);
    showToast('Этап пропущен'+(method==='q'?' за '+price+' Q':' за просмотр рекламы'));
  }catch(e){
    console.warn('[Adventure skip]',e);
    showToast('Не удалось пропустить этап');
  }finally{
    adventureBusy=false;
    renderAdventures();
  }
}
function adventureClick(event){
  const btn=event.target.closest('button[data-av-action]');
  if(!btn || !document.getElementById('adventureApp').contains(btn))return;
  const act=btn.dataset.avAction;
  if(adventureBusy)return;
  if(act==='back'||act==='pause'){adventureBack();return;}
  if(act==='open'){adventureOpen(btn.dataset.kind,btn.dataset.id);return;}
  if(act==='weekly-reroll'){weeklyReroll();return;}
  if(act==='favorite'){
    const id=btn.dataset.id;
    if(!adventureQuickById(id) && !adventureStoryById(id))return;
    const ids=adventureFavorites.ids;
    adventureFavorites.ids=ids.includes(id)?ids.filter(x=>x!==id):ids.concat(id);
    adventureWrite(ADVENTURE_FAV_KEY,adventureFavorites);renderAdventureCards();return;
  }
  if(act==='quick-done'){adventureCompleteQuick();return;}
  const story=adventureStoryById(adventureView.id);
  if(!story||adventureIsPremiumLocked(story))return;
  if(act==='weekly-free'){
    if(weeklyClaim(story)) adventureStartStory(story);
    else showToast('Бесплатное приключение на эту неделю уже выбрано');
    return;
  }
  if(act==='weekly-buy'){
    if(weeklyBuy(story)) adventureStartStory(story);
    return;
  }
  const p=adventureStoryProgress[story.id];
  if(act==='start'){adventureStartStory(story);return;}
  if(act==='replay'){adventureRestartStory(story);return;}
  if(act==='cancel-restart'){adventureView.confirmRestart=false;renderAdventures();return;}
  if(act==='confirm-restart'){adventureRestartStory(story);return;}
  if(adventureView.page!=='play'||!p.active)return;
  const node=story.nodes[p.node];
  if(act==='choice' && node.type==='choice'){
    const index=Number(btn.dataset.choice);
    if(Number.isInteger(index)&&node.options[index]) adventureCommitStep(story,'choice',node.options[index].next,index);
  }else if(act==='done'&&node.type==='task'){
    adventureCommitStep(story,'done',node.next,null);
  }else if(act==='ask-skip'&&node.type==='task'){
    adventureView.skipOpen=true;renderAdventures();
  }else if(act==='cancel-skip'){
    adventureView.skipOpen=false;renderAdventures();
  }else if(act==='skip-q'||act==='skip-ad'){
    if(node.type==='task' && adventureView.skipOpen) adventureSkip(act==='skip-q'?'q':'ad');
  }
}
