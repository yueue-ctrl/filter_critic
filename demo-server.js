import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAnalysisHandler,geminiAnalysis,validatedResult,MAX_AUDIO_BYTES,MAX_RECORD_SECONDS} from './demo-analysis.js';
try{process.loadEnvFile('.env');}catch{}
const publicDir=fileURLToPath(new URL('./public/',import.meta.url));
// Local development may use the already installed offline models. Vercel never imports them.
const useLocal=!process.env.GEMINI_API_KEY&&process.env.DEMO_AI_PROVIDER!=='gemini'&&!process.env.VERCEL;
async function localAnalysis(input){
 const {localConfigured,localTranscribe,localExtract}=await import('./local-ai.js');
 if(!localConfigured())throw Object.assign(Error('Analysis is not connected yet. Please try again later.'),{status:503});
 const transcript=[input.audio?await localTranscribe(`data:${input.audio.mime};base64,${input.audio.data}`):'',input.text].filter(Boolean).join('\n');
 const items=transcript.trim()?await localExtract([{id:'transcript',text:transcript}]):[];
 return {...validatedResult({transcript,takeaways:items.map(t=>({keyword:t.keyword,brief:t.brief,quotes:t.sources.map(s=>s.quote)}))}),provider:'local'};
}
const analyze=createAnalysisHandler(useLocal?localAnalysis:geminiAnalysis);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.gif':'image/gif','.ttf':'font/ttf','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/analyze')return analyze(req,res);
 if(pathname==='/api/config'){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed.'}));}
  let configured=!!process.env.GEMINI_API_KEY;if(useLocal)configured=(await import('./local-ai.js')).localConfigured();
  return res.end(JSON.stringify({provider:useLocal?'local':'gemini',configured,maxAudioBytes:MAX_AUDIO_BYTES,maxSeconds:MAX_RECORD_SECONDS}));
 }
 if(req.method!=='GET'){res.statusCode=405;return res.end('Method not allowed');}
 try{
  const target=path.resolve(publicDir,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(publicDir)||!types[path.extname(target)]||pathname==='/app.js')throw Error();
  const bytes=await readFile(target);res.setHeader('Content-Type',types[path.extname(target)]);res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);
 }catch{res.statusCode=404;res.end('Not found');}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Critroom demo: http://localhost:'+(process.env.PORT||3000)));
