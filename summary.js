// Conservative, explicit topic rules. Unknown phrasing remains separate.
const topics = [
 {keyword:'Button hierarchy',brief:'The primary button is not prominent enough.',target:/按钮|cta|button/i,issue:/不明显|不突出|不够突出|难以找到|难找|看不清|不显眼|不够显眼|not.?visible|not (prominent|obvious|noticeable)|doesn.t stand out|hard to (find|see)/i},
 {keyword:'Small text',brief:'The text is too small; improve readability.',target:/字号|字体|文字|正文|font|text/i,issue:/太小|偏小|过小|增大|放大|small|larger|increase/i},
 {keyword:'Large text',brief:'The text is too large; adjust the font size.',target:/字号|字体|文字|正文|font|text/i,issue:/太大|偏大|过大|缩小|减小|too big|smaller|decrease/i},
 {keyword:'Low contrast',brief:'Content does not have enough contrast against the background.',target:/对比|contrast/i,issue:/不足|太低|偏低|不够|增强|提高|low|increase|insufficient|not enough/i},
 {keyword:'Unclear navigation',brief:'Navigation structure or entry points are unclear.',target:/导航|navigation/i,issue:/混乱|不清|难找|不明确|confus|unclear/i},
];
function topic(text){
 // Never collapse a sentence with negation of a suggestion, mixed directions, or multiple issues.
 if(/不要|不应|不用|无需|别|don't|do not/i.test(text))return null;
 const matches=topics.filter(t=>t.target.test(text)&&t.issue.test(text));
 return matches.length===1?matches[0]:null;
}
export function summarize(feedback) {
 const groups=new Map();
 for(const f of feedback){
 const normalized=f.text.toLowerCase().replace(/[\s，。！？,.!?；;：:]/g,'');
 const t=topic(f.text);
 const key=normalized?(f.kind==='drawing'?f.id:(t?.keyword||normalized)):f.id;
 if(!groups.has(key))groups.set(key,{id:f.id,keyword:t?t.keyword:f.text?f.text.split(/[，。,.!！?？\n]/)[0].slice(0,48):(f.kind==='audio'?'Recorded feedback':'Drawing feedback'),brief:t?t.brief:f.text?f.text.slice(0,100):(f.kind==='audio'?'Audio saved. Add a transcript to include it in text grouping.':'View the drawing on the project work.'),sources:[],authors:new Set(),voters:new Set()});
 const g=groups.get(key);g.sources.push(f.id);g.authors.add(f.user_id);for(const v of f.votes)g.voters.add(v);
 }
 return [...groups.values()].map(g=>{const people=new Set([...g.authors,...g.voters]).size;return {...g,authors:[...g.authors],voters:[...g.voters],support:people,priority:people>=3?'High':people>=2?'Medium':'Needs review',reason:people>=2?`${people} independent participants raised or agreed with this feedback`:'One contributor; impact needs review'};}).sort((a,b)=>b.support-a.support);
}
