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
const guildRetreatOpenings=require('../app/guild-retreat-openings.js');
const fengmoYanwu=require('../app/fengmo-yanwu.js');
const fengmoLive=require('../app/fengmo-live.js');
const tuzhizhuPractice=require('../app/tuzhizhu-practice.js');
const resourceEncounters=require('../app/resource-encounters.js');
const orochi=require('../app/true-orochi.js');
const hunling=require('../app/hunling-encounters.js');
const {firstExperience}=resourceEncounters;

const engines={
 3:{name:'MonstarGuanKaEngine',route:'mode-pve-default-solo',sha256:'1627ca26088ba2fca41b3408ed930650fb31d9040642b5b10566a4479067ef1b'},
 29:{name:'AwakeFbEngine',route:'awake-ordinary-solo',sha256:awakeOpenings.engineSHA256},
 266:{name:'ChallengeFbEngine',route:'secret-ordinary-solo',sha256:secretOpenings.engineSHA256},
 267:{name:'GorenFbEngine',route:'yuling-solo',sha256:yulingOpenings.engineSHA256},
 306:{name:'GuildBossEngine',route:'guild-retreat-personal-window',sha256:guildRetreatOpenings.engineSHA256},
 2000:{name:'GuildHuntingBattleEngine',route:'guild-hunting-local-owned',sha256:guildHuntOpenings.engineSHA256},
 2001:{name:'GuildLieFengEngine',route:'underworld-gate-local-solo',sha256:'5ee939050f18dc8de1960d88ce5181f5735fb89477c3736e1f32ac696426d625'},
 3004:{name:'LBSWorldBossEngine',route:'regional-boss-ordinary-scenario',sha256:'d7430531c4dd85fa2c3fc14b2c55677ee7d030e4703e8806887a3d55a0821174'},
 [orochi.battleMode]:{name:'ZhenDaSheEngine',route:'true-orochi-local-solo',sha256:orochi.engineSHA256},
 1031:{name:'HunlingNormalBattleEngine',route:'hunling-regional-exploration',sha256:'bb053a93fe3ed2cea06443be58cfc7e45c80be6f34d057bdd32aca29abda70a1'},
 1032:{name:'HunlingBossBattleEngine',route:'hunling-personal-challenge',sha256:'e50f9324358819f76562dece05379f15d7def294d83c2eb327da798fc2e15813'},
 3023:{name:'LBSWorldBossXEngine',route:'regional-boss-hard-scenario',sha256:'a4268deb478a53610e6ef6e23e833f3bf18d2be826f7cd703aaca7e1a54df38f'},
 [fengmoYanwu.battleMode]:{name:'FengMoEquipBattleEngine',route:'fengmo-yanwu-solo',sha256:fengmoYanwu.engineSHA256},
 ...Object.fromEntries(Object.entries(tuzhizhuPractice.modes).map(([id,mode])=>
  [id,{name:mode.engine,route:'tuzhizhu-practice-solo',sha256:mode.sha256}])),
 [firstExperience.battleMode]:null,
};
const positive=value=>Number.isSafeInteger(value)&&value>0;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const regionModes=[3004,3023];

