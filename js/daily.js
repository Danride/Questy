/* ============================================================
   PICK TASK
   ============================================================ */
function pickTaskIndex(cat, excludeIndex=-1){
  const pool = taskPool(cat);
  const used=usedToday[cat];
  if(pool.every(i=>used.has(i))){
    pool.forEach(i=>used.delete(i));
    if(excludeIndex>=0) used.add(excludeIndex);
  }
  const available=pool.filter(i=>i!==excludeIndex && !used.has(i));
  if(available.length===0){
    pool.forEach(i=>{if(i!==excludeIndex) available.push(i);});
  }
  const idx=available[Math.floor(Math.random()*available.length)];
  used.add(idx);
  return idx;
}

/* ============================================================
   FILM
   ============================================================ */
function buildFilm(){
  if(filmEl && filmEl.parentNode) filmEl.remove();
  filmEl = null;

  const st = dailyState[currentCategory];
  if(st.revealed || st.done || st.skipped){
    progressEl.classList.remove('show');
    progressEl.textContent = '';
    updateTaskActionsUI();
    return;
  }

  const div=document.createElement('div');
  div.className='film hint';
  div.id='film';
  const cv=document.createElement('canvas');
  cv.id='filmCanvas';
  div.appendChild(cv);
  taskWrap.insertBefore(div, progressEl);
  filmEl=div;
  progressEl.classList.remove('show');
  progressEl.textContent='';
  updateTaskActionsUI();
  initFilmInteraction(div, cv);
}

function drawFilmBase(ctx,w,h){
  const t = THEMES[currentTheme] || THEMES.classic;
  const g=ctx.createLinearGradient(0,0,w,h);
  t.film.forEach(([p,c]) => g.addColorStop(p,c));
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);

  ctx.save();ctx.globalAlpha=0.16;
  for(let i=-h;i<w+h;i+=22){
    ctx.strokeStyle=t.filmLine;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+h,h);ctx.stroke();
  }
  ctx.restore();

  ctx.save();ctx.globalAlpha=0.09;
  ctx.strokeStyle=t.filmScratch;ctx.lineWidth=0.5;
  for(let y=0;y<h;y+=4){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.restore();

  const shine=ctx.createLinearGradient(0,0,0,h);
  shine.addColorStop(0,'rgba(255,255,255,.32)');
  shine.addColorStop(0.25,'rgba(255,255,255,0)');
  shine.addColorStop(0.75,'rgba(0,0,0,0)');
  shine.addColorStop(1,'rgba(0,0,0,.14)');
  ctx.fillStyle=shine;ctx.fillRect(0,0,w,h);
}

