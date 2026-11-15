import './check-stage2.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=f=>fs.readFileSync(f,'utf8');
const local=new Map(),pending=new Map(),ads=[];
let shown='',saves=0,day='2026-11-15',adResult='cancelled';
const target={innerHTML:'',textContent:'',addEventListener(){},contains(){return true}};
const ctx=vm.createContext({
  console,Date,Math,
  localStorage:{getItem:key=>local.has(key)?local.get(key):null,setItem:(key,value)=>local.set(key,String(value))},
  document:{getElementById:()=>target},
  pendingSaves:pending,queueStorageSet:(key,value)=>pending.set(key,value),
  escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  plural:(n,a,b,c)=>n===1?a:n>=2&&n<=4?b:c,
  dateKey:()=>day,showToast:s=>{shown=s},
  requestRewardedAd:async()=>{ads.push(day);return adResult},
  balance:600,saveBalance:()=>saves++,updateBalanceUI:()=>{},updateMiningUI:()=>{},
  storageGetMultiple:async keys=>Object.fromEntries(keys.map(k=>[k,local.get('g_'+k)||'']))
});
for(const file of ['js/adventure-content.js','js/weekly-stories.js','js/adventures.js']){
  vm.runInContext(read(file),ctx,{filename:file});
}
const run=js=>vm.runInContext(js,ctx);
run('initAdventureLibrary()');

assert.equal(run('weeklyKey()'),'2026-11-09','week must start Monday');
assert.equal(run('weeklyStories.slots.length'),3);
assert.equal(run('new Set(weeklyStories.slots).size'),3);
assert.ok(run('weeklyStories.slots.every(id=>!adventureStoryById(id).premium)'));
assert.equal(run('WEEKLY_STORY_PRICE'),200);
assert.equal(run('adventureCatalogItems().length'),50,'quick challenges must remain available');
assert.equal(run('ADVENTURE_STORAGE_KEYS.includes(WEEKLY_STORIES_KEY)'),true);
const before=[...run('weeklyStories.slots')];
ctx.first=before[0];ctx.paid=before[1];ctx.other=before[2];
assert.equal(run('weeklySlot(first)'),0);
assert.equal(run('weeklySlot(paid)'),1);
assert.equal(run('weeklySlot(other)'),2);
assert.equal(run('weeklyCanAccess(adventureStoryById(first))'),false);
assert.equal(run('weeklyClaim(adventureStoryById(paid))'),false,'paid slot cannot be claimed free');
assert.equal(run('weeklyClaim(adventureStoryById(first))'),true);
assert.equal(run('weeklyStories.freeClaimed'),before[0]);
assert.equal(run('weeklyCanAccess(adventureStoryById(first))'),true);
assert.equal(run('weeklyClaim(adventureStoryById(first))'),true);
assert.equal(run('weeklyBuy(adventureStoryById(paid))'),true);
assert.equal(ctx.balance,400,'paid slot must cost 200 Q');
assert.equal(saves,1);
assert.equal(run('weeklyBuy(adventureStoryById(paid))'),true,'repeat buy must have no further charge');
assert.equal(ctx.balance,400);
assert.equal(run('weeklyQOwned.ids.length'),1);

run("adventureOpen('story',first)");
run("adventureStartStory(adventureStoryById(first))");
assert.equal(run('adventureStoryProgress[first].active'),true);

adResult='closed';
assert.equal(await run('weeklyReroll()'),false,'closed ad cannot reroll');
assert.deepEqual([...run('weeklyStories.slots')],before);
assert.equal(run('weeklyStories.rerolls'),0);
assert.equal(run('weeklyStories.freeClaimed'),before[0]);
adResult='success';
assert.equal(await run('weeklyReroll()'),true,'completed ad must reroll');
const after=[...run('weeklyStories.slots')];
assert.equal(after.length,3);
assert.equal(new Set(after).size,3);
assert.equal(after.filter(id=>before.includes(id)).length,0,'reroll must avoid previous 3');
assert.equal(run('weeklyStories.rerolls'),1);
assert.equal(run('weeklyStories.freeClaimed'),before[0],'ad may not restore free claim');
assert.equal(run('weeklyQOwned.ids.includes(paid)'),true,'Q owned must persist');
assert.equal(run('adventureStoryProgress[first].active'),true,'progress must persist');
assert.equal(run('weeklyCanAccess(adventureStoryById(first))'),true,'previously started story must remain available');
assert.equal(run('weeklyCanAccess(adventureStoryById(paid))'),true,'Q purchase must persist after reroll');
assert.equal(run('weeklyClaim(adventureStoryById(weeklyStories.slots[0]))'),false,'cannot claim two free stories in same week');

ctx.newFree=after[0];
run("adventureOpen('story',newFree)");
run("adventureStartStory(adventureStoryById(newFree))");
assert.equal(run('adventureStoryProgress[newFree].active'),false,'unclaimed new free card must be locked');
assert.equal(run('adventureStatus("quick","q01")'),'new');
assert.equal(run('adventureCatalogItems().filter(x=>x.kind==="quick").length'),50);

day='2026-11-16'; // new Monday
run('weeklyEnsureCurrent()');
assert.equal(run('weeklyKey()'),'2026-11-16');
assert.equal(run('weeklyStories.rerolls'),0,'new week resets ad rerolls');
assert.equal(run('weeklyStories.freeClaimed'),null,'new week resets free claim');
assert.equal(run('weeklyStories.slots.length'),3);
assert.equal(run('weeklyCanAccess(adventureStoryById(paid))'),true,'Q owned must persist after new week');
assert.equal(run('weeklyCanAccess(adventureStoryById(first))'),true,'started free story must persist');
assert.equal(run('weeklyQOwned.ids.length'),1);

// Storage restoration of the permanent Q purchase and active story.
const owned=local.get('g_questy_weekly_q_owned_v1');
assert.ok(owned);
run('weeklyQOwned.ids=[]');
ctx.__owned=owned;
run('weeklyApplyRecord(WEEKLY_Q_OWNED_KEY,__owned)');
assert.equal(run('weeklyQOwned.ids.includes(paid)'),true);
assert.ok(ads.length===2);
console.log('PASS: weekly 3 offers, 1 free, 2 Q, ad reroll, purchase safety, rollover, quick challenges and saved state');
