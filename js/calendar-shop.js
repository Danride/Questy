/* ============================================================
   CALENDAR
   ============================================================ */
function renderCalendar(){
  const grid = document.getElementById('calGrid');
  const monthEl = document.getElementById('calMonth');
  const countEl = document.getElementById('calCount');
  if(!grid) return;

  const now = new Date(Date.now() + timeOffset);
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7;

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  monthEl.textContent = monthNames[month] + ' ' + year;

  const doneDates = new Set();
  history.forEach(h => { if(h.ok) doneDates.add(h.d); });

  const todayKey = dateKey();
  let doneCount = 0;

  grid.innerHTML = '';
  for(let i = 0; i < startWeekday; i++){
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }
  for(let d = 1; d <= daysInMonth; d++){
    const key = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    cell.textContent = String(d);
    if(doneDates.has(key)){ cell.classList.add('done'); doneCount++; }
    if(key === todayKey) cell.classList.add('today');
    grid.appendChild(cell);
  }

  countEl.textContent = doneCount + ' / ' + daysInMonth;

  const dotsEl = document.getElementById('streakDots');
  const hintEl = document.getElementById('streakHint');
  dotsEl.innerHTML = '';
  const cyclePos = streak === 0 ? 0 : ((streak - 1) % 7) + 1;
  for(let i = 1; i <= 7; i++){
    const dot = document.createElement('div');
    dot.className = 'streak-dot';
    if(i <= cyclePos) dot.classList.add('filled');
    dot.textContent = String(i);
    dotsEl.appendChild(dot);
  }
  if(streak === 0) hintEl.textContent = 'Выполняй задание каждый день';
  else if(streak < 7) hintEl.textContent = (7 - streak) + ' ' + plural(7-streak,'день','дня','дней') + ' до серии из 7 дней';
  else hintEl.textContent = 'Серия идёт — продолжай!';

  const listEl = document.getElementById('historyList');
  listEl.innerHTML = '';
  const recent = history.slice().reverse().slice(0, 30);
  if(recent.length === 0){
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Пока пусто. Выполни первое задание — и оно появится здесь.';
    listEl.appendChild(empty);
  } else {
    recent.forEach(h => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML =
        '<div class="hi-date">' + shortDate(h.d) + '</div>' +
        '<div class="hi-text">' + escapeHtml(h.t) + '</div>' +
        '<div class="hi-mark">' + (h.ok ? '✓' : '—') + '</div>';
      listEl.appendChild(item);
    });
  }
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

/* ============================================================
   SHOP
   ============================================================ */
function renderShop(){
  const buyReroll = document.getElementById('buyReroll');
  buyReroll.disabled = balance < PRICE_REROLL;
  buyReroll.textContent = PRICE_REROLL + ' Q';

  const themesList = document.getElementById('themesList');
  themesList.innerHTML = '';
  Object.entries(THEMES).forEach(([id, th]) => {
    const owned = ownedThemes.includes(id);
    const equipped = currentTheme === id;
    const card = document.createElement('div');
    card.className = 'shop-card';
    const prev = document.createElement('div');
    prev.className = 'sc-preview';
    prev.style.background = th.preview;
    card.appendChild(prev);
    const info = document.createElement('div');
    info.className = 'sc-info';
    info.innerHTML = '<div class="sc-name">' + th.name + '</div><div class="sc-desc">' + th.desc + '</div>';
    card.appendChild(info);
    const btn = document.createElement('button');
    btn.className = 'sc-buy';
    if(equipped){ btn.textContent = 'Выбрано'; btn.classList.add('equipped'); }
    else if(owned){ btn.textContent = 'Выбрать'; }
    else { btn.textContent = th.price + ' Q'; btn.disabled = balance < th.price; }
    btn.addEventListener('click', () => buyOrEquipTheme(id, th.price));
    card.appendChild(btn);
    themesList.appendChild(card);
  });

  const framesList = document.getElementById('framesList');
  framesList.innerHTML = '';
  const grads = {
    wood:'linear-gradient(135deg,#8b5a2b,#4a2d10)',
    stone:'linear-gradient(135deg,#9a9a9a,#4a4a4a)',
    bronze:'linear-gradient(135deg,#d18b3f,#8b5a2b)',
    silver:'linear-gradient(135deg,#e0e4ea,#8a94a5)',
    gold:'linear-gradient(135deg,#ffd29a,#c89040)',
    diamond:'linear-gradient(135deg,#8ef0ff,#3a7fc0)'
  };
  Object.entries(FRAMES).forEach(([id, fr]) => {
    const owned = ownedFrames.includes(id);
    const equipped = currentFrame === id;
    const card = document.createElement('div');
    card.className = 'shop-card';
    const prev = document.createElement('div');
    prev.className = 'sc-avatar-preview';
    if(id !== 'none') prev.style.background = grads[id] || 'transparent';
    const inner = document.createElement('div');
    inner.className = 'inner';
    prev.appendChild(inner);
    card.appendChild(prev);
    const info = document.createElement('div');
    info.className = 'sc-info';
    info.innerHTML = '<div class="sc-name">' + fr.name + '</div>' +
      (fr.price === 0 ? '<div class="sc-desc">По умолчанию</div>' : '');
    card.appendChild(info);
    const btn = document.createElement('button');
    btn.className = 'sc-buy';
    if(equipped){ btn.textContent = 'Выбрано'; btn.classList.add('equipped'); }
    else if(owned){ btn.textContent = 'Выбрать'; }
    else { btn.textContent = fr.price + ' Q'; btn.disabled = balance < fr.price; }
    btn.addEventListener('click', () => buyOrEquipFrame(id, fr.price));
    card.appendChild(btn);
    framesList.appendChild(card);
  });
}

