import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const jsNames = ['core','content','state','migrations','mining','ui','daily','goals-achievements','calendar-shop','adventure-content','adventures','bootstrap'];
const cssNames = ['base','features','navigation','adventures'];
const load = name => fs.readFileSync(name, 'utf8');
const html = load('index.html');

for (const name of jsNames) {
  new vm.Script(load('js/' + name + '.js'), { filename:'js/' + name + '.js' });
}
new vm.Script(jsNames.map(name => load('js/' + name + '.js')).join('\n'), { filename:'combined-classic-scripts.js' });
for (const name of cssNames) assert.ok(load('css/' + name + '.css').length > 200, name + '.css missing');

const scripts = [...html.matchAll(/<script src=\"(js\/[^\"]+)\"/g)].map(m => m[1]);
assert.deepEqual(scripts, jsNames.map(name => 'js/' + name + '.js'), 'classic script order changed');
assert.ok(!/<style>/.test(html), 'inline CSS should be external');
assert.ok(!/<script>/.test(html), 'inline app JS should be external');
const ids = [...html.matchAll(/\bid=\"([^\"]+)\"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'duplicate HTML IDs');
const nav = html.match(/<nav class=\"bottom-nav\"[^>]*>([\s\S]*?)<\/nav>/);
assert.ok(nav, 'bottom nav missing');
assert.deepEqual([...nav[1].matchAll(/data-screen=\"([^\"]+)\"/g)].map(m => m[1]),
  ['task','adventures','calendar','shop','profile'], 'five agreed sections not found');
for (const label of ['Главная','Приключения','Календарь','Лавка','Профиль']) assert.ok(nav[1].includes(label));
assert.ok(html.includes('id=\"openMiningButton\"') && html.includes('id=\"closeMiningButton\"'));
assert.ok(html.includes('data-screen=\"mining\"'));
assert.ok(!html.includes('id=\"taskMode\"'), 'unsupported daily topic selector remains');
assert.ok(load('js/ui.js').includes('navigateTo(target)'));
assert.ok(load('js/bootstrap.js').includes('migrateLegacyStorage();'));
assert.ok(load('js/content.js').includes('const TASKS_NORMAL=') && load('js/content.js').includes('const TASKS_HARD='));
assert.ok(load('js/state.js').includes("'owned_themes'") && load('js/state.js').includes("'mining'"));

// Migration: copy old unprefixed saves, never overwrite more recent g_ data.
const saved = new Map([
  ['balance','123'],['g_balance','777'],['streak','9'],
  ['owned_themes','[\"classic\",\"metal\"]'],['state_2026-11-15','{\"normal\":{}}'],
  ['history','[]'],['mining','{\"level\":2}']
]);
const storage = { getItem:k=>saved.has(k)?saved.get(k):null, setItem:(k,v)=>saved.set(k,String(v)) };
const context = vm.createContext({ localStorage:storage, stateKey:()=> 'state_2026-11-15',
  unlocksKey:()=> 'unlocks_2026-11-15', dateKey:()=> '2026-11-15', console });
vm.runInContext(load('js/migrations.js'), context);
context.migrateLegacyStorage();
assert.equal(saved.get('g_balance'),'777','migration overwrote existing balance');
assert.equal(saved.get('g_streak'),'9');
assert.equal(saved.get('g_owned_themes'),'[\"classic\",\"metal\"]');
assert.equal(saved.get('g_state_2026-11-15'),'{\"normal\":{}}');
assert.equal(saved.get('g_mining'),'{\"level\":2}');
assert.equal(saved.get('questy_schema_version'),'2');
context.migrateLegacyStorage();
assert.equal(saved.get('g_balance'),'777','repeat migration changed saved data');

console.log('PASS: JS syntax, script order, unique IDs, navigation, storage migration');
