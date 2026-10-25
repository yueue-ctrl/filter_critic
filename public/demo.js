import {projectName} from './project-name.js';
import {createDemoSession,applyDemoAnalysis,demoExport} from './demo-session.js';
import {feedbackDocument} from './feedback-export.js';
import {prepareKeepMotion,playDecisionMotion,showKeepIdle,previewKeepDrag} from './organize-motion.js';
import {createDecisionGate} from './organize-decisions.js';
const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=createDemoSession(),view='home',capture=null,clock=null,sceneController=null,analysisController=null,starting=false,finishing=false;
let config={provider:'gemini',configured:false,maxAudioBytes:3000000,maxSeconds:600};
const entryDone=new Promise(resolve=>{const image=$('#entry-animation'),fallback=setTimeout(resolve,5000),play=()=>{clearTimeout(fallback);setTimeout(resolve,2860);};if(image.complete){if(image.naturalWidth)play();else{clearTimeout(fallback);resolve();}}else{image.onload=play;image.onerror=()=>{clearTimeout(fallback);resolve();};}});
function notice(message){$('#toast').textContent=message;}
function leaveView(){clearInterval(clock);sceneController?.abort();sceneController=null;}
function showView(next){leaveView();view=next;window.scrollTo(0,0);$('#toast').textContent='';}
function homeAnimation(){const image=$('.home-character');if(image)image.src='/home-character.gif?play='+crypto.randomUUID();}
function transcriptHTML(quotes){
 const spans=[];for(const quote of quotes){let i=0;while((i=session.transcript.indexOf(quote,i))!==-1){spans.push([i,i+quote.length]);i+=quote.length;}}
 spans.sort((a,b)=>a[0]-b[0]);let cursor=0,html='';for(const [start,end]of spans){if(start<cursor)continue;html+=esc(session.transcript.slice(cursor,start))+'<mark>'+esc(session.transcript.slice(start,end))+'</mark>';cursor=end;}return html+esc(session.transcript.slice(cursor));
}
function evidence(card){return `<details class="evidence"><summary>Transcript feedback</summary><small>${esc(card.priority)}${card.mentions>1?' · Mentioned '+card.mentions+' times':''}</small><p class="original">${transcriptHTML(card.quotes)}</p></details>`;}
function keptCard(card){return `<article class="kept-card"><h2>KEY POINTS</h2><p>${esc(card.brief)}</p>${evidence(card)}</article>`;}
function home(){
 showView('home');document.body.className='home-screen'+(session.analyzed?' feedback-results':'');const kept=session.takeaways.filter(t=>t.decision==='keep'),pending=session.takeaways.some(t=>t.decision==='pending');
 $('#app').innerHTML=`<header class="home-header"><a class="room-title" href="/" id="home-link">Critroom</a><button id="download-feedback" ${session.analyzed?'':'disabled'}>Download</button></header><main class="home-main"><div class="home-actions"><div class="home-project-box"><input id="home-project-name" aria-label="Project name" placeholder="untitled project" value="${session.named?esc(session.title):''}" maxlength="120" autocomplete="off"></div></div><section class="home-feedback"><h1>Feedback</h1>${kept.length?'<div class="home-feedback-cards">'+kept.map(keptCard).join('')+'</div>':`<p>${session.analyzed?'No takeaways kept yet.':'Start critique to see some feedback!'}</p>`}${pending?'<button id="review-pending" class="demo-text-button">Organize feedback</button>':''}</section>${session.analyzed?'':'<div class="home-footer"><div class="home-character-viewport"><img alt="" class="home-character"></div><button id="home-start">Start Critique</button></div>'}</main>`;
 $('#home-link').onclick=e=>{e.preventDefault();home();};$('#home-project-name').oninput=e=>{session.title=projectName(e.target.value);session.named=!!e.target.value.trim();};
 if($('#home-start'))$('#home-start').onclick=recordingView;$('#download-feedback').onclick=download;
 if($('#review-pending'))$('#review-pending').onclick=organizing;
 if(!$('#entry-loading'))homeAnimation();
}
function flowHeader(label,action=''){
 document.body.className='flow-screen';$('#app').innerHTML=`<header class="flow-header"><nav><a href="/" id="back-home">Critroom /</a>${label?'<span class="nav-ancestor">'+esc(session.title)+' /</span><span aria-current="page">'+esc(label)+'</span>':'<span aria-current="page">'+esc(session.title)+'</span>'}</nav>${action}</header><main id="flow-main"></main>`;
 const nav=$('.flow-header nav');requestAnimationFrame(()=>{nav.scrollLeft=nav.scrollWidth;});
 $('#back-home').onclick=async e=>{e.preventDefault();await stopCapture();home();};
}
const ring='<svg class="record-ring" viewBox="0 0 370 370" aria-hidden="true"><path d="M211 350 C146 346 73 320 40 267 C7 215 14 137 48 84 C86 27 164 3 228 20 C300 36 352 90 355 162 C361 226 328 291 275 317 C212 351 133 336 90 299 M90 299 C118 333 170 356 211 361"/></svg>';
const mic='<svg class="record-mic" viewBox="0 0 48 56" aria-hidden="true"><rect x="15" y="3" width="19" height="32" rx="6"/><path d="M5 24v10q0 10 19 10t19-10V24M24 44v9M14 53h20"/></svg>';
const pauseIcon='<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M5 3h8v33H5zM23 3h8v33h-8z"/></svg>',resumeIcon='<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M7 3L32 20L7 37Z"/></svg>';
function recordingView(){
 showView('record');flowHeader('');document.body.classList.add('recording-screen');
 $('#flow-main').innerHTML=`<div class="live-stage"><div class="recording-motion" hidden aria-hidden="true"><img id="recording-animation" src="/recording.gif" alt=""><canvas id="paused-animation" hidden></canvas></div><div class="record-center">${ring}${mic}<button id="live-record">${session.audio?'Record again':'Start recording'}</button><p id="live-clock">00:00</p><p id="live-status" role="status">${session.audio?'Recording ready.':''}</p></div><div class="live-bottom" ${capture||session.audio?'':'hidden'}><button id="live-pause" aria-label="Pause recording" disabled>${pauseIcon}</button><button id="finish-critique">Finish critique</button></div></div><p class="demo-session-note">${config.provider==='gemini'?'Audio is sent to Google for analysis. ':''}This is a temporary session. Download your results before refreshing.</p>`;
 $('#live-record').onclick=startCapture;$('#live-pause').onclick=togglePause;$('#finish-critique').onclick=finish;
 if(capture){paintRecordingState();clock=setInterval(updateClock,250);}
}
function elapsed(){return capture?capture.elapsed+(capture.recorder.state==='recording'?Date.now()-capture.started:0):0;}
function updateClock(){if(!$('#live-clock'))return;const total=Math.floor(elapsed()/1000);$('#live-clock').textContent=String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');if(capture&&total>=config.maxSeconds)capture.recorder.stop();}
function paintRecordingState(){
 const running=!!capture&&capture.recorder.state!=='inactive',paused=capture?.recorder.state==='paused',motion=$('.recording-motion');if(!motion)return;
 $('.live-stage').classList.toggle('recording-active',running);motion.hidden=!running;$('.live-bottom').hidden=!running&&!session.audio;
 $('#live-pause').disabled=!running;$('#live-pause').setAttribute('aria-label',paused?'Resume recording':'Pause recording');$('#live-pause').setAttribute('aria-pressed',String(!!paused));$('#live-pause').innerHTML=paused?resumeIcon:pauseIcon;
 const image=$('#recording-animation'),canvas=$('#paused-animation');
 if(paused&&image.complete&&image.naturalWidth){canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);canvas.hidden=false;image.hidden=true;}else{canvas.hidden=true;image.hidden=false;}
 $('#live-status').textContent=paused?'Recording paused.':running?'Recording…':session.audio?'Recording ready.':'';updateClock();
}
async function startCapture(){
 if(starting||capture||finishing)return;const button=$('#live-record');starting=true;button.disabled=true;$('#live-status').textContent='Waiting for microphone permission…';
 try{
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Microphone recording needs HTTPS or localhost and a supported browser.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(view!=='record'||!button.isConnected){stream.getTracks().forEach(t=>t.stop());return;}
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));let recorder;
  try{recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});}catch{stream.getTracks().forEach(t=>t.stop());throw Error('This browser could not start recording.');}
  session.audio=null;session.transcript='';session.takeaways=[];session.analyzed=false;session.created=Date.now();
  const c={stream,recorder,chunks:[],size:0,elapsed:0,started:Date.now(),done:null};let resolve,reject;c.done=new Promise((a,b)=>{resolve=a;reject=b;});c.done.catch(()=>{});capture=c;
  recorder.ondataavailable=e=>{if(e.data.size){c.chunks.push(e.data);c.size+=e.data.size;if(c.size>=config.maxAudioBytes-100000&&recorder.state!=='inactive')recorder.stop();}};
  recorder.onerror=()=>{stream.getTracks().forEach(t=>t.stop());if(capture===c)capture=null;clearInterval(clock);c.chunks=[];reject(Error('Recording stopped unexpectedly. Please record again.'));if(view==='record'){recordingView();notice('Recording stopped unexpectedly. Please record again.');}};
  recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(capture!==c){c.chunks=[];resolve();return;}clearInterval(clock);const blob=new Blob(c.chunks,{type:recorder.mimeType});c.chunks=[];if(capture===c)capture=null;if(blob.size>config.maxAudioBytes){reject(Error('This clip is too large. Please record a shorter clip.'));if(view==='record'){recordingView();notice('This clip is too large. Please record a shorter clip.');}return;}session.audio=blob;if(view==='record')recordingView();resolve();};
  recorder.start(1000);paintRecordingState();clock=setInterval(updateClock,250);
 }catch(e){notice(e.name==='NotAllowedError'?'Microphone permission is needed to record.':e.message);}finally{starting=false;if(button.isConnected)button.disabled=false;}
}
function togglePause(){if(!capture)return;const c=capture;if(c.recorder.state==='recording'){c.elapsed+=Date.now()-c.started;c.recorder.pause();}else if(c.recorder.state==='paused'){c.started=Date.now();c.recorder.resume();}paintRecordingState();}
async function stopCapture(){const c=capture;if(!c)return;if(c.recorder.state!=='inactive')c.recorder.stop();await c.done;}
const readData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
async function finish(){
 if(finishing)return;finishing=true;if($('#finish-critique'))$('#finish-critique').disabled=true;
 try{
  await stopCapture();if(!session.audio?.size)throw Error('Record some feedback first.');
  showView('processing');document.body.className='flow-screen';$('#app').innerHTML='<main class="processing-screen" role="status" aria-label="Processing feedback"><img class="loading-animation" src="/loading.gif?v=4" alt=""></main>';
  const controller=new AbortController();analysisController=controller;
  const response=await fetch('/api/analyze',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title:session.title,audio:await readData(session.audio)})});
  const result=await response.json().catch(()=>({error:response.status===413?'This clip is too large. Please record a shorter clip.':'Analysis is unavailable. Please retry.'}));
  if(!response.ok)throw Error(result.error||'Analysis could not finish. Please retry.');
  if(controller.signal.aborted)return;applyDemoAnalysis(session,result);analysisController=null;organizing();
 }catch(e){if(e.name==='AbortError')return;if(view==='processing'){showView('error');flowHeader('');$('#flow-main').innerHTML=`<div class="analysis-help"><h1>Analysis unavailable</h1><p>${esc(e.message)}</p><p>Your recording is still in this tab. Refreshing will clear it.</p><button id="retry-analysis">Retry analysis</button><button id="record-again">Record again</button></div>`;$('#retry-analysis').onclick=finish;$('#record-again').onclick=recordingView;}else notice(e.message);}finally{finishing=false;}
}
function organizing(){
 showView('organizing');flowHeader('Organizing','<button id="finalize">FINALIZE</button>');document.body.classList.add('organizing-screen');
 $('#flow-main').innerHTML='<div class="filter-stage"><button id="trash-card">Trash</button><div class="swipe-area"><div id="swipe-stack"></div><p id="filter-progress" role="status"></p></div><button id="keep-card">Keep</button></div><div class="filter-tools"><button id="undo-decision" disabled>Undo</button><details><summary>Sources</summary><div id="filter-evidence"></div></details></div>';
 const controller=new AbortController();sceneController=controller;const stack=$('#swipe-stack'),current=()=>session.takeaways.find(t=>t.decision==='pending'),active=()=>!controller.signal.aborted&&stack.isConnected;
 let busy=false,last=null,wheel=0,armed=true,resetWheel,keyboardFocus=false;
 prepareKeepMotion().catch(()=>{});
 const sync=()=>{const pending=!!current();$('#trash-card').disabled=$('#keep-card').disabled=busy||!pending;$('#finalize').disabled=busy||pending;$('#undo-decision').disabled=busy||!last;stack.setAttribute('aria-busy',String(busy));};
 const gate=createDecisionGate({current,isActive:active,onBusy:value=>{busy=value;sync();},save:async()=>{},animate:(card,decision)=>playDecisionMotion(stack,card.brief,decision,controller.signal),commit:(card,decision)=>{card.decision=decision;last=card.id;render();}});
 const decide=async(decision,id)=>{if(busy)return;try{await gate(decision,id);}catch(e){if(active()){notice(e.message);render();}}};
 $('#keep-card').onclick=()=>decide('keep');$('#trash-card').onclick=()=>decide('trash');$('#finalize').onclick=()=>{if(!busy&&!current())home();};
 $('#undo-decision').onclick=()=>{if(busy||!last)return;session.takeaways.find(t=>t.id===last).decision='pending';last=null;render();};
 $('.swipe-area').addEventListener('wheel',e=>{if(!current()||e.ctrlKey||Math.abs(e.deltaY)<=Math.abs(e.deltaX))return;e.preventDefault();clearTimeout(resetWheel);resetWheel=setTimeout(()=>{wheel=0;armed=true;},260);if(busy||!armed)return;wheel+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);if(Math.abs(wheel)>65){armed=false;void decide(wheel>0?'keep':'trash',current().id);}},{passive:false});controller.signal.addEventListener('abort',()=>clearTimeout(resetWheel),{once:true});
 function render(){
  if(!active())return;const t=current(),pending=session.takeaways.filter(t=>t.decision==='pending');stack.classList.remove('keep-collecting','keep-scene','scene-trash');
  $('#filter-progress').textContent=t?`${session.takeaways.length-pending.length+1} / ${session.takeaways.length}`:'All takeaways reviewed.';$('#filter-evidence').innerHTML=t?evidence(t):'';
  stack.innerHTML=t?`${pending.length>2?'<div class="stack-back back-two"></div>':''}${pending.length>1?'<div class="stack-back back-one"></div>':''}<div class="takeaway-front" tabindex="0" role="group" aria-label="Takeaway: ${esc(t.brief)}"><p>${esc(t.brief)}</p></div>`:`<p class="filter-empty">${session.takeaways.length?'Ready to finalize.':'No specific design takeaways were found.'}</p>`;
  sync();if(!t)return;const front=stack.querySelector('.takeaway-front');if(keyboardFocus){front.focus({preventScroll:true});keyboardFocus=false;}void showKeepIdle(stack,t.brief,controller.signal);let pointer=null;
  front.onpointerdown=e=>{if(busy||pointer||e.button>0||!e.isPrimary)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};front.setPointerCapture(e.pointerId);};
  front.onpointermove=e=>{if(!pointer||e.pointerId!==pointer.id)return;const dy=e.clientY-pointer.y;previewKeepDrag(stack,dy);front.style.transform=`translateY(${dy}px) rotate(${Math.max(-8,Math.min(8,dy/20))}deg)`;};
  front.onpointerup=e=>{if(!pointer||e.pointerId!==pointer.id)return;const dy=e.clientY-pointer.y,dx=e.clientX-pointer.x;pointer=null;front.style.transform='';if(Math.abs(dy)>65&&Math.abs(dy)>Math.abs(dx))void decide(dy>0?'keep':'trash',t.id);else previewKeepDrag(stack,0);};
  const cancel=()=>{if(!pointer)return;pointer=null;front.style.transform='';previewKeepDrag(stack,0);};front.onpointercancel=front.onlostpointercapture=cancel;
  front.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(!e.repeat){keyboardFocus=true;void decide(e.key==='ArrowDown'?'keep':'trash',t.id);}}};
 }
 render();
}
async function download(){
 const button=$('#download-feedback');if(!session.analyzed)return;button.disabled=true;
 try{const response=await fetch('/fonts/Yomogi-Regular.ttf');if(!response.ok)throw Error('The download could not be prepared. Please retry.');const font=await readData(await response.blob()),data=demoExport(session),html=feedbackDocument(data.project,data.critiques,{},font),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=(session.title.replace(/[^\p{L}\p{N} _-]/gu,'').trim()||'untitled project')+'-feedback.html';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){notice(e.message);}finally{if(button.isConnected)button.disabled=false;}
}
window.addEventListener('beforeunload',e=>{if(capture){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{analysisController?.abort();capture?.stream.getTracks().forEach(t=>t.stop());});
window.addEventListener('pageshow',e=>{if(e.persisted){session=createDemoSession();capture=null;home();}});
history.replaceState(null,'','/');
try{const response=await fetch('/api/config',{credentials:'omit'});if(response.ok)config={...config,...await response.json()};}catch{}
home();await entryDone;$('#entry-loading')?.remove();$('#app').inert=false;$('#app').removeAttribute('aria-hidden');homeAnimation();