function initFilmInteraction(film, canvas){
  const ctx=canvas.getContext('2d');
  const dpr=Math.max(1,window.devicePixelRatio||1);
  const rect=film.getBoundingClientRect();
  canvas.width=Math.max(1, rect.width*dpr);
  canvas.height=Math.max(1, rect.height*dpr);
  ctx.setTransform(1,0,0,1,0,0);ctx.scale(dpr,dpr);
  drawFilmBase(ctx, Math.max(1, rect.width), Math.max(1, rect.height));

  let drawing=false,lastX=null,lastY=null,revealed=false,checkScheduled=false;
  let checkFrame=0;
  const RADIUS=26,SOFT_RADIUS=34,REVEAL_THRESHOLD=0.80;

  function pos(e){const r=film.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
  function stamp(x,y){
    const grad=ctx.createRadialGradient(x,y,0,x,y,SOFT_RADIUS);
    grad.addColorStop(0,'rgba(0,0,0,1)');grad.addColorStop(0.55,'rgba(0,0,0,1)');
    grad.addColorStop(0.85,'rgba(0,0,0,0.6)');grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,SOFT_RADIUS,0,Math.PI*2);ctx.fill();
  }
  function erase(x,y){
    ctx.globalCompositeOperation='destination-out';
    if(lastX!==null){
      const dist=Math.hypot(x-lastX,y-lastY);
      const step=RADIUS*0.35;
      const steps=Math.max(1,Math.ceil(dist/step));
      for(let i=1;i<=steps;i++){
        stamp(lastX+(x-lastX)*(i/steps), lastY+(y-lastY)*(i/steps));
      }
    }else stamp(x,y);
    lastX=x;lastY=y;
  }
  function computePercent(){
    const w=canvas.width,h=canvas.height;
    if(w < 2 || h < 2) return 0;
    const data=ctx.getImageData(0,0,w,h).data;
    let transparent=0,total=0;
    const step=48*4;
    for(let i=3;i<data.length;i+=step){total++;if(data[i]===0) transparent++;}
    return total>0 ? transparent/total : 0;
  }
  function scheduleCheck(){
    if(checkScheduled) return;
    checkScheduled=true;
    requestAnimationFrame(()=>{
      checkScheduled=false;
      checkFrame++;
      if(checkFrame % 3 === 0) checkReveal();
    });
  }
  function checkReveal(){
    if(revealed)return;
    const pct=computePercent();
    if(pct>0.05 && pct<REVEAL_THRESHOLD){
      progressEl.textContent=Math.round(pct*100)+'%';
      progressEl.classList.add('show');
      film.classList.add('partial');film.classList.remove('hint');
    }else if(pct<=0.05){
      progressEl.classList.remove('show');
      film.classList.add('hint');film.classList.remove('partial');
    }
    if(pct>=REVEAL_THRESHOLD){
      revealed=true;
      progressEl.textContent='✓';progressEl.classList.add('show');
      film.classList.remove('hint','partial');film.classList.add('revealing');

      dailyState[currentCategory].revealed = true;
      saveDailyState();
      haptic('medium');
      setTimeout(()=>{
        if(film.parentNode) film.remove();
        filmEl = null;
        progressEl.classList.remove('show');
        updateTaskActionsUI();
      },1300);
    }
  }
  function start(e){
    e.preventDefault();drawing=true;film.classList.remove('hint');
    film.dataset.scratched = '1';
    if(film.setPointerCapture){try{film.setPointerCapture(e.pointerId)}catch(err){}}
    const p=pos(e);lastX=p.x;lastY=p.y;erase(p.x,p.y);scheduleCheck();
  }
  function move(e){if(!drawing)return;e.preventDefault();const p=pos(e);erase(p.x,p.y);scheduleCheck()}
  function end(){if(!drawing)return;drawing=false;lastX=null;lastY=null;checkReveal()}

  film.addEventListener('pointerdown',start);
  film.addEventListener('pointermove',move);
  film.addEventListener('pointerup',end);
  film.addEventListener('pointercancel',end);
  film.addEventListener('pointerleave',()=>{if(drawing) end()});

  let resizeTimer;
  window.addEventListener('resize',()=>{
    if(!film.parentNode || film.classList.contains('revealing')) return;
    if(film.dataset.scratched) return;
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      const dpr2=Math.max(1,window.devicePixelRatio||1);
      const r2=film.getBoundingClientRect();
      if(r2.width < 2 || r2.height < 2) return;
      canvas.width=r2.width*dpr2;canvas.height=r2.height*dpr2;
      ctx.setTransform(1,0,0,1,0,0);ctx.scale(dpr2,dpr2);
      drawFilmBase(ctx,r2.width,r2.height);
    },200);
  });
}

/* ============================================================
   TASK DONE / SKIP
   ============================================================ */
function handleDone(){
  if(!appReady) return;
  const st = dailyState[currentCategory];
  if(st.done || st.skipped) return;
  if(!st.revealed){ showToast('Сначала сотри плёнку'); return; }
  if(currentCategory !== 'normal' && !isUnlocked(currentCategory)){
    showToast('Раздел не разблокирован');
    return;
  }

  st.done = true;
  totalDone++;
  if(currentCategory === 'hard') totalHardDone++;

  const today = dateKey();
  const yesterday = dateKey(-1);
  if(lastCompleteDate !== today){
    if(lastCompleteDate === yesterday) streak++;
    else streak = 1;
    lastCompleteDate = today;
    if(streak > bestStreak) bestStreak = streak;
    if(streak === 7) showToast('Серия 7 дней!');
    if(streak === 30) showToast('Серия 30 дней!');
  }

  history.push({
    d: today,
    c: currentCategory,
    t: CATEGORY_TASKS[currentCategory][st.idx],
    ok: true
  });
  if(history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);

  saveDailyState();
  saveStreak();
  saveBestStreak();
  saveTotalDone();
  saveTotalHardDone();
  saveLastCompleteDate();
  saveHistory();

  haptic('medium');
  showToast('Задание выполнено');
  updateTaskActionsUI();
  updateStreakUI();
  updateProfileStats();
  renderAchievements();
}

function handleSkip(){
  if(!appReady) return;
  const st = dailyState[currentCategory];
  if(st.done || st.skipped) return;
  if(!st.revealed){ showToast('Сначала сотри плёнку'); return; }

  st.skipped = true;
  const today = dateKey();
  history.push({
    d: today,
    c: currentCategory,
    t: CATEGORY_TASKS[currentCategory][st.idx],
    ok: false
  });
  if(history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);

  saveDailyState();
  saveHistory();
  haptic('light');
  updateTaskActionsUI();
}

btnDone.addEventListener('click', handleDone);
btnSkip.addEventListener('click', handleSkip);

/* ============================================================
   CATEGORY SWITCH
   ============================================================ */
function switchCategory(cat, forceNew=false){
  currentCategory=cat;
  [...tabsEl.querySelectorAll('.tab')].forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.cat===cat);
  });
  const list=CATEGORY_TASKS[cat];
  const st = dailyState[cat];

  if(forceNew){
    st.idx = pickTaskIndex(cat, st.idx);
    st.revealed = false;
    st.done = false;
    st.skipped = false;
    saveDailyState();
  } else {
    if(st.idx < 0){
      const pool = taskPool(cat);
      st.idx = pool[seededIndex(dateKey()+':'+cat+':'+taskMode, pool.length)];
      usedToday[cat].add(st.idx);
      saveDailyState();
    } else {
      usedToday[cat].add(st.idx);
    }
  }

  taskEl.textContent = list[st.idx];
  buildFilm();
}

