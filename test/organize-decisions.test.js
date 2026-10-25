import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDecisionGate} from '../public/organize-decisions.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('one gesture owns one card until saving and its collection animation both finish',async()=>{
 const animation=deferred(),saved=deferred(),cards=[{id:'a'},{id:'b'}],calls=[],commits=[],busy=[];
 const decide=createDecisionGate({current:()=>cards[0],save:card=>{calls.push(card.id);return saved.promise;},animate:()=>animation.promise,commit:card=>{commits.push(card.id);cards.shift();},onBusy:value=>busy.push(value)});
 const first=decide('keep','a');assert.equal(await decide('keep','a'),false);await Promise.resolve();assert.deepEqual(calls,['a']);saved.resolve();await Promise.resolve();assert.deepEqual(commits,[]);assert.equal(await decide('keep','b'),false);
 animation.resolve();assert.equal(await first,true);assert.deepEqual(commits,['a']);assert.deepEqual(busy,[true,false]);assert.equal(await decide('keep','a'),false);assert.equal(cards[0].id,'b');
});
test('failed saves preserve the card and stay locked until the animation finishes before retry',async()=>{
 const animation=deferred(),card={id:'a'};let fail=true,commits=0;
 const decide=createDecisionGate({current:()=>card,save:async()=>{if(fail)throw Error('Offline');},animate:()=>animation.promise,commit:()=>commits++,onBusy:()=>{}});
 const first=decide('keep','a');const rejected=assert.rejects(first,/Offline/);await Promise.resolve();assert.equal(await decide('keep','a'),false);animation.resolve();await rejected;assert.equal(commits,0);fail=false;assert.equal(await decide('keep','a'),true);assert.equal(commits,1);
});
test('leaving Organizing while saving never commits into the next screen',async()=>{
 const saved=deferred();let active=true,commits=0;
 const decide=createDecisionGate({current:()=>({id:'a'}),save:()=>saved.promise,animate:async()=>{},commit:()=>commits++,onBusy:()=>{},isActive:()=>active});
 const pending=decide('keep');active=false;saved.resolve();await pending;assert.equal(commits,0);assert.equal(await decide('keep'),false);
});
test('trash and keep cannot both consume a card while the trash motion is running',async()=>{
 const animation=deferred(),cards=[{id:'a'},{id:'b'}],saved=[];
 const decide=createDecisionGate({current:()=>cards[0],save:async(card,decision)=>saved.push([card.id,decision]),animate:()=>animation.promise,commit:()=>cards.shift(),onBusy:()=>{}});
 const trash=decide('trash','a');assert.equal(await decide('keep','a'),false);assert.equal(await decide('trash','b'),false);animation.resolve();await trash;assert.deepEqual(saved,[['a','trash']]);assert.equal(cards[0].id,'b');
});
