function applyGoalsRaw(raw){
  personalGoals=[];
  try{
    const arr=JSON.parse(raw);
    if(Array.isArray(arr)){
      personalGoals=arr.filter(g=>g && typeof g.name==='string' && g.name.trim())
        .slice(-60).map(g=>({
          id:String(g.id).slice(0,60),
          name:g.name.slice(0,80),
          target:Math.min(100,Math.max(1,parseInt(g.target,10)||1)),
          progress:Math.max(0,parseInt(g.progress,10)||0),
          created:typeof g.created==='string'?g.created:dateKey()
        })).map(g=>({...g,progress:Math.min(g.progress,g.target)}));
    }
  }catch(e){}
}
function renderGoals(){
  const host=document.getElementById('goalsList');
  if(!host) return;
  host.innerHTML='';
  const active=personalGoals.filter(g=>g.progress<g.target).length;
  document.getElementById('goalsCounter').textContent=active+' активных';
  if(!personalGoals.length){
    const empty=document.createElement('p');
    empty.className='goals-note';
    empty.textContent='Пока нет целей. Добавь одну, чтобы отслеживать маленькие шаги.';
    host.appendChild(empty);
  }
  personalGoals.slice().reverse().forEach(g=>{
    const row=document.createElement('div');row.className='goal-item';
    if(g.progress>=g.target) row.classList.add('done');
    const top=document.createElement('div');top.className='goal-item-top';
    const title=document.createElement('div');title.className='goal-name';title.textContent=g.name;
    const count=document.createElement('div');count.className='goal-progress';
    count.textContent=g.progress>=g.target?'✓ Готово':g.progress+' / '+g.target;
    top.append(title,count);
    const track=document.createElement('div');track.className='goal-bar';
    const fill=document.createElement('div');fill.className='goal-bar-fill';
    fill.style.width=(g.progress/g.target*100)+'%';track.appendChild(fill);
    const actions=document.createElement('div');actions.className='goal-buttons';
    const plus=document.createElement('button');plus.textContent='+1 шаг';
    plus.dataset.action='advance';plus.dataset.id=g.id;plus.disabled=g.progress>=g.target;
    const del=document.createElement('button');del.textContent='Удалить';
    del.dataset.action='delete';del.dataset.id=g.id;
    actions.append(plus,del);
    row.append(top,track,actions);
    host.appendChild(row);
  });
}
function renderAchievements(){
  const host=document.getElementById('achievementsList');if(!host)return;
  host.innerHTML='';
  const items=[
    ['✦','Первый шаг','Выполни 1 задание',totalDone>=1],
    ['◆','Привычка','Выполни 10 заданий',totalDone>=10],
    ['★','Опытный','Выполни 30 заданий',totalDone>=30],
    ['✧','Смелый','Выполни 5 сложных заданий',totalHardDone>=5],
    ['◈','Неделя','Серия из 7 дней',bestStreak>=7],
    ['✴','Месяц','Серия из 30 дней',bestStreak>=30],
    ['⬡','Целеустремлённый','Доведи 3 личные цели до конца',goalsFinished>=3],
    ['◇','Коллекционер','Выполни 60 заданий',totalDone>=60],
    ['✧','Путешественник','Закончи первое сюжетное приключение',QUESTY_STORIES.some(s=>adventureStoryProgress[s.id] && adventureStoryProgress[s.id].runs>0)],
    ['◉','Марафонец','Заверши первый марафон',marathonCompletedCount()>0]
  ];
  document.getElementById('achievementsCounter').textContent=items.filter(x=>x[3]).length+' / '+items.length;
  items.forEach(a=>{
    const card=document.createElement('div');card.className='achievement '+(a[3]?'earned':'locked');
    const icon=document.createElement('div');icon.className='achievement-icon';icon.textContent=a[0];
    const name=document.createElement('div');name.className='achievement-name';name.textContent=a[1];
    const desc=document.createElement('div');desc.className='achievement-desc';desc.textContent=a[2];
    card.append(icon,name,desc);host.appendChild(card);
  });
}
document.getElementById('goalAdd').addEventListener('click',()=>{
  if(!appReady)return;
  const input=document.getElementById('goalTitle');
  const name=input.value.trim().replace(/\s+/g,' ');
  if(!name || name.length>80){showToast('Введите название цели до 80 символов');return;}
  const active=personalGoals.filter(g=>g.progress<g.target).length;
  if(active>=12){showToast('Можно вести не более 12 активных целей');return;}
  const target=parseInt(document.getElementById('goalTarget').value,10)||3;
  personalGoals.push({id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
    name,target,progress:0,created:dateKey()});
  saveGoals();input.value='';renderGoals();showToast('Цель добавлена');
});
document.getElementById('goalTitle').addEventListener('keydown',e=>{
  if(e.key==='Enter')document.getElementById('goalAdd').click();
});
let pendingGoalDelete = null;
document.getElementById('goalsList').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action]');if(!btn || !appReady)return;
  const i=personalGoals.findIndex(g=>g.id===btn.dataset.id);
  if(i<0)return;
  const g=personalGoals[i];
  if(btn.dataset.action==='advance' && g.progress<g.target){
    g.progress++;
    if(g.progress===g.target){
      goalsFinished++;saveGoalsFinished();renderAchievements();showToast('Цель достигнута!');
    }else showToast('Шаг отмечен');
  }else if(btn.dataset.action==='delete'){
    const now=Date.now();
    if(!pendingGoalDelete || pendingGoalDelete.id!==g.id || now-pendingGoalDelete.at>4000){
      pendingGoalDelete={id:g.id,at:now};
      showToast('Нажми «Удалить» ещё раз для подтверждения');
      return;
    }
    pendingGoalDelete=null;
    personalGoals.splice(i,1);
    showToast('Цель удалена');
  }else return;
  saveGoals();renderGoals();
});
function showWelcomeIfNeeded(){
  let seen=false;try{seen=localStorage.getItem('g_welcome_seen')==='1'}catch(e){}
  if(!seen) document.getElementById('welcomeOverlay').hidden=false;
}
document.getElementById('welcomeStart').addEventListener('click',()=>{
  document.getElementById('welcomeOverlay').hidden=true;
  try{localStorage.setItem('g_welcome_seen','1')}catch(e){}
});
