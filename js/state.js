/* ============================================================
   STORAGE QUEUE
   ============================================================ */
const pendingSaves = new Map();
let saveTimer = null;
let saveInFlight = false;

function queueStorageSet(key, value){
  pendingSaves.set(key, String(value));
  scheduleFlush();
}
function scheduleFlush(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, 700);
}
async function flushSaves(){
  saveTimer = null;
  if(saveInFlight){ scheduleFlush(); return; }
  if(pendingSaves.size === 0) return;
  saveInFlight = true;
  const entries = [...pendingSaves.entries()];
  pendingSaves.clear();
  entries.forEach(([key, value]) => {
    try{ localStorage.setItem('g_'+key, value); }catch(e){}
  });
  if(vkBridge){
    for(const [key, value] of entries){
      try{ await vkSend('VKWebAppStorageSet', {key, value}); }
      catch(e){}
    }
  }
  saveInFlight = false;
  if(pendingSaves.size > 0) scheduleFlush();
}
function flushSavesSync(){
  pendingSaves.forEach((value, key) => {
    try{ localStorage.setItem('g_'+key, value); }catch(e){}
  });
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden'){ flushSavesSync(); flushSaves(); }
});
window.addEventListener('pagehide', () => { flushSavesSync(); flushSaves(); });

async function storageGetMultiple(keys){
  const result = {};
  let vkResponded = false;
  if(vkBridge){
    try{
      const r = await vkSend('VKWebAppStorageGet', { keys });
      (r && r.keys || []).forEach(k => { result[k.key] = k.value; });
      vkResponded = true;
    }catch(e){}
  }
  if(vkResponded){
    keys.forEach(k => {
      if(result[k] == null || result[k] === ''){
        try{
          const local = localStorage.getItem('g_'+k);
          result[k] = local !== null ? local : (result[k] || '');
        }catch(e){result[k] = result[k] || '';}
      }
    });
    return result;
  }
  keys.forEach(k => {
    try{
      const ls = localStorage.getItem('g_'+k);
      result[k] = (ls !== null && ls !== undefined) ? ls : (localStorage.getItem(k) || '');
    }catch(e){ result[k] = ''; }
  });
  return result;
}

/* ============================================================
   DOM
   ============================================================ */
const taskEl=document.getElementById('task');
const taskWrap=document.getElementById('taskWrap');
const progressEl=document.getElementById('progress');
const tabsEl=document.getElementById('tabs');
const rerollBtn=document.getElementById('rerollBtn');
const rerollLbl=document.getElementById('rerollLbl');
const taskActions=document.getElementById('taskActions');
const btnDone=document.getElementById('btnDone');
const btnSkip=document.getElementById('btnSkip');
const taskStatus=document.getElementById('taskStatus');
const balanceValueEl=document.getElementById('balanceValue');
const streakValueEl=document.getElementById('streakValue');
const giftBtn=document.getElementById('giftBtn');
const bottomNav=document.getElementById('bottomNav');
const screens=document.querySelectorAll('.screen');

/* ============================================================
   STATE
   ============================================================ */
let appReady=false;
let currentCategory='normal';
let unlocked={hard:false};
let filmEl=null;
let lastRenderedDay=dateKey();

const usedToday={normal:new Set(), hard:new Set()};
let rerollsToday = 0;
let bonusRerolls = 0;
let bonusRerollsDay = '';
let taskMode = 'all';
let personalGoals = [];
let goalsFinished = 0;

let balance = 0;
let streak = 0;
let bestStreak = 0;
let totalDone = 0;
let totalHardDone = 0;
let lastDailyClaim = '';
let lastCompleteDate = '';
let sharedOnce = false;

let ownedThemes = ['classic'];
let currentTheme = 'classic';
let ownedFrames = ['none'];
let currentFrame = 'none';

let history = [];
let userPhoto = '';
let userName = 'Игрок 360';

/* Добыча */
let mining = {
  level: 1,
  lastTick: Date.now(),
  bonusEnd: 0,
  bonusStart: 0
};

const dailyState = {
  normal: { idx: -1, revealed: false, done: false, skipped: false },
  hard:   { idx: -1, revealed: false, done: false, skipped: false }
};

function stateKey(){ return 'state_' + dateKey(); }
function unlocksKey(){ return 'unlocks_' + dateKey(); }

/* ============================================================
   SAVE
   ============================================================ */
