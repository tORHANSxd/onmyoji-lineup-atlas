'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {resourceVersion,dungeonId}=require('../app/rune-lineup.js');
const inputs={python:'isFile',snapshot:'isDirectory',gameTools:'isDirectory',opcodeProof:'isDirectory',scriptIndex:'isFile'};

async function readConfig(file){
 const config=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
 for(const [key,check] of Object.entries(inputs)){
  if(typeof config[key]!=='string'||!path.isAbsolute(config[key])||!(await fs.stat(config[key]))[check]()){
   throw Error(`复跑运行时缺少 ${key}`);
  }
 }
 const update=await fs.readFile(path.join(config.snapshot,'raw','extra','update.ini'),'utf8');
 if(/^\s*version\s*=\s*([\d.]+)\s*$/m.exec(update)?.[1]!==resourceVersion)throw Error('魂王复跑需要对应的客户端资源版本');
 return config;
}

function waitForExit(python,args,dir,signal){
 return new Promise((resolve,reject)=>{
  const env={...process.env,PYTHONHOME:'',PYTHONPATH:'',PYTHONNOUSERSITE:'1',PYTHONHASHSEED:'0'};
  const child=spawn(python,args,{cwd:dir,windowsHide:true,stdio:'ignore',env,signal});
  let error;
  child.once('error',reason=>{error=reason;});
  child.once('close',code=>error?reject(error):resolve(code));
 });
}

const MAX_BRANCH_TRIALS=8;

function summary(report,seed,fixedStep,flips){
 if(report.resourceVersion!==resourceVersion||report.dungeonId!==dungeonId||report.fixture!=='selected-inventory'||
  report.seed!==seed||
  typeof report.completed!=='boolean'||!['win','loss','unknown'].includes(report.outcome)||
  !Number.isSafeInteger(report.wavesCleared)||!Number.isSafeInteger(report.bouts))throw Error('客户端复跑没有返回可识别的结算');
 const sync=report.animationSync;
 const playback=report.animationPlayback;
 const projected=playback?.scope==='model-playback-projection-on-engine-clock'&&
  Number.isFinite(playback.overlapMs)&&playback.overlapMs>=0&&
  Number.isSafeInteger(playback.interruptedClips)&&playback.interruptedClips>=0&&Array.isArray(playback.unresolved)
  ?{overlapMs:playback.overlapMs,interruptedClips:playback.interruptedClips,unresolved:playback.unresolved.length,
    combatOverlapMs:Number.isFinite(playback.combatOverlapMs)&&playback.combatOverlapMs>=0?playback.combatOverlapMs:null,
    combatElapsedMs:Number.isSafeInteger(playback.combatElapsedMs)&&playback.combatElapsedMs>=0?playback.combatElapsedMs:null}
  :null;
 const spirit=report.equippedSpirit;
 const clock=report.clock;
 if(clock?.mode!==(fixedStep?'client-record-step':'host-wall')||clock.stepMs!==(fixedStep?20:null)||
  !Number.isFinite(clock.elapsedEngineSeconds)||clock.elapsedEngineSeconds<0)throw Error('客户端复跑时钟与所选条件不符');
 const health=report.monsterHealth;
 const monsterHealth=health?.scope==='original-monster-hp-updates'&&health.total===3&&Array.isArray(health.waves)&&
  health.waves.filter(wave=>wave.cleared).length===report.wavesCleared?health.waves:null;
 const audit=report.randomAudit;
 let randomObservations=null;
 if(fixedStep){
  const observed=audit?.observedComparisonDraws,other=audit?.unclassifiedDraws,alternatives=audit?.reversibleDraws?.length;
  if(audit?.scope!=='engine-rng-observed-comparisons'||(audit.flipped?.index??null)!==(flips.at(-1)??null)||
   !Array.isArray(audit.interventions)||audit.interventions.length!==flips.length||
   audit.interventions.some((step,i)=>step?.index!==flips[i])||
   ![observed,other,alternatives].every(value=>Number.isSafeInteger(value)&&value>=0)||
   observed+other!==report.randomCalls||alternatives>observed)throw Error('客户端复跑没有返回可识别的随机调用记录');
  randomObservations={observed,other,alternatives};
 }
 return {seed,completed:report.completed,outcome:report.outcome,wavesCleared:report.wavesCleared,bouts:report.bouts,
  engineSeconds:clock.elapsedEngineSeconds,monsterHealth,randomObservations,
  animationPlayback:projected,
  randomBranchesVerified:false,overlapMs:Number.isFinite(sync?.overlapMs)?sync.overlapMs:null,
  unresolvedActions:Array.isArray(sync?.unresolved)?sync.unresolved.length:null,
  spirit:spirit?{id:spirit.id,star:spirit.star,level:spirit.level}:null};
}

