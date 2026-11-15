/* ============================================================
   MINING LOGIC
   ============================================================ */
function miningRate(level){
  if(level <= 10){
    return +(MINING_BASE_RATE + (level - 1) * MINING_RATE_STEP).toFixed(2);
  }
  const base = MINING_BASE_RATE + 9 * MINING_RATE_STEP; // 1.9
  return +(base * Math.pow(MINING_RATE_GROWTH, level - 10)).toFixed(2);
}
function miningCapHours(level){
  return Math.min(MINING_CAP_MAX_H, MINING_BASE_CAP_H + (level - 1) * MINING_CAP_STEP_H);
}
function miningUpgradeCost(level){
  return Math.floor(MINING_UPGRADE_BASE * Math.pow(MINING_UPGRADE_GROWTH, level - 1));
}

function computeMining(now){
  now = now || Date.now();
  const rate = miningRate(mining.level);
  const capH = miningCapHours(mining.level);
  const capMs = capH * 3600000;

  const lastTick = mining.lastTick;

  // сколько «реально» прошло (для защиты от перевода часов):
  // если разница сильно больше cap — считаем, что прошло ровно cap
  const realElapsed = Math.max(0, now - lastTick);
  const cappedElapsed = Math.min(realElapsed, capMs);
  const cappedEnd = lastTick + cappedElapsed;
  const totalMs = cappedElapsed;

  // #1 — бонус считаем строго в окне [bonusStart, bonusEnd] ∩ [lastTick, cappedEnd]
  let bonusMs = 0;
  if(mining.bonusEnd > 0){
    const bs = Math.max(lastTick, mining.bonusStart);
    const be = Math.min(mining.bonusEnd, cappedEnd);
    if(be > bs) bonusMs = be - bs;
  }
  const normalMs = Math.max(0, totalMs - bonusMs);

  const earned = rate * (
    (normalMs / 3600000) +
    (bonusMs / 3600000) * MINING_BOOST_MULT
  );

  const isFull = realElapsed >= capMs;
  const bonusActive = now < mining.bonusEnd;

  return { rate, capH, capMs, totalMs, bonusMs, earned, isFull, bonusActive };
}

function collectMining(){
  if(!appReady) return;
  const now = Date.now();
  const m = computeMining(now);
  const amt = Math.floor(m.earned);
  if(amt <= 0){
    showToast('Пока нечего забирать');
    return;
  }
  balance += amt;
  mining.lastTick = now;
  // очищаем истёкший буст
  if(mining.bonusEnd > 0 && mining.bonusEnd <= now){
    mining.bonusEnd = 0;
    mining.bonusStart = 0;
  }
  saveBalance();
  saveMining();
  updateBalanceUI();
  updateMiningUI();
  renderMining();
  haptic('medium');
  showToast('+' + amt + ' Q');
}

function upgradeMining(){
  if(!appReady) return;
  const cost = miningUpgradeCost(mining.level);
  if(balance < cost){
    showToast('Не хватает Q');
    return;
  }
  balance -= cost;
  // перед апгрейдом — зачислим накопленное, чтобы не потерять
  const now = Date.now();
  const m = computeMining(now);
  const pending = Math.floor(m.earned);
  if(pending > 0) balance += pending;
  mining.lastTick = now;
  mining.level += 1;

  saveBalance();
  saveMining();
  updateBalanceUI();
  updateMiningUI();
  renderMining();
  haptic('medium');
  showToast('Уровень добычи: ' + mining.level);
}

async function activateMiningBoost(){
  if(!appReady) return;
  const now = Date.now();
  if(now < mining.bonusEnd){
    showToast('Ускоритель уже активен');
    return;
  }
  const result = await requestRewardedAd('Ускоритель ×2 к добыче на 2 часа за просмотр рекламы?');
  if(result === 'success'){
    const t0 = Date.now();
    mining.bonusStart = t0;
    mining.bonusEnd = t0 + MINING_BOOST_MS;
    saveMining();
    renderMining();
    updateMiningUI();
    haptic('medium');
    showToast('⚡ Ускоритель активирован');
  } else if(result === 'closed'){
    showToast('Реклама закрыта');
  } else if(result === 'error'){
    showToast('Не удалось загрузить рекламу');
  }
}