function saveDailyState(){
  const obj = {};
  ['normal','hard'].forEach(cat => {
    obj[cat] = {
      idx: dailyState[cat].idx,
      revealed: dailyState[cat].revealed,
      done: dailyState[cat].done,
      skipped: dailyState[cat].skipped,
      used: [...usedToday[cat]]
    };
  });
  queueStorageSet(stateKey(), JSON.stringify(obj));
}
function saveRerollsToday(){ queueStorageSet('rerolls_' + dateKey(), String(rerollsToday)); }
function saveUnlocks(){ return queueStorageSet(unlocksKey(), JSON.stringify({hard: !!unlocked.hard})); }
function saveBonusRerolls(){
  bonusRerollsDay=dateKey();
  queueStorageSet('bonus_rerolls', String(bonusRerolls));
  queueStorageSet('bonus_rerolls_day', bonusRerollsDay);
}
function saveBalance(){ queueStorageSet('balance', String(balance)); }
function saveStreak(){ queueStorageSet('streak', String(streak)); }
function saveBestStreak(){ queueStorageSet('best_streak', String(bestStreak)); }
function saveTotalDone(){ queueStorageSet('total_done', String(totalDone)); }
function saveTotalHardDone(){ queueStorageSet('total_hard_done', String(totalHardDone)); }
function saveLastDailyClaim(){ queueStorageSet('last_daily_claim', lastDailyClaim); }
function saveLastCompleteDate(){ queueStorageSet('last_complete_date', lastCompleteDate); }
function saveSharedOnce(){ queueStorageSet('shared_once', sharedOnce ? '1' : '0'); }
function saveOwnedThemes(){ queueStorageSet('owned_themes', JSON.stringify(ownedThemes)); }
function saveCurrentTheme(){ queueStorageSet('current_theme', currentTheme); }
function saveOwnedFrames(){ queueStorageSet('owned_frames', JSON.stringify(ownedFrames)); }
function saveCurrentFrame(){ queueStorageSet('current_frame', currentFrame); }
function saveHistory(){ queueStorageSet('history', JSON.stringify(history.slice(-HISTORY_MAX))); }
function saveTaskMode(){ queueStorageSet('task_mode', taskMode); }
function saveGoals(){ queueStorageSet('personal_goals', JSON.stringify(personalGoals)); }
function saveGoalsFinished(){ queueStorageSet('goals_finished', String(goalsFinished)); }
function saveMining(){
  queueStorageSet('mining', JSON.stringify({
    level: mining.level,
    lastTick: mining.lastTick,
    bonusEnd: mining.bonusEnd,
    bonusStart: mining.bonusStart
  }));
}

/* ============================================================
   PARSERS
   ============================================================ */
function isUnlocked(cat){
  if(cat === 'normal') return true;
  return !!unlocked[cat];
}
function applyStateJson(raw){
  ['normal','hard'].forEach(cat => {
    dailyState[cat] = { idx: -1, revealed: false, done: false, skipped: false };
  });
  usedToday.normal.clear();
  usedToday.hard.clear();
  if(!raw) return;
  try{
    const parsed = JSON.parse(raw);
    ['normal','hard'].forEach(cat => {
      if(parsed[cat]){
        dailyState[cat].idx = (typeof parsed[cat].idx === 'number') ? parsed[cat].idx : -1;
        dailyState[cat].revealed = !!parsed[cat].revealed;
        dailyState[cat].done = !!parsed[cat].done;
        dailyState[cat].skipped = !!parsed[cat].skipped;
        if(dailyState[cat].idx >= 0) usedToday[cat].add(dailyState[cat].idx);
        if(Array.isArray(parsed[cat].used)){
          parsed[cat].used.forEach(i => { if(typeof i === 'number') usedToday[cat].add(i); });
        }
      }
    });
  }catch(e){}
}
function applyRerollsRaw(raw){
  rerollsToday = raw ? parseInt(raw, 10) : 0;
  if(isNaN(rerollsToday) || rerollsToday < 0) rerollsToday = 0;
}
function applyUnlocksRaw(raw){
  unlocked.hard = false;
  if(!raw) return;
  try{
    const parsed = JSON.parse(raw);
    if(parsed && typeof parsed === 'object') unlocked.hard = parsed.hard === true;
  }catch(e){}
}
function applyMiningRaw(raw){
  try{
    if(!raw){
      mining = { level:1, lastTick: Date.now(), bonusEnd:0, bonusStart:0 };
      return;
    }
    const p = JSON.parse(raw);
    mining.level = Math.max(1, parseInt(p.level, 10) || 1);
    mining.lastTick = parseInt(p.lastTick, 10) || Date.now();
    mining.bonusEnd = parseInt(p.bonusEnd, 10) || 0;
    // если bonusStart не сохранён (старые данные) — считаем его = bonusEnd - BOOST_MS
    mining.bonusStart = parseInt(p.bonusStart, 10) || Math.max(0, mining.bonusEnd - MINING_BOOST_MS);
    // защита от часов из будущего
    if(mining.lastTick > Date.now() + 60000) mining.lastTick = Date.now();
    if(mining.bonusEnd > Date.now() + MINING_BOOST_MS + 60000) mining.bonusEnd = 0;
  }catch(e){
    mining = { level:1, lastTick: Date.now(), bonusEnd:0, bonusStart:0 };
  }
}
function parseIntSafe(raw, fallback){ const n = parseInt(raw, 10); return isNaN(n) ? fallback : n; }

