import './check-weekly.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const load=p=>fs.readFileSync(p,'utf8'),html=load('index.html');
assert.ok(html.includes('id="marathonApp"') && html.includes('id="myAdventures"'));
assert.ok(html.includes('id="randomQuickBtn"'), 'quick challenges should be accessible outside the 3 adventure cards');
assert.ok(html.indexOf('js/marathon-content.js') < html.indexOf('js/marathons.js'));
assert.ok(html.indexOf('js/marathons.js') < html.indexOf('js/adventures.js'));
assert.ok(load('js/goals-achievements.js').includes("marathonCompletedCount()>0"));
assert.ok(load('js/ui.js').includes("renderMarathons()") && load('js/ui.js').includes("renderMyAdventures()"));

const storage=new Map(),pending=new Map();
let day='2026-11-15',balance=1000,log=[];
const elements={};
function elem(id){
  if(!elements[id])elements[id]={innerHTML:'',textContent:'',addEventListener(){},contains(){return true}};
  return elements[id];
}
const context=vm.createContext({
 console,Date,Math,document:{getElementById:elem},
 localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))},
 pendingSaves:pending,queueStorageSet:(k,v)=>pending.set(k,String(v)),
 dateKey:()=>day,showToast:m=>log.push(m),
 balance,saveBalance:()=>{},updateBalanceUI:()=>{},updateMiningUI:()=>{},
 requestRewardedAd:async()=> 'closed',
 escapeHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 plural:(n,a,b,c)=>n===1?a:n>=2&&n<=4?b:c,
 storageGetMultiple:async keys=>Object.fromEntries(keys.map(k=>[k,storage.get('g_'+k)||'']))
});
for(const file of ['js/adventure-content.js','js/weekly-stories.js','js/marathon-content.js','js/marathons.js','js/adventures.js']){
  vm.runInContext(load(file),context,{filename:file});
}
const run=code=>vm.runInContext(code,context);
run('initAdventureLibrary()');
run('initMarathons()');
const marathons=run('QUESTY_MARATHONS');
assert.equal(marathons.length,5);
assert.equal(marathons.filter(m=>!m.premium).length,3);
assert.equal(marathons.filter(m=>m.premium).length,2);
assert.deepEqual([...marathons.map(m=>m.tasks.length)].sort((a,b)=>a-b),[3,7,7,30,30]);
assert.ok(marathons.every(m=>m.tasks.every(t=>typeof t==='string' && t.length>15)));

run('renderAdventures()');
const visible=elem('adventureApp').innerHTML;
assert.equal((visible.match(/<article class="weekly-card"/g)||[]).length,3,'only 3 adventure cards must be visible');
assert.ok(!visible.includes('av-search')&&!visible.includes('av-grid')&&!visible.includes('Быстрые'));
assert.ok(visible.includes('Сменить за рекламу'));
assert.ok(!visible.includes('Квартира номер ноль') || run("weeklyStories.slots.includes('flat-zero')"),
  'future stories must not be spoiled');

assert.equal(run("marathonStart('thirty-days')"),false,'premium should remain blocked');
assert.equal(run("marathonStart('three-sparks')"),true);
assert.equal(run("marathonEntry('three-sparks').active.completed"),0);
assert.equal(run("marathonComplete('three-sparks')"),true);
assert.equal(run("marathonComplete('three-sparks')"),false,'cannot complete two stages in same day');
assert.equal(run("marathonEntry('three-sparks').active.completed"),1);
assert.ok(elem('marathonApp').innerHTML.includes('Марафоны'));

day='2026-11-16';
assert.equal(run("marathonComplete('three-sparks')"),true);
assert.equal(run("marathonComplete('three-sparks')"),false);
day='2026-11-17';
assert.equal(run("marathonComplete('three-sparks')"),true);
assert.equal(run("marathonEntry('three-sparks').active"),null);
assert.equal(run("marathonEntry('three-sparks').history[0].status"),'success');
assert.equal(run('marathonCompletedCount()'),1);

day='2026-11-18';
assert.equal(run("marathonStart('week-observer')"),true);
assert.equal(run("marathonComplete('week-observer')"),true);
day='2026-11-20'; // 19th missed
assert.equal(run('marathonRefresh()'),true,'missed calendar day must fail');
assert.equal(run("marathonEntry('week-observer').active"),null);
assert.equal(run("marathonEntry('week-observer').history[0].status"),'failed');
assert.equal(run("marathonEntry('week-observer').history[0].completed"),1);
assert.equal(run("marathonStart('week-observer')"),true,'restart after failure must be free');
assert.equal(run("marathonEntry('week-observer').active.startDate"),'2026-11-20');
assert.equal(run("marathonComplete('week-observer')"),true);
assert.equal(run("marathonEntry('week-observer').active.completed"),1);

// Night boundary and midnight: one task per date, not 24 hours apart.
day='2026-11-21';
assert.equal(run("marathonComplete('week-observer')"),true);
assert.equal(run("marathonEntry('week-observer').active.completed"),2);
assert.equal(run("marathonComplete('week-observer')"),false);

// Future task text hidden even for active marathon; UI only shows today's task.
run("marathonSelected='week-observer';renderMarathons()");
const rendered=elem('marathonApp').innerHTML;
assert.ok(rendered.includes('День 3')===false,'day 3 must be locked until tomorrow');
assert.ok(rendered.includes('завтра'),'show when next day unlocks');

// Existing marathon storage keys remain independent from balance and adventures.
const saved=storage.get('g_questy_marathons_v1');
assert.ok(saved,'marathon save missing');
const snapshot=JSON.parse(saved);
assert.equal(snapshot.entries['week-observer'].active.completed,2);
run('marathonData={v:1,entries:{},updatedAt:0}');
context.__save=saved;
run('marathonApplyRecord(__save)');
assert.equal(run("marathonEntry('week-observer').active.completed"),2,'marathon restore failed');
assert.equal(run("marathonEntry('three-sparks').history[0].status"),'success');

assert.equal(run("marathonDayNumber('2026-02-29')")===run("marathonDayNumber('2026-02-29')"),false,'invalid date should be NaN');
assert.equal(run("marathonDayNumber('2028-02-29')+1"),run("marathonDayNumber('2028-03-01')"));
console.log('PASS: only 3 visible stories, 5 marathons, premium lock, consecutive dates, failed restart, restoration');
