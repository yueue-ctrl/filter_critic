// Reference frames are rendered once; the baked-in wording is replaced on every frame.
const WIDTH=540,HEIGHT=960,FRAME_MS=110,FRAME_COUNT=11;
const cards=[
 [[120,330],[420,330],[420,630],[120,630]],
 [[120,330],[420,330],[420,630],[120,630]],
 [[120,330],[420,330],[420,630],[120,630]],
 [[120,360],[415,358],[394,629],[144,629]],
 [[128,445],[395,445],[363,654],[160,654]],
 [[164,554],[363,552],[332,675],[194,675]],
 [[200,680],[333,678],[327,711],[204,715]],
];
let spriteReady,trashReady;
const scenes=new WeakMap();
export function prepareKeepMotion(){
 return spriteReady??=(async()=>{const image=new Image();image.src='/keep-motion.png';await image.decode();await document.fonts.load('24px Yomogi');return image;})();
}
function linesFor(context,text,size){
 context.font=`${size}px Yomogi`;const lines=[];let line='';
 for(const word of String(text).split(/\s+/).filter(Boolean)){
  if(context.measureText(line?line+' '+word:word).width<=250){line=line?line+' '+word:word;continue;}
  if(line){lines.push(line);line='';}
  for(const letter of word){if(context.measureText(line+letter).width>250){lines.push(line);line='';}line+=letter;}
 }
 if(line)lines.push(line);return lines;
}
function paintCaption(context,q,text,fontSize,mask=q){
 context.save();context.beginPath();mask.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));context.closePath();context.clip();context.fillStyle='#fff';context.fillRect(0,0,WIDTH,HEIGHT);
 let size=fontSize,lines=linesFor(context,text,size);while(lines.length*size*1.5>250&&size>10){size--;lines=linesFor(context,text,size);}
 const lineHeight=size*1.5,top=(300-lines.length*lineHeight)/2;
 context.fillStyle='#000';context.strokeStyle='#000';context.lineWidth=.35;context.textBaseline='middle';context.textAlign='center';
 lines.forEach((line,i)=>{
  const v=(top+(i+.5)*lineHeight)/300,left=[q[0][0]+(q[3][0]-q[0][0])*v,q[0][1]+(q[3][1]-q[0][1])*v],right=[q[1][0]+(q[2][0]-q[1][0])*v,q[1][1]+(q[2][1]-q[1][1])*v];
  const scaleY=((q[3][1]-q[0][1])+(q[2][1]-q[1][1]))/600;
  context.save();context.transform((right[0]-left[0])/300,(right[1]-left[1])/300,0,scaleY,left[0],left[1]);context.font=`${size}px Yomogi`;context.fillText(line,150,0);context.strokeText(line,150,0);context.restore();
 });context.restore();
}
export function drawKeepFrame(context,image,index,text,fontSize=24,offsetY=0){
 context.clearRect(0,0,WIDTH,HEIGHT);context.drawImage(image,index*WIDTH,0,WIDTH,HEIGHT,0,0,WIDTH,HEIGHT);
 if(index===0&&offsetY){context.clearRect(110,320,320,325);context.drawImage(image,110,320,320,325,110,320+offsetY,320,325);}
 const q=cards[index]?.map(([x,y])=>[x,y+(index===0?offsetY:0)]);if(q)paintCaption(context,q,text,fontSize);
}
function prepareTrashMotion(){
 return trashReady??=(async()=>{const image=new Image();image.src='/trash-motion.png';await image.decode();return image;})();
}
const foldFace=[[191,300],[250,295],[334,300],[303,371],[329,380],[367,419],[386,405],[379,435],[396,466],[375,480],[337,491],[298,494],[298,527],[273,546],[255,574],[257,589],[281,598],[237,597],[230,588],[192,578],[191,545],[195,538],[166,530],[143,511],[115,482],[128,442],[132,407],[150,405],[172,399],[201,399],[225,353],[207,327]];
export function drawTrashFrame(context,image,index,text,fontSize=24){
 context.clearRect(0,0,WIDTH,HEIGHT);context.save();context.translate(4,32);context.drawImage(image,index*WIDTH,0,WIDTH,HEIGHT,0,0,WIDTH,HEIGHT);
 if(index===0)paintCaption(context,[[119,302],[415,302],[415,595],[119,595]],text,fontSize);
 if(index===1){paintCaption(context,[[119,302],[415,302],[415,595],[119,595]],text,fontSize,foldFace);context.beginPath();foldFace.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));context.closePath();context.strokeStyle='#111';context.lineWidth=2.6;context.lineJoin='round';context.stroke();}
 context.restore();
}
function paintScene(scene,kind,index){
 const {context,image,trashImage,text,fontSize}=scene;
 if(kind==='trash'&&trashImage){
  drawTrashFrame(context,trashImage,index,text,fontSize);
  // Keep the other destination visible while the trash character crumples this card.
  context.drawImage(image,0,680,540,280,0,680,540,280);
 }else{
  drawKeepFrame(context,image,index,text,fontSize);
  if(trashImage)context.drawImage(trashImage,0,0,540,280,4,32,540,280);
 }
}
export function gestureFrame(dy,height){
 const kind=dy<0?'trash':'keep',limit=kind==='trash'?4:6;
 return {kind,frame:Math.min(limit,Math.floor(Math.abs(dy)/Math.max(1,height)*7))};
}
async function slideAway(front,decision,signal){
 if(!front||signal.aborted)return;
 const animation=front.animate([{transform:'translateY(0)',opacity:1},{transform:`translateY(${decision==='keep'?'100%':'-100%'}) scale(.65)`,opacity:0}],{duration:300,easing:'ease-in',fill:'forwards'});
 const cancel=()=>animation.cancel();signal.addEventListener('abort',cancel,{once:true});try{await animation.finished;}catch{}finally{signal.removeEventListener('abort',cancel);}
}
export async function showKeepIdle(stack,text,signal){
 const front=stack.querySelector('.takeaway-front');if(!front||signal.aborted)return;
 let image,trashImage;try{[image,trashImage]=await Promise.all([prepareKeepMotion(),prepareTrashMotion().catch(()=>null)]);}catch{return;}
 if(signal.aborted||!stack.isConnected||stack.querySelector('.takeaway-front')!==front)return;
 const existing=scenes.get(stack);if(existing?.front===front&&existing.canvas.isConnected)return existing;
 const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;canvas.className='keep-motion-canvas';canvas.setAttribute('aria-hidden','true');stack.append(canvas);
 const context=canvas.getContext('2d'),fontSize=parseFloat(getComputedStyle(front).fontSize)*310/stack.clientWidth;
 const scene={image,trashImage,canvas,context,fontSize,text,front,kind:'keep',frame:0};scenes.set(stack,scene);stack.classList.add('keep-scene');
 paintScene(scene,'keep',0);return scene;
}
export function previewKeepDrag(stack,dy){
 const scene=scenes.get(stack);if(!scene?.canvas.isConnected)return;
 Object.assign(scene,gestureFrame(dy,stack.clientHeight));paintScene(scene,scene.kind,scene.frame);
}
export async function playDecisionMotion(stack,text,decision,signal){
 if(signal.aborted||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const scene=await showKeepIdle(stack,text,signal);
 if(signal.aborted||!stack.isConnected)return;
 if(!scene||(decision==='trash'&&!scene.trashImage)){
  if(scene){scene.canvas.hidden=true;stack.classList.remove('keep-scene');}
  return slideAway(stack.querySelector('.takeaway-front'),decision,signal);
 }
 const {canvas}=scene,startFrame=scene.kind===decision?scene.frame:0,frameCount=decision==='trash'?15:FRAME_COUNT,frameMs=decision==='trash'?130:FRAME_MS;stack.classList.add('keep-collecting');
 await new Promise(resolve=>{
  let raf,start;const finish=()=>{cancelAnimationFrame(raf);signal.removeEventListener('abort',cancel);resolve();};
  const cancel=()=>{canvas.remove();stack.classList.remove('keep-collecting','keep-scene');finish();};
  signal.addEventListener('abort',cancel,{once:true});
  const tick=now=>{start??=now;const elapsed=now-start,index=Math.min(frameCount-1,startFrame+Math.floor(elapsed/frameMs));paintScene(scene,decision,index);if(elapsed>=(frameCount-startFrame)*frameMs+120){finish();return;}raf=requestAnimationFrame(tick);};
  raf=requestAnimationFrame(tick);
 });
}
