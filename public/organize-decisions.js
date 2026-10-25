// A decision owns the current card until both its animation and save have settled.
export function createDecisionGate({current,save,animate,commit,onBusy,isActive=()=>true}){
 let busy=false;
 return async(decision,expectedId)=>{
  if(busy||!isActive())return false;
  const card=current();if(!card||(expectedId&&card.id!==expectedId))return false;
  busy=true;onBusy(true);
  try{
   const [saved]=await Promise.allSettled([Promise.resolve().then(()=>save(card,decision)),Promise.resolve().then(()=>animate(card,decision))]);
   if(saved.status==='rejected')throw saved.reason;
   if(isActive())commit(card,decision);
   return true;
  }finally{busy=false;if(isActive())onBusy(false);}
 };
}