/* ============================================================
   MINING UI
   ============================================================ */
function updateMiningUI(){
  document.getElementById('miningLevel').textContent = String(mining.level);
  document.getElementById('profileMiningLvl').textContent = String(mining.level);

  const rate = miningRate(mining.level);
  document.getElementById('miningRate').textContent = String(rate);

  const nextLevel = mining.level + 1;
  const cost = miningUpgradeCost(mining.level);
  const nextRate = miningRate(nextLevel);
  const nextCap = miningCapHours(nextLevel);
  const curCap = miningCapHours(mining.level);
  const capDelta = nextCap - curCap;
  document.getElementById('upgradeDesc').innerHTML =
    'Уровень <b>' + nextLevel + '</b> · <b>' + nextRate + '</b> Q/час' +
    (capDelta > 0 ? ' · <b>+' + capDelta + '</b> ч хранилища' : '');
  const btnUp = document.getElementById('btnUpgrade');
  btnUp.textContent = cost + ' Q';
  btnUp.disabled = balance < cost;
}

function renderMining(){
  const now = Date.now();
  const m = computeMining(now);

  document.getElementById('miningStored').textContent = Math.floor(m.earned) + ' Q';

  const capLabel = document.getElementById('miningCapLabel');
  const timeLeft = document.getElementById('miningTimeLeft');
  const totalH = m.totalMs / 3600000;
  capLabel.textContent = totalH.toFixed(1) + ' / ' + m.capH + ' ч';

  const remainingMs = Math.max(0, m.capMs - m.totalMs);
  if(remainingMs <= 60000){
    timeLeft.textContent = 'заполнено';
  } else {
    const h = Math.floor(remainingMs / 3600000);
    const min = Math.floor((remainingMs % 3600000) / 60000);
    timeLeft.textContent = h > 0 ? ('до полного ' + h + 'ч ' + min + 'м') : ('до полного ' + min + 'м');
  }

  const pct = Math.min(100, (m.totalMs / m.capMs) * 100);
  document.getElementById('miningFill').style.width = pct + '%';
  document.getElementById('miningStorage').classList.toggle('full', m.isFull);

  // #5 — дизейблим «Забрать» при нуле
  document.getElementById('btnCollect').disabled = Math.floor(m.earned) < 1;

  // Бонус-бейдж
  const badge = document.getElementById('boostBadge');
  const boostTimeEl = document.getElementById('boostTime');
  if(m.bonusActive){
    badge.classList.add('show');
    const left = mining.bonusEnd - now;
    const hh = Math.floor(left / 3600000);
    const mm = Math.floor((left % 3600000) / 60000);
    boostTimeEl.textContent = hh > 0 ? (hh + 'ч ' + mm + 'м осталось') : (mm + 'м осталось');
  } else {
    badge.classList.remove('show');
  }

  // #3 + #6 — кнопка boost разблокируется сразу после окончания
  const btnAd = document.getElementById('btnAdBoost');
  const needDisabled = m.bonusActive;
  if(btnAd.disabled !== needDisabled){
    btnAd.disabled = needDisabled;
    btnAd.querySelector('.abb-text').textContent = needDisabled
      ? 'Ускоритель активен'
      : 'Ускоритель ×2 на 2 часа';
  }
}

setInterval(() => {
  if(!appReady) return;
  const active = document.querySelector('.screen.active');
  if(active && active.dataset.screen === 'mining') renderMining();
}, 1000);

document.getElementById('btnCollect').addEventListener('click', collectMining);
document.getElementById('btnUpgrade').addEventListener('click', upgradeMining);
document.getElementById('btnAdBoost').addEventListener('click', activateMiningBoost);

