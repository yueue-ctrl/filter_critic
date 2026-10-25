import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('refresh reset clears only the signed-in owner workspace, preserves accounts and other users, and rejects cross-origin requests',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'critroom-reset-')),port=45000+Math.floor(Math.random()*10000);
 const child=spawn(process.execPath,['--experimental-sqlite','server.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,AI_PROVIDER:'openai',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});child.stderr.on('data',()=>{});
 const call=async(path,body,cookie,origin)=>{const response=await fetch(`http://localhost:${port}/api${path}`,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...(origin?{origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],data:await response.json()};};
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});
 const a=await call('/register',{name:'Owner',email:'owner@example.test',password:'test-password'}),b=await call('/register',{name:'Peer',email:'peer@example.test',password:'test-password'});
 const p=(await call('/projects',{title:'Old project'},a.cookie)).data,q=(await call('/projects',{title:'Peer project'},b.cookie)).data;
 const c=(await call('/projects/'+p.id+'/critiques',{},a.cookie)).data;
 await call('/projects/'+p.id+'/feedback',{kind:'text',text:'Make the title clearer.',critique_id:c.id},a.cookie);
 assert.equal((await call('/workspace/reset',{})).status,401);assert.equal((await call('/workspace/reset',undefined,a.cookie)).status,405);assert.equal((await call('/workspace/reset',{},a.cookie,'https://another.example')).status,403);
 assert.equal((await call('/workspace/reset',{owner:b.data.id},a.cookie)).status,200);
 assert.deepEqual((await call('/projects',undefined,a.cookie)).data,[]);assert.deepEqual((await call('/folders',undefined,a.cookie)).data,[]);assert.equal((await call('/critiques/'+c.id,undefined,a.cookie)).status,404);
 assert.equal((await call('/me',undefined,a.cookie)).data.user.id,a.data.id);assert.equal((await call('/projects/'+q.id,undefined,b.cookie)).data.title,'Peer project');
 const fresh=(await call('/projects',{},a.cookie)).data;assert.equal((await call('/projects/'+fresh.id,undefined,a.cookie)).data.title,'untitled project');
 }finally{if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});rmSync(dir,{recursive:true,force:true});}
});
