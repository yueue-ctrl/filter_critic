import {projectName} from './project-name.js';
export function createDemoSession(){return {title:projectName(''),named:false,created:Date.now(),audio:null,transcript:'',takeaways:[],analyzed:false};}
export function applyDemoAnalysis(session,result){
 session.transcript=String(result.transcript||'');session.takeaways=result.takeaways.map(t=>({...t,quotes:[...t.quotes],decision:'pending'}));session.audio=null;session.analyzed=true;
}
export function demoExport(session){
 const feedback={id:'transcript',name:'Recording transcript',kind:'text',text:session.transcript,strokes:[],selection:null,created:session.created};
 return {project:{title:session.title,image:null,feedback:[feedback]},critiques:[{created:session.created,takeaways:session.takeaways.map(t=>({...t,support:t.mentions,sources:t.quotes.map(quote=>({id:'transcript',quote}))}))}]};
}
