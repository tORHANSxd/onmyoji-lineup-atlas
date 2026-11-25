'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createRuneRunner,planRandomTrials}=require('../desktop/rune-runner.cjs');

test('复跑取消后释放正在运行的任务，未连接资料仍保留离线精算',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-rune-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const configPath=path.join(root,'config.json'),entry=path.join(root,'verify-rune-runtime.py');
 const runner=createRuneRunner({configPath,scriptRoot:root,suits:{}});
 assert.deepEqual(await runner.status(),{available:false,reason:'未连接本机魂王复跑资料'});
 await fs.writeFile(entry,'');
 const extra=path.join(root,'raw','extra');
 await fs.mkdir(extra,{recursive:true});
 await fs.writeFile(path.join(extra,'update.ini'),'version = 0.0.816\n');
 await fs.writeFile(configPath,JSON.stringify({python:process.execPath,snapshot:root,gameTools:root,opcodeProof:root,scriptIndex:entry}));
 assert.deepEqual(await runner.status(),{available:true,resourceVersion:'0.0.816'});
 const input={onmyoji:{},members:Array.from({length:5},()=>({}))};
 await assert.rejects(runner.run(input,{seed:2**32}),/无效的复跑种子/);
 await assert.rejects(runner.run(input,{fixedStep:'20'}),/无效的复跑种子/);
 const initial=assert.rejects(runner.run(input),/已停止/);
 await assert.rejects(runner.run(input),/已有魂王复跑/);
 await runner.stop();
 await initial;
 const next=assert.rejects(runner.run(input),/已停止/);
 await runner.stop();
 await next;
});

test('随机翻转先覆盖战斗中的不同调用位置，再试同位置的另一方向',()=>{
 const row=(offset,inCombat,before)=>({method:'random',site:['formula.py','randomDecision',17,offset],
  inCombat,comparisons:[['lt',0.5,before]]});
 const draws=[row(10,false,false),row(11,true,false),row(11,true,true),row(11,true,true),row(12,true,false),row(10,true,false)];
 const result=planRandomTrials({draws,reversibleDraws:[1,2,3,4,5,6]});
 assert.equal(result.eligible,6);
 assert.equal(result.sites,3);
 assert.deepEqual(result.targets.map(x=>x.index),[6,2,5,3]);
 const more=Array.from({length:11},(_,i)=>row(i,i>=2,false));
 assert.deepEqual(planRandomTrials({draws:more,reversibleDraws:more.map((_,i)=>i+1)}).targets.map(x=>x.index),[3,4,5,6,7,8,9,10]);
 const stages=[{...row(17,true,false),site:['battleengine/BattleEngine.py','BattleEngine.eggs',4153,17]},
  {...row(9,true,false),wave:1},{...row(9,true,false),wave:2},{...row(13,true,false),wave:1}];
 assert.deepEqual(planRandomTrials({draws:stages,reversibleDraws:[1,2,3,4]}).targets.map(x=>x.index),[2,4,3,1]);
 assert.throws(()=>planRandomTrials({draws,reversibleDraws:[99]}),/无效的原版随机分支/);
});
