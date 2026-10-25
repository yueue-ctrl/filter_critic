import {MAX_AUDIO_BYTES,MAX_RECORD_SECONDS} from '../demo-analysis.js';
export default function config(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed.'}));}
 res.end(JSON.stringify({provider:'gemini',configured:!!process.env.GEMINI_API_KEY,maxAudioBytes:MAX_AUDIO_BYTES,maxSeconds:MAX_RECORD_SECONDS}));
}