/* ============================================================
   REWARDED AD
   ============================================================ */
function requestRewardedAd(questionText){
  return new Promise(resolve => {
    const modal     = document.getElementById('adModal');
    const titleEl   = document.getElementById('adModalTitle');
    const bodyEl    = document.getElementById('adModalBody');
    const actionsEl = document.getElementById('adModalActions');

    let settled = false;
    function finish(result){
      if(settled) return;
      settled = true;
      modal.classList.remove('show');
      actionsEl.innerHTML = '';
      resolve(result);
    }

    titleEl.textContent = 'Реклама';
    bodyEl.innerHTML = questionText || 'Посмотреть рекламу?';
    actionsEl.innerHTML =
      '<button class="modal-btn primary" data-act="watch">Смотреть</button>' +
      '<button class="modal-btn ghost" data-act="cancel">Отмена</button>';
    modal.classList.add('show');

    actionsEl.onclick = (e) => {
      const btn = e.target.closest('button[data-act]');
      if(!btn) return;
      const act = btn.dataset.act;

      if(act === 'cancel'){ finish('cancelled'); return; }

      if(act === 'watch'){
        bodyEl.innerHTML =
          '<span class="ad-loading">Загружаем рекламу<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>';
        actionsEl.innerHTML = '';
        if(!vkBridge){
          finish('error');
          return;
        }
        // Награда только после подтверждённого результата от VK.
        vkSend('VKWebAppShowNativeAds', {ad_format:'reward'}, 90000)
          .then(res => finish(res && res.result === true ? 'success' : 'closed'))
          .catch(() => finish('error'));
        return;
      }
    };
  });
}

/* ============================================================
   REROLL
   ============================================================ */
async function doReroll(){
  if(!appReady) return;
  if(rerollBtn.classList.contains('loading') || rerollBtn.classList.contains('disabled')) return;

  const st = dailyState[currentCategory];
  if(st.done){
    showToast('Задание уже отмечено как «Сделал»');
    return;
  }
  if(st.skipped){
    showToast('Задание уже отмечено как «Не сделал»');
    return;
  }

  const totalAllowed = MAX_REROLLS_PER_DAY + bonusRerolls;
  if(rerollsToday >= totalAllowed) return;

  if(currentCategory !== 'normal' && !isUnlocked(currentCategory)){
    requestUnlock(currentCategory);
    return;
  }

  rerollBtn.classList.add('loading');
  const result = await requestRewardedAd('Посмотреть рекламу и получить другое задание?');
  rerollBtn.classList.remove('loading');

  if(result === 'success'){
    switchCategory(currentCategory, true);
    rerollsToday++;
    saveRerollsToday();
    updateRerollUI();
    haptic('light');
  } else if(result === 'closed'){
    showToast('Реклама закрыта — попытка не списана');
  } else if(result === 'error'){
    showToast('Не удалось загрузить рекламу');
  }
}
rerollBtn.addEventListener('click', doReroll);

/* ============================================================
   UNLOCK Сложное
   ============================================================ */
async function requestUnlock(cat){
  if(!appReady) return;
  const result = await requestRewardedAd('Открыть раздел «Сложное» до конца дня за просмотр рекламы?');

  if(result === 'success'){
    unlocked[cat] = true;
    updateLocks();
    switchCategory(cat);
    haptic('light');
    saveUnlocks();
  } else if(result === 'closed'){
    showToast('Реклама закрыта — раздел не открыт');
  } else if(result === 'error'){
    showToast('Не удалось загрузить рекламу');
  }
}

/* ============================================================
   TABS
   ============================================================ */
tabsEl.addEventListener('click', async (e)=>{
  if(!appReady) return;
  const btn=e.target.closest('.tab');
  if(!btn) return;
  const cat=btn.dataset.cat;
  if(cat===currentCategory) return;

  if(isUnlocked(cat)){
    switchCategory(cat);
    haptic('light');
    return;
  }
  await syncUnlocksFromVK();
  if(isUnlocked(cat)){
    switchCategory(cat);
    haptic('light');
    return;
  }
  requestUnlock(cat);
});

async function syncUnlocksFromVK(){
  if(!vkBridge) return;
  try{
    const r = await vkSend('VKWebAppStorageGet', { keys: [unlocksKey()] });
    const items = (r && r.keys) || [];
    const item = items.find(i => i.key === unlocksKey());
    const raw = item ? item.value : '';
    const before = unlocked.hard;
    applyUnlocksRaw(raw);
    try{ localStorage.setItem('g_'+unlocksKey(), raw); }catch(e){}
    if(before !== unlocked.hard) updateLocks();
  }catch(e){}
}