function isCombatDecision(draw){
 // In 0.0.816 these methods schedule opening SFX or a renderer scene flag.
 return draw.inCombat&&!(draw.file==='battleengine/BattleEngine.py'&&['BattleEngine.eggs','BattleEngine.new_eggs'].includes(draw.method));
}

function planRandomTrials(audit,{afterIndex=0,afterWave=0}={}){
 const bySite=new Map();
 for(const index of audit.reversibleDraws){
  const draw=audit.draws[index-1],site=draw?.site,comparison=draw?.comparisons?.[0];
  if(!Number.isSafeInteger(index)||index<1||draw?.method!=='random'||!Array.isArray(site)||site.length!==4||
    typeof site[0]!=='string'||typeof site[1]!=='string'||![site[2],site[3]].every(Number.isSafeInteger)||
    !Array.isArray(comparison)||!['lt','le','gt','ge'].includes(comparison[0])||!Number.isFinite(comparison[1])||
    typeof comparison[2]!=='boolean')throw Error('无效的原版随机分支记录');
  const wave=[1,2,3].includes(draw.wave)?draw.wave:null;
  const candidate={index,file:site[0],method:site[1],line:site[2],comparison:comparison[0],threshold:comparison[1],
   before:comparison[2],inCombat:draw.inCombat===true,wave};
  if(index<=afterIndex||(afterWave>0&&(wave==null||wave<=afterWave||!isCombatDecision(candidate))))continue;
  const key=JSON.stringify(site),variants=bySite.get(key)||new Map();
  const context=JSON.stringify([wave,candidate.before]),previous=variants.get(context);
  if(!previous||!previous.inCombat&&candidate.inCombat)variants.set(context,candidate);
  bySite.set(key,variants);
 }
 const groups=[...bySite.values()].map(variants=>[...variants.values()]);
 const targets=[],used=new Set();
 const add=target=>{targets.push(target);used.add(target.index);};
 for(const preferred of [true,false]){
  const choices=groups.map(g=>g.filter(d=>isCombatDecision(d)===preferred)).filter(g=>g.length);
  if(preferred){
   const coveredSites=new Set();
   for(const wave of [1,2,3]){
    const sites=choices.filter(group=>group.some(d=>d.wave===wave));
    const site=sites.find(group=>!coveredSites.has(group))||sites[0];
    if(site){add(site.find(d=>d.wave===wave));coveredSites.add(site);}
   }
  }
  for(let depth=0;targets.length<MAX_BRANCH_TRIALS&&choices.some(g=>g.length>depth);depth++){
   for(const group of choices){
    const target=group[depth];
    if(target&&!used.has(target.index)&&targets.length<MAX_BRANCH_TRIALS)add(target);
   }
  }
 }
 return {sites:groups.length,eligible:audit.reversibleDraws.length,targets};
}

