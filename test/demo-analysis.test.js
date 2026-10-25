import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analysisInput,validatedResult,geminiAnalysis,MAX_AUDIO_BYTES} from '../demo-analysis.js';
const audio='data:audio/webm;codecs=opus;base64,YWJj';
test('anonymous analysis validates bounded audio and defaults the project name',()=>{
 assert.equal(analysisInput({audio}).title,'untitled project');assert.equal(analysisInput({audio}).audio.mime,'audio/webm');assert.equal(analysisInput({audio:'data:audio/mp4;base64,YWJj'}).audio.mime,'audio/m4a');
 assert.throws(()=>analysisInput({}),/Record/);assert.throws(()=>analysisInput({audio:'data:text/html;base64,YWJj'}),/supported/);assert.throws(()=>analysisInput({audio:'data:audio/webm;base64,a'}),/Invalid/);assert.throws(()=>analysisInput({audio:'data:audio/webm;base64,'+Buffer.alloc(MAX_AUDIO_BYTES+1).toString('base64')}),/shorter/);
});
test('takeaways retain verbatim evidence, merge repeats and count mentions without inventing people',()=>{
 const result=validatedResult({transcript:'Try Inter. Try Inter. Increase spacing.',takeaways:[{keyword:'Font',brief:'Try Inter.',quotes:['Try Inter.']},{keyword:'Font',brief:'try inter',quotes:['Try Inter.']},{keyword:'Spacing',brief:'Increase spacing.',quotes:['Increase spacing.']}]});
 assert.equal(result.takeaways.length,2);assert.equal(result.takeaways[0].mentions,2);assert.equal(result.takeaways[0].priority,'Medium');assert.equal(result.takeaways[0].decision,'pending');assert.ok(!('support' in result.takeaways[0]));
 assert.throws(()=>validatedResult({transcript:'Try Inter.',takeaways:[{keyword:'Fake',brief:'Use red.',quotes:['Use red.']}]}),/matched/);
});
test('Gemini receives inline audio through a server-side key without a persistent file upload',async()=>{
 const input=analysisInput({audio}),calls=[];
 const result=await geminiAnalysis(input,{env:{GEMINI_API_KEY:'test-key',OPENAI_API_KEY:'must-not-use'},fetcher:async(url,options)=>{calls.push(url);assert.equal(options.headers['x-goog-api-key'],'test-key');assert.equal(options.headers.Authorization,undefined);assert.ok(!String(url).includes('test-key'));const body=JSON.parse(options.body);assert.equal(body.contents[0].parts[1].inlineData.data,'YWJj');assert.equal(body.generationConfig.responseMimeType,'application/json');return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({transcript:'Try Inter.',takeaways:[{keyword:'Font',brief:'Try Inter.',quotes:['Try Inter.']}]})}]}}]})};}});
 assert.equal(calls.length,1);assert.match(calls[0],/^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/gemini-2.5-flash:generateContent$/);assert.equal(result.provider,'gemini');assert.ok(!('audio' in result));
});
test('missing keys, quota exhaustion and truncated output never use a paid fallback or leak provider details',async()=>{
 const input=analysisInput({audio});let called=false;
 await assert.rejects(geminiAnalysis(input,{env:{OPENAI_API_KEY:'not-a-fallback'},fetcher:async()=>{called=true;}}),e=>e.status===503);assert.equal(called,false);
 await assert.rejects(geminiAnalysis(input,{env:{GEMINI_API_KEY:'test'},fetcher:async()=>({ok:false,status:429,json:async()=>({secret:'never shown'})})}),e=>e.status===429&&!e.message.includes('secret'));
 await assert.rejects(geminiAnalysis(input,{env:{GEMINI_API_KEY:'test'},fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS'}]})})}),/shorter/);
});
