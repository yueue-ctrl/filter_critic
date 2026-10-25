import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localExtract,evidenceSegments,resolveEvidence} from '../local-ai.js';
import {extractTakeaways,aiProvider} from '../analysis.js';
const feedback=[{id:'f1',user_id:'u1',text:'Try Inter. Make the button clearer.',votes:[],kind:'text'},{id:'f2',user_id:'u2',text:'Try Inter.',votes:[],kind:'text'}];
test('evidence IDs resolve to original quotes and reject invented references',()=>{
 const e=evidenceSegments(feedback);assert.equal(e.length,3);assert.deepEqual(resolveEvidence([{keyword:'Font',brief:'Try Inter',source_ids:['E0001','E0003']}],e)[0].sources,[{id:'f1',quote:'Try Inter.'},{id:'f2',quote:'Try Inter.'}]);assert.throws(()=>resolveEvidence([{keyword:'Wrong',brief:'Wrong',source_ids:['missing']}],e));
});
test('default local AI never uses a paid API even if an OpenAI key exists',async()=>{
 const provider=process.env.AI_PROVIDER,key=process.env.OPENAI_API_KEY,fetcher=globalThis.fetch;delete process.env.AI_PROVIDER;process.env.OPENAI_API_KEY='must-not-be-used';let calls=[];
 try{assert.equal(aiProvider(),'local');globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.match(String(url),/^http:\/\/(127\.0\.0\.1|localhost):11434\//);assert.ok(!options?.headers?.Authorization);if(String(url).endsWith('/api/tags'))return {ok:true};const request=JSON.parse(options.body);assert.equal(request.think,false);assert.equal(request.stream,false);assert.equal(request.model,'qwen3:4b');return {ok:true,json:async()=>({message:{content:JSON.stringify({takeaways:[{keyword:'Typography',brief:'Try Inter.',source_ids:['E0001','E0003']}]})}})};};const result=await extractTakeaways(feedback);assert.equal(result.engine,'local');assert.equal(result.items[0].support,2);assert.equal(result.items[0].sources.length,2);assert.equal(calls.length,2);
 }finally{globalThis.fetch=fetcher;if(provider===undefined)delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=provider;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('local model cannot cite sources outside its evidence batch',async()=>{
 const fetcher=globalThis.fetch;
 try{globalThis.fetch=async(url)=>String(url).endsWith('/api/tags')?{ok:true}:{ok:true,json:async()=>({message:{content:JSON.stringify({takeaways:[{keyword:'Fake',brief:'Invented',source_ids:['E9999']}]})}})};await assert.rejects(localExtract(feedback),/unknown evidence/);}finally{globalThis.fetch=fetcher;}
});
