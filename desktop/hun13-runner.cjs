'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createHash}=require('node:crypto');
const {readConfig}=require('./rune-runner.cjs');
const {resourceVersion}=require('../app/rune-lineup.js');
const {engineSHA256}=require('../app/rune-openings.js');

const execute=promisify(execFile);
const digest=value=>createHash('sha256').update(value).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f\d]{64}$/.test(value);
const nonnegative=value=>Number.isFinite(value)&&value>=0;
const isHun13Plan=plan=>Array.isArray(plan?.rounds)&&plan.rounds.length===2&&
 plan.rounds.every(row=>row?.onmyoji&&Array.isArray(row.members)&&row.members.length===5);

function verifyReport(report,seed,team,suits){
 const rounds=report?.rounds;
 if(report?.resourceVersion!==resourceVersion||report.dungeonId!==103||report.route!=='normal-solo-hun13'||
    report.seed!==seed||report.fixedStepMs!==20||report.engineSHA256!==engineSHA256.Hun13Engine||
    report.teamSHA256!==digest(team)||report.suitIndexSHA256!==digest(suits)||!hash(report.recordSHA256)||
    !hash(report.nativeSHA256)||!hash(report.scriptIndexSHA256)||
    !(report.completed===true?['win','loss'].includes(report.outcome)&&report.recordSHA256!==digest(''):
     report.completed===false&&report.outcome==='unknown')||!nonnegative(report.engineSeconds)||
    !Array.isArray(rounds)||rounds.length>2||!rounds.every((round,index)=>round.wave===index+1&&
     Number.isSafeInteger(round.availableSeconds)&&nonnegative(round.seconds)&&
     (typeof round.cleared==='boolean'||!report.completed&&round.cleared===null)&&
     (index===1||round.availableSeconds===120)&&(index===1||round.cleared===null||
      Number.isFinite(round.carriedSeconds)&&Number.isSafeInteger(round.carriedBudgetSeconds)))||
    (report.completed&&rounds.length!==2)||(rounds.length===2&&rounds[1].availableSeconds!==120+rounds[0].carriedBudgetSeconds)||
    report.wavesCleared!==rounds.filter(round=>round.cleared===true).length){
  throw Error('虚无原版引擎未返回可核验的双波战报');
 }
 const plan=JSON.parse(team);
 if(!rounds.every((round,index)=>round.onmyojiId===plan.rounds[index].onmyoji.heroId&&round.spiritId===(plan.rounds[index].spirit?.id??null)))
  throw Error('虚无战报的阴阳师或契灵与选定配置不一致');
 return report;
}

function createHun13Runner({configPath,scriptRoot,suits}){
 const entry=path.join(scriptRoot,'verify-hun13.py');
 let current=null;
 const runner={
  async available(){
   try{await fs.access(entry);return true;}
   catch{return false;}
  },
  async run(plan,{dungeonId,seed,fixedStep}={}){
   if(current)throw Error('已有虚无原版复跑正在运行');
   if(dungeonId!==103||fixedStep!==true||!Number.isSafeInteger(seed)||seed<0||seed>=10000||
      !isHun13Plan(plan))
    throw Error('无效的虚无双队复跑请求');
   const input=JSON.stringify(plan),suitInput=JSON.stringify(suits);
   if(Buffer.byteLength(input)>512*1024)throw Error('虚无双队配装超过复跑大小限制');
   const cancel=new AbortController();
   let release,dir;
   current={cancel,done:new Promise(resolve=>{release=resolve;})};
   try{
    const config=await readConfig(configPath);
    cancel.signal.throwIfAborted();
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-hun13-'));
    const team=path.join(dir,'team.json'),index=path.join(dir,'suits.json'),output=path.join(dir,'battle.json');
    await Promise.all([fs.writeFile(team,input,'utf8'),fs.writeFile(index,suitInput,'utf8')]);
    const deadline=AbortSignal.timeout(175000);
    const env={...process.env,PYTHONHOME:'',PYTHONPATH:'',PYTHONNOUSERSITE:'1',PYTHONHASHSEED:'0',TMP:dir,TEMP:dir};
    try{
     await execute(config.python,['-X','utf8',entry,'--runtime',path.resolve(configPath),'--seed',String(seed),
      '--team',team,'--suit-index',index,'--output',output],{cwd:dir,windowsHide:true,env,signal:AbortSignal.any([cancel.signal,deadline])});
    }catch(error){
     if(cancel.signal.aborted)throw Error('虚无复跑已停止');
     if(deadline.aborted)throw Error('虚无原版复跑超时');
     throw Error('虚无原版引擎运行异常，请核对本机资料和配装',{cause:error});
    }
    const report=JSON.parse(await fs.readFile(output,'utf8'));
    cancel.signal.throwIfAborted();
    return verifyReport(report,seed,input,suitInput);
   }finally{
    try{if(dir)await fs.rm(dir,{recursive:true,force:true,maxRetries:2});}
    finally{current=null;release();}
   }
  },
  async runSeedEvidence(plan,seed){
   const {completed,outcome,engineSeconds,rounds,wavesCleared,nativeSHA256,scriptIndexSHA256,teamSHA256,suitIndexSHA256,
    engineSHA256,recordSHA256,animationPlayback}=await runner.run(plan,{dungeonId:103,seed,fixedStep:true});
   return {seed,completed,outcome,engineSeconds,rounds,wavesCleared,combatMs:animationPlayback?.combatElapsedMs??null,
    nativeSHA256,scriptIndexSHA256,teamSHA256,suitIndexSHA256,engineSHA256,recordSHA256};
  },
  stop(){current?.cancel.abort();return current?.done;},
 };
 return runner;
}

module.exports={createHun13Runner,isHun13Plan};
