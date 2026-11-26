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
const guildCrevice=require('../app/guild-crevice.js');
const superGhost=require('../app/superghost.js');
const fengmoYanwu=require('../app/fengmo-yanwu.js');
const activityScore=require('../app/general-soul-trial.js');
const tianfa=require('../app/tianfa.js');
const journeyHard=require('../app/journey-hard.js');
const fengmoLive=require('../app/fengmo-live.js');
const tuzhizhuPractice=require('../app/tuzhizhu-practice.js');
const resourceEncounters=require('../app/resource-encounters.js');
const orochi=require('../app/true-orochi.js');
const hunling=require('../app/hunling-encounters.js');
const qilingGroups=require('../app/qiling-group-openings.js');
const sixRealms=require('../app/six-realms-exams.js');
const {firstExperience}=resourceEncounters;

const engines={
 3:{name:'MonstarGuanKaEngine',route:'mode-pve-default-solo',sha256:'1627ca26088ba2fca41b3408ed930650fb31d9040642b5b10566a4479067ef1b'},
 29:{name:'AwakeFbEngine',route:'awake-ordinary-solo',sha256:awakeOpenings.engineSHA256},
 266:{name:'ChallengeFbEngine',route:'secret-ordinary-solo',sha256:secretOpenings.engineSHA256},
 267:{name:'GorenFbEngine',route:'yuling-solo',sha256:yulingOpenings.engineSHA256},
 306:{name:'GuildBossEngine',route:'guild-retreat-personal-window',sha256:guildRetreatOpenings.engineSHA256},
 [guildCrevice.battleMode]:{name:'GuildLiefeng2022Engine',route:'guild-crevice-local-window',sha256:guildCrevice.engineSHA256},
 [superGhost.battleMode]:{name:'SuperGhostEngine',route:'superghost-local-window',sha256:superGhost.engineSHA256},
 [superGhost.historicalBattleMode]:{name:'SuperGhostBossEngine',route:'superghost-historical-personal',sha256:superGhost.historicalEngineSHA256},
 2000:{name:'GuildHuntingBattleEngine',route:'guild-hunting-local-owned',sha256:guildHuntOpenings.engineSHA256},
 2001:{name:'GuildLieFengEngine',route:'underworld-gate-local-solo',sha256:'5ee939050f18dc8de1960d88ce5181f5735fb89477c3736e1f32ac696426d625'},
 3004:{name:'LBSWorldBossEngine',route:'regional-boss-ordinary-scenario',sha256:'d7430531c4dd85fa2c3fc14b2c55677ee7d030e4703e8806887a3d55a0821174'},
 [orochi.battleMode]:{name:'ZhenDaSheEngine',route:'true-orochi-local-solo',sha256:orochi.engineSHA256},
 1031:{name:'HunlingNormalBattleEngine',route:'hunling-regional-exploration',sha256:'bb053a93fe3ed2cea06443be58cfc7e45c80be6f34d057bdd32aca29abda70a1'},
 1032:{name:'HunlingBossBattleEngine',route:'hunling-personal-challenge',sha256:'e50f9324358819f76562dece05379f15d7def294d83c2eb327da798fc2e15813'},
 [qilingGroups.battleMode]:{name:'QiLingGroupBossBattleEngine',route:'qiling-collective-local-window',sha256:qilingGroups.engineSHA256},
 3023:{name:'LBSWorldBossXEngine',route:'regional-boss-hard-scenario',sha256:'a4268deb478a53610e6ef6e23e833f3bf18d2be826f7cd703aaca7e1a54df38f'},
 [fengmoYanwu.battleMode]:{name:'FengMoEquipBattleEngine',route:'fengmo-yanwu-solo',sha256:fengmoYanwu.engineSHA256},
 ...Object.fromEntries(Object.values(activityScore.modes).map(({battleMode,engine,route,engineSHA256})=>
  [battleMode,{name:engine,route,sha256:engineSHA256}])),
 [tianfa.battleMode]:{name:tianfa.engine,route:tianfa.route,sha256:tianfa.engineSHA256},
 [journeyHard.battleMode]:{name:'JSNormalEngine',route:'journey-hard-solo',sha256:journeyHard.engineSHA256},
 ...Object.fromEntries(Object.entries(tuzhizhuPractice.modes).map(([id,mode])=>
  [id,{name:mode.engine,route:'tuzhizhu-practice-solo',sha256:mode.sha256}])),
 [firstExperience.battleMode]:null,
 [sixRealms.battleMode]:null,
 [sixRealms.eventMode]:null,
};
const positive=value=>Number.isSafeInteger(value)&&value>0;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const regionModes=[3004,3023];
const sixRealmsModes=[sixRealms.battleMode,sixRealms.eventMode];

function validSixRealmsEvent(event){
 return event&&positive(event.id)&&[1,2,3].includes(event.difficulty)&&Number.isSafeInteger(event.moves)&&event.moves>=0;
}

