const APP_URL = 'https://vk.ru/app54747359';
const APP_NAME = 'Questy';
const MAX_REROLLS_PER_DAY = 3;
const VK_TIMEOUT_MS = 3500;
const DAILY_GIFT = 50;
const PRICE_REROLL = 200;
const HISTORY_MAX = 90;
const SHARE_REWARD = 30;

/* Добыча */
const MINING_BASE_RATE = 1;
const MINING_RATE_STEP = 0.1;
const MINING_RATE_GROWTH = 1.25;
const MINING_BASE_CAP_H = 12;
const MINING_CAP_STEP_H = 1;
const MINING_CAP_MAX_H = 24;
const MINING_UPGRADE_BASE = 150;
const MINING_UPGRADE_GROWTH = 1.7;
const MINING_BOOST_MS = 2 * 3600 * 1000;
const MINING_BOOST_MULT = 2;
const MINING_TIME_SKEW_MS = 30 * 60 * 1000; // защита от перевода часов

/* ============================================================
   ИГРОВОЕ ВРЕМЯ
   ============================================================ */
let timeOffset = 0;
function dateKey(offsetDays){
  const d = new Date(Date.now() + timeOffset);
  if(offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function shortDate(key){
  const parts = key.split('-');
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return parseInt(parts[2],10) + ' ' + months[parseInt(parts[1],10)-1];
}
function seededIndex(seed,len){
  let h=2166136261>>>0;
  for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
  return(h>>>0)%len;
}

/* ============================================================
   ФОНОВЫЕ СИМВОЛЫ
   ============================================================ */
(function initBgSymbols(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const container=document.getElementById('bgSymbols');
  const glyphs=['✦','✧','!','!','!','★','✶','!','·','✴','!','!'];
  const COUNT=26;
  function rand(min,max){return Math.random()*(max-min)+min}
  function spawnSymbol(){
    const el=document.createElement('span');
    el.className='bg-sym';
    el.textContent=glyphs[Math.floor(Math.random()*glyphs.length)];
    const size=rand(14,28);
    const x=rand(3,95),y=rand(3,92);
    const opacity=rand(.2,.5);
    const rot=rand(-30,30);
    const driftDur=rand(10,18);
    const driftDelay=rand(0,3);
    const fadeDelay=rand(0,1.5);
    const dx1=rand(-80,80),dy1=rand(-100,100);
    const dx2=rand(-100,100),dy2=rand(-120,120);
    const dx3=rand(-90,90),dy3=rand(-80,80);
    el.style.left=x+'%';el.style.top=y+'%';
    el.style.fontSize=size+'px';
    el.style.setProperty('--sym-opacity',opacity.toFixed(2));
    el.style.setProperty('--sym-rot',rot+'deg');
    el.style.setProperty('--drift-dur',driftDur+'s');
    el.style.setProperty('--drift-delay',driftDelay+'s');
    el.style.setProperty('--dx1',dx1+'px');el.style.setProperty('--dy1',dy1+'px');
    el.style.setProperty('--dx2',dx2+'px');el.style.setProperty('--dy2',dy2+'px');
    el.style.setProperty('--dx3',dx3+'px');el.style.setProperty('--dy3',dy3+'px');
    el.style.animationDelay=fadeDelay+'s,'+driftDelay+'s';
    el.style.animationDuration='1.2s,'+driftDur+'s';
    el.addEventListener('click',(e)=>{e.stopPropagation();burst(el)});
    container.appendChild(el);
  }
  function burst(sym){
    const rect=sym.getBoundingClientRect();
    const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    const count=7+Math.floor(Math.random()*4);
    for(let i=0;i<count;i++){
      const p=document.createElement('span');
      p.className='burst';
      const pick=Math.random();
      p.textContent = pick<0.3 ? '✦' : pick<0.5 ? '·' : pick<0.8 ? '!' : '✧';
      const angle=(Math.PI*2)*(i/count)+rand(-.3,.3);
      const dist=rand(55,130);
      p.style.left=cx+'px';p.style.top=cy+'px';
      p.style.fontSize=rand(10,18)+'px';
      p.style.setProperty('--bx',Math.cos(angle)*dist+'px');
      p.style.setProperty('--by',Math.sin(angle)*dist+'px');
      p.style.setProperty('--br',rand(-360,360)+'deg');
      document.body.appendChild(p);
      setTimeout(()=>p.remove(),950);
    }
    sym.style.transition='transform .3s ease, opacity .3s ease';
    sym.style.transform='scale(1.8)';sym.style.opacity='0';
    setTimeout(()=>sym.remove(),300);
    setTimeout(spawnSymbol, rand(800,2200));
  }
  for(let i=0;i<COUNT;i++) spawnSymbol();
})();

const vkBridge = window.vkBridge;

/* ============================================================
   VK SEND
   ============================================================ */
function vkSend(method, params, timeoutMs){
  if(!vkBridge) return Promise.reject(new Error('vkBridge not loaded'));
  const t = timeoutMs || VK_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if(done) return;
      done = true;
      reject(new Error('vk timeout: ' + method));
    }, t);
    vkBridge.send(method, params)
      .then(r => { if(!done){ done = true; clearTimeout(timer); resolve(r); } })
      .catch(e => { if(!done){ done = true; clearTimeout(timer); reject(e); } });
  });
}

/* ============================================================
   TOAST / HAPTIC
   ============================================================ */
let toastTimer = null;
function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2400);
}
function haptic(style){
  if(vkBridge){
    vkBridge.send('VKWebAppTapticImpactOccurred',{style:style||'light'}).catch(()=>{});
  } else if(navigator.vibrate){
    navigator.vibrate(style === 'medium' ? 20 : 10);
  }
}

/* ============================================================
   VK INIT
   ============================================================ */
function initVKBridge(){
  if(!vkBridge){ console.warn('[VK Bridge] не загружен'); return; }
  try{
    vkBridge.send('VKWebAppInit');
    vkBridge.send('VKWebAppSetViewSettings',{
      status_bar_style:'light',
      action_bar_text_color:'#f5efe2',
      status_bar_background_color:'#0f0f12',
      action_bar_background_color:'#0f0f12',
      navigation_bar_color:'#0f0f12'
    }).catch(()=>{});
    vkBridge.send('VKWebAppEnableSwipeBack').catch(()=>{});
  }catch(err){console.warn('[VK Bridge]',err)}
}

