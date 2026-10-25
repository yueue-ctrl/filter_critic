import {projectName} from './public/project-name.js';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import QRCode from 'qrcode';
import { summarize } from './summary.js';
import { aiConfigured,aiProvider,transcribe,extractTakeaways } from './analysis.js';
try{process.loadEnvFile('.env');}catch{}
mkdirSync(process.env.DATA_DIR || 'data', { recursive: true });
const db = new DatabaseSync(`${process.env.DATA_DIR || 'data'}/critique.sqlite`);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT,salt TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,owner TEXT,title TEXT,description TEXT,invite TEXT UNIQUE,image TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS members(project_id TEXT,user_id TEXT,PRIMARY KEY(project_id,user_id));
CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,project_id TEXT,user_id TEXT,kind TEXT,text TEXT,strokes TEXT,audio TEXT,mime TEXT,selection TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS folders(id TEXT PRIMARY KEY,owner TEXT,title TEXT,invite TEXT UNIQUE,created INTEGER);
CREATE TABLE IF NOT EXISTS folder_members(folder_id TEXT,user_id TEXT,PRIMARY KEY(folder_id,user_id));
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,project_id TEXT,user_id TEXT,type TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS critiques(id TEXT PRIMARY KEY,project_id TEXT,code TEXT UNIQUE,status TEXT,created INTEGER,finished INTEGER,error TEXT,engine TEXT);
CREATE TABLE IF NOT EXISTS takeaways(id TEXT PRIMARY KEY,critique_id TEXT,keyword TEXT,brief TEXT,sources TEXT,support INTEGER,priority TEXT,decision TEXT DEFAULT 'pending',created INTEGER);
CREATE TABLE IF NOT EXISTS votes(feedback_id TEXT,user_id TEXT,PRIMARY KEY(feedback_id,user_id));`);
const id = () => randomBytes(16).toString('hex');
const stmt = sql => db.prepare(sql);
const fail = (status,message) => { throw Object.assign(new Error(message), {status}); };
const json = (res,status,data) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req) { let chunks=[], size=0; for await (const c of req) { size+=c.length; if(size>24*1024*1024) fail(413,'File too large. Use a file under 15 MB.');chunks.push(c); } try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'Invalid request format');} }
const userOf = req => {const token = req.headers.cookie?.match(/(?:^|;\s*)session=([a-f0-9]+)/)?.[1];return token ? stmt('SELECT users.id,users.name,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(token,Date.now()) : null;};
const membership = (pid,uid) => {if(!stmt('SELECT 1 FROM projects p WHERE p.id=? AND (EXISTS(SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=?) OR EXISTS(SELECT 1 FROM folder_members fm WHERE fm.folder_id=p.folder_id AND fm.user_id=?))').get(pid,uid,uid)) fail(403,'Join this project using an invitation first');};
const canAccessSQL = `EXISTS(SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=?) OR EXISTS(SELECT 1 FROM folder_members fm WHERE fm.folder_id=p.folder_id AND fm.user_id=?)`;
const visibleProjects = uid => stmt(`SELECT p.* FROM projects p WHERE ${canAccessSQL} ORDER BY p.created DESC`).all(uid,uid);
const cleanProject = ({image,...p}) => ({...p,hasImage:!!image});
if(!stmt('PRAGMA table_info(projects)').all().some(c=>c.name==='folder_id'))db.exec('ALTER TABLE projects ADD COLUMN folder_id TEXT');
for(const owner of stmt('SELECT DISTINCT owner FROM projects WHERE folder_id IS NULL').all()){
 const fid=id();stmt('INSERT INTO folders VALUES(?,?,?,?,?)').run(fid,owner.owner,'My projects',id(),Date.now());
 stmt('INSERT INTO folder_members VALUES(?,?)').run(fid,owner.owner);
 stmt('UPDATE projects SET folder_id=? WHERE owner=? AND folder_id IS NULL').run(fid,owner.owner);
}
for(const p of stmt("SELECT * FROM projects WHERE NOT EXISTS(SELECT 1 FROM events WHERE project_id=projects.id AND type='created')").all()){
 stmt('INSERT INTO events VALUES(?,?,?,?,?)').run(id(),p.id,p.owner,'created',p.created);
 if(p.image)stmt('INSERT INTO events VALUES(?,?,?,?,?)').run(id(),p.id,p.owner,'uploaded',p.created);
}
for(const [table,column,type]of [['projects','link','TEXT'],['feedback','critique_id','TEXT'],['feedback','ai_transcribed','INTEGER NOT NULL DEFAULT 0'],['feedback','original_text','TEXT'],['feedback','transcription_provider','TEXT']])if(!stmt('PRAGMA table_info('+table+')').all().some(c=>c.name===column))db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' '+type);
// Successful transcriptions keep their text, never the original audio.
stmt("UPDATE feedback SET audio=NULL WHERE ai_transcribed=1 AND audio IS NOT NULL").run();
// A process restart never leaves the UI polling an orphaned worker forever.
stmt("UPDATE critiques SET status='error',error='Analysis was interrupted. Retry to continue.' WHERE status='processing'").run();
const feedbackRows=cid=>stmt('SELECT f.*,users.name FROM feedback f JOIN users ON users.id=f.user_id WHERE critique_id=? ORDER BY created').all(cid).map(({audio,...f})=>({...f,has_audio:!!audio,strokes:JSON.parse(f.strokes),selection:JSON.parse(f.selection),votes:stmt('SELECT user_id FROM votes WHERE feedback_id=?').all(f.id).map(x=>x.user_id)}));
const takeawayRows=cid=>stmt('SELECT * FROM takeaways WHERE critique_id=? ORDER BY support DESC,created,id').all(cid).map(t=>({...t,sources:JSON.parse(t.sources)}));
const critiqueData=c=>({...c,feedback:feedbackRows(c.id),takeaways:takeawayRows(c.id),ai:aiConfigured(),provider:aiProvider()});
async function processCritique(cid){
 try{
 if(!aiConfigured())throw Error(aiProvider()==='local'?'Local AI is not ready yet. Your recordings are saved; start the local models and retry.':'AI analysis is unavailable. Your recordings are saved. Connect the AI service, then retry.');
 for(const f of stmt("SELECT * FROM feedback WHERE critique_id=? AND kind='audio' AND audio IS NOT NULL AND ai_transcribed=0 ORDER BY created").all(cid)){
 const text=await transcribe(f.audio);
 if(!stmt('SELECT 1 FROM critiques WHERE id=?').get(cid))return;
 stmt('UPDATE feedback SET original_text=COALESCE(original_text,text),text=?,ai_transcribed=1,transcription_provider=?,audio=NULL WHERE id=?').run(text.slice(0,12000),aiProvider(),f.id);
 }
 const feedback=feedbackRows(cid);const result=await extractTakeaways(feedback);
 if(!stmt('SELECT 1 FROM critiques WHERE id=?').get(cid))return;
 // Keep drawings with no text as reviewable original evidence, without claiming visual analysis.
 for(const f of feedback.filter(f=>f.kind==='drawing'&&!f.text.trim()))result.items.push({keyword:'Drawing',brief:'Review this drawing on the project.',sources:[{id:f.id,quote:''}],support:1,priority:'Needs review'});
 db.exec('BEGIN');try{stmt('DELETE FROM takeaways WHERE critique_id=?').run(cid);for(const t of result.items)stmt('INSERT INTO takeaways VALUES(?,?,?,?,?,?,?,?,?)').run(id(),cid,t.keyword,t.brief,JSON.stringify(t.sources),t.support,t.priority,'pending',Date.now());stmt("UPDATE critiques SET status='filtering',engine=?,error=NULL WHERE id=?").run(result.engine,cid);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }catch(e){console.error('Critique processing failed:',e.message);stmt("UPDATE critiques SET status='error',error=? WHERE id=?").run(e.message,cid);}
}
const attempts=new Map();
const server=http.createServer(async(req,res)=>{try{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
const url=new URL(req.url,'http://localhost'); const p=url.pathname;
if(p.startsWith('/api/')){
if(req.method!=='GET' && req.headers.origin && req.headers.origin!==`${req.socket.encrypted?'https':'http'}://${req.headers.host}`) fail(403,'Request origin does not match');
if(p==='/api/register'||p==='/api/login'){
if(req.method!=='POST')fail(405,'Method not allowed');
const ip=req.socket.remoteAddress, a=attempts.get(ip)||{n:0,t:Date.now()};if(Date.now()-a.t>600000){a.n=0;a.t=Date.now();}if(++a.n>40)fail(429,'Too many attempts. Please try again later.');attempts.set(ip,a);
const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||password.length<8||password.length>200)fail(400,'Enter a valid email and a password of at least 8 characters');
let u=stmt('SELECT * FROM users WHERE email=?').get(email);
if(p==='/api/register'){if(u)fail(409,'This email is already registered');const name=String(b.name||'').trim().slice(0,60);if(!name)fail(400,'Enter your name');const salt=id(),uid=id();stmt('INSERT INTO users VALUES(?,?,?,?,?)').run(uid,name,email,scryptSync(password,salt,64).toString('hex'),salt);u=stmt('SELECT * FROM users WHERE id=?').get(uid);}
else if(!u||!timingSafeEqual(Buffer.from(u.password,'hex'),scryptSync(password,u.salt,64)))fail(401,'Incorrect email or password');
const token=id();stmt('INSERT INTO sessions VALUES(?,?,?)').run(token,u.id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return json(res,200,{id:u.id,name:u.name,email:u.email});
}
const u=userOf(req);if(p==='/api/me')return json(res,200,{user:u});if(!u)fail(401,'Please sign in first');
if(p==='/api/logout'&&req.method==='POST'){stmt('DELETE FROM sessions WHERE token=?').run(req.headers.cookie?.match(/session=([a-f0-9]+)/)?.[1]||'');res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{});}
if(p==='/api/workspace/reset'){
 if(req.method!=='POST')fail(405,'Method not allowed');
 db.exec('BEGIN');try{
 stmt('DELETE FROM votes WHERE feedback_id IN (SELECT f.id FROM feedback f JOIN projects p ON p.id=f.project_id WHERE p.owner=?)').run(u.id);
 stmt('DELETE FROM takeaways WHERE critique_id IN (SELECT c.id FROM critiques c JOIN projects p ON p.id=c.project_id WHERE p.owner=?)').run(u.id);
 for(const table of ['feedback','events','critiques','members'])stmt('DELETE FROM '+table+' WHERE project_id IN (SELECT id FROM projects WHERE owner=?)').run(u.id);
 stmt('DELETE FROM projects WHERE owner=?').run(u.id);
 stmt('DELETE FROM folder_members WHERE folder_id IN (SELECT id FROM folders WHERE owner=?)').run(u.id);
 stmt('DELETE FROM folders WHERE owner=?').run(u.id);
 db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 return json(res,200,{reset:true});
}
if(p==='/api/capabilities'&&req.method==='GET')return json(res,200,{ai:aiConfigured()});
const startMatch=p.match(/^\/api\/projects\/([a-f0-9]+)\/critiques$/);
if(startMatch&&req.method==='POST'){
 const pid=startMatch[1];membership(pid,u.id);const project=stmt('SELECT * FROM projects WHERE id=?').get(pid);if(project.owner!==u.id)fail(403,'Only the project owner can start a critique');
 let c=stmt("SELECT * FROM critiques WHERE project_id=? AND status!='finalized' ORDER BY created DESC LIMIT 1").get(pid);
 if(!c){const cid=id();let code;do{code=randomBytes(5).toString('hex').toUpperCase().slice(0,8);}while(stmt('SELECT 1 FROM critiques WHERE code=?').get(code));stmt('INSERT INTO critiques(id,project_id,code,status,created) VALUES(?,?,?,?,?)').run(cid,pid,code,'active',Date.now());c=stmt('SELECT * FROM critiques WHERE id=?').get(cid);}
 return json(res,200,critiqueData(c));
}
const cm=p.match(/^\/api\/critiques\/([a-f0-9]+)(?:\/(qr|finish|retry|finalize))?$/);
if(cm){
 const c=stmt('SELECT * FROM critiques WHERE id=?').get(cm[1]);if(!c)fail(404,'Critique not found');membership(c.project_id,u.id);const project=stmt('SELECT * FROM projects WHERE id=?').get(c.project_id);
 if(!cm[2]&&req.method==='GET')return json(res,200,critiqueData(c));
 if(cm[2]==='qr'&&req.method==='GET'){const base=process.env.PUBLIC_URL||`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;res.writeHead(200,{'Content-Type':'image/png'});return res.end(await QRCode.toBuffer(`${base}/?code=${c.code}`,{width:320,margin:1}));}
 if(project.owner!==u.id)fail(403,'Only the project owner can finish or organize a critique');
 if(['finish','retry'].includes(cm[2])&&req.method==='POST'){
 if(c.status==='finalized')fail(409,'This critique is already finalized');
 if(c.status==='filtering'||c.status==='processing')return json(res,200,critiqueData(c));
 stmt("UPDATE critiques SET status='processing',error=NULL,finished=COALESCE(finished,?) WHERE id=?").run(Date.now(),c.id);
 void processCritique(c.id);return json(res,202,{status:'processing',id:c.id});
 }
 if(cm[2]==='finalize'&&req.method==='POST'){
 if(c.status==='finalized')return json(res,200,{project_id:c.project_id});
 if(c.status!=='filtering')fail(409,'Wait for analysis to complete');
 if(stmt("SELECT 1 FROM takeaways WHERE critique_id=? AND decision='pending'").get(c.id))fail(409,'Choose Keep or Trash for every takeaway first');
 stmt("UPDATE critiques SET status='finalized' WHERE id=?").run(c.id);stmt('INSERT INTO events VALUES(?,?,?,?,?)').run(id(),c.project_id,u.id,'finalized',Date.now());return json(res,200,{project_id:c.project_id});
 }
 fail(405,'Method not allowed');
}
const decisionMatch=p.match(/^\/api\/takeaways\/([a-f0-9]+)\/decision$/);
if(decisionMatch&&req.method==='POST'){
 const t=stmt('SELECT t.*,c.project_id,c.status FROM takeaways t JOIN critiques c ON c.id=t.critique_id WHERE t.id=?').get(decisionMatch[1]);if(!t)fail(404,'Takeaway not found');
 const project=stmt('SELECT * FROM projects WHERE id=?').get(t.project_id);if(project.owner!==u.id)fail(403,'Only the owner can organize takeaways');if(t.status!=='filtering')fail(409,'This critique is not being organized');
 const b=await body(req);if(!['keep','trash','pending'].includes(b.decision))fail(400,'Invalid decision');stmt('UPDATE takeaways SET decision=? WHERE id=?').run(b.decision,t.id);return json(res,200,{});
}
const transcriptMatch=p.match(/^\/api\/feedback\/([a-f0-9]+)\/transcript$/);
if(transcriptMatch&&req.method==='POST'){
 const f=stmt('SELECT f.*,p.owner FROM feedback f JOIN projects p ON p.id=f.project_id WHERE f.id=?').get(transcriptMatch[1]);if(!f)fail(404,'Feedback not found');membership(f.project_id,u.id);if(f.user_id!==u.id&&f.owner!==u.id)fail(403,'Only the author or project owner can edit the transcript');
 const c=f.critique_id?stmt('SELECT status FROM critiques WHERE id=?').get(f.critique_id):null;if(c&&['processing','filtering','finalized'].includes(c.status))fail(409,'Transcript cannot be changed after analysis; retry from the transcript step');
 const b=await body(req),text=String(b.text||'').trim().slice(0,12000);if(!text)fail(400,'Enter the transcript');stmt('UPDATE feedback SET text=? WHERE id=?').run(text,f.id);return json(res,200,{});
}

if(p==='/api/folders'){
 if(req.method==='GET'){
 const projects=visibleProjects(u.id).map(cleanProject);
 const folders=stmt('SELECT f.*,users.name owner_name FROM folders f JOIN users ON users.id=f.owner WHERE EXISTS(SELECT 1 FROM folder_members fm WHERE fm.folder_id=f.id AND fm.user_id=?) OR EXISTS(SELECT 1 FROM projects p JOIN members m ON m.project_id=p.id WHERE p.folder_id=f.id AND m.user_id=?) ORDER BY f.created DESC').all(u.id,u.id);
 return json(res,200,folders.map(f=>({...f,invite:f.owner===u.id?f.invite:undefined,projects:projects.filter(p=>p.folder_id===f.id)})));
 }
 if(req.method==='POST'){const b=await body(req),title=String(b.title||'').trim().slice(0,120);if(!title)fail(400,'Enter a folder name');const fid=id();stmt('INSERT INTO folders VALUES(?,?,?,?,?)').run(fid,u.id,title,id(),Date.now());stmt('INSERT INTO folder_members VALUES(?,?)').run(fid,u.id);return json(res,201,{id:fid});}
}
if(p==='/api/profiles'&&req.method==='GET'){
 const peers=new Set();
 for(const p of visibleProjects(u.id))for(const member of stmt('SELECT user_id FROM members WHERE project_id=? UNION SELECT user_id FROM folder_members WHERE folder_id=?').all(p.id,p.folder_id))if(member.user_id!==u.id)peers.add(member.user_id);
 return json(res,200,[...peers].map(uid=>stmt('SELECT id,name FROM users WHERE id=?').get(uid)));
}
const profileMatch=p.match(/^\/api\/profiles\/([a-f0-9]+)$/);
if(profileMatch&&req.method==='GET'){
 const uid=profileMatch[1],other=stmt('SELECT id,name FROM users WHERE id=?').get(uid);if(!other)fail(404,'Profile not found');
 const shared=visibleProjects(u.id).filter(p=>visibleProjects(uid).some(q=>q.id===p.id));
 if(uid!==u.id&&!shared.length)fail(403,'You can only view profiles of people in your projects');
 return json(res,200,{...other,projects:shared.map(cleanProject)});
}
const folderQR=p.match(/^\/api\/folders\/([a-f0-9]+)\/qr$/);
if(folderQR&&req.method==='GET'){
 const folder=stmt('SELECT * FROM folders WHERE id=? AND owner=?').get(folderQR[1],u.id);if(!folder)fail(403,'Only the folder owner can share its invitation');
 const base=process.env.PUBLIC_URL||`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;res.writeHead(200,{'Content-Type':'image/png'});return res.end(await QRCode.toBuffer(`${base}/?join=${folder.invite}`,{width:320,margin:2}));
}
if(p==='/api/projects'){
if(req.method==='GET')return json(res,200,visibleProjects(u.id).map(cleanProject));
if(req.method==='POST'){
 const b=await body(req),pid=id(),title=projectName(b.title);
 if(b.link){let link;try{link=new URL(String(b.link));}catch{fail(400,'Enter a valid project link');}if(!['https:','http:'].includes(link.protocol))fail(400,'Use an HTTP or HTTPS project link');}let folder;if(b.folder_id){folder=stmt('SELECT * FROM folders WHERE id=? AND owner=?').get(b.folder_id,u.id);if(!folder)fail(403,'Choose one of your personal folders');}
 else {folder=stmt('SELECT * FROM folders WHERE owner=? ORDER BY created LIMIT 1').get(u.id);if(!folder){const fid=id();stmt('INSERT INTO folders VALUES(?,?,?,?,?)').run(fid,u.id,'My projects',id(),Date.now());stmt('INSERT INTO folder_members VALUES(?,?)').run(fid,u.id);folder={id:fid};}}
 stmt('INSERT INTO projects(id,owner,title,description,invite,image,created,folder_id) VALUES(?,?,?,?,?,?,?,?)').run(pid,u.id,title,String(b.description||'').slice(0,2000),id(),null,Date.now(),folder.id);if(b.link){let link;try{link=new URL(String(b.link));}catch{fail(400,'Enter a valid project link');}if(!['https:','http:'].includes(link.protocol))fail(400,'Use an HTTP or HTTPS project link');stmt('UPDATE projects SET link=? WHERE id=?').run(link.href,pid);}stmt('INSERT INTO members VALUES(?,?)').run(pid,u.id);stmt('INSERT INTO events VALUES(?,?,?,?,?)').run(id(),pid,u.id,'created',Date.now());return json(res,201,{id:pid});
}}
if(p==='/api/join'&&req.method==='POST'){
 const b=await body(req);if(b.code){const c=stmt('SELECT * FROM critiques WHERE code=?').get(String(b.code).trim().toUpperCase());if(!c)fail(404,'Critique code not found');if(c.status!=='active')fail(409,'This critique is no longer accepting feedback');stmt('INSERT OR IGNORE INTO members VALUES(?,?)').run(c.project_id,u.id);return json(res,200,{id:c.project_id,critique_id:c.id});}const token=String(b.token||'');const folder=stmt('SELECT id FROM folders WHERE invite=?').get(token);
 if(folder){stmt('INSERT OR IGNORE INTO folder_members VALUES(?,?)').run(folder.id,u.id);return json(res,200,{folder_id:folder.id});}
 const project=stmt('SELECT id FROM projects WHERE invite=?').get(token);if(!project)fail(404,'Invitation not found');stmt('INSERT OR IGNORE INTO members VALUES(?,?)').run(project.id,u.id);return json(res,200,project);
}
const m=p.match(/^\/api\/projects\/([a-f0-9]+)(?:\/(image|feedback|qr|title))?$/);
if(m){const pid=m[1];membership(pid,u.id);const project=stmt('SELECT * FROM projects WHERE id=?').get(pid);if(!project)fail(404,'Project not found');
if(m[2]==='title'&&req.method==='POST'){if(project.owner!==u.id)fail(403,'Only the owner can rename this project');const b=await body(req),title=projectName(b.title);stmt('UPDATE projects SET title=? WHERE id=?').run(title,pid);return json(res,200,{title});}
if(m[2]==='qr'&&req.method==='GET'){const base=process.env.PUBLIC_URL||`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;res.writeHead(200,{'Content-Type':'image/png'});return res.end(await QRCode.toBuffer(`${base}/?join=${project.invite}`,{width:320,margin:2}));}
if(m[2]==='image'&&req.method==='POST'){if(project.owner!==u.id)fail(403,'Only the owner can upload project work');if(stmt('SELECT 1 FROM feedback WHERE project_id=?').get(pid))fail(409,'This work already has feedback. Create a new project for a new version to preserve annotations.');const b=await body(req);if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.image||''))fail(400,'Upload a PNG, JPEG or WebP image');stmt('UPDATE projects SET image=? WHERE id=?').run(b.image,pid);stmt('INSERT INTO events VALUES(?,?,?,?,?)').run(id(),pid,u.id,'uploaded',Date.now());return json(res,200,{});}
if(m[2]==='feedback'&&req.method==='POST'){const b=await body(req),text=String(b.text||'').trim().slice(0,12000),kind=b.kind;if(!['text','drawing','audio'].includes(kind))fail(400,'Invalid feedback type');if(!text&&kind==='text')fail(400,'Enter your feedback');if(kind==='audio'&&!/^data:audio\/[\w.+-]+(?:;codecs=[\w.-]+)?;base64,[A-Za-z0-9+/=]+$/.test(b.audio||''))fail(400,'Record or upload valid audio first');const strokes=Array.isArray(b.strokes)?b.strokes:[];if(strokes.length>1000||!strokes.every(s=>Array.isArray(s)&&s.length<=20000&&s.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(n=>Number.isFinite(n)&&n>=0&&n<=1))))fail(400,'Invalid drawing data');if(kind==='drawing'&&!strokes.length)fail(400,'Draw something first');let cid=b.critique_id||null;if(cid){const c=stmt('SELECT * FROM critiques WHERE id=? AND project_id=?').get(cid,pid);if(!c||c.status!=='active')fail(409,'This critique is no longer accepting feedback. Your local draft has not been cleared.');}const fid=id();stmt('INSERT INTO feedback(id,project_id,user_id,kind,text,strokes,audio,mime,selection,created,critique_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(fid,pid,u.id,kind,text,JSON.stringify(strokes),kind==='audio'?b.audio:null,String(b.mime||''),JSON.stringify(b.selection||null),Date.now(),cid);return json(res,201,{id:fid});}
if(!m[2]&&req.method==='GET'){const feedback=stmt('SELECT f.id,f.user_id,f.kind,f.text,f.strokes,f.selection,f.created,(f.audio IS NOT NULL) AS has_audio,users.name FROM feedback f JOIN users ON users.id=f.user_id WHERE project_id=? ORDER BY created DESC').all(pid).map(f=>({...f,has_audio:!!f.has_audio,strokes:JSON.parse(f.strokes),selection:JSON.parse(f.selection),votes:stmt('SELECT user_id FROM votes WHERE feedback_id=?').all(f.id).map(x=>x.user_id)}));return json(res,200,{...project,feedback,summary:summarize(feedback),critiques:stmt('SELECT * FROM critiques WHERE project_id=? ORDER BY created DESC').all(pid),kept:stmt("SELECT t.* FROM takeaways t JOIN critiques c ON c.id=t.critique_id WHERE c.project_id=? AND c.status='finalized' AND t.decision='keep' ORDER BY t.support DESC,t.created DESC").all(pid).map(t=>({...t,sources:JSON.parse(t.sources)})),timeline:stmt('SELECT e.*,users.name FROM events e JOIN users ON users.id=e.user_id WHERE project_id=? ORDER BY created').all(pid),memberCount:stmt('SELECT count(*) n FROM (SELECT user_id FROM members WHERE project_id=? UNION SELECT user_id FROM folder_members WHERE folder_id=?)').get(pid,project.folder_id).n});}}
const fm=p.match(/^\/api\/feedback\/([a-f0-9]+)\/(audio|vote)$/);if(fm){const f=stmt('SELECT * FROM feedback WHERE id=?').get(fm[1]);if(!f)fail(404,'Feedback not found');membership(f.project_id,u.id);if(fm[2]==='audio'&&req.method==='GET'){if(!f.audio)fail(404,'No audio available');const match=f.audio.match(/^data:([^,]+),(.+)$/);res.writeHead(200,{'Content-Type':match[1].split(';')[0],'Cache-Control':'private, no-store'});return res.end(Buffer.from(match[2],'base64'));}if(fm[2]==='vote'&&req.method==='POST'){if(stmt('SELECT 1 FROM votes WHERE feedback_id=? AND user_id=?').get(f.id,u.id))stmt('DELETE FROM votes WHERE feedback_id=? AND user_id=?').run(f.id,u.id);else stmt('INSERT INTO votes VALUES(?,?)').run(f.id,u.id);return json(res,200,{});}}
fail(404,'Endpoint not found');}
if(req.method!=='GET')fail(405,'Method not allowed');const files={'/':'index.html','/app.js':'app.js','/organize-motion.js':'organize-motion.js','/organize-decisions.js':'organize-decisions.js','/keep-motion.png':'keep-motion.png','/trash-motion.png':'trash-motion.png','/project-name.js':'project-name.js','/feedback-export.js':'feedback-export.js','/style.css':'style.css','/loading.gif':'loading.gif','/recording.gif':'recording.gif','/home-character.png':'home-character.png','/home-character.gif':'home-character.gif','/fonts/Yomogi-Regular.ttf':'fonts/Yomogi-Regular.ttf','/vendor/jsQR.js':'../node_modules/jsqr/dist/jsQR.js'};if(!files[p])fail(404,'Page not found');res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.gif')?'image/gif':p.endsWith('.png')?'image/png':p.endsWith('.ttf')?'font/ttf':'text/html; charset=utf-8'});res.end(readFileSync(new URL(`./public/${files[p]}`,import.meta.url)));
}catch(e){if(!e.status)console.error(e);json(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});}});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Critique Room: http://localhost:${process.env.PORT||3000}`));
