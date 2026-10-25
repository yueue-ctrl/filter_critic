import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../summary.js';
const f=(id,user,text,votes=[],kind='text')=>({id,user_id:user,text,votes,kind,selection:null});
test('duplicate feedback counts unique participants, not repetitions',()=>{const [g]=summarize([f('1','a','按钮太小'),f('2','a','按钮太小。',['b']),f('3','b','按钮太小',['a','c'])]);assert.equal(g.support,3);assert.equal(g.priority,'High');assert.equal(g.sources.length,3);});
test('opposite advice and separate drawings stay distinct',()=>{assert.equal(summarize([f('1','a','放大按钮'),f('2','b','缩小按钮')]).length,2);assert.equal(summarize([f('1','a','这里','', 'drawing'),f('2','b','这里',[], 'drawing')]).length,2);});
test('empty audio retained without invented transcript',()=>{const [g]=summarize([f('1','a','',[],'audio')]);assert.equal(g.keyword,'Recorded feedback');assert.equal(g.priority,'Needs review');});
test('common semantic variants merge while opposite and negated suggestions remain distinct',()=>{
 const groups=summarize([f('1','a','按钮不明显'),f('2','b','CTA不突出'),f('3','c','不要增强按钮对比度'),f('4','d','字号太小'),f('5','e','字体放大'),f('6','f','字号太大')]);
 assert.equal(groups.length,4);assert.equal(groups.find(g=>g.keyword==='Button hierarchy').support,2);assert.equal(groups.find(g=>g.keyword==='Small text').support,2);
});
test('English feedback uses English summaries and groups equivalent wording',()=>{
 const groups=summarize([f('1','a','The button is not prominent'),f('2','b','The CTA is hard to see'),f('3','c','The font is too small'),f('4','d','Make the text larger')]);
 assert.equal(groups.length,2);assert.equal(groups[0].support,2);assert.equal(groups[0].priority,'Medium');assert.match(groups[0].brief,/primary button/);
});
