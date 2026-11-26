'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readConfig,matchesDamagePolicy}=require('./rune-runner.cjs');
const {resourceVersion,runeFloorIds}=require('../app/rune-lineup.js');
const {floors,engineSHA256,dungeonTableSHA256}=require('../app/rune-openings.js');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const emptyReplay=sha256('');

function runPython(python,argv,dir,signal){
 return new Promise((resolve,reject)=>{
  const env={...process.env,PYTHONHOME:'',PYTHONPATH:'',PYTHONNOUSERSITE:'1',PYTHONHASHSEED:'0',TMP:dir,TEMP:dir};
  const child=spawn(python,argv,{cwd:dir,windowsHide:true,stdio:'ignore',env,signal});
  let failure;
  child.once('error',error=>{failure=error;});
  child.once('close',code=>failure?reject(failure):resolve(code));
 });
}

function createRuneFloorRunner({configPath,scriptRoot,suits}){
 const entry=path.join(scriptRoot,'verify-rune-floor.py');
 let current=null;
 const runner={
  async available(){
   try{await Promise.all([entry,path.join(scriptRoot,'rune_floor_host.py')].map(file=>fs.access(file)));return true;}
   catch{return false;}
  },
  async run(plan,options){
   const {result}=await runReport(plan,options);
   return result;
  },
  async runSeedEvidence(plan,seed){
   const {result,report}=await runReport(plan,{dungeonId:101,seed,fixedStep:true});
   const {completed,outcome,wavesCleared,bouts,engineSeconds}=result;
   const {nativeSHA256,scriptIndexSHA256,teamSHA256,suitIndexSHA256,recordSHA256}=report;
   return {seed,completed,outcome,wavesCleared,bouts,engineSeconds,combatMs:result.animationPlayback?.combatElapsedMs??null,
    nativeSHA256,scriptIndexSHA256,teamSHA256,suitIndexSHA256,recordSHA256};
  },
  stop(){current?.cancel.abort();return current?.done;},
 };
 async function runReport(plan,{dungeonId,seed,fixedStep}){
   if(current)throw Error('已有原版复跑正在运行');
   if(!runeFloorIds.includes(dungeonId)||!Number.isSafeInteger(seed)||seed<0||seed>=10000||fixedStep!==true||
      !plan?.onmyoji||!Array.isArray(plan.members)||plan.members.length!==5)throw Error('无效的御魂复跑请求');
   const input=JSON.stringify(plan);
   if(Buffer.byteLength(input)>256*1024)throw Error('复跑输入超过大小限制');
   const cancel=new AbortController();
   let release,dir;
   current={cancel,done:new Promise(resolve=>{release=resolve;})};
   try{
    const config=await readConfig(configPath);
    cancel.signal.throwIfAborted();
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-rune-floor-'));
    const team=path.join(dir,'team.json'),suitIndex=path.join(dir,'suits.json'),output=path.join(dir,'battle.json');
    const suitInput=JSON.stringify(suits);
    await Promise.all([fs.writeFile(team,input,'utf8'),fs.writeFile(suitIndex,suitInput,'utf8')]);
    const argv=['-X','utf8',entry,'--runtime',path.resolve(configPath),'--dungeon',String(dungeonId),'--seed',String(seed),
     '--team',team,'--suit-index',suitIndex,'--output',output];
    const deadline=AbortSignal.timeout(100000);
    const code=await runPython(config.python,argv,dir,AbortSignal.any([cancel.signal,deadline]));
    cancel.signal.throwIfAborted();
    if(code!==0)throw Error('御魂原版引擎运行异常，请核对本机资料和阵容');
    const report=JSON.parse(await fs.readFile(output,'utf8'));
    const floor=floors[dungeonId];
    if(report.resourceVersion!==resourceVersion||report.dungeonId!==dungeonId||report.fixture!=='selected-inventory'||
       report.battleMode!==floor.battleMode||report.sceneId!==floor.scene||report.engineSHA256!==engineSHA256[floor.engine]||
       report.dungeonTableSHA256!==dungeonTableSHA256||report.waveCount!==floor.waves.length||!Array.isArray(report.formations)||
       report.formations.length<report.wavesCleared||report.formations.length>floor.waves.length||
       !report.formations.every((wave,index)=>JSON.stringify(wave)===JSON.stringify(
        floor.waves[index].map(({position,id,level})=>[position,id,level])))||
       report.fixedStepMs!==20||report.seed!==seed||report.teamSHA256!==sha256(input)||report.suitIndexSHA256!==sha256(suitInput)||
       !matchesDamagePolicy(report,plan.damageFloor===true)||
       typeof report.completed!=='boolean'||!['win','loss','unknown'].includes(report.outcome)||
       (report.completed&&(!/^[a-f0-9]{64}$/.test(report.recordSHA256)||report.recordSHA256===emptyReplay))||
       !Number.isSafeInteger(report.wavesCleared)||report.wavesCleared<0||report.wavesCleared>report.waveCount||
       !Number.isSafeInteger(report.bouts)||report.bouts<0||!Number.isFinite(report.engineSeconds)||report.engineSeconds<0){
     throw Error('御魂原版复跑没有返回与楼层和编组一致的结算');
    }
    const {completed,outcome,wavesCleared,bouts,engineSeconds,spirit,monsterHealth,animationPlayback,minimumDamage}=report;
    return {report,result:{seed,completed,outcome,wavesCleared,bouts,engineSeconds,spirit,monsterHealth,animationPlayback,formationsVerified:report.formations.length,
     ...(minimumDamage?{minimumDamage}:{})}};
   }catch(error){
    if(cancel.signal.aborted)throw Error('御魂复跑已停止');
    if(error.name==='AbortError')throw Error('御魂原版复跑超时');
    throw error;
   }finally{
    try{if(dir)await fs.rm(dir,{recursive:true,force:true,maxRetries:2});}
    finally{current=null;release();}
   }
 }
 return runner;
}

module.exports={createRuneFloorRunner};
