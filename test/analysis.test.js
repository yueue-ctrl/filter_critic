process.env.AI_PROVIDER='openai';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localTakeaways,validateTakeaways,transcribe,extractTakeaways} from '../analysis.js';
const note=(id,user,text)=>({id,user_id:user,text,kind:'text',votes:[],strokes:[]});
test('split independent sentences, group repeats and keep distinct contributors',()=>{
 const items=localTakeaways([note('a','u','The button is not prominent. The text is too small.'),note('b','v','The CTA is hard to see.')]);assert.equal(items.length,2);assert.equal(items[0].support,2);assert.equal(items[0].sources.length,2);assert.equal(items[0].priority,'Medium');
});
test('reject invented quotations and nonexistent source IDs',()=>{
 const feedback=[note('a','u','Try Inter.')];assert.throws(()=>validateTakeaways([{keyword:'Font',brief:'Try Inter',sources:[{id:'a',quote:'Use Helvetica'}]}],feedback));assert.throws(()=>validateTakeaways([{keyword:'Font',brief:'Try Inter',sources:[{id:'missing',quote:'Try Inter.'}]}],feedback));
});
test('AI adapter uploads real audio and validates structured source evidence',async()=>{
 const old=process.env.OPENAI_API_KEY,originalFetch=globalThis.fetch;process.env.OPENAI_API_KEY='test-only';
 try{
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.ok(options.body instanceof FormData);assert.equal(await options.body.get('file').text(),'audio');return {ok:true,json:async()=>({text:'Try Inter.'})};};
 assert.equal(await transcribe('data:audio/webm;base64,YXVkaW8='),'Try Inter.');
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(options.body);assert.equal(b.text.format.strict,true);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({takeaways:[{keyword:'Font',brief:'Try Inter.',sources:[{id:'a',quote:'Try Inter.'}]}]})}]}]})};};
 const result=await extractTakeaways([note('a','u','Try Inter.')]);assert.equal(result.engine,'ai');assert.equal(result.items[0].brief,'Try Inter.');
 }finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('AI extraction never silently falls back to rules without a key',async()=>{
 const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 try{await assert.rejects(extractTakeaways([note('a','u','Try Inter.')]),/AI analysis is unavailable/);}finally{if(old!==undefined)process.env.OPENAI_API_KEY=old;}
});
test('distinguish account quota from temporary rate limits without exposing provider messages',async()=>{
 const originalFetch=globalThis.fetch;
 try{
 for(const [code,type,expected]of [['insufficient_quota','insufficient_quota',/credits or usage quota/],['credit_balance_exhausted','insufficient_quota',/credits or usage quota/],['rate_limit_exceeded','rate_limit_error',/temporarily rate limiting/]]){
 globalThis.fetch=async()=>({ok:false,status:429,json:async()=>({error:{code,type,message:'sensitive provider detail'}})});
 await assert.rejects(transcribe('data:audio/webm;base64,YXVkaW8='),e=>expected.test(e.message)&&!e.message.includes('sensitive provider detail'));
 }
 }finally{globalThis.fetch=originalFetch;}
});