function validSixRealmsState(state){
 if(!state||Object.keys(state).some(key=>!['lifeCaps','marks','skills','artifacts','coins','guard'].includes(key)))return false;
 const {lifeCaps,marks,skills=[],artifacts=[],coins=0}=state;
 return Array.isArray(lifeCaps)&&lifeCaps.length===6&&lifeCaps.every(cap=>Number.isFinite(cap)&&cap>=0&&cap<=100)&&
  Array.isArray(marks)&&marks.length===6&&marks.every(mark=>Number.isSafeInteger(mark)&&mark>=0)&&
  Array.isArray(skills)&&skills.length<=sixRealms.maxRunSkills&&
  skills.every(row=>Array.isArray(row)&&row.length===2&&positive(row[0])&&[1,2,3,4,5].includes(row[1]))&&
  new Set(skills.map(row=>row[0])).size===skills.length&&
  Number.isSafeInteger(coins)&&coins>=0&&Array.isArray(artifacts)&&artifacts.length<=sixRealms.maxRunArtifacts&&
  artifacts.every(row=>Array.isArray(row)&&row.length===3&&positive(row[0])&&positive(row[1])&&
   Array.isArray(row[2])&&row[2].every(round=>Number.isSafeInteger(round)&&round>=0))&&
  new Set(artifacts.map(row=>row[0])).size===artifacts.length&&
  (!Object.hasOwn(state,'guard')||validGuard(state.guard));
}

function validGuard(guard){
 return guard&&Object.keys(guard).length===3&&[2000,2001,2002,2003,2004,2005].includes(guard.id)&&
  positive(guard.level)&&guard.level<=sixRealms.guardMaxLevel&&typeof guard.breakthrough==='boolean'&&
  (!guard.breakthrough||guard.level===sixRealms.guardMaxLevel);
}

function validSixRealmsStateReport(proof,state,dao){
 const ordering=proof?.opening;
 return Array.isArray(ordering)&&ordering.length===6&&ordering.every((unit,i)=>unit&&unit.slot===i+1&&
  unit.lifeCap===state.lifeCaps[i]&&unit.markId===state.marks[i]&&
  (unit.markId>0?positive(unit.markSkill):unit.markSkill===0)&&
  Number.isFinite(unit.baseHp)&&unit.baseHp>0&&Number.isFinite(unit.maxHp)&&unit.maxHp>=0&&Number.isFinite(unit.hp)&&unit.hp>=0&&
  Math.abs(100*unit.maxHp/unit.baseHp-unit.lifeCap)<1e-7)&&
  (!state.skills?.length||Array.isArray(proof.skills)&&proof.skills.length===state.skills.length&&
   proof.skills.every((row,i)=>row?.itemId===state.skills[i][0]&&row.level===state.skills[i][1]&&positive(row.skillId)&&typeof row.name==='string'))&&
  (!state.artifacts?.length||validArtifactReport(proof,state,dao))&&
  (!state.guard||validGuardReport(proof.guard,state.guard));
}

function validGuardReport(proof,guard){
 return proof?.id===guard.id&&proof.level===guard.level&&proof.breakthrough===guard.breakthrough&&
  typeof proof.name==='string'&&positive(proof.stage)&&positive(proof.summonSkill)&&
  proof.attributes&&typeof proof.attributes==='object'&&!Array.isArray(proof.attributes)&&
  Object.values(proof.attributes).every(Number.isFinite)&&
  Array.isArray(proof.baseSkills)&&proof.baseSkills.every(positive)&&
  Array.isArray(proof.extraSkills)&&proof.extraSkills.every(positive);
}

function validArtifactReport(proof,state,dao){
 return proof.coins===(state.coins??0)&&Number.isSafeInteger(proof.coinCost)&&proof.coinCost>=0&&
  Array.isArray(proof.artifacts)&&proof.artifacts.length===state.artifacts.length&&proof.artifacts.every((row,i)=>{
   const [id,amount,rounds]=state.artifacts[i];
   const schedule=rounds.slice().sort((a,b)=>a-b);
   if(row?.itemId!==id||row.amount!==amount||row.level!==(dao===4?amount:1)||!positive(row.skillId)||
      typeof row.name!=='string'||!Array.isArray(row.requests)||row.requests.length!==rounds.length)return false;
   const confirmed=row.requests.filter(request=>Number.isSafeInteger(request?.castRound)).length;
   return row.remainingUses===(dao===4?1:amount-confirmed)&&row.remainingUses>=0&&row.requests.every((request,index)=>
    request?.notBeforeRound===schedule[index]&&
    (request.requestedRound===null||Number.isSafeInteger(request.requestedRound)&&request.requestedRound>=schedule[index])&&
    (request.castRound===null?request.castMs===null:Number.isSafeInteger(request.castRound)&&request.requestedRound!==null&&
     request.castRound>=request.requestedRound&&Number.isSafeInteger(request.castMs)&&request.castMs>=0));
  });
}

