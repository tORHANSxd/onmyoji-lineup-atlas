'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readConfig,matchesDamagePolicy}=require('./rune-runner.cjs');
const {resourceVersion}=require('../app/rune-lineup.js');
const awakeOpenings=require('../app/awake-openings.js');
const secretOpenings=require('../app/secret-openings.js');
const yulingOpenings=require('../app/yuling-openings.js');
const guildHuntOpenings=require('../app/guild-hunt-openings.js');
const resourceEncounters=require('../app/resource-encounters.js');
const {firstExperience}=resourceEncounters;

const engines={
 3:{name:'MonstarGuanKaEngine',route:'mode-pve-default-solo',sha256:'1627ca26088ba2fca41b3408ed930650fb31d9040642b5b10566a4479067ef1b'},
 29:{name:'AwakeFbEngine',route:'awake-ordinary-solo',sha256:awakeOpenings.engineSHA256},
 266:{name:'ChallengeFbEngine',route:'secret-ordinary-solo',sha256:secretOpenings.engineSHA256},
 267:{name:'GorenFbEngine',route:'yuling-solo',sha256:yulingOpenings.engineSHA256},
 2000:{name:'GuildHuntingBattleEngine',route:'guild-hunting-local-owned',sha256:guildHuntOpenings.engineSHA256},
 [firstExperience.battleMode]:{name:'NewExpEngine',route:'resource-first-new-server-exp',sha256:resourceEncounters.engineSHA256},
};
const positive=value=>Number.isSafeInteger(value)&&value>0;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

function validTactics(plan,battleMode){
 if(!Object.hasOwn(plan,'tactics'))return true;
 const {tactics}=plan;
 if(battleMode!==2000||!tactics||typeof tactics!=='object'||Array.isArray(tactics)||!Object.keys(tactics).length)return false;
 return Object.entries(tactics).every(([key,value])=>{
  const slot=number=>positive(number)&&number<=plan.members.length;
  if(key==='redBoss'||key==='manualOpening')return value===true;
  if(key==='greenSlot')return slot(value);
  return key==='autoMode'&&value&&Object.keys(value).length===2&&slot(value.slot)&&
   ['basic','spell'].includes(value.mode)&&plan.members[value.slot-1]?.aiSkill===0;
 });
}

function sameTactics(actual,expected){
 if(actual===expected)return true;
 if(!actual||!expected||typeof actual!=='object'||typeof expected!=='object')return false;
 return Object.keys(actual).length===Object.keys(expected).length&&
  Object.entries(expected).every(([key,value])=>Object.hasOwn(actual,key)&&sameTactics(actual[key],value));
}

function launch(python,args,cwd,signal){
 return new Promise((resolve,reject)=>{
  const env={...process.env,PYTHONHOME:'',PYTHONPATH:'',PYTHONNOUSERSITE:'1',PYTHONHASHSEED:'0',TMP:cwd,TEMP:cwd};
  const child=spawn(python,args,{cwd,env,signal,windowsHide:true,stdio:'ignore'});
  let error;
  child.once('error',reason=>{error=reason;});
  child.once('close',code=>error?reject(error):resolve(code));
 });
}

