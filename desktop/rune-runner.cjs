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

function summary(report,seed,fixedStep){
 if(report.resourceVersion!==resourceVersion||report.dungeonId!==dungeonId||report.fixture!=='selected-inventory'||
  report.seed!==seed||
  typeof report.completed!=='boolean'||!['win','loss','unknown'].includes(report.outcome)||
  !Number.isSafeInteger(report.wavesCleared)||!Number.isSafeInteger(report.bouts))throw Error('客户端复跑没有返回可识别的结算');
 const sync=report.animationSync;
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
  if(audit?.scope!=='engine-rng-observed-comparisons'||audit.flipped!==null||
   ![observed,other,alternatives].every(value=>Number.isSafeInteger(value)&&value>=0)||
   observed+other!==report.randomCalls||alternatives>observed)throw Error('客户端复跑没有返回可识别的随机调用记录');
  randomObservations={observed,other,alternatives};
 }
 return {seed,completed:report.completed,outcome:report.outcome,wavesCleared:report.wavesCleared,bouts:report.bouts,
  engineSeconds:clock.elapsedEngineSeconds,monsterHealth,randomObservations,
  randomBranchesVerified:false,overlapMs:Number.isFinite(sync?.overlapMs)?sync.overlapMs:null,
  unresolvedActions:Array.isArray(sync?.unresolved)?sync.unresolved.length:null,
  spirit:spirit?{id:spirit.id,star:spirit.star,level:spirit.level}:null};
}

function createRuneRunner({configPath,scriptRoot,suits}){
 let current=null;
 return {
  async status(){
   try{await Promise.all([readConfig(configPath),fs.access(path.join(scriptRoot,'verify-rune-runtime.py'))]);return {available:true,resourceVersion};}
   catch(error){return {available:false,reason:error.code==='ENOENT'?'未连接本机魂王复跑资料':'本机魂王复跑配置无效'};}
  },
  async run(plan,{seed=0,fixedStep=false}={}){
   if(current)throw Error('已有魂王复跑正在运行');
   if(!plan?.onmyoji||!Array.isArray(plan.members)||plan.members.length!==5)throw Error('复跑需要一位阴阳师及五位式神');
   if(!Number.isSafeInteger(seed)||seed<0||seed>=2**32||typeof fixedStep!=='boolean')throw Error('无效的复跑种子或时钟');
   const input=JSON.stringify(plan);
   if(Buffer.byteLength(input)>256*1024)throw Error('复跑输入超过大小限制');
   const action=new AbortController();
   let release;
   const job=current={action,done:new Promise(resolve=>{release=resolve;})};
   const alarm=setTimeout(()=>action.abort(),100000);
   let dir;
   try{
    const config=await readConfig(configPath);
    action.signal.throwIfAborted();
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-rune-'));
    const team=path.join(dir,'team.json'),suitIndex=path.join(dir,'suits.json'),out=path.join(dir,'report.json');
    await Promise.all([fs.writeFile(team,input,'utf8'),fs.writeFile(suitIndex,JSON.stringify(suits),'utf8')]);
    const argv=['-X','utf8',path.join(scriptRoot,'verify-rune-runtime.py'),
     '--snapshot',config.snapshot,'--game-tools',config.gameTools,'--opcode-proof',config.opcodeProof,
     '--script-index',config.scriptIndex,'--output',out,'--suit-index',suitIndex,'--team',team,'--timeout','75','--seed',String(seed)];
    if(fixedStep)argv.push('--fixed-step-ms','20','--audit-random');
    const code=await waitForExit(config.python,argv,dir,action.signal);
    if(code!==0&&code!==1)throw Error('原版引擎未能完成复跑');
    const report=await fs.readFile(out,'utf8').then(JSON.parse).catch(()=>null);
    if(!report)throw Error('原版引擎未生成结算，请核对客户端资料和阵容配置');
    return summary(report,seed,fixedStep);
   }catch(error){
    if(action.signal.aborted)throw Error('魂王复跑已停止或超时');
    throw error;
   }finally{
    clearTimeout(alarm);
    try{if(dir)await fs.rm(dir,{recursive:true,force:true,maxRetries:2});}finally{if(current===job)current=null;release();}
   }
  },
  stop(){current?.action.abort();return current?.done;}
 };
}

module.exports={createRuneRunner};