function validTactics(plan,battleMode){
 if(!Object.hasOwn(plan,'tactics'))return true;
 const {tactics}=plan;
 if((![2000,306,fengmoYanwu.battleMode,qilingGroups.battleMode].includes(battleMode)&&!Object.hasOwn(activityScore.modes,battleMode))||
    !tactics||typeof tactics!=='object'||Array.isArray(tactics)||!Object.keys(tactics).length)return false;
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

function validQiLingWindow(input,entry){
 return input&&positive(input.windowSeconds)&&input.windowSeconds<=qilingGroups.windowLimit&&
  (input.startingHp===undefined||positive(input.startingHp)&&input.startingHp<=entry.maxHp);
}

function validQiLingReport(report,entry,input,plan){
 const data=report.qilingCollective;
 const actors=[Number(plan.onmyoji.heroId),...plan.members.map(row=>Number(row.hero?.heroId))];
 if(!data||report.sceneId!==entry.sceneId||report.waveCount!==1||data.configId!==report.stageId||
    data.spiritId!==entry.spiritId||data.enemyId!==entry.enemyId||data.skillId!==entry.skillId||data.maxHp!==entry.maxHp||
    data.startingHp!==(input.startingHp??entry.maxHp)||data.windowSeconds!==input.windowSeconds||
    !Number.isFinite(data.remainingHp)||data.remainingHp<0||data.remainingHp>data.startingHp||
    !Number.isSafeInteger(data.damage)||data.damage<0||!Number.isSafeInteger(data.hpMessages)||data.hpMessages<0||
    Math.abs(data.startingHp-data.remainingHp-data.damage)>=1.001||
    !Number.isFinite(data.combatSeconds)||data.combatSeconds<0||data.combatSeconds>input.windowSeconds+0.02||
    !validScoringTactics(data,plan,entry.enemyId)||!Array.isArray(data.skillRecipients)||data.skillRecipients.length!==entry.skillTargets||
    !data.skillRecipients.every(([position,id],index)=>position===index+1&&id===actors[index]))return false;
 if(!report.completed)return data.reason===null&&data.settlementSeconds===null;
 if(data.reason==='window-expired')return data.settlementSeconds===null&&data.combatSeconds===input.windowSeconds&&report.outcome==='loss';
 return Number.isFinite(data.settlementSeconds)&&data.settlementSeconds>=data.combatSeconds&&
  (report.outcome==='win'?data.reason==='boss-defeated'&&data.remainingHp===0&&report.wavesCleared===1:
   data.reason==='team-defeated'&&report.wavesCleared===0);
}

function validPersonalWindow(report,data,formation,windowSeconds,deadlineSeconds){
 if(report.waveCount!==1||data.windowSeconds!==windowSeconds||!Number.isSafeInteger(data.damage)||data.damage<0||
    !Number.isFinite(data.combatSeconds)||data.combatSeconds<0||data.combatSeconds>report.engineSeconds||
    !Array.isArray(data.enemies)||data.enemies.length!==formation.length||
    !formation.every(([position,id,level],index)=>{
     const unit=data.enemies[index];
     return unit?.position===position&&unit.id===id&&unit.level===level&&
      Number.isFinite(unit.startingHp)&&unit.startingHp>0&&Number.isFinite(unit.remainingHp)&&unit.remainingHp>=0;
    }))return false;
 if(!report.completed)return data.reason===null&&report.wavesCleared===0;
 if(data.reason==='window-expired')return windowSeconds<deadlineSeconds&&data.combatSeconds===windowSeconds&&report.outcome==='loss';
 if(report.outcome==='win')return data.reason==='cleared'&&report.wavesCleared===1;
 return ['native-timeout','team-defeated'].includes(data.reason)&&report.wavesCleared===0;
}

function validCreviceReport(report,route,windowSeconds){
 const data=report.guildCrevice;
 return data&&report.sceneId===guildCrevice.sceneId&&data.kind===route.kind&&data.bossId===route.bossId&&
  data.sharedHp===(route.kind!==1)&&Number.isSafeInteger(data.hpMessages)&&data.hpMessages>=0&&
  Number.isSafeInteger(data.reportedHpChange)&&(data.sharedHp||data.hpMessages===0&&data.reportedHpChange===0)&&
  validPersonalWindow(report,data,route.formation,windowSeconds,guildCrevice.deadlineSeconds);
}

function validGhostSettings(input,route){
 return input&&Object.keys(input).length===3&&[0,1].includes(input.attackType)&&
  (input.day===0||Number.isInteger(input.day)&&Object.hasOwn(superGhost.days,input.day))&&
  positive(input.windowSeconds)&&input.windowSeconds<=route.deadlineSeconds;
}

function validSuperGhostReport(report,route,settings,plan){
 const data=report.superGhost,{day,attackType,windowSeconds}=settings;
 if(!data||report.sceneId!==route.sceneId||data.day!==day||data.attackType!==attackType||data.star!==route.star||
    data.deadlineSeconds!==route.deadlineSeconds||data.enemyDamageReduction!==superGhost.attackReductions[attackType]||
    !validPersonalWindow(report,data,route.formation,windowSeconds,route.deadlineSeconds)||!Array.isArray(data.specialAttack))return false;
 const groups=superGhost.days[day]?.groups??[],boosted=plan.members.flatMap((member,i)=>{
  const heroId=Number(member.hero.heroId);
  return groups.some(group=>group.heroIds.includes(heroId))?[{position:i+2,heroId}]:[];
 });
 return data.specialAttack.length===boosted.length&&boosted.every(({position,heroId})=>
  data.specialAttack.some(row=>row.position===position&&row.heroId===heroId&&Number.isFinite(row.attackAdded)&&row.attackAdded>0));
}

function validHistoricalGhostReport(report,route,windowSeconds){
 const data=report.historicalSuperGhost;
 if(!data||report.sceneId!==route.sceneId||data.deadlineSeconds!==route.deadlineSeconds||data.nativeSettled!==report.completed||
    !validPersonalWindow(report,data,route.formation,windowSeconds,route.deadlineSeconds))return false;
 const boss=data.enemies[0];
 return data.bossDefeated===(boss.remainingHp===0)&&data.damage===Math.trunc(boss.startingHp)-Math.trunc(boss.remainingHp)&&
  (report.outcome!=='win'||data.enemies.every(unit=>unit.remainingHp===0))&&
  data.reason!=='window-expired'&&(data.reason!=='native-timeout'||data.combatSeconds>=windowSeconds-1);
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

function validActivityScore(report,plan,trial){
 const data=report[trial.reportKey];
 const roster=plan.members.map(member=>Number(member.hero.heroId)).sort((a,b)=>a-b);
 return data&&report.sceneId===trial.sceneId&&report.waveCount===1&&data.actId===trial.actId&&
  data.deadlineSeconds===trial.deadlineSeconds&&typeof data.timedOut==='boolean'&&
  Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&(!data.timedOut||data.combatSeconds>=trial.deadlineSeconds-1)&&
  Number.isSafeInteger(data.damage)&&data.damage>=0&&Array.isArray(data.usedHeroIds)&&
  sameTactics(data.usedHeroIds.slice().sort((a,b)=>a-b),roster)&&validScoringTactics(data,plan,trial.enemies[0])&&
  Array.isArray(data.opening)&&data.opening.length===trial.enemies.length&&data.opening.every((unit,i)=>
   unit?.id===trial.enemies[i]&&unit.position===i+1&&unit.level===40&&
   ['hp','speed','attack','defense','critRate'].every(key=>Number.isFinite(unit[key])&&unit[key]>=0));
}

function validJourneySettings(settings){
 return settings&&Object.keys(settings).length===2&&positive(settings.deadlineSeconds)&&
  Number.isSafeInteger(settings.blessingCount)&&settings.blessingCount>=0;
}

function validTianfaReport(report,stage){
 const data=report.tianfa;
 return data&&report.sceneId===tianfa.sceneId&&report.waveCount===1&&data.difficulty===stage.difficulty&&
  sameTactics(data.positions,[2,3,4,5,6,7])&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
  Number.isSafeInteger(data.damage)&&data.damage>=0&&Number.isSafeInteger(data.fireCount)&&data.fireCount>=0&&
  Array.isArray(data.opening)&&sameTactics(data.opening.map(unit=>[unit?.position,unit?.id]),tianfa.formation(stage))&&
  data.opening.every(unit=>unit.level===40&&['hp','speed','attack','defense','critRate'].every(key=>Number.isFinite(unit[key])&&unit[key]>=0));
}

function validSecretProtection(report,expected){
 const data=report.secretProtection;
 if(!expected)return data===undefined;
 if(data?.targetId!==expected.targetId||data.support?.id!==expected.supportId||data.support.position!==101||
    data.support.level!==40||data.support.star!==6||!Number.isFinite(data.support.hp)||data.support.hp<=0)return false;
 const settlement=data.settlement;
 return report.completed?settlement&&typeof settlement.supportAlive==='boolean'&&typeof settlement.targetAlive==='boolean'&&
  Number.isSafeInteger(settlement.enemiesAlive)&&settlement.enemiesAlive>=Number(settlement.targetAlive)&&
  (report.outcome!=='win'||report.wavesCleared===report.waveCount):settlement===null;
}

function validSecretMirror(report,stage){
 const expected=stage.mirror,data=report.secretMirror;
 if(!expected)return data===undefined;
 if(data?.wave!==expected.wave||!Array.isArray(data.units))return false;
 if(report.formationsVerified<expected.wave)return data.units.length===0;
 const slots=stage.waves[expected.wave-1].filter(unit=>unit.id===-1);
 return data.units.length===slots.length&&data.units.every((unit,i)=>
  unit?.position===slots[i].position&&unit.level===slots[i].level&&typeof unit.copied==='boolean'&&
  (unit.sourceId===null||positive(unit.sourceId))&&Array.isArray(unit.soulSkills)&&
  (unit.copied?positive(unit.sourceId)&&unit.monsterId===unit.sourceId&&unit.soulSkills.every(skill=>
   Array.isArray(skill)&&skill.length===2&&skill.every(positive)):
   unit.monsterId===expected.fallbackId&&unit.soulSkills.length===0));
}

function validSecretMechanic(report,expected){
 const data=report.secretMechanic;
 if(!expected)return data===undefined;
 return data&&sameTactics(data.setup,expected)&&typeof data.openingObserved==='boolean'&&
  (!report.completed||data.openingObserved)&&data.counters&&Object.keys(data.counters).length===expected.counters.length&&
  expected.counters.every(key=>Number.isSafeInteger(data.counters[key])&&data.counters[key]>=0);
}

function validJourneyReport(report,route,settings){
 const data=report.journeyHard;
 return data&&report.sceneId===journeyHard.sceneId&&report.waveCount===1&&data.challengeId===route.challengeId&&
  data.deadlineSeconds===settings.deadlineSeconds&&data.blessingCount===settings.blessingCount&&
  data.blessingSkill===journeyHard.blessingSkill&&typeof data.timedOut==='boolean'&&
  Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&(!data.timedOut||data.combatSeconds>=data.deadlineSeconds)&&
  data.blessingBonus&&['attack','defense','hp','speed','crit','critDamage'].every(key=>Number.isFinite(data.blessingBonus[key]))&&
  Array.isArray(data.opening)&&data.opening.length===route.enemies.length&&data.opening.every((unit,index)=>
   unit?.position===route.enemies[index][0]&&unit.id===route.enemies[index][1]&&unit.level===40);
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

function readReport(report,{battleMode,stageId,groupId,seed,input,suitInput,damageFloor,rounds,retreat,region,resource,hunlingRoute,capture,qilingEntry,qilingWindow,sixRealmsRoute,sixRealmsEvent,trialSlot,sixRealmsState,journeyRoute,journeySettings,creviceRoute,creviceWindow,ghostRoute,ghostSettings,historicalGhostRoute,historicalGhostWindow}){
 const secret=battleMode===266?secretOpenings.floors[stageId]:null;
 const engine=sixRealmsRoute?{name:sixRealmsRoute.engine,sha256:sixRealmsRoute.sha256,
  route:`six-realms-${sixRealmsState?'configured':'full-health'}-${sixRealmsEvent?'encounter':'trial'}`}:
  resource?{name:resource.engine,route:resource.route,sha256:resource.engineSHA256??resourceEncounters.engineSHA256}:
  secret?.entrance==='race'?{...engines[battleMode],route:'secret-race-solo'}:
  secret?.entrance==='team'?{...engines[battleMode],route:'secret-team-solo'}:engines[battleMode];
 const awake=battleMode===29?awakeOpenings.floors[stageId]:null;
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
 const trial=report?.sixRealms;
 const invalidEvent=sixRealmsEvent&&(trial?.eventId!==sixRealmsEvent.id||trial.moveCount!==sixRealmsEvent.moves||
  ![0,1,2].includes(trial.battleType)||!Number.isFinite(trial.enemyAttributeBonus)||trial.enemyAttributeBonus<0);
 const invalidTrial=sixRealmsRoute&&(!trial||trial.dao!==sixRealmsRoute.dao||trial.difficulty!==(sixRealmsEvent?.difficulty??sixRealms.difficulty)||
  trial.trialSlot!==trialSlot||trial.trialHero!==Number(rounds[0].members[trialSlot-1].hero.heroId)||
  !Number.isSafeInteger(trial.rounds)||trial.rounds<0||
  (sixRealmsRoute.phases?!validMoonPhases(report,sixRealmsRoute.phases):
   report.sceneId!==sixRealmsRoute.sceneId||report.waveCount!==1));
 if(report?.resourceVersion!==resourceVersion||report.route!==engine.route||report.engineClass!==engine.name||
    report.engineSHA256!==engine.sha256||report.battleMode!==battleMode||report.stageId!==stageId||report.groupId!==groupId||
    (awake&&(report.sceneId!==awake.sceneId||report.waveCount!==1))||
    (yuling&&(report.sceneId!==yuling.sceneId||report.waveCount!==1||report.formationsVerified!==1||invalidYuling))||
    (hunt&&(report.sceneId!==hunt.sceneId||report.waveCount!==1||invalidHunt))||
    (retreatOpening&&!validRetreat(report,retreatOpening,retreat,rounds[0]))||
    (yanwu&&!validFengmoYanwu(report,yanwu,rounds[0]))||
    (activityScore.modes[battleMode]&&!validActivityScore(report,rounds[0],activityScore.modes[battleMode]))||
    (battleMode===tianfa.battleMode&&!validTianfaReport(report,tianfa.stages[stageId]))||
    (journeyRoute&&!validJourneyReport(report,journeyRoute,journeySettings))||
    (spider&&!validTuzhizhuPractice(report,spider,stageId,rounds[0]))||
    (battleMode===2001&&!validUnderworld(report,rounds))||
    (battleMode===orochi.battleMode&&!validOrochiReport(report,rounds[0]))||
    (hunlingRoute&&!validHunlingReport(report,hunlingRoute,capture))||
    (qilingEntry&&!validQiLingReport(report,qilingEntry,qilingWindow,rounds[0]))||
    (creviceRoute&&!validCreviceReport(report,creviceRoute,creviceWindow))||
    (ghostRoute&&!validSuperGhostReport(report,ghostRoute,ghostSettings,rounds[0]))||
    (historicalGhostRoute&&!validHistoricalGhostReport(report,historicalGhostRoute,historicalGhostWindow))||
    invalidTrial||invalidEvent||(sixRealmsState&&!validSixRealmsStateReport(trial?.runState,sixRealmsState,sixRealmsRoute.dao))||
    (regionModes.includes(battleMode)&&!validRegionalReport(report,region))||
    (secret&&(report.sceneId!==secret.sceneId||report.waveCount!==secret.waves.length||
      !Number.isSafeInteger(report.formationsVerified)||report.formationsVerified<report.wavesCleared||
      report.formationsVerified>report.waveCount||!validSecretProtection(report,secret.protection)||!validSecretMirror(report,secret)||
      !validSecretMechanic(report,secret.mechanic)||
      (secret.replacement?!sameTactics(report.secretActor,{...secret.replacement,position:1}):report.secretActor!==undefined)))||
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

function validMoonPhases(report,expected){
 const {phases,phasesCleared,montageWaitMs}=report.sixRealms;
 return Array.isArray(phases)&&phases.length>=1&&phases.length<=expected.length&&
  phases.every((phase,index)=>phase&&Object.entries(expected[index]).every(([key,value])=>phase[key]===value))&&
  expected.some(phase=>phase.sceneId===report.sceneId)&&report.waveCount===expected.length&&
  phasesCleared===report.wavesCleared&&Number.isSafeInteger(phasesCleared)&&phasesCleared>=0&&phasesCleared<=phases.length&&
  (report.outcome!=='win'||phasesCleared===expected.length)&&Number.isSafeInteger(montageWaitMs)&&montageWaitMs>=0;
}

function createPveStageRunner({configPath,scriptRoot,suits}){
 const entry=path.join(scriptRoot,'verify-pve-stage.py');
 let current=null;
 return {
  async status(){
   try{
    await Promise.all([readConfig(configPath),fs.access(entry),fs.access(path.join(scriptRoot,'rune_floor_host.py'))]);
    const has=name=>fs.access(path.join(scriptRoot,name)).then(()=>true,()=>false);
    const [awake,secret,yuling,resource,hunt,underworld,retreat,regional,yanwu,spider,trueOrochi,spirit,qiling,shilian,generalSoul,journey,tianfaAvailable,crevice,ghost]=await Promise.all([has('awake_stage.py'),has('secret_stage.py'),has('yuling_stage.py'),
     has('resource_stage.py'),has('guild_hunt_stage.py'),has('underworld_stage.py'),has('guild_retreat_stage.py'),has('regional_boss_stage.py'),
     has('fengmo_yanwu_stage.py'),has('tuzhizhu_practice.py'),has('true_orochi_stage.py'),has('hunling_stage.py'),has('qiling_group_stage.py'),
     Promise.all([has('shilian_stage.py'),has('shilian_routes.py')]).then(files=>files.every(Boolean)),has('general_soul_stage.py'),has('journey_hard_stage.py'),has('tianfa_stage.py'),has('guild_crevice_stage.py'),has('superghost_stage.py')]);
    return {available:true,resourceVersion,battleModes:[3,...(awake?[29]:[]),...(secret?[266]:[]),...(yuling?[267]:[]),
     ...(resource?[firstExperience.battleMode]:[]),...(hunt?[2000]:[]),...(underworld?[2001]:[]),...(retreat?[306]:[]),...(regional?regionModes:[]),
     ...(yanwu?[fengmoYanwu.battleMode]:[]),...(spider?Object.keys(tuzhizhuPractice.modes).map(Number):[]),...(trueOrochi?[orochi.battleMode]:[]),
     ...(spirit?hunling.battleModes:[]),...(qiling?[qilingGroups.battleMode]:[]),...(shilian?sixRealmsModes:[]),
     ...(generalSoul?Object.keys(activityScore.modes).map(Number):[]),...(journey?[journeyHard.battleMode]:[]),...(tianfaAvailable?[tianfa.battleMode]:[]),
     ...(crevice?[guildCrevice.battleMode]:[]),...(ghost?[superGhost.battleMode,superGhost.historicalBattleMode]:[])]};
   }catch(error){
    return {available:false,reason:error.code==='ENOENT'?'缺少本机 PvE 复跑资料':'本机 PvE 复跑配置无效'};
   }
  },
  async run(plan,{battleMode=3,stageId,groupId,seed,damageFloor=false,retreat,region,capture,qilingWindow,sixRealmsEvent,trialSlot,sixRealmsState,journeyHard:journeySettings,creviceWindow,ghostSettings,historicalGhostWindow}={}){
   if(current)throw Error('已有库存复跑正在运行');
   const rounds=battleMode===2001&&Object.hasOwn(plan??{},'rounds')?plan.rounds:[plan];
   const minMembers=battleMode===2001?5:1;
   const maxMembers=[fengmoYanwu.battleMode,orochi.battleMode,tianfa.battleMode,...sixRealmsModes].includes(battleMode)?6:5;
   const stageActor=battleMode===266&&secretOpenings.floors[stageId]?.replacement;
   if(!Number.isInteger(battleMode)||!Object.hasOwn(engines,battleMode)||!positive(stageId)||!positive(groupId)||!Number.isSafeInteger(seed)||seed<0||seed>=10000||
      typeof damageFloor!=='boolean'||!Array.isArray(rounds)||rounds.length<1||rounds.length>4||rounds.some(row=>
       !row||(!stageActor&&!row.onmyoji)||!Array.isArray(row.members)||row.members.length<minMembers||row.members.length>maxMembers||!validTactics(row,battleMode))||
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
   const isSixRealmsEvent=battleMode===sixRealms.eventMode;
   const sixRealmsRoute=isSixRealmsEvent?sixRealms.eventRoute(stageId):
    battleMode===sixRealms.battleMode?sixRealms.routes[stageId]:null;
   if(sixRealmsModes.includes(battleMode)&&(sixRealms.resourceVersion!==resourceVersion||!sixRealmsRoute||stageId!==groupId||
      plan.members.length!==6||!Number.isInteger(trialSlot)||trialSlot<1||trialSlot>6||
      !sixRealmsRoute.eligible.includes(Number(plan.members[trialSlot-1]?.hero?.heroId)))||trialSlot!==undefined&&!sixRealmsRoute)
    throw Error('六道之门需要同路线的六式神阵容和符合条件的试炼式神');
   if(isSixRealmsEvent?!validSixRealmsEvent(sixRealmsEvent):sixRealmsEvent!==undefined)
    throw Error('六道之门途中战斗需要有效的原版事件、难度档位和前行步数');
   if(sixRealmsState!==undefined&&(!sixRealmsRoute||!validSixRealmsState(sixRealmsState)))
    throw Error('六道之门途中状态的生命上限、印记、技能或秘宝设置无效');
   const qilingEntry=battleMode===qilingGroups.battleMode?qilingGroups.routes[stageId]:null;
   if(battleMode===qilingGroups.battleMode&&(qilingGroups.resourceVersion!==resourceVersion||qilingEntry?.groupId!==groupId||
      plan.members.length!==5||!validQiLingWindow(qilingWindow,qilingEntry))||qilingWindow!==undefined&&!qilingEntry)
    throw Error('契灵集结需要合法的首领、计分窗口、开场生命和五位自有式神');
   if(battleMode===fengmoYanwu.battleMode&&(fengmoYanwu.resourceVersion!==resourceVersion||stageId!==groupId||
      plan.members.length!==fengmoYanwu.routes[stageId]?.memberCount))throw Error('当前配装与逢魔演武单人上阵人数不一致');
   if(battleMode===3&&Object.hasOwn(fengmoYanwu.routes,stageId))throw Error('逢魔演武需要使用原版活动计分入口');
   const scoreRoute=activityScore.modes[battleMode];
   if(scoreRoute&&(scoreRoute.resourceVersion!==resourceVersion||stageId!==scoreRoute.stageId||
      groupId!==stageId||plan.members.length!==scoreRoute.memberCount))
    throw Error(`${scoreRoute.label}需要原版活动关卡和五位自有式神`);
   if(battleMode===3&&activityScore.stages[stageId])throw Error(`${activityScore.stages[stageId].label}需要使用原版活动计分入口`);
   const tianfaStage=tianfa.stages[stageId];
   if(battleMode===tianfa.battleMode&&(tianfa.resourceVersion!==resourceVersion||!tianfaStage||
      groupId!==stageId||plan.members.length!==tianfa.memberCount))
    throw Error('彼世逢魔单人挑战需要对应难度的原版关卡和六位自有式神');
   if(battleMode===3&&tianfaStage)throw Error('彼世逢魔需要使用原版挑战入口');
   const journeyRoute=battleMode===journeyHard.battleMode?journeyHard.routes[stageId]:null;
   if(battleMode===journeyHard.battleMode&&(journeyHard.resourceVersion!==resourceVersion||!journeyRoute||stageId!==groupId||
      plan.members.length!==journeyHard.memberCount||!validJourneySettings(journeySettings))||journeySettings!==undefined&&!journeyRoute)
    throw Error('京畿净化需要原版首领关卡、祝福层数、战斗时限和五位自有式神');
   if(battleMode===3&&journeyHard.routes[stageId])throw Error('京畿净化需要使用原版首领挑战入口');
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
   const creviceRoute=battleMode===guildCrevice.battleMode?guildCrevice.routes[stageId]:null;
   if(battleMode===guildCrevice.battleMode&&(guildCrevice.resourceVersion!==resourceVersion||creviceRoute?.groupId!==groupId||
      plan.members.length!==5||!positive(creviceWindow)||creviceWindow>guildCrevice.deadlineSeconds)||
      creviceWindow!==undefined&&!creviceRoute)throw Error('狭间暗域需要正确的关卡、编组、计分时长和五位自有式神');
   if(battleMode===3&&guildCrevice.routes[stageId])throw Error('狭间暗域需要该玩法的原版入口');
   const ghostRoute=battleMode===superGhost.battleMode?superGhost.routes[stageId]:null;
   if(battleMode===superGhost.battleMode&&(superGhost.resourceVersion!==resourceVersion||!ghostRoute||groupId!==stageId||
      plan.members.length!==5||!validGhostSettings(ghostSettings,ghostRoute))||
      ghostSettings!==undefined&&!ghostRoute)throw Error('超鬼王需要正确的首领、追击方式、特攻日和计分时长');
   const historicalGhostRoute=battleMode===superGhost.historicalBattleMode?superGhost.historicalRoutes[stageId]:null;
   if(battleMode===superGhost.historicalBattleMode&&(superGhost.resourceVersion!==resourceVersion||!historicalGhostRoute||groupId!==stageId||
      plan.members.length!==5||!positive(historicalGhostWindow)||historicalGhostWindow>historicalGhostRoute.deadlineSeconds)||
      historicalGhostWindow!==undefined&&!historicalGhostRoute)throw Error('超鬼王历史挑战需要正确的关卡、阵容和计分时长');
   const input=JSON.stringify(plan),suitInput=JSON.stringify(suits);
   if(Buffer.byteLength(input)>256*1024)throw Error('复跑配装超过大小限制');
   const deadlineMs=spider?645000:battleMode===306||qilingEntry||ghostRoute||historicalGhostRoute?245000:sixRealmsRoute||tianfaStage||creviceRoute?175000:
    hunlingRoute||[2001,orochi.battleMode].includes(battleMode)?155000:100000;
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
    if(sixRealmsRoute)args.push('--shilian-trial-slot',String(trialSlot));
    if(sixRealmsState)args.push('--shilian-state',JSON.stringify(sixRealmsState));
    if(journeyRoute)args.push('--journey-blessings',String(journeySettings.blessingCount),'--journey-deadline',String(journeySettings.deadlineSeconds));
    if(isSixRealmsEvent)args.push('--shilian-event-id',String(sixRealmsEvent.id),'--shilian-difficulty',String(sixRealmsEvent.difficulty),
     '--shilian-moves',String(sixRealmsEvent.moves));
    if(qilingEntry){
     args.push('--qiling-window',String(qilingWindow.windowSeconds));
     if(qilingWindow.startingHp!==undefined)args.push('--qiling-hp',String(qilingWindow.startingHp));
    }
    if(creviceRoute)args.push('--crevice-window',String(creviceWindow));
    if(ghostRoute)args.push('--ghost-settings',JSON.stringify(ghostSettings));
    if(historicalGhostRoute)args.push('--historical-ghost-window',String(historicalGhostWindow));
    const code=await launch(config.python,args,dir,AbortSignal.any([cancel.signal,deadline]));
    cancel.signal.throwIfAborted();
    if(code!==0&&code!==2)throw Error('本机原版引擎未能运行此关卡，请核对资料、阵容和入场条件');
    const report=JSON.parse(await fs.readFile(output,'utf8'));
    cancel.signal.throwIfAborted();
    return readReport(report,{battleMode,stageId,groupId,seed,input,suitInput,damageFloor,rounds,resource,hunlingRoute,capture,qilingEntry,qilingWindow,sixRealmsRoute,sixRealmsEvent,trialSlot,sixRealmsState,journeyRoute,journeySettings,creviceRoute,creviceWindow,ghostRoute,ghostSettings,historicalGhostRoute,historicalGhostWindow,
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