function createRuneRunner({configPath,scriptRoot,suits}){
 let current=null;
 async function withRun(plan,seed,fixedStep,execute){
  if(current)throw Error('已有魂王复跑正在运行');
  if(!plan?.onmyoji||!Array.isArray(plan.members)||plan.members.length!==5)throw Error('复跑需要一位阴阳师及五位式神');
  if(!Number.isSafeInteger(seed)||seed<0||seed>=2**32||typeof fixedStep!=='boolean')throw Error('无效的复跑种子或时钟');
  const input=JSON.stringify(plan);
  if(Buffer.byteLength(input)>256*1024)throw Error('复跑输入超过大小限制');
  const action=new AbortController();
  let release;
  const job=current={action,done:new Promise(resolve=>{release=resolve;})};
  let dir;
  try{
   const config=await readConfig(configPath);
   action.signal.throwIfAborted();
   dir=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-rune-'));
   const team=path.join(dir,'team.json'),suitIndex=path.join(dir,'suits.json');
   await Promise.all([fs.writeFile(team,input,'utf8'),fs.writeFile(suitIndex,JSON.stringify(suits),'utf8')]);
   const argv=['-X','utf8',path.join(scriptRoot,'verify-rune-runtime.py'),
    '--snapshot',config.snapshot,'--game-tools',config.gameTools,'--opcode-proof',config.opcodeProof,
    '--script-index',config.scriptIndex,'--suit-index',suitIndex,'--team',team,'--timeout','75','--seed',String(seed)];
   if(fixedStep)argv.push('--fixed-step-ms','20','--audit-random');
   const reference=path.join(dir,'baseline.json');
   async function replay(flip=null,parent=null){
    action.signal.throwIfAborted();
    const indices=flip===null?[]:[...(parent?.indices??[]),flip];
    const out=flip===null?reference:path.join(dir,`trial-${indices.join('-')}.json`);
    const flags=flip===null?[]:['--random-reference',parent?.file??reference,'--flip-random',String(flip)];
    const deadline=AbortSignal.timeout(100000);
    let code;
    try{code=await waitForExit(config.python,[...argv,'--output',out,...flags],dir,AbortSignal.any([action.signal,deadline]));}
    catch(error){if(deadline.aborted&&!action.signal.aborted)throw Error('单次魂王复跑超时');throw error;}
    action.signal.throwIfAborted();
    if(code!==0&&code!==1)throw Error('原版引擎未能完成复跑');
    const report=await fs.readFile(out,'utf8').then(JSON.parse).catch(()=>null);
    if(!report)throw Error('原版引擎未生成结算，请核对客户端资料和阵容配置');
    return {raw:report,result:summary(report,seed,fixedStep,indices),file:out,indices};
   }
   return await execute(replay,action.signal);
  }catch(error){
   if(action.signal.aborted)throw Error('魂王复跑已停止');
   throw error;
  }finally{
   try{if(dir)await fs.rm(dir,{recursive:true,force:true,maxRetries:2});}finally{if(current===job)current=null;release();}
  }
 }
 return {
  async status(){
   try{await Promise.all([readConfig(configPath),fs.access(path.join(scriptRoot,'verify-rune-runtime.py'))]);return {available:true,resourceVersion};}
   catch(error){return {available:false,reason:error.code==='ENOENT'?'未连接本机魂王复跑资料':'本机魂王复跑配置无效'};}
  },
  async run(plan,{seed=0,fixedStep=false}={}){
   return withRun(plan,seed,fixedStep,async replay=>(await replay()).result);
  },
  async runSeedEvidence(plan,seed){
   return withRun(plan,seed,true,async replay=>{
    const {raw,result}=await replay();
    const {nativeSHA256,scriptIndexSHA256,teamSHA256,suitIndexSHA256,recordSHA256}=raw;
    return {seed,completed:result.completed,outcome:result.outcome,wavesCleared:result.wavesCleared,
     bouts:result.bouts,engineSeconds:result.engineSeconds,combatMs:result.animationPlayback?.combatElapsedMs??null,
     nativeSHA256,scriptIndexSHA256,teamSHA256,suitIndexSHA256,recordSHA256};
   });
  },
  verifyRandom(plan,seed,onProgress=()=>{}){
   return withRun(plan,seed,true,async (replay,signal)=>{
    const {raw,result:baseline}=await replay();
    if(!baseline.completed||baseline.outcome!=='win'||baseline.wavesCleared!==3)throw Error('基准种子未能再次通关');
    const {targets,eligible,sites}=planRandomTrials(raw.randomAudit);
    const batch={seed,eligible,sites,planned:targets.length,baseline:{bouts:baseline.bouts,engineSeconds:baseline.engineSeconds},trials:[]};
    const snapshot=()=>({...batch,trials:[...batch.trials]});
    onProgress(snapshot());
    let followup=null;
    async function test(target,parent=null){
     const indices=[...(parent?.indices??[]),target.index];
     let trial;
     let run=null;
     try{
      run=await replay(target.index,parent);
      const {result}=run;
      trial={...target,indices,completed:result.completed,outcome:result.outcome,wavesCleared:result.wavesCleared,
       bouts:result.bouts,engineSeconds:result.engineSeconds,replayChanged:raw.recordSHA256!==run.raw.recordSHA256};
     }catch(error){signal.throwIfAborted();trial={...target,indices,error:error.message};}
     batch.trials.push(trial);
     onProgress(snapshot());
     return {run,trial};
    }
    for(const target of targets){
     const {run,trial}=await test(target);
     if(run&&trial.completed&&trial.outcome==='win'&&trial.wavesCleared===3&&trial.replayChanged&&
        isCombatDecision(target)&&target.wave&&target.wave<3&&(!followup||trial.engineSeconds>followup.seconds)){
      const next=planRandomTrials(run.raw.randomAudit,{afterIndex:target.index,afterWave:target.wave}).targets[0];
      if(next)followup={run,next,seconds:trial.engineSeconds};
     }
    }
    if(followup){
     batch.planned++;
     onProgress(snapshot());
     await test(followup.next,followup.run);
    }
    return snapshot();
   });
  },
  stop(){current?.action.abort();return current?.done;}
 };
}

module.exports={createRuneRunner,planRandomTrials,readConfig};