function readReport(report,{battleMode,stageId,groupId,seed,input,suitInput,damageFloor,tactics}){
 const engine=engines[battleMode],awake=battleMode===29?awakeOpenings.floors[stageId]:null;
 const secret=battleMode===266?secretOpenings.floors[stageId]:null;
 const yuling=battleMode===267?yulingOpenings.floors[stageId]:null;
 const hunt=battleMode===2000?guildHuntOpenings.floors[stageId]:null;
 const huntReport=report?.guildHunt;
 const manual=huntReport?.manualAction;
 const invalidHunt=hunt&&(!huntReport||huntReport.deadlineSeconds!==240||huntReport.phaseRandomSeed!==seed||!Number.isSafeInteger(huntReport.damage)||
  huntReport.damage<0||!sameTactics(huntReport.tactics,tactics)||
  (tactics?.manualOpening?(!positive(manual?.heroId)||!positive(manual?.skillId)||manual.targetId!==hunt.enemy.id):manual!==undefined)||
  !Object.entries(hunt.enemy).every(([key,value])=>huntReport.opening?.[key]===value));
 const invalidYuling=yuling&&(!Array.isArray(report?.opening)||report.opening.length!==yuling.enemies.length||
  !yuling.enemies.every((unit,index)=>Object.entries(unit).every(([key,value])=>report.opening[index]?.[key]===value)));
 const experience=battleMode===firstExperience.battleMode?report?.experience:null;
 const invalidExperience=battleMode===firstExperience.battleMode&&(!experience||report.sceneId!==firstExperience.sceneId||
  report.waveCount!==1||experience.requiredKills!==firstExperience.requiredKills||
  experience.deadlineSeconds!==firstExperience.deadlineSeconds||typeof experience.timedOut!=='boolean'||
  !Number.isInteger(experience.kills)||experience.kills<0||experience.kills>experience.requiredKills||
  !Array.isArray(experience.opening)||experience.opening.length!==6||
  !experience.opening.every((unit,index)=>unit?.position===index+1&&
   Object.entries(firstExperience.enemy).every(([key,value])=>unit[key]===value))||
  (report.outcome==='win'&&(experience.timedOut||experience.kills!==experience.requiredKills)));
 if(report?.resourceVersion!==resourceVersion||report.route!==engine.route||report.engineClass!==engine.name||
    report.engineSHA256!==engine.sha256||report.battleMode!==battleMode||report.stageId!==stageId||report.groupId!==groupId||
    (awake&&(report.sceneId!==awake.sceneId||report.waveCount!==1))||
    (yuling&&(report.sceneId!==yuling.sceneId||report.waveCount!==1||report.formationsVerified!==1||invalidYuling))||
    (hunt&&(report.sceneId!==hunt.sceneId||report.waveCount!==1||invalidHunt))||
    (secret&&(report.sceneId!==secret.sceneId||report.waveCount!==secret.waves.length||
      !Number.isSafeInteger(report.formationsVerified)||report.formationsVerified<report.wavesCleared||
      report.formationsVerified>report.waveCount))||
    invalidExperience||report.seed!==seed||report.fixedStepMs!==20||report.teamSHA256!==sha256(input)||report.suitIndexSHA256!==sha256(suitInput)||
    !matchesDamagePolicy(report,damageFloor)||
    !validHash(report.nativeSHA256)||!validHash(report.scriptIndexSHA256)||!validHash(report.recordSHA256)||
    report.recordSHA256===sha256('')||!positive(report.recordLines)||!positive(report.waveCount)||
    !Number.isSafeInteger(report.wavesCleared)||report.wavesCleared<0||report.wavesCleared>report.waveCount||
    !Number.isSafeInteger(report.bouts)||report.bouts<0||!Number.isFinite(report.engineSeconds)||report.engineSeconds<0||
    !(report.completed===true?['win','loss'].includes(report.outcome):report.completed===false&&report.outcome==='unknown')){
  throw Error('原版复跑没有返回与关卡和配装一致的战报');
 }
 return report;
}

