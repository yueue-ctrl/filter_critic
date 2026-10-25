import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDemoSession,applyDemoAnalysis,demoExport} from '../public/demo-session.js';
import {feedbackDocument} from '../public/feedback-export.js';
test('a fresh visit is blank; successful analysis drops audio and exports only text, takeaways and decisions',()=>{
 const session=createDemoSession();session.title='Studio project';session.audio=new Blob(['temporary audio']);
 applyDemoAnalysis(session,{transcript:'Try Inter. Try Inter.',takeaways:[{id:'t',keyword:'Font',brief:'Try Inter.',quotes:['Try Inter.'],mentions:2,priority:'Medium'}]});
 assert.equal(session.audio,null);session.takeaways[0].decision='keep';const exported=demoExport(session),html=feedbackDocument(exported.project,exported.critiques,{},null);
 assert.match(html,/2 mentions/);assert.match(html,/Try Inter/);assert.match(html,/keep/);assert.ok(!html.includes('<audio controls'));assert.ok(!JSON.stringify(exported).includes('temporary audio'));
 const refreshed=createDemoSession();assert.equal(refreshed.title,'untitled project');assert.equal(refreshed.transcript,'');assert.deepEqual(refreshed.takeaways,[]);assert.equal(refreshed.audio,null);assert.equal(refreshed.analyzed,false);assert.equal(session.takeaways.length,1);
});
