'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {scanSeeds,seedOrder}=require('../desktop/rune-seed-evidence.cjs');

const hash='a'.repeat(64);
const scope={route:'local-solo-rune',resourceVersion:'0.0.816',nativeSHA256:hash,
 scriptIndexSHA256:hash,teamSHA256:hash,suitIndexSHA256:hash};
const win=seed=>({seed,completed:true,outcome:'win',wavesCleared:3,bouts:25,engineSeconds:100+seed/100,
 combatMs:98000,nativeSHA256:hash,scriptIndexSHA256:hash,teamSHA256:hash,suitIndexSHA256:hash,recordSHA256:hash});

async function directory(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-rune-seeds-test-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 return dir;
}

test('本地单人种子遍历恰好覆盖 0 至 9999',()=>{
 assert.deepEqual(seedOrder.toSorted((a,b)=>a-b),Array.from({length:10000},(_,i)=>i));
});

test('四个并行复跑分配不同种子并按原伤害口径续跑', {timeout:5000}, async t=>{
 const dir=await directory(t),plan={},started=[];
 const minimumScope={...scope,damageFloor:true};
 let notifyStarted,release;
 const fourStarted=new Promise(resolve=>{notifyStarted=resolve;});
 const finishFirstFour=new Promise(resolve=>{release=resolve;});
 const runners=Array.from({length:4},()=>({async runSeedEvidence(_plan,seed){
  started.push(seed);
  if(started.length===4)notifyStarted();
  await finishFirstFour;
  return win(seed);
 }}));
 const batch=scanSeeds({scope:minimumScope,dir,plan,runners,limit:5});
 await fourStarted;
 assert.deepEqual(started,seedOrder.slice(0,4));
 release();
 const first=await batch;
 assert.equal(first.workerCount,4);
 assert.equal(first.damageFloor,true);
 assert.equal(first.wins,5);
 assert.deepEqual(started,seedOrder.slice(0,5));
 const resumed=await scanSeeds({scope:minimumScope,dir,plan,runners,limit:3});
 assert.equal(resumed.wins,8);
 assert.deepEqual(started,seedOrder.slice(0,8));
 await assert.rejects(scanSeeds({scope,dir,plan,runners,limit:1}),/绑定了另一份阵容/);
});

test('同范围续跑跳过已验证种子，真实失败持久记录且保留最慢通过样本',async t=>{
 const dir=await directory(t), plan={};
 const runner={async runSeedEvidence(_plan,seed){return win(seed);}};
 const initial=await scanSeeds({scope,dir,plan,runners:[runner],limit:2});
 assert.equal(initial.wins,2);
 assert.equal(initial.status,'incomplete');
 assert.equal(initial.slowest.seed,9999);
 const failed={async runSeedEvidence(_plan,seed){
  assert.equal(seed,seedOrder[2]);
  return {...win(seed),outcome:'loss',wavesCleared:2};
 }};
 const next=await scanSeeds({scope,dir,plan,runners:[failed]});
 assert.equal(next.wins,2);
 assert.equal(next.status,'seed-loss');
 assert.equal(next.loss.seed,seedOrder[2]);
 assert.equal(next.loss.wavesCleared,2);
 const saved=await scanSeeds({scope,dir,plan,runners:[failed]});
 assert.equal(saved.attempted,0);
 assert.deepEqual(saved.loss,next.loss);
 await assert.rejects(scanSeeds({scope:{...scope,teamSHA256:'b'.repeat(64)},dir,plan,runners:[runner]}),/绑定了另一份阵容/);
});

test('取消并保留已完成的种子，未知结果在下次运行可重试',async t=>{
 const dir=await directory(t), plan={}, cancellation=new AbortController();
 let stop;
 const runner={async runSeedEvidence(_plan,seed){
  if(seed===seedOrder[0])return win(seed);
  cancellation.abort();
  throw Error('已停止');
 },async stop(){stop=true;}};
 const interrupted=await scanSeeds({scope,dir,plan,runners:[runner],signal:cancellation.signal});
 assert.equal(stop,true);
 assert.equal(interrupted.stopped,true);
 assert.equal(interrupted.wins,1);
 const bad={async runSeedEvidence(_plan,seed){
  assert.equal(seed,seedOrder[1]);
  return {...win(seed),nativeSHA256:'c'.repeat(64)};
 }};
 const inconclusive=await scanSeeds({scope,dir,plan,runners:[bad]});
 assert.equal(inconclusive.status,'inconclusive');
 assert.equal(inconclusive.uncertain.seed,seedOrder[1]);
 assert.equal(inconclusive.wins,1);
 const retried=await scanSeeds({scope,dir,plan,limit:1,runners:[{async runSeedEvidence(_plan,seed){
  assert.equal(seed,seedOrder[1]);return win(seed);
 }}]});
 assert.equal(retried.wins,2);
});

test('虚无全种子断点区分最终胜利、两波清场与原版落败',async t=>{
 const dir=await directory(t),plan={};
 const hun={...scope,dungeonId:103,route:'normal-solo-hun13',engineSHA256:hash};
 const report=(seed,first,second)=>({
  ...win(seed),engineSHA256:hash,outcome:second?'win':'loss',wavesCleared:Number(first)+Number(second),
  rounds:[{wave:1,cleared:first,seconds:20,availableSeconds:120,carriedSeconds:first?100:-30.5,carriedBudgetSeconds:first?100:-30},
   {wave:2,cleared:second,seconds:55,availableSeconds:first?220:90}],
 });
 const start=await scanSeeds({scope:hun,dir,plan,limit:2,runners:[{
  async runSeedEvidence(_plan,seed){return report(seed,seed===0,true);},
 }]});
 assert.equal(start.wins,2);assert.equal(start.bothWavesWins,1);assert.equal(start.slowest.wavesCleared,1);
 assert.equal(start.slowest.recordSHA256,hash);
 const unknown=await scanSeeds({scope:hun,dir,plan,limit:1,runners:[{
  async runSeedEvidence(_plan,seed){return {...report(seed,true,false),outcome:'win'};},
 }]});
 assert.equal(unknown.status,'inconclusive');assert.equal(unknown.wins,2);
 const failure=await scanSeeds({scope:hun,dir,plan,runners:[{
  async runSeedEvidence(_plan,seed){assert.equal(seed,seedOrder[2]);return report(seed,true,false);},
 }]});
 assert.equal(failure.status,'seed-loss');assert.equal(failure.bothWavesWins,1);
 assert.deepEqual(failure.loss.rounds.map(round=>round.cleared),[true,false]);
 const restored=await scanSeeds({scope:hun,dir,plan,runners:[{runSeedEvidence:()=>assert.fail('已有落败结果禁止发起新复跑')}]});
 assert.equal(restored.attempted,0);assert.deepEqual(restored.loss,failure.loss);
 await assert.rejects(scanSeeds({scope:{...hun,dungeonId:102},dir,plan,runners:[]}),/绑定了另一份阵容/);
});