function validTactics(plan,battleMode){
 if(!Object.hasOwn(plan,'tactics'))return true;
 const {tactics}=plan;
 if(![2000,306,fengmoYanwu.battleMode].includes(battleMode)||!tactics||typeof tactics!=='object'||Array.isArray(tactics)||!Object.keys(tactics).length)return false;
 return Object.entries(tactics).every(([key,value])=>{
  const slot=number=>positive(number)&&number<=plan.members.length;
  if(key==='redBoss')return value===true;
  if(key==='manualOpening')return value===true||
   (value&&typeof value==='object'&&Object.keys(value).length===3&&slot(value.actorSlot)&&positive(value.skillId)&&
    (['simple','boss','self'].includes(value.target)||slot(value.target))&&
    plan.members[value.actorSlot-1]?.hero?.skinfo?.some(skill=>skill[0]===value.skillId));
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

function validUnderworld(report,rounds){
 const data=report.underworld;
 if(report.sceneId!==211||report.waveCount!==70||!data||!Array.isArray(data.teams)||!data.teams.length||
    data.teams.length>rounds.length||data.usedShikigamiBanned!==5*data.teams.length||
    typeof data.leftAfterLastTeam!=='boolean'||(data.leftAfterLastTeam&&data.teams.length!==rounds.length)||
    !Array.isArray(data.formations)||data.formations.length<report.wavesCleared||data.formations.length>report.wavesCleared+1||
    (report.completed&&report.outcome!==(report.wavesCleared>0?'win':'loss')))return false;
 return data.teams.every((row,i)=>row.team===i+1&&row.onmyojiId===Number(rounds[i].onmyoji.heroId)&&
    positive(row.startWave)&&row.startWave<=(report.wavesCleared+1)&&row.startWave>=(data.teams[i-1]?.startWave??1))&&
  data.teams[0].startWave===1&&data.formations.every((row,i)=>row.wave===i+1&&positive(row.group)&&Array.isArray(row.units)&&
    row.units.length>0&&row.units.length<=6&&row.units.every(([position,id,level],j)=>positive(position)&&position<=6&&
      position>(row.units[j-1]?.[0]??0)&&positive(id)&&positive(level)&&level<=40));
}

function validOrochiPlan(plan){
 const members=[...plan.members,...(Array.isArray(plan.reserves)?plan.reserves:[])];
 const actors=[Number(plan.onmyoji.heroId),Number(plan.reserveOnmyoji?.heroId)];
 if(plan.members.length!==6||!Array.isArray(plan.reserves)||plan.reserves.length!==4||
    !actors.every(id=>[10,11,12,13,15,16].includes(id))||actors[0]===actors[1]||
    !members.every(row=>typeof row?.instanceId==='string'&&row.instanceId&&positive(Number(row.hero?.heroId))&&Array.isArray(row.souls))||
    new Set(members.map(row=>row.instanceId)).size!==10)return false;
 const souls=members.flatMap(row=>row.souls.map(soul=>soul?.id));
 return souls.every(id=>typeof id==='string'&&id)&&new Set(souls).size===souls.length;
}

function validCapture(choice){
 return choice===undefined||choice&&positive(choice.itemId)&&Object.hasOwn(hunling.items,choice.itemId)&&Array.isArray(choice.cards)&&
  choice.cards.length===3&&new Set(choice.cards).size===3&&choice.cards.every(slot=>positive(slot)&&slot<=5);
}

function validHunlingReport(report,encounter,choice){
 const result=report.hunling;
 if(!result||report.sceneId!==encounter.sceneId||report.waveCount!==1||typeof result.timedOut!=='boolean'||
    !Number.isFinite(result.combatSeconds)||result.combatSeconds<0||
    !['regionId','exploreLevel','spiritId'].every(key=>result[key]===encounter[key])||
    !Array.isArray(result.opening)||result.opening.length!==encounter.units.length||
    !encounter.units.every(([position,id,level],index)=>{
     const unit=result.opening[index];
     return unit?.position===position&&unit.id===id&&unit.level===level&&Number.isFinite(unit.hp)&&unit.hp>0&&Number.isFinite(unit.speed);
    }))return false;
 if(encounter.spiritId===null)return result.regionSkill===77925;
 if(typeof result.weakened!=='boolean'||report.wavesCleared!==Number(result.weakened)||
    (report.completed&&(report.outcome==='win')!==result.weakened)||
    !(result.weakened?Number.isFinite(result.weakenSeconds)&&result.weakenSeconds>=0:result.weakenSeconds===null))return false;
 const attempt=result.capture;
 if(!choice||!result.weakened)return attempt===null;
 return attempt?.itemId===choice.itemId&&Array.isArray(attempt.cards)&&attempt.cards.length===3&&
  attempt.cards.every((slot,i)=>slot===choice.cards[i])&&[attempt.baseRate,attempt.bonusRate].every(rate=>Number.isFinite(rate)&&rate>=0)&&
  (report.completed?typeof attempt.success==='boolean':attempt.success===null);
}

function validOrochiReport(report,plan){
 const {formations,starts,settlement}=report.trueOrochi??{};
 const roster=[...plan.members,...plan.reserves];
 const actors=[Number(plan.onmyoji.heroId),Number(plan.reserveOnmyoji.heroId)];
 if(report.sceneId!==orochi.sceneId||report.waveCount!==orochi.floorCount||!Array.isArray(formations)||!formations.length||
    !Array.isArray(starts)||!starts.length||formations.length<report.wavesCleared||
    formations[formations.length-1]?.floor<report.wavesCleared||
    !(report.completed?['win','loss'].includes(settlement):settlement==='unknown')||
    (report.completed&&report.outcome!==(settlement==='win'&&report.wavesCleared===report.waveCount?'win':'loss')))return false;
 const validOrder=(row,index,rows)=>positive(row.floor)&&row.floor<=orochi.floorCount&&
  (index?row.floor===rows[index-1].floor||row.floor===rows[index-1].floor+1:row.floor===1);
 if(!formations.every((row,i)=>validOrder(row,i,formations)&&row.groupId===orochi.firstFloor+row.floor-1&&
    Array.isArray(row.units)&&row.units.length===5&&row.units.every((unit,j)=>Array.isArray(unit)&&unit.length===3&&
     unit[0]===[1,2,4,5,6][j]&&positive(unit[1])&&unit[2]===40)))return false;
 return starts.every((row,i)=>validOrder(row,i,starts)&&row.floor<=formations[formations.length-1].floor&&
   Array.isArray(row.lineup)&&row.lineup.length>0&&row.lineup.length<=7&&
   new Set(row.lineup.map(unit=>unit.rosterSlot)).size===row.lineup.length&&row.lineup.every((unit,j)=>
    positive(unit.position)&&unit.position<=7&&unit.position>(row.lineup[j-1]?.position??0)&&
    (unit.position===1?unit.rosterSlot===null&&actors.includes(unit.id):positive(unit.rosterSlot)&&roster[unit.rosterSlot-1]&&
      Number(roster[unit.rosterSlot-1].hero.heroId)===unit.id)&&
    Number.isFinite(unit.hp)&&unit.hp>=0&&Number.isFinite(unit.maxHp)&&unit.maxHp>0&&unit.hp<=unit.maxHp+1e-4&&
    (i>0||(row.lineup.length===7&&unit.position===j+1&&(j?unit.rosterSlot===j:unit.id===actors[0])))));
}

function validScoringTactics(data,plan,bossId){
 const {tactics}=plan,opening=tactics?.manualOpening;
 const action=data?.manualAction;
 const choices=data?.manualChoices;
 if(!sameTactics(data?.tactics,tactics))return false;
 if(!opening)return action===undefined&&choices===undefined;
 if(!positive(action?.heroId)||!positive(action?.skillId)||!positive(action?.targetId))return false;
 const heroId=slot=>Number(plan.members[slot-1]?.hero?.heroId);
 if(opening===true)return action.targetId===bossId&&(choices===undefined||
  (positive(choices.actorSlot)&&heroId(choices.actorSlot)===action.heroId&&Array.isArray(choices.skills)&&
   choices.skills.every(skill=>positive(skill?.skillId)&&skill.skillId!==action.skillId&&Array.isArray(skill.targets)&&
    new Set(skill.targets).size===skill.targets.length&&skill.targets.every(target=>['simple','boss','self','ally'].includes(target)))&&
   new Set(choices.skills.map(skill=>skill.skillId)).size===choices.skills.length));
 if(choices!==undefined||action.actorSlot!==opening.actorSlot||action.heroId!==heroId(opening.actorSlot)||
    action.skillId!==opening.skillId||(action.targetSlot!==null&&action.targetId!==heroId(action.targetSlot)))return false;
 if(opening.target==='simple')return true;
 if(opening.target==='boss')return action.targetSlot===null&&action.targetId===bossId;
 return action.targetSlot===(opening.target==='self'?opening.actorSlot:opening.target);
}

function validRegion(region,battleMode){
 if(!region||!positive(region.areaId))return false;
 if(battleMode===3023){
  const {star,modifierIds}=region;
  return Object.keys(region).length===3&&positive(star)&&star<=10&&Array.isArray(modifierIds)&&modifierIds.length<=10&&
   new Set(modifierIds).size===modifierIds.length&&modifierIds.every(skill=>
    Number.isSafeInteger(skill)&&skill>=61701&&skill<=(star===10?61712:61710));
 }
 return Object.keys(region).length===4&&positive(region.ruleId)&&
  positive(region.level)&&region.level<=60&&Array.isArray(region.params)&&region.params.length>=1&&
  region.params.length<=2&&region.params.every(value=>Number.isFinite(value)&&value>=0);
}

function validRegionalReport(report,region){
 const actual=report.regionalBoss;
 const hard=report.battleMode===3023;
 const level=hard?60+4*region.star:region.level;
 return actual&&sameTactics(region,Object.fromEntries(Object.keys(region).map(key=>[key,actual[key]])))&&
  (!hard||(actual.effectiveLevel===level&&Array.isArray(actual.appliedModifiers)&&
   new Set(actual.appliedModifiers).size===actual.appliedModifiers.length&&
   actual.appliedModifiers.every(skill=>region.modifierIds.includes(skill))&&Array.isArray(actual.snakeSpawns)&&
   [true,false,null].includes(actual.paperDollAlive)&&(actual.paperDollAlive===null||region.modifierIds.includes(61703))&&
   actual.snakeSpawns.every(unit=>unit.id===1192078&&unit.level===40&&[5,6].includes(unit.position)&&
    positive(unit.wave)&&unit.wave<=report.waveCount)&&
   actual.appliedModifiers.includes(61711)===!!actual.snakeSpawns.length))&&
  [true,false,null].includes(actual.eligible)&&Array.isArray(actual.formations)&&
  actual.formations.length>=report.wavesCleared&&actual.formations.length<=report.waveCount&&
  actual.formations.every(wave=>Array.isArray(wave)&&wave.length&&wave.every(unit=>
   positive(unit.position)&&positive(unit.id)&&unit.level===level&&Number.isFinite(unit.hp)&&
   unit.hp>0&&Number.isFinite(unit.speed)&&unit.speed>0))&&
  (report.completed?actual.eligible===true&&typeof actual.metrics==='object'&&
   Number.isFinite(actual.metrics?.receivedDamage)&&actual.metrics.receivedDamage>=0&&
   Number.isSafeInteger(actual.metrics.rounds)&&actual.metrics.rounds>=0:actual.metrics===null);
}

function validRetreat(report,panel,{raidRound,guildMembers,windowSeconds},plan){
 const data=report.guildRetreat;
 const reasons={win:['boss-defeated'],loss:['window-expired','team-defeated'],unknown:[null]};
 return report.sceneId===40010&&report.waveCount===1&&report.wavesCleared===Number(report.outcome==='win')&&
  data?.raidSHA256===guildRetreatOpenings.raidSHA256&&data.round===raidRound&&data.guildMembers===guildMembers&&
  data.windowSeconds===windowSeconds&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=windowSeconds&&
  reasons[report.outcome]?.includes(data.reason)&&(data.reason!=='window-expired'||data.combatSeconds===windowSeconds)&&
  Number.isSafeInteger(data.damage)&&data.damage>=0&&Number.isSafeInteger(data.localDamage)&&data.localDamage>=0&&
  Array.isArray(data.phases)&&data.phases.every(value=>typeof value==='string'&&value.length>0)&&
  validScoringTactics(data,plan,panel.id)&&Object.entries(panel).every(([key,value])=>data.opening?.[key]===value);
}

function validFengmoYanwu(report,entry,plan){
 const data=report.fengmoYanwu;
 return data&&report.sceneId===entry.sceneId&&report.waveCount===1&&data.actId===entry.actId&&data.deadlineSeconds===300&&
  typeof data.timedOut==='boolean'&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
  (!data.timedOut||data.combatSeconds>=299)&&
  Number.isSafeInteger(data.damage)&&data.damage>=0&&data.assists?.length===1&&
  sameTactics(data.assists[0],{configId:70,heroId:5643,position:101})&&Array.isArray(data.opening)&&
  data.opening[0]?.id===entry.bossId&&data.opening[0].position===1&&data.opening.every((unit,i)=>
   positive(unit.id)&&positive(unit.position)&&positive(unit.level)&&unit.position>(data.opening[i-1]?.position??0)&&
   ['hp','speed','attack','defense','critRate'].every(key=>Number.isFinite(unit[key])&&unit[key]>=0))&&validScoringTactics(data,plan,entry.bossId);
}

function validTuzhizhuPractice(report,mode,stageId,plan){
 const data=report.tuzhizhuPractice,trait=tuzhizhuPractice.traits[stageId];
 const ids=trait?[plan.onmyoji.heroId,...plan.members.map(member=>member.hero.heroId)].map(Number).sort((a,b)=>a-b):[];
 return data&&report.sceneId===tuzhizhuPractice.sceneId&&report.waveCount===1&&data.trait===trait&&data.configuredSeconds===3600&&
  Array.isArray(data.traitRecipients)&&sameTactics([...data.traitRecipients].sort((a,b)=>a-b),ids)&&
  typeof data.timedOut==='boolean'&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
  Number.isSafeInteger(data.damage)&&data.damage>=0&&Number.isSafeInteger(data.cocoonsSpawned)&&data.cocoonsSpawned>=0&&
  Number.isSafeInteger(data.cocoonsDefeated)&&data.cocoonsDefeated>=0&&data.cocoonsDefeated<=data.cocoonsSpawned&&
  (trait||data.cocoonsSpawned===0)&&Array.isArray(data.opening)&&data.opening.length===4&&data.opening.every((unit,index)=>
   unit?.id===mode.bossId+index&&unit.position===index+1&&unit.level===40&&
   ['hp','speed','attack','defense','critRate'].every(key=>Number.isFinite(unit[key])&&unit[key]>=0))&&
  Array.isArray(data.partsRemaining)&&new Set(data.partsRemaining).size===data.partsRemaining.length&&
  data.partsRemaining.every(id=>data.opening.some(unit=>unit.id===id))&&
  (report.outcome!=='win'||data.partsRemaining.length===0);
}

function validResource(report,entry){
 const {enemy,ids=[entry.enemy.id],requiredKills,reinforcementIds}=entry;
 const data=requiredKills?report?.experience:report?.coins;
 if(!data||report.sceneId!==entry.sceneId||report.waveCount!==1||data.deadlineSeconds!==entry.deadlineSeconds||
    typeof data.timedOut!=='boolean'||data.opening?.length!==ids.length||
    !Array.isArray(data.opening)||!data.opening.every((unit,index)=>unit?.position===index+1&&unit.id===ids[index]&&
     Object.entries(enemy).every(([key,value])=>Number.isFinite(unit[key])&&Math.abs(unit[key]-value)<1e-6)))return false;
 if(requiredKills)return Number.isInteger(data.kills)&&data.kills>=0&&data.kills<=requiredKills&&data.requiredKills===requiredKills&&
  (report.outcome!=='win'||(!data.timedOut&&data.kills===requiredKills))&&(!reinforcementIds||
   (Array.isArray(data.reinforcements)&&data.reinforcements.length<=requiredKills-ids.length&&
    data.reinforcements.every(id=>reinforcementIds.includes(id))&&
    (report.outcome!=='win'||data.reinforcements.length===requiredKills-ids.length)));
 const {bossHpFraction:hp,damage,baseCoins,previewCoins,minimumPreviewCoins}=data;
 return Number.isFinite(hp)&&hp>=0&&hp<=1&&Number.isSafeInteger(damage)&&damage>=0&&
  Number.isSafeInteger(baseCoins)&&baseCoins>=entry.baseRange[0]&&baseCoins<=entry.baseRange[1]&&
  Number.isSafeInteger(previewCoins)&&Number.isSafeInteger(minimumPreviewCoins)&&
  previewCoins>=minimumPreviewCoins&&minimumPreviewCoins>=0&&
  (hp===1?previewCoins===0:previewCoins-minimumPreviewCoins===baseCoins-entry.baseRange[0])&&
  (report.outcome!=='win'||(!data.timedOut&&hp===0));
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

function readReport(report,{battleMode,stageId,groupId,seed,input,suitInput,damageFloor,rounds,retreat,region,resource,hunlingRoute,capture}){
 const engine=resource?{name:resource.engine,route:resource.route,sha256:resource.engineSHA256??resourceEncounters.engineSHA256}:engines[battleMode];
 const awake=battleMode===29?awakeOpenings.floors[stageId]:null;
 const secret=battleMode===266?secretOpenings.floors[stageId]:null;
 const yuling=battleMode===267?yulingOpenings.floors[stageId]:null;
 const hunt=battleMode===2000?guildHuntOpenings.floors[stageId]:null;
 const huntReport=report?.guildHunt;
 const invalidHunt=hunt&&(!huntReport||huntReport.deadlineSeconds!==240||huntReport.phaseRandomSeed!==seed||!Number.isSafeInteger(huntReport.damage)||
  huntReport.damage<0||!validScoringTactics(huntReport,rounds[0],hunt.enemy.id)||
  !Object.entries(hunt.enemy).every(([key,value])=>huntReport.opening?.[key]===value));
 const retreatOpening=retreat&&guildRetreatOpenings.difficulties[stageId][retreat.raidRound-1][groupId];
 const yanwu=battleMode===fengmoYanwu.battleMode?fengmoYanwu.routes[stageId]:null;
 const spider=tuzhizhuPractice.modes[battleMode];
 const invalidYuling=yuling&&(!Array.isArray(report?.opening)||report.opening.length!==yuling.enemies.length||
  !yuling.enemies.every((unit,index)=>Object.entries(unit).every(([key,value])=>report.opening[index]?.[key]===value)));
 if(report?.resourceVersion!==resourceVersion||report.route!==engine.route||report.engineClass!==engine.name||
    report.engineSHA256!==engine.sha256||report.battleMode!==battleMode||report.stageId!==stageId||report.groupId!==groupId||
    (awake&&(report.sceneId!==awake.sceneId||report.waveCount!==1))||
    (yuling&&(report.sceneId!==yuling.sceneId||report.waveCount!==1||report.formationsVerified!==1||invalidYuling))||
    (hunt&&(report.sceneId!==hunt.sceneId||report.waveCount!==1||invalidHunt))||
    (retreatOpening&&!validRetreat(report,retreatOpening,retreat,rounds[0]))||
    (yanwu&&!validFengmoYanwu(report,yanwu,rounds[0]))||
    (spider&&!validTuzhizhuPractice(report,spider,stageId,rounds[0]))||
    (battleMode===2001&&!validUnderworld(report,rounds))||
    (battleMode===orochi.battleMode&&!validOrochiReport(report,rounds[0]))||
    (hunlingRoute&&!validHunlingReport(report,hunlingRoute,capture))||
    (regionModes.includes(battleMode)&&!validRegionalReport(report,region))||
    (secret&&(report.sceneId!==secret.sceneId||report.waveCount!==secret.waves.length||
      !Number.isSafeInteger(report.formationsVerified)||report.formationsVerified<report.wavesCleared||
      report.formationsVerified>report.waveCount))||
    (resource&&!validResource(report,resource))||report.seed!==seed||report.fixedStepMs!==20||report.teamSHA256!==sha256(input)||report.suitIndexSHA256!==sha256(suitInput)||
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
    const [awake,secret,yuling,resource,hunt,underworld,retreat,regional,yanwu,spider,trueOrochi,spirit]=await Promise.all([has('awake_stage.py'),has('secret_stage.py'),has('yuling_stage.py'),
     has('resource_stage.py'),has('guild_hunt_stage.py'),has('underworld_stage.py'),has('guild_retreat_stage.py'),has('regional_boss_stage.py'),
     has('fengmo_yanwu_stage.py'),has('tuzhizhu_practice.py'),has('true_orochi_stage.py'),has('hunling_stage.py')]);
    return {available:true,resourceVersion,battleModes:[3,...(awake?[29]:[]),...(secret?[266]:[]),...(yuling?[267]:[]),
     ...(resource?[firstExperience.battleMode]:[]),...(hunt?[2000]:[]),...(underworld?[2001]:[]),...(retreat?[306]:[]),...(regional?regionModes:[]),
     ...(yanwu?[fengmoYanwu.battleMode]:[]),...(spider?Object.keys(tuzhizhuPractice.modes).map(Number):[]),...(trueOrochi?[orochi.battleMode]:[]),
     ...(spirit?hunling.battleModes:[])]};
   }catch(error){
    return {available:false,reason:error.code==='ENOENT'?'缺少本机 PvE 复跑资料':'本机 PvE 复跑配置无效'};
   }
  },
  async run(plan,{battleMode=3,stageId,groupId,seed,damageFloor=false,retreat,region,capture}={}){
   if(current)throw Error('已有库存复跑正在运行');
   const rounds=battleMode===2001&&Object.hasOwn(plan??{},'rounds')?plan.rounds:[plan];
   const minMembers=battleMode===2001?5:1;
   const maxMembers=[fengmoYanwu.battleMode,orochi.battleMode].includes(battleMode)?6:5;
   if(!Number.isInteger(battleMode)||!Object.hasOwn(engines,battleMode)||!positive(stageId)||!positive(groupId)||!Number.isSafeInteger(seed)||seed<0||seed>=10000||
      typeof damageFloor!=='boolean'||!Array.isArray(rounds)||rounds.length<1||rounds.length>4||rounds.some(row=>
       !row?.onmyoji||!Array.isArray(row.members)||row.members.length<minMembers||row.members.length>maxMembers||!validTactics(row,battleMode))||
      !validTactics(plan,battleMode))
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
   if(battleMode===306){
    const {raidRound,guildMembers,windowSeconds}=retreat??{};
    if(guildRetreatOpenings.resourceVersion!==resourceVersion||![1,2,3].includes(raidRound)||
       !guildRetreatOpenings.difficulties[stageId]?.[raidRound-1]?.[groupId]||plan.members.length!==5||
       !Number.isInteger(guildMembers)||guildMembers<0||guildMembers>50||
       !Number.isInteger(windowSeconds)||windowSeconds<1||windowSeconds>1800)throw Error('无效的首领退治难度、轮次或演练时长');
   }
   if(battleMode===2000&&(guildHuntOpenings.resourceVersion!==resourceVersion||stageId!==groupId||
      !guildHuntOpenings.floors[stageId]||plan.members.length!==5))
    throw Error('麒麟狩猎复跑需要已核验的战斗和五位自有式神');
   if(battleMode===2001&&(stageId!==groupId||![101,102,103].includes(stageId)))
    throw Error('阴界之门复跑需要已核验的单人入口');
   if(battleMode===orochi.battleMode&&(stageId!==orochi.stageId||groupId!==orochi.firstFloor||!validOrochiPlan(plan)))
    throw Error('真蛇需要六位首发、四位不同的备选式神和两名不同的阴阳师，御魂不可复用');
   if(battleMode===3&&orochi.isFloor(stageId))throw Error('真蛇需要使用原版十层复跑入口');
   const hunlingRoute=hunling.battleModes.includes(battleMode)?hunling.routes[stageId]:null;
   if(hunling.battleModes.includes(battleMode)&&(hunling.resourceVersion!==resourceVersion||
      hunlingRoute?.battleMode!==battleMode||hunlingRoute.groupId!==groupId||plan.members.length!==5))
    throw Error('请选择已核验的契灵关卡和五位自有式神');
   if(!validCapture(capture)||capture!==undefined&&hunlingRoute?.spiritId==null)
    throw Error('请选择可用式盘和三个不同的出战式神位置');
   if(battleMode===3&&(hunling.routes[stageId]||stageId===800021||stageId>=810001&&stageId<=810009))
    throw Error('契灵之境需要使用原版探查、挑战或集结入口');
   if(battleMode===fengmoYanwu.battleMode&&(fengmoYanwu.resourceVersion!==resourceVersion||stageId!==groupId||
      plan.members.length!==fengmoYanwu.routes[stageId]?.memberCount))throw Error('当前配装与逢魔演武单人上阵人数不一致');
   if(battleMode===3&&Object.hasOwn(fengmoYanwu.routes,stageId))throw Error('逢魔演武需要使用原版活动计分入口');
   if(battleMode===3&&fengmoLive.isLiveStage(stageId))throw Error('逢魔实战需要原版联机入场资料');
   if(battleMode===3&&Object.values(tuzhizhuPractice.modes).some(mode=>mode.groupId===stageId))
    throw Error('土蜘蛛木桩需要使用原版单人练习入口');
   const spider=tuzhizhuPractice.modes[battleMode],trait=tuzhizhuPractice.traits[stageId];
   if(spider&&(tuzhizhuPractice.resourceVersion!==resourceVersion||trait===undefined||groupId!==spider.groupId||
      (trait===0)!==(battleMode===5550)||plan.members.length!==5))throw Error('土蜘蛛木桩入口、词条或上阵人数不匹配');
   if(regionModes.includes(battleMode)&&(!validRegion(region,battleMode)||plan.members.length!==5))
    throw Error('地域鬼王复跑需要地点、难度、合法的特殊条件和五位自有式神');
   const resource=battleMode===firstExperience.battleMode?resourceEncounters.routes[stageId]:null;
   if(battleMode===firstExperience.battleMode&&(resourceEncounters.resourceVersion!==resourceVersion||
      !resource||groupId!==resource.groupId||plan.members.length!==resource.memberCount))
    throw Error('请选择已核验的资源关卡和五位自有式神');
   if(battleMode===3&&resourceEncounters.routes[stageId])throw Error('经验妖怪和金币妖怪需要资源副本的原版入口');
   const input=JSON.stringify(plan),suitInput=JSON.stringify(suits);
   if(Buffer.byteLength(input)>256*1024)throw Error('复跑配装超过大小限制');
   const deadlineMs=spider?645000:battleMode===306?245000:hunlingRoute||[2001,orochi.battleMode].includes(battleMode)?155000:100000;
   const cancel=new AbortController(),deadline=AbortSignal.timeout(deadlineMs);
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
    if(battleMode===306)args.push('--boss',String(groupId),'--raid-round',String(retreat.raidRound),
     '--guild-members',String(retreat.guildMembers),'--window-seconds',String(retreat.windowSeconds));
    if(regionModes.includes(battleMode))args.push('--region',JSON.stringify(region));
    if(capture)args.push('--capture-item',String(capture.itemId),'--capture-cards',...capture.cards.map(String));
    const code=await launch(config.python,args,dir,AbortSignal.any([cancel.signal,deadline]));
    cancel.signal.throwIfAborted();
    if(code!==0&&code!==2)throw Error('本机原版引擎未能运行此关卡，请核对资料、阵容和入场条件');
    const report=JSON.parse(await fs.readFile(output,'utf8'));
    cancel.signal.throwIfAborted();
    return readReport(report,{battleMode,stageId,groupId,seed,input,suitInput,damageFloor,rounds,resource,hunlingRoute,capture,
     retreat:battleMode===306?retreat:null,region:regionModes.includes(battleMode)?region:null});
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
