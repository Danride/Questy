import './check-stage3.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync('index.html','utf8');
const base=fs.readFileSync('css/base.css','utf8');
const state=fs.readFileSync('js/state.js','utf8');
const ui=fs.readFileSync('js/ui.js','utf8');
const daily=fs.readFileSync('js/daily.js','utf8');

assert.match(html, /id="btnDone">Сделал<\/button>/);
assert.match(html, /id="btnSkip">Не сделал<\/button>/);
assert.ok(!html.includes('id="taskStatus"'), 'empty status DOM was not removed');
assert.ok(!state.includes('taskStatus'), 'unused status reference left in state');
assert.ok(!ui.includes('taskStatus'), 'status logic left in UI');
assert.ok(!base.includes('.task-status'), 'old empty status CSS left behind');
assert.ok(!ui.includes('вернись завтра') && !daily.includes('приходите завтра'), 'old status notice remains');
assert.match(base, /\.task-actions\.is-resolved \.btn-action\.selected/);

const code=ui.match(/function updateTaskActionsUI\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(code, 'task actions function was not found');
function button(){
  const classes=new Set();
  const attributes={};
  return {
    disabled:false,
    classes,
    attributes,
    classList:{
      add:c=>classes.add(c),
      remove:c=>classes.delete(c),
      toggle:(c,on)=>{if(on)classes.add(c);else classes.delete(c);}
    },
    setAttribute:(key,val)=>{attributes[key]=val;}
  };
}
const actions=button(),done=button(),skip=button();
const context=vm.createContext({
  dailyState:{normal:{done:false,skipped:false,revealed:false}},
  currentCategory:'normal',
  taskActions:actions,btnDone:done,btnSkip:skip
});
vm.runInContext(code,context);
const update=()=>vm.runInContext('updateTaskActionsUI()',context);
const st=context.dailyState.normal;

update();
assert.equal(actions.classes.has('hidden'),true,'buttons must stay hidden under the film');
assert.equal(done.disabled,false);
assert.equal(skip.disabled,false);

st.revealed=true;update();
assert.equal(actions.classes.has('hidden'),false,'two buttons should appear after reveal');
assert.equal(actions.classes.has('is-resolved'),false);
assert.equal(done.disabled,false);
assert.equal(skip.disabled,false);

st.done=true;update();
assert.equal(actions.classes.has('hidden'),false,'done should keep both buttons visible');
assert.equal(actions.classes.has('is-resolved'),true);
assert.equal(done.classes.has('selected'),true);
assert.equal(skip.classes.has('selected'),false);
assert.equal(done.disabled,true);
assert.equal(skip.disabled,true);
assert.equal(done.attributes['aria-pressed'],'true');

st.done=false;st.skipped=true;update();
assert.equal(actions.classes.has('hidden'),false,'skipped should keep both buttons visible');
assert.equal(done.classes.has('selected'),false);
assert.equal(skip.classes.has('selected'),true);
assert.equal(done.attributes['aria-pressed'],'false');
assert.equal(skip.attributes['aria-pressed'],'true');
assert.equal(done.disabled,true);
assert.equal(skip.disabled,true);

st.skipped=false;st.revealed=false;update();
assert.equal(actions.classes.has('hidden'),true,'new daily task should reset buttons');
assert.equal(actions.classes.has('is-resolved'),false);
assert.equal(done.disabled,false);
assert.equal(skip.disabled,false);

assert.match(daily, /btnDone\.addEventListener\('click', handleDone\)/);
assert.match(daily, /btnSkip\.addEventListener\('click', handleSkip\)/);
assert.match(daily, /st\.skipped = true;/);
assert.match(daily, /saveDailyState\(\);/);

console.log('PASS: no empty task bar, two persistent response buttons, selected and disabled states, original saves intact');
