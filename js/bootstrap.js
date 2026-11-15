/* ============================================================
   VIEW RESTORE
   ============================================================ */
function initViewRestoreSync(){
  if(!vkBridge) return;
  vkBridge.subscribe((event) => {
    if(!event.detail || event.detail.type !== 'VKWebAppViewRestore') return;

    const prevDay = lastRenderedDay;
    const prevIdx = dailyState[currentCategory].idx;
    const prevRevealed = dailyState[currentCategory].revealed;
    const prevDone = dailyState[currentCategory].done;
    const prevRerolls = rerollsToday;

    loadProgress().then(() => {
      const dayChanged = dateKey() !== prevDay;
      if(dayChanged){
        lastRenderedDay = dateKey();
        switchCategory(currentCategory);
      } else if(
        dailyState[currentCategory].idx !== prevIdx ||
        dailyState[currentCategory].revealed !== prevRevealed ||
        dailyState[currentCategory].done !== prevDone
      ){
        switchCategory(currentCategory);
      } else if(rerollsToday !== prevRerolls){
        updateRerollUI();
      }
      updateMiningUI();
      const active = document.querySelector('.screen.active');
      if(active && active.dataset.screen === 'mining') renderMining();
    });
  });
}

/* Смена дня без перезапуска мини-приложения. */
let daySyncing = false;
async function checkDayChange(){
  if(!appReady || daySyncing || lastRenderedDay === dateKey()) return;
  daySyncing=true;
  lastRenderedDay=dateKey();
  try{
    applyStateJson('');
    applyRerollsRaw('');
    applyUnlocksRaw('');
    bonusRerolls=0;
    saveBonusRerolls();
    await loadProgress();
    const nextCategory=isUnlocked(currentCategory)?currentCategory:'normal';
    switchCategory(nextCategory);
    refreshAll();
    renderCalendar();
    renderMining();
  }catch(e){console.warn('[Day rollover]',e);}
  finally{daySyncing=false;}
}
setInterval(checkDayChange,30000);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState === 'visible') checkDayChange();
});

/* ============================================================
   SPLASH
   ============================================================ */
function hideSplash(){
  const s = document.getElementById('splash');
  if(!s) return;
  s.classList.add('hide');
  setTimeout(() => { if(s.parentNode) s.remove(); }, 500);
}

/* ============================================================
   START
   ============================================================ */
async function initGameTime(){
  if(!vkBridge) return;
  try{
    const p = await Promise.race([
      vkSend('VKWebAppGetLaunchParams', {}, 1500),
      new Promise(r => setTimeout(() => r(null), 1500))
    ]);
    if(p && p.vk_ts){
      timeOffset = p.vk_ts * 1000 - Date.now();
    }
  }catch(e){}
}

async function startApp(){
  initVKBridge();
  initViewRestoreSync();
  await initGameTime();

  migrateLegacyStorage();
  loadProgressFromLocal();
  lastRenderedDay = dateKey();
  appReady = true;
  switchCategory('normal');
  hideSplash();
  showWelcomeIfNeeded();

  loadProgress().then(() => {
    const cat = currentCategory;
    const serverState = dailyState[cat];
    const shownTask = taskEl.textContent;
    const serverTask = serverState.idx >= 0 ? CATEGORY_TASKS[cat][serverState.idx] : '';
    const needsRedraw = shownTask !== serverTask ||
      (serverState.revealed && filmEl) ||
      (serverState.skipped && filmEl) ||
      serverState.done;
    if(needsRedraw) switchCategory(cat);
    if(!isUnlocked(currentCategory)) switchCategory('normal');

    return loadUserProfile();
  }).catch(e => {
    console.warn('[Start] VK sync failed:', e.message || e);
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}