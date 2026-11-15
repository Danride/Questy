/* Questy: weekly story offers. Exactly one free selection and two Q slots.
 * Not a payment authority: true currency/purchase validation requires server.
 * Existing started/completed stories remain accessible after offer refresh. */
const WEEKLY_STORIES_KEY='questy_weekly_stories_v1';
const WEEKLY_Q_OWNED_KEY='questy_weekly_q_owned_v1';
const WEEKLY_STORY_PRICE=200;
let weeklyStories={v:1,week:'',slots:[],freeClaimed:null,rerolls:0,updatedAt:0};
let weeklyQOwned={v:1,ids:[],updatedAt:0};
let weeklyBusy=false;

function weeklyKey(){
  const parts=dateKey().split('-').map(Number);
  const d=new Date(parts[0],parts[1]-1,parts[2]);
  d.setDate(d.getDate()-(d.getDay()+6)%7); // Monday, local calendar
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function weeklyEligible(){
  return QUESTY_STORIES.filter(s=>!s.premium);
}
function weeklyHash(input){
  let hash=2166136261>>>0;
  for(let i=0;i<input.length;i++) {hash^=input.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
function weeklyOfferIds(week,rerolls,previous=[]){
  const pool=weeklyEligible();
  let candidates=pool.filter(s=>!previous.includes(s.id));
  if(candidates.length<3)candidates=pool;
  const order=candidates.slice().sort((a,b)=>{
    const hA=weeklyHash(week+':'+rerolls+':'+a.id);
    const hB=weeklyHash(week+':'+rerolls+':'+b.id);
    return hA-hB || a.id.localeCompare(b.id);
  });
  return order.slice(0,3).map(s=>s.id);
}
function weeklySanitize(data){
  if(!data||typeof data!=='object')return null;
  if(typeof data.week!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.week))return null;
  const valid=new Set(weeklyEligible().map(s=>s.id));
  const slots=Array.isArray(data.slots)?data.slots.filter(id=>valid.has(id)):[];
  if(slots.length!==3||new Set(slots).size!==3)return null;
  const rerolls=Math.max(0,Math.min(10000,Math.floor(Number(data.rerolls)||0)));
  return {v:1,week:data.week,slots,freeClaimed:valid.has(data.freeClaimed)?data.freeClaimed:null,
    rerolls,updatedAt:Math.max(0,Number(data.updatedAt)||0)};
}
function weeklySanitizeOwned(data){
  const valid=new Set(weeklyEligible().map(s=>s.id));
  const ids=data && Array.isArray(data.ids) ? [...new Set(data.ids.filter(id=>valid.has(id)))]:[];
  return {v:1,ids,updatedAt:Math.max(0,Number(data&&data.updatedAt)||0)};
}
function weeklyApplyRecord(key,raw){
  let data=null;
  try{data=JSON.parse(raw);}catch(e){return;}
  if(key===WEEKLY_STORIES_KEY){
    const clean=weeklySanitize(data);
    if(clean) weeklyStories=clean;
  }else if(key===WEEKLY_Q_OWNED_KEY){
    weeklyQOwned=weeklySanitizeOwned(data);
  }
}
function weeklyRecordFor(key){
  return key===WEEKLY_STORIES_KEY?weeklyStories:weeklyQOwned;
}
function weeklyReadLocal(){
  for(const key of [WEEKLY_STORIES_KEY,WEEKLY_Q_OWNED_KEY]){
    try{const raw=localStorage.getItem('g_'+key);if(raw)weeklyApplyRecord(key,raw);}
    catch(e){}
  }
  weeklyEnsureCurrent();
}
function weeklyEnsureCurrent(){
  const week=weeklyKey();
  if(weeklyStories.week===week && weeklyStories.slots.length===3)return;
  // A new week starts fresh. Nothing is removed from completed/purchased stories.
  weeklyStories={v:1,week,slots:weeklyOfferIds(week,0),freeClaimed:null,rerolls:0,updatedAt:0};
}
function weeklySlot(id){
  weeklyEnsureCurrent();
  return weeklyStories.slots.indexOf(id); // 0 is free offer, 1 and 2 cost Q
}
function weeklyCanAccess(story){
  if(!story||story.premium)return false; // Voices purchases not implemented yet
  weeklyEnsureCurrent();
  if(weeklyQOwned.ids.includes(story.id))return true;
  if(weeklyStories.freeClaimed===story.id)return true;
  const p=adventureStoryProgress[story.id];
  return !!(p && (p.active || p.runs>0));
}
function weeklyStoryOfferLabel(story){
  if(weeklyQOwned.ids.includes(story.id))return 'Куплено за Q';
  if(weeklyCanAccess(story))return 'Доступно';
  const index=weeklySlot(story.id);
  if(index===0)return weeklyStories.freeClaimed?'Бесплатный выбор использован':'Бесплатно';
  if(index===1||index===2)return WEEKLY_STORY_PRICE+' Q';
  return 'Нет в подборке';
}
function weeklyClaim(story){
  if(!story || story.premium || weeklyBusy)return false;
  weeklyEnsureCurrent();
  if(weeklyCanAccess(story))return true;
  if(weeklySlot(story.id)!==0 || weeklyStories.freeClaimed)return false;
  weeklyStories.freeClaimed=story.id;
  adventureWrite(WEEKLY_STORIES_KEY,weeklyStories);
  return true;
}
function weeklyBuy(story){
  if(!story||story.premium||weeklyBusy)return false;
  weeklyEnsureCurrent();
  if(weeklyCanAccess(story))return true;
  if(![1,2].includes(weeklySlot(story.id)))return false;
  if(!Number.isFinite(balance)||balance<WEEKLY_STORY_PRICE){
    showToast('Не хватает Q для открытия истории');
    return false;
  }
  weeklyBusy=true;
  try{
    balance-=WEEKLY_STORY_PRICE;
    weeklyQOwned.ids.push(story.id);
    adventureWrite(WEEKLY_Q_OWNED_KEY,weeklyQOwned);
    saveBalance();updateBalanceUI();updateMiningUI();
    showToast('История куплена за '+WEEKLY_STORY_PRICE+' Q — доступ навсегда');
    return true;
  }finally{weeklyBusy=false;}
}
async function weeklyReroll(){
  if(weeklyBusy||adventureBusy)return false;
  weeklyEnsureCurrent();
  const oldWeek=weeklyStories.week,oldSlots=weeklyStories.slots.slice();
  weeklyBusy=true;adventureBusy=true;
  try{
    const result=await requestRewardedAd('Посмотреть рекламу и обновить три приключения на этой неделе? Бесплатный выбор не восстанавливается.');
    if(result!=='success'){
      showToast(result==='error'?'Реклама недоступна':'Обновление отменено');
      return false;
    }
    weeklyEnsureCurrent();
    if(weeklyStories.week!==oldWeek){showToast('Наступила новая неделя — список уже обновлён');return false;}
    if(oldSlots.join('|')!==weeklyStories.slots.join('|'))return false;
    weeklyStories.rerolls++;
    weeklyStories.slots=weeklyOfferIds(weeklyStories.week,weeklyStories.rerolls,oldSlots);
    // Deliberately preserve weeklyStories.freeClaimed.
    adventureWrite(WEEKLY_STORIES_KEY,weeklyStories);
    showToast('Тройка приключений обновлена');
    return true;
  }catch(e){console.warn('[Weekly stories reroll]',e);showToast('Не удалось обновить приключения');return false;}
  finally{weeklyBusy=false;adventureBusy=false;renderAdventures();}
}
function weeklyUnlockPanel(story){
  if(story.premium)return '<div class="av-locked"><strong>Платное приключение</strong><p>Подключим покупки голосами VK на четвёртом этапе. Сейчас оплата недоступна.</p></div>';
  if(weeklyCanAccess(story))return '';
  const slot=weeklySlot(story.id);
  if(slot===0 && !weeklyStories.freeClaimed){
    return '<div class="av-locked"><strong>Бесплатный выбор недели</strong><p>Один сюжет можно открыть бесплатно раз в неделю.</p>'+
      '<button class="av-primary" data-av-action="weekly-free">Открыть бесплатно</button></div>';
  }
  if(slot===1||slot===2){
    return '<div class="av-locked"><strong>Приключение за '+WEEKLY_STORY_PRICE+' Q</strong>'+
      '<p>История откроется навсегда. Покупка не заменяет оплату премиальных историй голосами VK.</p>'+
      '<button class="av-primary" data-av-action="weekly-buy">Купить за '+WEEKLY_STORY_PRICE+' Q</button></div>';
  }
  return '<div class="av-locked"><strong>Недоступно на этой неделе</strong>'+
    '<p>'+(slot===0?'Бесплатное приключение на эту неделю уже выбрано.':'Эта история сейчас не входит в еженедельную тройку.')+
    ' Можно дождаться новой недели или обновить предложения за рекламу.</p></div>';
}
function weeklyOfferHtml(){
  weeklyEnsureCurrent();
  const items=weeklyStories.slots.map((id,index)=>{
    const story=adventureStoryById(id);
    const status=weeklyStoryOfferLabel(story);
    const locked=index===0 && weeklyStories.freeClaimed && !weeklyCanAccess(story);
    return '<article class="weekly-card">'+
      '<div class="weekly-card-top"><span>'+(index===0?'БЕСПЛАТНЫЙ ВЫБОР':'ЗА Q')+'</span><span class="weekly-index">0'+(index+1)+'</span></div>'+
      '<h3>'+adventureEscape(story.title)+'</h3><p>'+adventureEscape(story.description)+'</p>'+
      '<div class="av-tags"><span>'+ADVENTURE_MODES[story.mode]+'</span><span>'+story.minutes+' мин</span></div>'+
      '<div class="weekly-card-bottom"><span>'+adventureEscape(status)+'</span>'+
      '<button class="av-open" data-av-action="open" data-kind="story" data-id="'+story.id+'"'+(locked?' disabled':'')+'>'+
      (weeklyCanAccess(story)?'Продолжить / открыть':locked?'Недоступно':index===0?'Выбрать':'Открыть')+
      '</button></div></article>';
  }).join('');
  const claimed=weeklyStories.freeClaimed ? 'Бесплатная история на этой неделе уже выбрана.' : 'Одну историю можно выбрать бесплатно на этой неделе.';
  return '<section class="weekly-offers" aria-labelledby="weeklyOffersHeading">'+
    '<div class="weekly-heading"><div><span class="weekly-eyebrow">НА ЭТУ НЕДЕЛЮ</span>'+
    '<h2 id="weeklyOffersHeading">Три приключения</h2><p>'+claimed+' Остальные две можно купить за '+WEEKLY_STORY_PRICE+' Q каждую.</p></div>'+
    '<button class="weekly-reroll" data-av-action="weekly-reroll"'+(weeklyBusy?' disabled':'')+'>↻ Сменить за рекламу</button></div>'+
    '<div class="weekly-grid">'+items+'</div></section>';
}
