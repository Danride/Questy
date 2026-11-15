import './check-stage1.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const load = file => fs.readFileSync(file,'utf8');
const html=load('index.html');
assert.ok(html.includes('id="adventureApp"') && html.includes('css/adventures.css'));
assert.ok(html.indexOf('js/adventure-content.js') < html.indexOf('js/adventures.js'));
assert.ok(html.indexOf('js/adventures.js') < html.indexOf('js/bootstrap.js'));
assert.ok(load('js/ui.js').includes("if(target === 'adventures') renderAdventures()"));
assert.ok(load('js/bootstrap.js').includes('initAdventureLibrary();'));

const local=new Map(), pending=new Map();
let result='closed', balanceSaves=0;
const node={innerHTML:'',textContent:'',addEventListener(){},contains(){return true}};
const ctx=vm.createContext({
  console,
  document:{getElementById:()=>node},
  localStorage:{getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,String(v))},
  pendingSaves:pending,
  queueStorageSet:(k,v)=>pending.set(k,String(v)),
  requestRewardedAd:async()=>result,showToast:()=>{},
  escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  plural:(n,a,b,c)=>n===1?a:n>1&&n<5?b:c,
  balance:1000,saveBalance:()=>balanceSaves++,updateBalanceUI:()=>{},updateMiningUI:()=>{},
  storageGetMultiple:async keys=>Object.fromEntries(keys.map(k=>[k,local.get('g_'+k)||'']))
});
vm.runInContext(load('js/adventure-content.js'),ctx);
vm.runInContext(load('js/adventures.js'),ctx);
const run=js=>vm.runInContext(js,ctx);
const quick=run('QUESTY_CHALLENGES'),stories=run('QUESTY_STORIES');
assert.equal(quick.length,50);assert.equal(stories.length,10);
assert.equal(stories.filter(s=>s.premium).length,3);
assert.equal(stories.filter(s=>!s.premium).length,7);
assert.equal(new Set(quick.map(q=>q.id)).size,50);
assert.equal(new Set(stories.map(s=>s.id)).size,10);
assert.deepEqual([...new Set(quick.map(q=>q.mode))].sort(),['duo','group','solo']);
assert.deepEqual([...new Set(stories.map(s=>s.mode))].sort(),['duo','group','solo']);
for(const q of quick) assert.ok(q.title && q.text && q.minutes>0 && ['easy','medium','hard'].includes(q.difficulty));
for(const story of stories){
  assert.ok(story.start in story.nodes);
  let exits=new Set(), seen=new Set(),queue=[[story.start,0]],min=100,max=0,paths=0;
  while(queue.length){
    const [id,depth]=queue.shift(),n=story.nodes[id];assert.ok(n,'bad link '+story.id+':'+id);
    assert.ok(depth<=15,'story cycle '+story.id);
    assert.ok(n.title && n.text);seen.add(id);
    if(n.type==='ending'){exits.add(id);paths++;min=Math.min(min,depth);max=Math.max(max,depth);}
    else if(n.type==='task'){
      assert.ok(['normal','hard','special'].includes(n.difficulty));queue.push([n.next,depth+1]);
    }else if(n.type==='choice'){
      assert.equal(n.options.length,2);for(const o of n.options) queue.push([o.next,depth+1]);
    }else assert.fail('invalid node type');
  }
  assert.equal(seen.size,Object.keys(story.nodes).length,'unreachable story node '+story.id);
  assert.equal(exits.size,2,'two endings required '+story.id);
  assert.ok(min>=5 && max<=15 && paths>=4,'poor story branching '+story.id);
}

run('initAdventureLibrary()');
run("adventureOpen('story','letters')");
run("adventureStartStory(adventureStoryById('letters'))");
const story=()=>run("adventureStoryProgress.letters");
assert.equal(story().node,'open');
for(const [kind,next,idx] of [
  ['done','fork',null],['choice','left',0],['done','middle',null],['done','choice',null],
  ['choice','wayA',0],['done','reveal',null],['done','last',null],['choice','endA',0]
]){
  run("adventureCommitStep(adventureStoryById('letters'),"+JSON.stringify(kind)+","+JSON.stringify(next)+","+JSON.stringify(idx)+")");
}
assert.equal(story().runs,1);assert.equal(story().active,false);
assert.deepEqual([...story().endings],['endA']);assert.equal(ctx.balance,1000);
run("adventureRestartStory(adventureStoryById('letters'))");
run("adventureRestartStory(adventureStoryById('letters'))");
assert.equal(story().node,'open');assert.equal(story().runs,1);

run("adventureOpen('story','unmapped-city')");
run("adventureStartStory(adventureStoryById('unmapped-city'))");
assert.equal(run("adventureStoryProgress['unmapped-city'].active"),false,'premium bypassed');

run("adventureOpen('quick','q01')");
run('adventureCompleteQuick()');
assert.equal(run('adventureQuickResults.done.q01.count'),1);
assert.equal(ctx.balance,1000,'completion must not reward Q');

run("adventureOpen('story','radio')");
run("adventureStartStory(adventureStoryById('radio'))");
await run("adventureSkip('q')");
assert.equal(ctx.balance,800);assert.equal(balanceSaves,1);
assert.equal(run('adventureStoryProgress.radio.node'),'fork');
assert.equal(run('adventureStoryProgress.radio.path[0].kind'),'skipped');
await run("adventureSkip('q')");
assert.equal(ctx.balance,800,'choice cannot be paid-skipped');
run("adventureCommitStep(adventureStoryById('radio'),'choice','left',0)");
result='closed';
await run("adventureSkip('ad')");
assert.equal(run('adventureStoryProgress.radio.node'),'left','closed ad bypass');
result='success';
await run("adventureSkip('ad')");
assert.equal(run('adventureStoryProgress.radio.node'),'middle');
assert.equal(ctx.balance,800,'reward ad should not charge Q');

run("adventureView.status='all';adventureView.type='story';adventureView.access='free'");
assert.equal(run('adventureCatalogItems().length'),7);
run("adventureView.mode='group'");
assert.equal(run('adventureCatalogItems().length'),2);
run("adventureFavorites.ids.push('q01')");
run("adventureView.type='quick';adventureView.mode='all';adventureView.access='all';adventureView.status='favorites'");
assert.equal(run('adventureCatalogItems().length'),1);
const saved=local.get('g_questy_story_v1_radio');
assert.equal(JSON.parse(saved).node,'middle');
ctx.__saved=saved;
run("adventureStoryProgress.radio=adventureFreshProgress(adventureStoryById('radio'))");
run("adventureApplyRecord(adventureProgressKey('radio'),__saved)");
assert.equal(run('adventureStoryProgress.radio.node'),'middle','restore failed');
console.log('PASS: catalog counts, branches, 2 endings, replay, premium locks, Q/ad skips, persistence, filters');
