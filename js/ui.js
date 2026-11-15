/* ============================================================
   THEME
   ============================================================ */
function applyTheme(themeId){
  const t = THEMES[themeId] || THEMES.classic;
  const root = document.documentElement;
  const defaults = {
    '--bg':'#0f0f12','--ink':'#f5efe2',
    '--line':'rgba(245,239,226,.28)','--line-soft':'rgba(245,239,226,.14)',
    '--accent':'rgba(255,205,150,.55)','--accent-soft':'rgba(255,205,150,.25)'
  };
  Object.entries(defaults).forEach(([k,v]) => root.style.setProperty(k, v));
  if(t.vars) Object.entries(t.vars).forEach(([k,v]) => root.style.setProperty(k, v));

  const bg = (t.vars && t.vars['--bg']) || '#0f0f12';
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', bg);

  if(vkBridge){
    vkBridge.send('VKWebAppSetViewSettings',{
      status_bar_style:'light',
      action_bar_text_color: (t.vars && t.vars['--ink']) || '#f5efe2',
      status_bar_background_color: bg,
      action_bar_background_color: bg,
      navigation_bar_color: bg
    }).catch(()=>{});
  }

  if(filmEl && filmEl.parentNode
     && !filmEl.dataset.scratched
     && !filmEl.classList.contains('revealing')
     && !filmEl.classList.contains('partial')){
    const cv = filmEl.querySelector('canvas');
    if(cv){
      const dpr = Math.max(1, window.devicePixelRatio||1);
      const r = filmEl.getBoundingClientRect();
      if(r.width >= 2 && r.height >= 2){
        cv.width = r.width * dpr;
        cv.height = r.height * dpr;
        const ctx = cv.getContext('2d');
        ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
        drawFilmBase(ctx, r.width, r.height);
      }
    }
  }
}

/* ============================================================
   UI UPDATERS
   ============================================================ */
