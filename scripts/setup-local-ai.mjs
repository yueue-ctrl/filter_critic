import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {ensureOllama,localPaths} from '../local-ai.js';
const run=promisify(execFile),root=fileURLToPath(new URL('..',import.meta.url)),dir=path.join(root,'.local-ai');
process.chdir(root);fs.mkdirSync(dir,{recursive:true});
if(process.platform!=='darwin')throw Error('This installer targets macOS. Install Ollama and the Python environment manually on other platforms.');
if(!fs.existsSync(localPaths.python))await run('python3',['-m','venv',path.join(dir,'venv')]);
try{await run(localPaths.python,['-c','import faster_whisper']);}catch{console.log('Installing local speech dependencies…');await run(localPaths.python,['-m','pip','install','--upgrade','pip']);await run(localPaths.python,['-m','pip','install','-r','scripts/local-ai-requirements.txt'],{maxBuffer:8*1024*1024});}
if(!fs.existsSync(localPaths.ollama)){
 const version='v0.40.11',archive=path.join(dir,'ollama-darwin.tgz'),checksum='aea7d3f2e32371b7644a6e2ec8d4f26820a0e3965918cce8a46cef3e947f6291';
 if(!fs.existsSync(archive)){console.log('Downloading official Ollama runtime…');const r=await fetch(`https://github.com/ollama/ollama/releases/download/${version}/ollama-darwin.tgz`);if(!r.ok)throw Error('Ollama download failed');await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(archive));}
 if(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==checksum)throw Error('Ollama checksum mismatch');
 fs.mkdirSync(path.dirname(localPaths.ollama),{recursive:true});await run('tar',['-xzf',archive,'-C',path.dirname(localPaths.ollama)]);
}
if(!fs.existsSync(path.join(localPaths.whisper,'model.bin'))){console.log('Downloading offline speech model…');await run(localPaths.python,['scripts/download-speech-model.py'],{maxBuffer:8*1024*1024,env:{...process.env,HF_HUB_DISABLE_XET:'1'},timeout:600000});}
await ensureOllama();
const model=process.env.OLLAMA_MODEL||'qwen3:4b',url=process.env.OLLAMA_URL||'http://127.0.0.1:11434';
if(/cloud/i.test(model))throw Error('Choose a local model.');
const tags=await (await fetch(url+'/api/tags')).json();
if(!tags.models.some(m=>m.name===model)){
 console.log('Downloading local text model '+model+' (about 2.5 GB)…');
 const r=await fetch(url+'/api/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:true})});if(!r.ok)throw Error('Model download failed');let buffer='',progress=-1;
 for await(const chunk of r.body){buffer+=Buffer.from(chunk).toString();let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;const item=JSON.parse(line);if(item.error)throw Error(item.error);if(item.total){const n=Math.floor((item.completed||0)/item.total*10)*10;if(n!==progress){progress=n;console.log('Text model download: '+n+'%');}}else if(item.status==='success')console.log('Text model downloaded.');}}
}
fs.writeFileSync(path.join(dir,'ready.json'),JSON.stringify({model,speech:'Systran/faster-whisper-small',readyAt:new Date().toISOString()}));
console.log('Local AI is ready. No API key or paid API is required.');