function buyOrEquipTheme(id, price){
  if(ownedThemes.includes(id)){
    currentTheme = id;
    saveCurrentTheme();
    applyTheme(currentTheme);
    renderShop();
    haptic('light');
    showToast(THEMES[id].name + ' — выбрано');
    return;
  }
  if(balance < price){ showToast('Не хватает Q'); return; }
  balance -= price;
  ownedThemes.push(id);
  currentTheme = id;
  saveBalance();
  saveOwnedThemes();
  saveCurrentTheme();
  updateBalanceUI();
  updateMiningUI();
  applyTheme(currentTheme);
  renderShop();
  haptic('medium');
  showToast(THEMES[id].name + ' — куплено');
}

function buyOrEquipFrame(id, price){
  if(ownedFrames.includes(id)){
    currentFrame = id;
    saveCurrentFrame();
    renderShop();
    renderProfileFrame();
    haptic('light');
    showToast(FRAMES[id].name + ' — выбрано');
    return;
  }
  if(balance < price){ showToast('Не хватает Q'); return; }
  balance -= price;
  ownedFrames.push(id);
  currentFrame = id;
  saveBalance();
  saveOwnedFrames();
  saveCurrentFrame();
  updateBalanceUI();
  updateMiningUI();
  renderShop();
  renderProfileFrame();
  haptic('medium');
  showToast(FRAMES[id].name + ' — куплено');
}

document.getElementById('buyReroll').addEventListener('click', () => {
  if(balance < PRICE_REROLL){ showToast('Не хватает Q'); return; }
  balance -= PRICE_REROLL;
  bonusRerolls += 1;
  saveBalance();
  saveBonusRerolls();
  updateBalanceUI();
  updateMiningUI();
  updateRerollUI();
  renderShop();
  haptic('light');
  showToast('+1 реролл');
});

/* ============================================================
   SHARE
   ============================================================ */
document.getElementById('shareBtn').addEventListener('click', async () => {
  const firstTime = !sharedOnce;
  const text =
    'Мой прогресс в ' + APP_NAME + '\n' +
    '🔥 Серия: ' + streak + ' ' + plural(streak,'день','дня','дней') + '\n' +
    '✦ Выполнено: ' + totalDone + '\n' +
    '⛏ Добыча ур. ' + mining.level + '\n' +
    '⬤ Баланс: ' + balance + ' Q';

  let shared = false;
  if(vkBridge){
    try{
      await vkSend('VKWebAppShare', { link: APP_URL, text: text });
      shared = true;
    }catch(e){}
    if(!shared){
      try{
        await vkSend('VKWebAppShowWallPostBox', {
          message: text + '\n\n' + APP_URL,
          attachments: APP_URL
        });
        shared = true;
      }catch(e){}
    }
  }

  if(!shared){
    showToast('Шаринг доступен только в VK');
    return;
  }

  if(firstTime){
    sharedOnce = true;
    saveSharedOnce();
    balance += SHARE_REWARD;
    saveBalance();
    updateBalanceUI();
    updateMiningUI();
    haptic('medium');
    showToast('+' + SHARE_REWARD + ' Q за первый шаринг');
  }
});