function updateBalanceUI(){
  balanceValueEl.textContent = String(balance);
  document.getElementById('profileBalance').textContent = balance + ' Q';
  const giftClaimed = lastDailyClaim === dateKey();
  giftBtn.classList.toggle('claimed', giftClaimed);
  giftBtn.classList.toggle('pulse', !giftClaimed);
}
function updateStreakUI(){
  streakValueEl.textContent = String(streak);
  document.getElementById('profileStreak').textContent = String(streak);
  document.getElementById('profileBest').textContent = String(bestStreak);
  document.getElementById('piSub').textContent = 'серия: ' + streak + ' ' + plural(streak,'день','дня','дней');
}
function plural(n, one, few, many){
  const m10 = n % 10, m100 = n % 100;
  if(m10 === 1 && m100 !== 11) return one;
  if(m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function updateRerollUI(){
  const totalAllowed = MAX_REROLLS_PER_DAY + bonusRerolls;
  const remaining = Math.max(0, totalAllowed - rerollsToday);
  rerollLbl.textContent = `${remaining}/${totalAllowed}`;
  rerollBtn.classList.toggle('disabled', remaining <= 0);
}
function updateLocks(){
  [...tabsEl.querySelectorAll('.tab')].forEach(btn=>{
    const cat=btn.dataset.cat;
    if(cat==='normal'){ btn.classList.remove('locked'); return; }
    btn.classList.toggle('locked', !isUnlocked(cat));
  });
}
function updateProfileStats(){
  document.getElementById('profileDone').textContent = String(totalDone);
  document.getElementById('profileHard').textContent = String(totalHardDone);
  document.getElementById('profileMiningLvl').textContent = String(mining.level);
}
function updateUserName(){
  document.getElementById('piName').textContent = userName;
}
function renderProfileAvatar(){
  const img = document.getElementById('paImg');
  const fb = document.getElementById('paFallback');
  if(userPhoto){
    img.onerror = () => { img.hidden = true; fb.style.display = 'block'; };
    img.src = userPhoto;
    img.hidden = false;
    fb.style.display = 'none';
  } else {
    img.hidden = true;
    fb.style.display = 'block';
  }
}
function renderProfileFrame(){
  const wrap = document.getElementById('profileAvatarWrap');
  wrap.className = 'profile-avatar-wrap';
  const fr = FRAMES[currentFrame] || FRAMES.none;
  wrap.classList.add(fr.cls);
}

/* ============================================================
   TASK ACTIONS UI
   ============================================================ */
function updateTaskActionsUI(){
  const st = dailyState[currentCategory];
  taskActions.classList.add('hidden');
  taskStatus.classList.add('hidden');
  taskStatus.classList.remove('ok');

  if(st.done){
    taskStatus.classList.remove('hidden');
    taskStatus.classList.add('ok');
    taskStatus.textContent = '✓ Выполнено';
    return;
  }
  if(st.skipped){
    taskStatus.classList.remove('hidden');
    taskStatus.textContent = 'Пропущено · вернись завтра';
    return;
  }
  if(st.revealed){
    taskActions.classList.remove('hidden');
  }
}

/* ============================================================
   DAILY GIFT
   ============================================================ */
giftBtn.addEventListener('click', () => {
  if(lastDailyClaim === dateKey()){
    showToast('Подарок уже получен сегодня');
    return;
  }
  balance += DAILY_GIFT;
  lastDailyClaim = dateKey();
  saveBalance();
  saveLastDailyClaim();
  updateBalanceUI();
  updateMiningUI();
  haptic('medium');
  showToast('+' + DAILY_GIFT + ' Q');
});

/* ============================================================
   BOTTOM NAV
   ============================================================ */
function navigateTo(target){
  const allowed = ['task','adventures','calendar','shop','profile','mining'];
  if(!allowed.includes(target)) return;
  const selectedNav = target === 'mining' ? 'task' : target;
  bottomNav.querySelectorAll('button[data-screen]').forEach(b => b.classList.toggle('active', b.dataset.screen === selectedNav));
  screens.forEach(s => s.classList.toggle('active', s.dataset.screen === target));
  if(target === 'calendar'){ renderCalendar(); renderGoals(); }
  if(target === 'profile'){ updateProfileStats(); updateStreakUI(); updateBalanceUI(); renderProfileAvatar(); renderProfileFrame(); renderAchievements(); }
  if(target === 'shop') renderShop();
  if(target === 'adventures') renderAdventures();
  if(target === 'mining'){ updateMiningUI(); renderMining(); }
  haptic('light');
}
bottomNav.addEventListener('click', e => {
  const btn = e.target.closest('button[data-screen]');
  if(btn) navigateTo(btn.dataset.screen);
});
document.getElementById('openMiningButton').addEventListener('click', () => navigateTo('mining'));
document.getElementById('closeMiningButton').addEventListener('click', () => navigateTo('task'));

/* ============================================================
   LOAD
   ============================================================ */
function loadProgressFromLocal(){
  try{ applyStateJson(localStorage.getItem('g_'+stateKey()) || ''); }catch(e){ applyStateJson(''); }
  try{ applyRerollsRaw(localStorage.getItem('g_'+'rerolls_'+dateKey())); }catch(e){ applyRerollsRaw(''); }
  try{ applyUnlocksRaw(localStorage.getItem('g_'+unlocksKey())); }catch(e){ applyUnlocksRaw(''); }
  try{ applyMiningRaw(localStorage.getItem('g_mining')); }catch(e){ applyMiningRaw(''); }

  balance = parseIntSafe(localStorage.getItem('g_balance'), 0);
  streak = parseIntSafe(localStorage.getItem('g_streak'), 0);
  bestStreak = parseIntSafe(localStorage.getItem('g_best_streak'), 0);
  totalDone = parseIntSafe(localStorage.getItem('g_total_done'), 0);
  totalHardDone = parseIntSafe(localStorage.getItem('g_total_hard_done'), 0);
  bonusRerolls = parseIntSafe(localStorage.getItem('g_bonus_rerolls'), 0);
  bonusRerollsDay = localStorage.getItem('g_bonus_rerolls_day') || '';
  if(bonusRerollsDay !== dateKey()) bonusRerolls = 0;
  lastDailyClaim = localStorage.getItem('g_last_daily_claim') || '';
  lastCompleteDate = localStorage.getItem('g_last_complete_date') || '';
  sharedOnce = localStorage.getItem('g_shared_once') === '1';
  userPhoto = localStorage.getItem('g_user_photo') || '';
  userName = localStorage.getItem('g_user_name') || 'Игрок 360';
  taskMode = localStorage.getItem('g_task_mode') || 'all';
  applyGoalsRaw(localStorage.getItem('g_personal_goals') || '');
  goalsFinished = Math.max(0, parseIntSafe(localStorage.getItem('g_goals_finished'), 0));

  try{
    const ot = localStorage.getItem('g_owned_themes');
    if(ot) ownedThemes = JSON.parse(ot) || ['classic'];
    if(!ownedThemes.includes('classic')) ownedThemes.unshift('classic');
  }catch(e){}
  currentTheme = localStorage.getItem('g_current_theme') || 'classic';
  try{
    const of = localStorage.getItem('g_owned_frames');
    if(of) ownedFrames = JSON.parse(of) || ['none'];
    if(!ownedFrames.includes('none')) ownedFrames.unshift('none');
  }catch(e){}
  currentFrame = localStorage.getItem('g_current_frame') || 'none';

  try{
    const h = localStorage.getItem('g_history');
    if(h) history = JSON.parse(h) || [];
  }catch(e){}

  applyTheme(currentTheme);
  maybeResetStreak();
  reconcileUsedToday();
  refreshAll();
  updateMiningUI();
}

async function loadProgress(){
  const keys = [
    stateKey(),
    'rerolls_' + dateKey(),
    unlocksKey(),
    'balance','streak','best_streak','total_done','total_hard_done',
    'bonus_rerolls','bonus_rerolls_day','last_daily_claim','last_complete_date',
    'shared_once','owned_themes','current_theme',
    'owned_frames','current_frame','history','user_photo','user_name',
    'mining','task_mode','personal_goals','goals_finished'
  ];
  const data = await storageGetMultiple(keys);

  applyStateJson(data[stateKey()] || '');
  applyRerollsRaw(data['rerolls_' + dateKey()]);
  applyUnlocksRaw(data[unlocksKey()]);
  applyMiningRaw(data['mining']);
  taskMode = data['task_mode'] || taskMode;
  applyGoalsRaw(data['personal_goals'] || '');
  goalsFinished = Math.max(0, parseIntSafe(data['goals_finished'], goalsFinished));

  balance = parseIntSafe(data['balance'], balance);
  streak = parseIntSafe(data['streak'], streak);
  bestStreak = parseIntSafe(data['best_streak'], bestStreak);
  totalDone = parseIntSafe(data['total_done'], totalDone);
  totalHardDone = parseIntSafe(data['total_hard_done'], totalHardDone);
  bonusRerolls = parseIntSafe(data['bonus_rerolls'], bonusRerolls);
  bonusRerollsDay = data['bonus_rerolls_day'] || '';
  if(bonusRerollsDay !== dateKey()) bonusRerolls = 0;
  lastDailyClaim = data['last_daily_claim'] || lastDailyClaim;
  lastCompleteDate = data['last_complete_date'] || lastCompleteDate;
  sharedOnce = data['shared_once'] === '1' || sharedOnce;

  try{ if(data['owned_themes']) ownedThemes = JSON.parse(data['owned_themes']) || ownedThemes; }catch(e){}
  if(!ownedThemes.includes('classic')) ownedThemes.unshift('classic');
  if(data['current_theme']) currentTheme = data['current_theme'];
  try{ if(data['owned_frames']) ownedFrames = JSON.parse(data['owned_frames']) || ownedFrames; }catch(e){}
  if(!ownedFrames.includes('none')) ownedFrames.unshift('none');
  if(data['current_frame']) currentFrame = data['current_frame'];
  try{ if(data['history']) history = JSON.parse(data['history']) || history; }catch(e){}
  if(data['user_photo']) userPhoto = data['user_photo'];
  if(data['user_name']) userName = data['user_name'];

  try{
    localStorage.setItem('g_'+stateKey(), data[stateKey()] || '');
    localStorage.setItem('g_'+'rerolls_'+dateKey(), String(rerollsToday));
    localStorage.setItem('g_'+unlocksKey(), data[unlocksKey()] || '');
    localStorage.setItem('g_balance', String(balance));
    localStorage.setItem('g_streak', String(streak));
    localStorage.setItem('g_best_streak', String(bestStreak));
    localStorage.setItem('g_total_done', String(totalDone));
    localStorage.setItem('g_total_hard_done', String(totalHardDone));
    localStorage.setItem('g_bonus_rerolls', String(bonusRerolls));
    localStorage.setItem('g_bonus_rerolls_day', bonusRerollsDay);
    localStorage.setItem('g_last_daily_claim', lastDailyClaim);
    localStorage.setItem('g_last_complete_date', lastCompleteDate);
    localStorage.setItem('g_shared_once', sharedOnce?'1':'0');
    localStorage.setItem('g_owned_themes', JSON.stringify(ownedThemes));
    localStorage.setItem('g_current_theme', currentTheme);
    localStorage.setItem('g_owned_frames', JSON.stringify(ownedFrames));
    localStorage.setItem('g_current_frame', currentFrame);
    localStorage.setItem('g_history', JSON.stringify(history));
    localStorage.setItem('g_mining', JSON.stringify(mining));
    localStorage.setItem('g_task_mode', taskMode);
    localStorage.setItem('g_personal_goals', JSON.stringify(personalGoals));
    localStorage.setItem('g_goals_finished', String(goalsFinished));
    if(userPhoto) localStorage.setItem('g_user_photo', userPhoto);
    if(userName) localStorage.setItem('g_user_name', userName);
  }catch(e){}

  applyTheme(currentTheme);
  maybeResetStreak();
  reconcileUsedToday();
  refreshAll();
  updateMiningUI();
}

async function loadUserProfile(){
  if(!vkBridge) return;
  try{
    const info = await vkSend('VKWebAppGetUserInfo', {});
    if(info){
      if(info.photo_200) userPhoto = info.photo_200;
      else if(info.photo_100) userPhoto = info.photo_100;
      else userPhoto = '';

      if(info.first_name){
        userName = info.first_name + (info.last_name ? ' ' + info.last_name : '');
      } else {
        userName = 'Игрок 360';
      }

      renderProfileAvatar();
      updateUserName();
      try{
        localStorage.setItem('g_user_photo', userPhoto);
        localStorage.setItem('g_user_name', userName);
      }catch(e){}
      queueStorageSet('user_photo', userPhoto);
      queueStorageSet('user_name', userName);
    }
  }catch(e){ console.warn('[VK] user info failed', e.message || e); }
}

function refreshAll(){
  updateRerollUI();
  updateLocks();
  updateBalanceUI();
  updateStreakUI();
  updateProfileStats();
  renderProfileAvatar();
  renderProfileFrame();
  updateUserName();
  renderAchievements();
  renderGoals();
  const modeSelect = document.getElementById('taskMode');
  if(modeSelect) modeSelect.value = taskMode;
}

function reconcileUsedToday(){
  const today = dateKey();
  const todayItems = history.filter(h => h.d === today);
  todayItems.forEach(h => {
    const list = CATEGORY_TASKS[h.c];
    if(!list) return;
    const idx = list.indexOf(h.t);
    if(idx >= 0) usedToday[h.c].add(idx);
  });
  ['normal','hard'].forEach(cat => {
    if(dailyState[cat].idx >= 0) usedToday[cat].add(dailyState[cat].idx);
  });
}

function maybeResetStreak(){
  if(!lastCompleteDate) return;
  const yesterday = dateKey(-1);
  const today = dateKey();
  if(lastCompleteDate !== today && lastCompleteDate !== yesterday){
    if(streak !== 0){
      streak = 0;
      saveStreak();
    }
  }
}

