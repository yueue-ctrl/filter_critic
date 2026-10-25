import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feedbackDocument} from '../public/feedback-export.js';
test('offline feedback export preserves takeaways, highlighted evidence, drawings and playable recordings; escapes user HTML',()=>{
 const p={title:'<script>bad</script>',image:null,feedback:[{id:'f',name:'Peer',kind:'audio',text:'Try Inter.',selection:{start:4,end:9},created:0},{id:'d',name:'Peer',kind:'drawing',text:'<img onerror=bad>',strokes:[[[0,0],[1,1]]],created:0}]};
 const html=feedbackDocument(p,[{created:0,takeaways:[{keyword:'Font',brief:'Try Inter.',decision:'keep',priority:'High',support:2,sources:[{id:'f',quote:'Try Inter.'}]}]}],{f:'data:audio/webm;base64,YWJj'},'data:font/ttf;base64,YWJj');
 assert.ok(html.includes('<mark>Inter</mark>'));assert.ok(html.includes('points="0,0 1000,1000"'));assert.ok(html.includes('src="data:audio/webm;base64,YWJj"'));assert.ok(html.includes('keep · High · 2 people'));assert.ok(html.includes('data:font/ttf;base64,YWJj'));assert.ok(!html.includes('<script>bad'));assert.ok(!html.includes('<img onerror=bad>'));
});
