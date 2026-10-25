import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createAnalysisHandler} from '../demo-analysis.js';
test('the anonymous endpoint works without accounts, rejects bad origins, and never sets a session cookie',async()=>{
 const requests=[];const handler=createAnalysisHandler(async input=>{requests.push(input);return {transcript:'Try Inter.',takeaways:[]};});const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{let r=await fetch(base);assert.equal(r.status,405);r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json',origin:'https://other.example'},body:JSON.stringify({text:'Try Inter.'})});assert.equal(r.status,403);r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Try Inter.'})});assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).transcript,'Try Inter.');assert.equal(requests.length,1);}finally{await new Promise(r=>server.close(r));}
});
test('the default demo server serves the no-login app and needs no database directory',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'critroom-no-db-')),port=46000+Math.floor(Math.random()*10000),child=spawn(process.execPath,['demo-server.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DEMO_AI_PROVIDER:'gemini',GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']});child.stderr.on('data',()=>{});
 try{await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});const base='http://127.0.0.1:'+port;const index=await(await fetch(base)).text();assert.match(index,/src="\/demo.js"/);assert.ok(!index.includes('jsQR'));assert.equal((await fetch(base+'/api/me')).status,404);assert.equal((await fetch(base+'/app.js')).status,404);const config=await(await fetch(base+'/api/config')).json();assert.equal(config.provider,'gemini');assert.equal(config.configured,false);assert.ok(!('key' in config));const r=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Try Inter.'})});assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null);assert.deepEqual(readdirSync(dir),[]);}finally{if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});rmSync(dir,{recursive:true,force:true});}
});