function createPveStageRunner({configPath,scriptRoot,suits}){
 const entry=path.join(scriptRoot,'verify-pve-stage.py');
 let current=null;
 return {
  async status(){
   try{
    await Promise.all([readConfig(configPath),fs.access(entry),fs.access(path.join(scriptRoot,'rune_floor_host.py'))]);
    const has=name=>fs.access(path.join(scriptRoot,name)).then(()=>true,()=>false);
    const [awake,secret,yuling,resource,hunt]=await Promise.all([has('awake_stage.py'),has('secret_stage.py'),has('yuling_stage.py'),
     has('resource_stage.py'),has('guild_hunt_stage.py')]);
    return {available:true,resourceVersion,battleModes:[3,...(awake?[29]:[]),...(secret?[266]:[]),...(yuling?[267]:[]),
     ...(resource?[firstExperience.battleMode]:[]),...(hunt?[2000]:[])]};
   }catch(error){
    return {available:false,reason:error.code==='ENOENT'?'缺少本机 PvE 复跑资料':'本机 PvE 复跑配置无效'};
   }
  },
  async run(plan,{battleMode=3,stageId,groupId,seed,damageFloor=false}={}){
   if(current)throw Error('已有库存复跑正在运行');
   if(!Number.isInteger(battleMode)||!Object.hasOwn(engines,battleMode)||!positive(stageId)||!positive(groupId)||!Number.isSafeInteger(seed)||seed<0||seed>=10000||
      typeof damageFloor!=='boolean'||!plan?.onmyoji||!Array.isArray(plan.members)||plan.members.length<1||plan.members.length>5||!validTactics(plan,battleMode))
    throw Error('无效的关卡、种子或配装');
   if(battleMode===29&&(awakeOpenings.resourceVersion!==resourceVersion||
      awakeOpenings.floors[stageId]?.groupId!==groupId||plan.members.length!==5))
    throw Error('当前觉醒关卡、编组或阵容与普通单人规则不一致');
   if(battleMode===266&&(secretOpenings.resourceVersion!==resourceVersion||stageId!==groupId||
      !secretOpenings.floors[stageId]?.solo||plan.members.length!==5))
    throw Error('当前秘闻关卡或阵容与已核验的单人入口不一致');
   if(battleMode===267&&(yulingOpenings.resourceVersion!==resourceVersion||stageId!==groupId||
      !yulingOpenings.floors[stageId]||plan.members.length!==5))
    throw Error('御灵复跑需要已核验的楼层和五式神配装');
   if(battleMode===2000&&(guildHuntOpenings.resourceVersion!==resourceVersion||stageId!==groupId||
      !guildHuntOpenings.floors[stageId]||plan.members.length!==5))
    throw Error('麒麟狩猎复跑需要已核验的战斗和五位自有式神');
   if(battleMode===firstExperience.battleMode&&(resourceEncounters.resourceVersion!==resourceVersion||
      stageId!==firstExperience.stageId||groupId!==firstExperience.groupId||plan.members.length!==firstExperience.memberCount))
    throw Error('此入口只适用于新服首次经验妖怪的五式神配装');
   const input=JSON.stringify(plan),suitInput=JSON.stringify(suits);
   if(Buffer.byteLength(input)>256*1024)throw Error('复跑配装超过大小限制');
   const cancel=new AbortController(),deadline=AbortSignal.timeout(100000);
   let release,dir;
   current={cancel,done:new Promise(resolve=>{release=resolve;})};
   try{
    const config=await readConfig(configPath);
    cancel.signal.throwIfAborted();
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-pve-stage-'));
    const team=path.join(dir,'team.json'),suitIndex=path.join(dir,'suits.json'),output=path.join(dir,'battle.json');
    await Promise.all([fs.writeFile(team,input,'utf8'),fs.writeFile(suitIndex,suitInput,'utf8')]);
    const args=['-X','utf8',entry,'--runtime',path.resolve(configPath),'--mode',String(battleMode),'--stage',String(stageId),'--seed',String(seed),
     '--team',team,'--suit-index',suitIndex,'--output',output];
    if(damageFloor)args.push('--minimum-damage');
    const code=await launch(config.python,args,dir,AbortSignal.any([cancel.signal,deadline]));
    cancel.signal.throwIfAborted();
    if(code!==0&&code!==2)throw Error('本机原版引擎未能运行此关卡，请核对资料、阵容和入场条件');
    const report=JSON.parse(await fs.readFile(output,'utf8'));
    cancel.signal.throwIfAborted();
    return readReport(report,{battleMode,stageId,groupId,seed,input,suitInput,damageFloor,tactics:plan.tactics});
   }catch(error){
    if(cancel.signal.aborted)throw Error('库存复跑已停止');
    if(deadline.aborted)throw Error('副本原版复跑超时');
    if(error.code==='ENOENT')throw Error('缺少本机资料或原版战报');
    throw error;
   }finally{
    try{if(dir)await fs.rm(dir,{recursive:true,force:true,maxRetries:2});}
    finally{current=null;release();}
   }
  },
  stop(){current?.cancel.abort();return current?.done;},
 };
}

module.exports={createPveStageRunner};
