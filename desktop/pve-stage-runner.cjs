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
const fengmoBand=require('../app/fengmo-band.js');
const devilFeast=require('../app/devil-feast.js');
const ghostKingTower=devilFeast.tower;
const laolao=devilFeast.laolao;
const fusion=devilFeast.fusion;
const bandTogether=fengmoBand.together;
const activityScore=require('../app/general-soul-trial.js');
const dojoAreaRules=require('../app/dojo-area.js');
const forestRules=require('../app/guild-forest.js');
const ten=require('../app/ten-anniversary.js');
const tenBoss=ten.bossRoute;
const tenExplore=ten.exploreRoute;
const tianfa=require('../app/tianfa.js');
const journeyHard=require('../app/journey-hard.js');
const yinYang=journeyHard.boss;
const mapBoss=require('../app/map-boss.js');
const qinfei=mapBoss.qinfeiBoss;
const fengmoLive=require('../app/fengmo-live.js');
const {duskWraith,songstress,mirage,catfish,skeleton,longche,spiderLive,spiderNormal}=fengmoLive;
const tuzhizhuPractice=require('../app/tuzhizhu-practice.js');
const resourceEncounters=require('../app/resource-encounters.js');
const orochi=require('../app/true-orochi.js');
const hunling=require('../app/hunling-encounters.js');
const qilingGroups=require('../app/qiling-group-openings.js');
const sixRealms=require('../app/six-realms-exams.js');
const {firstExperience}=resourceEncounters;

const engines={
 [dojoAreaRules.battleMode]:dojoAreaRules.engine,
 [forestRules.battleMode]:forestRules.engine,
 ...ten.modes,
 [tenBoss.battleMode]:tenBoss.engine,
 [tenExplore.battleMode]:tenExplore.engine,
 3:{name:'MonstarGuanKaEngine',route:'mode-pve-default-solo',sha256:'1627ca26088ba2fca41b3408ed930650fb31d9040642b5b10566a4479067ef1b'},
 29:{name:'AwakeFbEngine',route:'awake-ordinary-solo',sha256:awakeOpenings.engineSHA256},
 266:{name:'ChallengeFbEngine',route:'secret-ordinary-solo',sha256:secretOpenings.engineSHA256},
 267:{name:'GorenFbEngine',route:'yuling-solo',sha256:yulingOpenings.engineSHA256},
 306:{name:'GuildBossEngine',route:'guild-retreat-personal-window',sha256:guildRetreatOpenings.engineSHA256},
 [qinfei.battleMode]:qinfei.engine,
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
 [fengmoBand.battleMode]:fengmoBand.engine,
 [bandTogether.battleMode]:bandTogether.engine,
 [devilFeast.battleMode]:devilFeast.engine,
 [ghostKingTower.battleMode]:ghostKingTower.engine,
 [laolao.battleMode]:laolao.engine,
 [fusion.battleMode]:fusion.engine,
 [duskWraith.battleMode]:duskWraith.engine,
 [songstress.battleMode]:songstress.engine,
 [mirage.battleMode]:mirage.engine,
 [catfish.battleMode]:catfish.engine,
 [skeleton.battleMode]:skeleton.engine,
 [longche.battleMode]:longche.engine,
 [spiderLive.battleMode]:spiderLive.engine,
 [spiderNormal.battleMode]:spiderNormal.engine,
 ...Object.fromEntries(Object.values(activityScore.modes).map(({battleMode,engine,route,engineSHA256})=>
  [battleMode,{name:engine,route,sha256:engineSHA256}])),
 [tianfa.battleMode]:{name:tianfa.engine,route:tianfa.route,sha256:tianfa.engineSHA256},
 [journeyHard.battleMode]:{name:'JSNormalEngine',route:'journey-hard-solo',sha256:journeyHard.engineSHA256},
 [yinYang.battleMode]:{name:'YinYangEngine',route:'yinyang-monopoly-boss',sha256:yinYang.engineSHA256},
 ...Object.fromEntries(Object.entries(mapBoss.engines).map(([mode,engine])=>[mode,{...engine,route:'map-boss-local-team'}])),
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
 if((![2000,306,fengmoYanwu.battleMode,duskWraith.battleMode,songstress.battleMode,mirage.battleMode,catfish.battleMode,skeleton.battleMode,longche.battleMode,spiderLive.battleMode,spiderNormal.battleMode,qilingGroups.battleMode,qinfei.battleMode].includes(battleMode)&&!Object.hasOwn(activityScore.modes,battleMode))||
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

function validQinfeiBoss(report,options,plan){
 const {raidId,difficulty,windowSeconds}=options,profile=qinfei.profiles[[raidId,difficulty]];
 const data=report.qinfeiBoss,opening=data?.opening;
 const reasons={win:['boss-defeated'],loss:['window-expired','team-defeated'],unknown:[null]};
 return report.sceneId===qinfei.sceneId&&report.waveCount===1&&report.formationsVerified===1&&
  report.wavesCleared===Number(report.outcome==='win')&&data?.raidSHA256===qinfei.raidSHA256&&
  data.raidId===raidId&&data.difficulty===difficulty&&data.bossId===profile.bossId&&data.round===1&&data.fed===false&&
  opening?.id===profile.enemyId&&opening.position===1&&opening.level===40&&
  ['hp','speed','attack','defense','critRate'].every(key=>Number.isFinite(opening[key])&&opening[key]>=0)&&opening.hp>0&&
  Number.isFinite(data.remainingHp)&&data.remainingHp>=0&&data.remainingHp<=opening.hp&&
  Number.isSafeInteger(data.damage)&&data.damage>=0&&Number.isSafeInteger(data.localDamage)&&data.localDamage>=0&&
  data.windowSeconds===windowSeconds&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=windowSeconds&&
  reasons[report.outcome]?.includes(data.reason)&&(data.reason!=='window-expired'||data.combatSeconds===windowSeconds)&&
  (report.outcome!=='win'||data.remainingHp===0)&&
  Array.isArray(data.phases)&&data.phases.every(value=>typeof value==='string'&&value.length>0)&&
  validScoringTactics(data,plan,profile.enemyId);
}

function validDevilFeast(report,profile,requestedHp){
 const result=report.devilFeast;
 return report.sceneId===profile.sceneId&&report.waveCount===1&&report.formationsVerified===1&&
  result?.kind===profile.kind&&result.configId===profile.configId&&result.deadlineSeconds===profile.seconds&&
  Number.isFinite(result.combatSeconds)&&result.combatSeconds>=0&&typeof result.timedOut==='boolean'&&
  (!result.timedOut||result.combatSeconds>=profile.seconds-1)&&
  Array.isArray(result.enemies)&&result.enemies.length>0&&(profile.kind!=='boss'||result.enemies.length===1&&result.enemies[0]?.position===1)&&
  result.enemies.every((enemy,i)=>positive(enemy?.id)&&positive(enemy.level)&&positive(enemy.position)&&
   enemy.position>(result.enemies[i-1]?.position??0)&&Number.isFinite(enemy.maxHp)&&enemy.maxHp>0&&
   enemy.startingHp>0&&enemy.startingHp<=enemy.maxHp&&Math.abs(enemy.startingHp-(requestedHp??enemy.maxHp))<=0.001&&
   Number.isFinite(enemy.remainingHp)&&enemy.remainingHp>=0&&enemy.remainingHp<=enemy.maxHp)&&
  (report.outcome!=='win'||result.enemies.every(enemy=>enemy.remainingHp===0));
}

function validFengmoBand(report,stageId){
 const band=report.fengmoBand,opening=band?.opening;
 return report.sceneId===fengmoBand.sceneId&&report.waveCount===1&&report.formationsVerified===1&&
  band?.bossId===fengmoBand.bossFor(stageId)&&band.deadlineSeconds===fengmoBand.deadlineSeconds&&
  Number.isSafeInteger(band.damage)&&band.damage>=0&&Number.isFinite(band.combatSeconds)&&band.combatSeconds>=0&&
  typeof band.timedOut==='boolean'&&(!band.timedOut||band.combatSeconds>=band.deadlineSeconds-1)&&
  Array.isArray(opening)&&opening.length===6&&opening[0]?.id===band.monsterId&&
  opening.every((unit,i)=>unit?.position===i+1&&positive(unit.id)&&positive(unit.level)&&Number.isFinite(unit.hp)&&unit.hp>0)&&
  Number.isSafeInteger(band.enemiesRemaining)&&band.enemiesRemaining>=0&&band.enemiesRemaining<=opening.length&&
  report.wavesCleared===Number(band.enemiesRemaining===0)&&
  Array.isArray(band.allyBuffs)&&band.allyBuffs.every(positive)&&Array.isArray(band.enemyBuffs)&&band.enemyBuffs.every(positive)&&
  sameTactics(band.buffRecipients,Object.fromEntries([
   ...band.allyBuffs.map(id=>[id,id===fengmoBand.actorOnlyBuff?[1]:[1,2,3,4,5,6]]),
   ...band.enemyBuffs.map(id=>[id,[1]]),
  ]));
}

function validBandTogetherPhase(report,index,rhythmScore,priorDamage,priorBuffLevel){
 const phase=report.fengmoBandPhase,hasRhythm=phase?.rhythmScore!==null;
 const earned=hasRhythm?bandTogether.thresholds[index].filter(threshold=>rhythmScore>=threshold).length:0;
 return report.sceneId===bandTogether.scenes[index]&&report.waveCount===1&&report.formationsVerified===1&&
  phase?.monsterId===bandTogether.monsters[index]&&
  Number.isFinite(phase.openingHp)&&phase.openingHp>0&&Number.isFinite(phase.remainingHp)&&
  phase.remainingHp>=0&&phase.remainingHp<=phase.openingHp&&Number(phase.remainingHp===0)===report.wavesCleared&&
  phase.priorDamage===priorDamage&&Number.isSafeInteger(phase.damage)&&phase.damage>=priorDamage&&
  phase.priorBuffLevel===priorBuffLevel&&phase.buffLevel===priorBuffLevel+earned&&
  (!hasRhythm?phase.rhythmSeconds===0:phase.rhythmScore===rhythmScore&&
   (report.completed?Math.abs(phase.rhythmSeconds-bandTogether.rhythmSeconds[index])<=0.05:
    Number.isFinite(phase.rhythmSeconds)&&phase.rhythmSeconds>=0&&phase.rhythmSeconds<=bandTogether.rhythmSeconds[index]+0.05))&&
  [phase.beforeRhythmSeconds,phase.afterRhythmSeconds].every(seconds=>Number.isFinite(seconds)&&seconds>=0)&&
  typeof phase.timedOut==='boolean'&&(index===1||phase.afterRhythmSeconds===0&&!phase.timedOut);
}

function combineBandTogether(first,second){
 const reports=second?[first,second]:[first];
 const phases=reports.map(report=>({...report.fengmoBandPhase,stageId:report.stageId,recordSHA256:report.recordSHA256}));
 const final=phases.at(-1);
 const {animationPlayback,monsterHealth,fengmoBandPhase,...base}=first;
 return {...base,completed:reports.every(report=>report.completed),
  outcome:reports.at(-1).outcome,
  waveCount:2,wavesCleared:reports.reduce((sum,report)=>sum+report.wavesCleared,0),
  formationsVerified:phases.length,
  engineSeconds:reports.reduce((sum,report)=>sum+report.engineSeconds,0),
  recordSHA256:sha256(phases.map(phase=>phase.recordSHA256).join('')),
  recordLines:reports.reduce((sum,report)=>sum+report.recordLines,0),
  ...(base.minimumDamage?{minimumDamage:{side:'player',rolls:reports.reduce((sum,report)=>sum+report.minimumDamage.rolls,0)}}:{}),
  fengmoBandTogether:{damage:final.damage,phases,timedOut:final.timedOut}};
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

function validTianfaReport(report,stage,team){
 const data=report.tianfa;
 return data&&report.sceneId===tianfa.sceneId&&report.waveCount===1&&data.difficulty===stage.difficulty&&
  sameTactics(data.positions,team?tianfa.teamPositions[0]:[2,3,4,5,6,7])&&
  (team?sameTactics(data.teamPositions,tianfa.teamPositions):data.teamPositions===undefined)&&
  Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
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

function validYinYangBoss(report,settings){
 const data=report.yinyangBoss;
 return data&&report.sceneId===yinYang.sceneId&&report.waveCount===1&&report.formationsVerified===1&&
  data.remainingDrums===settings.remainingDrums&&sameTactics(data.buffIds,settings.buffIds)&&
  data.deadlineSeconds===yinYang.deadlineSeconds(settings)&&typeof data.timedOut==='boolean'&&
  Number.isSafeInteger(data.damage)&&data.damage>=0&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
  (!data.timedOut||data.combatSeconds>=data.deadlineSeconds&&report.outcome!=='win')&&
  Array.isArray(data.opening)&&data.opening.length===yinYang.enemies.length&&data.opening.every((unit,index)=>
   unit?.position===yinYang.enemies[index][0]&&unit.id===yinYang.enemies[index][1]&&unit.level===40);
}

function validGhostKingTower(report,route,settings){
 const data=report.ghostKingTower;
 if(!data||!route||report.waveCount!==1||report.formationsVerified!==1||data.kind!==route.kind||
    data.deadlineSeconds!==route.seconds||!sameTactics(data.settings,settings)||
    !Number.isFinite(data.combatSeconds)||data.combatSeconds<0||typeof data.timedOut!=='boolean'||
    data.timedOut&&(!route.seconds||data.combatSeconds<route.seconds-1||report.outcome==='win')||
    !Array.isArray(data.configIds)||!data.configIds.length||!data.configIds.every((id,i)=>positive(id)&&(!i||id>data.configIds[i-1]))||
    route.configId!=null&&!sameTactics(data.configIds,[route.configId])||
    !Array.isArray(data.blessingSkills)||data.blessingSkills.length!==settings.blessings.length||
    !data.blessingSkills.every(row=>Array.isArray(row)&&row.length===2&&positive(row[0])&&positive(row[1]))||
    !Array.isArray(data.guestIds)||!data.guestIds.every((id,i)=>positive(id)&&(!i||id>data.guestIds[i-1]))||
    Boolean(data.guestIds.length)!==Boolean(settings.factions.length)||
    !Array.isArray(data.enemies)||!data.enemies.length||data.enemies.length>6)return false;
 const {enemyHp}=settings;
 if(route.kind==='boss'&&(report.sceneId!==400205||data.enemies.length!==(enemyHp?enemyHp.filter(Boolean).length:6)))return false;
 if(route.kind!=='boss'&&![400202,400203,400204].includes(report.sceneId))return false;
 return data.enemies.every((unit,index)=>unit&&positive(unit.id)&&positive(unit.level)&&positive(unit.position)&&unit.position<=6&&
  (!index||unit.position>data.enemies[index-1].position)&&
  ['maxHp','startingHp','remainingHp'].every(key=>Number.isFinite(unit[key])&&unit[key]>=0)&&
  unit.startingHp>0&&unit.startingHp<=unit.maxHp&&
  (enemyHp?Math.abs(unit.startingHp-enemyHp[unit.position-1])<0.001:unit.startingHp===unit.maxHp));
}

function validLaolaoChallenge(report,route,settings){
 const data=report.laolaoChallenge;
 return data&&route&&report.sceneId===laolao.sceneId&&report.waveCount===route.waveCount&&
  data.ghostId===route.ghost&&data.difficulty===route.difficulty&&sameTactics(data.settings,settings)&&
  data.deadlineSeconds===laolao.deadlineSeconds&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
  typeof data.timedOut==='boolean'&&(!data.timedOut||data.combatSeconds>=data.deadlineSeconds-1&&report.outcome!=='win')&&
  Array.isArray(data.guestIds)&&data.guestIds.every((id,i)=>positive(id)&&(!i||id>data.guestIds[i-1]))&&
  Boolean(data.guestIds.length)===Boolean(settings.factions.length)&&
  Array.isArray(data.faithSkills)&&data.faithSkills.length>0&&data.faithSkills.every(skill=>
   Array.isArray(skill)&&skill.length===2&&positive(skill[0])&&positive(skill[1]))&&
  Array.isArray(data.actorFaithSkills)&&data.actorFaithSkills.every(positive)&&
  Array.isArray(data.waves)&&data.waves.length===report.formationsVerified&&data.waves.length>0&&data.waves.length<=route.waveCount&&
  data.waves.length>=report.wavesCleared&&data.waves.every(wave=>Array.isArray(wave)&&wave.length>0&&wave.length<=6&&
   wave.every((unit,i)=>unit&&positive(unit.id)&&unit.level===40&&positive(unit.position)&&unit.position<=6&&
    (!i||unit.position>wave[i-1].position)));
}

function validLaolaoFusion(report,settings){
 const data=report.laolaoFusion;
 if(!data||report.sceneId!==fusion.sceneId||report.waveCount!==1||!sameTactics(data.settings,settings)||
    !Number.isSafeInteger(data.damage)||data.damage<0||!Number.isFinite(data.combatSeconds)||data.combatSeconds<0||
    !Array.isArray(data.maximumHp)||data.maximumHp.length!==4||
    !data.maximumHp.every(hp=>Number.isFinite(hp)&&hp>=1&&hp===data.maximumHp[0])||
    data.thresholdHp!==data.maximumHp.reduce((total,hp)=>total+hp,0)/4)return false;
 const health=values=>Array.isArray(values)&&values.length===4&&values.every((hp,i)=>
  Number.isFinite(hp)&&hp>=0&&hp<=data.maximumHp[i]);
 if(!health(data.initialHp)||!health(data.sharedHp)||!sameTactics(data.initialHp,settings.sharedHpPercent.map((rate,i)=>
  rate?Math.max(1,Math.floor(data.maximumHp[i]*rate/100)):0)))return false;
 const total=values=>values.reduce((sum,hp)=>sum+hp,0);
 const first=total(data.initialHp)>data.thresholdHp?1:2;
 const transition=data.transition;
 if(transition!==null&&(first!==1||!health(transition?.sharedHp)||total(transition.sharedHp)>data.thresholdHp||
    !Number.isFinite(transition.seconds)||transition.seconds<0||transition.seconds>data.combatSeconds||
    !Number.isSafeInteger(transition.damage)||transition.damage<0||transition.damage>data.damage))return false;
 const phases=data.phases;
 if(!Array.isArray(phases)||!phases.length||phases.length!==(report.formationsVerified??0)||phases.length>(transition?2:1))return false;
 for(const [index,phase] of phases.entries()){
  const order=first+index,hp=phase?.sharedHp;
  if(!health(hp)||index===0&&!sameTactics(hp,data.initialHp))return false;
  const expected=fusion.bosses.flatMap((id,i)=>hp[i]>0&&(order===2||id===fusion.groupBosses[settings.group-1])?
   [{id,position:order===2?10+i:1,level:40,hp:hp[i]}]:[]);
  if(phase?.phase!==order||!sameTactics(phase.opening,expected)||typeof phase.rosterVerified!=='boolean'||
     !Number.isFinite(phase.seconds)||index===0&&!phase.rosterVerified||
     (index===0?phase.seconds!==0:phase.seconds<transition.seconds||phase.seconds>data.combatSeconds))return false;
 }
 if(!report.completed)return ['incomplete','window-expired','assigned-health-floor'].includes(data.reason);
 if(report.outcome==='win')return data.reason==='bosses-defeated'&&phases.at(-1).phase===2&&
  phases.at(-1).rosterVerified&&total(data.sharedHp)===0;
 return report.outcome==='loss'&&(data.reason==='team-defeated'||
  data.reason==='assigned-health-floor'&&phases.at(-1).phase===1&&!transition&&
   data.sharedHp[fusion.bosses.indexOf(fusion.groupBosses[settings.group-1])]<=1||
  data.reason==='window-expired'&&data.combatSeconds>=settings.windowSeconds);
}

function validSpiderNormal(report,settings,plan){
 const data=report.spiderNormal,source=spiderNormal;
 const between=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
 if(!data||report.sceneId!==source.sceneId||report.waveCount!==1||report.formationsVerified!==1||
    !sameTactics(data.settings,settings)||!validScoringTactics(data,plan,source.openingTarget)||
    !Number.isSafeInteger(data.damage)||data.damage<0||!between(data.combatSeconds,0,settings.windowSeconds+.1)||
    data.damageRating!==source.ratingThresholds.filter(threshold=>threshold<=data.damage).length||
    ![2,3,4].includes(data.weakPart)||settings.weakPart&&data.weakPart!==settings.weakPart||
    typeof data.weakPartVerified!=='boolean'||data.summonLimit!==source.summonLimit||
    !Number.isSafeInteger(data.summonRequests)||!between(data.summonRequests,0,source.summonLimit))return false;
 const {parts,summonWaves}=data;
 if(!Array.isArray(parts)||parts.length!==source.parts.length||parts.some((part,i)=>
   part?.position!==source.parts[i][0]||part.id!==source.parts[i][1]||part.level!==40||
   !Number.isFinite(part.maximumHp)||part.maximumHp<=1||!between(part.hp,0,part.maximumHp)||
   (part.brokenAt!==null&&(!between(part.brokenAt,0,data.combatSeconds)||part.hp>1))))return false;
 if(!Array.isArray(summonWaves)||summonWaves.length>data.summonRequests||summonWaves.some((wave,i)=>
   !between(wave?.seconds,summonWaves[i-1]?.seconds??0,data.combatSeconds)||
   !Array.isArray(wave.units)||!wave.units.length||wave.units.length>5||wave.units.some((unit,j)=>
    !Object.hasOwn(source.spawns,unit?.id)||!Number.isSafeInteger(unit.position)||unit.level!==40||
    !between(unit.position,(wave.units[j-1]?.position??4)+1,9))))return false;
 const spawned=summonWaves.flatMap(wave=>wave.units);
 if(!Number.isSafeInteger(data.papersDefeated)||!between(data.papersDefeated,0,spawned.filter(unit=>unit.id===86).length)||
    !Number.isSafeInteger(data.goldDefeated)||!between(data.goldDefeated,0,spawned.filter(unit=>unit.id===87).length))return false;
 if(!report.completed)return data.reason==='incomplete'&&report.wavesCleared===0;
 if(report.outcome==='win')return data.reason==='boss-defeated'&&data.weakPartVerified&&
  parts.every(row=>row.brokenAt!==null)&&report.wavesCleared===1;
 return report.outcome==='loss'&&report.wavesCleared===0&&(data.reason==='team-defeated'||
  data.reason==='window-expired'&&data.combatSeconds>=settings.windowSeconds);
}

function validSpiderLive(report,settings,plan){
 const data=report.spiderLive,source=spiderLive;
 const between=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
 if(!data||report.sceneId!==source.sceneId||report.waveCount!==1||report.formationsVerified!==1||
    !sameTactics(data.settings,settings)||!validScoringTactics(data,plan,source.openingTarget)||
    !Number.isSafeInteger(data.damage)||data.damage<0||!between(data.combatSeconds,0,settings.windowSeconds+.1)||
    data.cocoonSeconds!==source.cocoonSeconds||!Number.isSafeInteger(data.papersDefeated)||data.papersDefeated<0||
    !Number.isSafeInteger(data.goldDefeated)||data.goldDefeated<0)return false;
 const {parts,traitRecipients,cocoons}=data;
 const roster=[Number(plan.onmyoji.heroId),...plan.members.map(({hero})=>Number(hero.heroId))].sort((a,b)=>a-b);
 const validUnits=(units,formation)=>Array.isArray(units)&&units.length===formation.length&&units.every((unit,i)=>
  unit?.position===formation[i][0]&&unit.id===formation[i][1]&&unit.level===40&&Number.isFinite(unit.maximumHp)&&
  unit.maximumHp>0&&between(unit.hp,0,unit.maximumHp));
 if(!validUnits(parts,source.parts)||!Array.isArray(traitRecipients)||
    !sameTactics(traitRecipients.slice().sort((a,b)=>a-b),roster))return false;
 if(cocoons!==null){
  if(!validUnits(cocoons?.opening,source.cocoons)||cocoons.opening.some(row=>row.hp!==row.maximumHp)||
     !between(cocoons.startedAt,0,data.combatSeconds)||!Number.isSafeInteger(cocoons.defeated)||!between(cocoons.defeated,0,3)||
     !Array.isArray(cocoons.recovery)||typeof cocoons.resolved!=='boolean'||
     ![null,'broken','expired'].includes(cocoons.announcedResult))return false;
  const max=cocoons.opening.reduce((sum,row)=>sum+row.maximumHp,0);
  if(cocoons.announcedResult===null?cocoons.remainingForRecovery!==null||cocoons.resolved:
     !between(cocoons.remainingForRecovery,0,max)||(cocoons.announcedResult==='broken'?
       cocoons.defeated!==3||cocoons.remainingForRecovery!==0:cocoons.defeated>=3))return false;
  if(cocoons.resolved?!between(cocoons.resolvedAt,cocoons.startedAt+
       (cocoons.announcedResult==='expired'?source.cocoonSeconds:0),data.combatSeconds):cocoons.resolvedAt!==null)return false;
  if(cocoons.recovery.length&&(!cocoons.resolved||cocoons.announcedResult!=='expired'||
     new Set(cocoons.recovery.map(row=>row.position)).size!==cocoons.recovery.length||
     cocoons.recovery.some(row=>!Number.isSafeInteger(row?.position)||!between(row.position,2,4)||
      !between(row.amount,0,parts[row.position-1].maximumHp))||
     cocoons.recovery.reduce((sum,row)=>sum+row.amount,0)>cocoons.remainingForRecovery+1e-6))return false;
 }
 if(!report.completed)return data.reason==='incomplete'&&report.wavesCleared===0;
 if(report.outcome==='win')return data.reason==='boss-defeated'&&parts.every(row=>row.hp<=1)&&report.wavesCleared===1;
 return report.outcome==='loss'&&report.wavesCleared===0&&(data.reason==='team-defeated'||
  data.reason==='window-expired'&&data.combatSeconds>=settings.windowSeconds);
}

function validLongche(report,settings,plan){
 const data=report.longche,source=longche;
 const between=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
 if(!data||report.sceneId!==source.sceneId||report.waveCount!==1||!sameTactics(data.settings,settings)||
    !validScoringTactics(data,plan,source.boss)||!Number.isSafeInteger(data.damage)||data.damage<0||
    !between(data.combatSeconds,0,settings.windowSeconds+.1)||!Number.isFinite(data.maximumHp)||data.maximumHp<1||
    !between(data.bossHp,0,data.maximumHp)||!Number.isInteger(data.papersDefeated)||
    !between(data.papersDefeated,0,8)||!Number.isInteger(data.groundPapersDefeated)||!between(data.groundPapersDefeated,0,2))return false;
 const {phases,clues,commanderKills,repairs,groundWaves}=data;
 const next={slime:['flee'],flee:['slime','repair'],repair:['slime','gift'],gift:['slime']};
 if(!Array.isArray(phases)||!phases.length||phases.length>17||report.formationsVerified!==phases.length||
    !Array.isArray(clues)||!Array.isArray(commanderKills)||!Array.isArray(repairs)||!Array.isArray(groundWaves))return false;
 for(const [index,phase] of phases.entries()){
  const previous=phases[index-1];
  if((index===0?phase?.phase!=='slime'||phase.seconds!==0:!next[previous.phase].includes(phase?.phase))||
     !between(phase.seconds,previous?.seconds??0,data.combatSeconds)||!Number.isSafeInteger(phase.damage)||
     !between(phase.damage,previous?.damage??0,data.damage)||!between(phase.bossHp,0,data.maximumHp)||
     !Array.isArray(phase.opening))return false;
  const expected=source.formations[phase.phase];
  if(phase.opening.length!==expected.length||phase.opening.some((row,i)=>
     row?.position!==expected[i][0]||row.id!==expected[i][1]||row.level!==40||
     phase.phase==='flee'&&row.commander!==(row.id===settings.commanderId)))return false;
 }
 const flights=phases.flatMap((row,index)=>row.phase==='flee'?[{start:row.seconds,end:phases[index+1]?.seconds}]:[]);
 const repairPhases=phases.filter(row=>row.phase==='repair');
 if(flights.length>4||commanderKills.length>flights.length||repairs.length>repairPhases.length||
    commanderKills.length<flights.filter(flight=>flight.end!==undefined).length||
    commanderKills.some((at,i)=>!between(at,flights[i].start,flights[i].end??data.combatSeconds))||
    clues.some((clue,i)=>clue?.commanderId!==settings.commanderId||clue.unitId!==source.clues[settings.commanderId]||
     !between(clue.seconds,clues[i-1]?.seconds??0,data.combatSeconds))||
    groundWaves.some((wave,i)=>!between(wave?.seconds,groundWaves[i-1]?.seconds??0,data.combatSeconds)||
     !Array.isArray(wave.units)||!wave.units.length||wave.units.length>5||wave.units.some((unit,j)=>
      !Number.isSafeInteger(unit?.id)||!between(unit.id,95,98)&&!between(unit.id,120,132)||
      !Number.isSafeInteger(unit.position)||!between(unit.position,(wave.units[j-1]?.position??1)+1,6))))return false;
 for(const [index,result] of repairs.entries()){
  const phase=repairPhases[index],after=phases[phases.indexOf(phase)+1];
  if(!between(result?.seconds,phase.seconds,after?.seconds??data.combatSeconds)||
     typeof result.interrupted!=='boolean'||typeof result.timeout!=='boolean'||!Array.isArray(result.remaining)||
     result.remaining.length!==2||result.remaining.some(rate=>!between(rate,0,1))||
     (result.timeout?Math.min(...result.remaining)<=0||result.seconds-phase.seconds+1e-7<settings.repairSeconds:
       Math.min(...result.remaining)!==0)||
     result.interrupted!==(!result.timeout&&Math.max(...result.remaining)<=.1)||
     !between(result.healed,0,data.maximumHp*.12+1e-6)||result.interrupted&&result.healed!==0||
     after&&after.phase!==(result.interrupted?'gift':'slime'))return false;
 }
 if(data.papersDefeated>2*phases.filter(row=>row.phase==='gift').length)return false;
 if(!report.completed)return data.reason==='incomplete'&&report.wavesCleared===0;
 if(report.outcome==='win')return data.reason==='boss-defeated'&&data.bossHp===0&&report.wavesCleared===1;
 return report.outcome==='loss'&&report.wavesCleared===0&&(data.reason==='team-defeated'||
  data.reason==='window-expired'&&data.combatSeconds>=settings.windowSeconds);
}

function validSkeleton(report,settings,plan){
 const data=report.skeleton,source=skeleton;
 const between=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
 if(!data||report.sceneId!==source.sceneId||report.waveCount!==1||!sameTactics(data.settings,settings)||
    !validScoringTactics(data,plan,source.boss)||!Number.isSafeInteger(data.damage)||data.damage<0||
    !between(data.combatSeconds,0,settings.windowSeconds+.1)||!Number.isFinite(data.maximumHp)||data.maximumHp<1||
    !between(data.bossHp,0,data.maximumHp)||!Number.isInteger(data.papersDefeated)||!between(data.papersDefeated,0,5))return false;
 const {phases,votes,punishments}=data,names=Object.keys(source.phases);
 if(!Array.isArray(phases)||!phases.length||phases.length>names.length||!Array.isArray(votes)||!Array.isArray(punishments)||
    report.formationsVerified!==phases.length)return false;
 for(const [index,phase] of phases.entries()){
  if(phase.phase!==names[index]||!between(phase.seconds,phases[index-1]?.seconds??0,data.combatSeconds)||
     index===0&&phase.seconds!==0||!Number.isSafeInteger(phase.damage)||!between(phase.damage,0,data.damage)||
     !between(phase.bossHp,0,data.maximumHp)||!Array.isArray(phase.opening))return false;
  const expected=source.formations[phase.phase];
  if(phase.opening.length!==expected.length)return false;
  for(const [slot,row] of phase.opening.entries()){
   const [position,id]=expected[slot];
   if(row.position!==position||row.id!==id||row.level!==40||phase.phase==='elite'&&
      (row.trueRetainer!==settings.truePositions.includes(position)||row.clue!==null&&
       (typeof row.clue!=='string'||!row.clue.trim())))return false;
  }
 }
 const elite=phases.find(phase=>phase.phase==='elite'),papers=phases.find(phase=>phase.phase==='papers');
 if(elite&&elite.opening.filter(row=>row.clue!==null).length!==1)return false;
 if(new Set(votes.map(vote=>vote.position)).size!==votes.length||votes.some((vote,i)=>
    !elite||!source.positions.includes(vote.position)||vote.wrong===settings.truePositions.includes(vote.position)||
    typeof vote.wrong!=='boolean'||!between(vote.seconds,votes[i-1]?.seconds??elite.seconds,papers?.seconds??data.combatSeconds)))return false;
 const wrong=votes.filter(vote=>vote.wrong);
 if(punishments.length>wrong.length||punishments.some((at,i)=>
    !between(at,wrong[i].seconds,papers?.seconds??data.combatSeconds)))return false;
 if(papers&&votes.filter(vote=>!vote.wrong).length!==2||data.papersDefeated&&!papers)return false;
 if(!report.completed)return data.reason==='incomplete';
 if(report.outcome==='win')return data.reason==='boss-defeated'&&data.bossHp===0;
 return report.outcome==='loss'&&(data.reason==='team-defeated'||
  data.reason==='window-expired'&&data.combatSeconds>=settings.windowSeconds);
}

function validCatfish(report,settings,plan){
 const data=report.catfish,source=catfish;
 if(!data||report.sceneId!==source.sceneId||report.waveCount!==1||!sameTactics(data.settings,settings)||
    !validScoringTactics(data,plan,source.boss)||!Number.isSafeInteger(data.damage)||data.damage<0||
    !Number.isFinite(data.combatSeconds)||data.combatSeconds<0||!Number.isFinite(data.maximumHp)||data.maximumHp<1||
    ![data.blessing,data.activeBlessing].every(value=>value===null||Object.hasOwn(source.blessings,value))||
    data.blessing!==null&&data.blessing!==data.activeBlessing||
    data.monkeyBonus!==null&&(!Number.isFinite(data.monkeyBonus)||data.monkeyBonus<0||data.monkeyBonus>1)||
    !Number.isSafeInteger(data.papersDefeated)||data.papersDefeated<0||data.papersDefeated>5)return false;
 const healthy=hp=>Number.isFinite(hp)&&hp>=0&&hp<=data.maximumHp;
 const time=value=>Number.isFinite(value)&&value>=0&&value<=data.combatSeconds;
 const {phases,gate}=data;
 if(!healthy(data.bossHp)||!Array.isArray(phases)||!phases.length||phases.length>7||phases.length!==report.formationsVerified||
    gate?.limitSeconds!==source.gateSeconds||
    (gate.startedAt===null?gate.brokenAt!==null||gate.breakRate!==null:!time(gate.startedAt))||
    (gate.brokenAt!==null&&(!time(gate.brokenAt)||gate.brokenAt<gate.startedAt)))return false;
 const localBreak=gate.brokenAt!==null&&gate.brokenAt-gate.startedAt<=source.gateSeconds;
 const rate=(settings.otherBreaks+Number(localBreak))/(settings.otherPlayers+1);
 const result=rate>=source.gateRate?'flip':'boom',skill=result==='flip'?507:506;
 if((gate.breakRate!==null&&gate.breakRate!==rate)||
    (gate.skill!==null&&(gate.breakRate===null||gate.skill!==skill))||
    (data.papersDefeated>0&&gate.brokenAt===null))return false;
 const next={opening:['normal'],normal:['elite','flee'],elite:['normal','flee'],flee:[result],flip:['peace'],boom:['peace'],peace:[]};
 const layouts={opening:[[1,source.boss],[101,source.assist]],normal:source.fish,elite:[[4,source.monkey]],flee:[[8,source.gate]]};
 let sawMonkey=false;
 for(const [index,phase] of phases.entries()){
  if(!phase||!Object.hasOwn(next,phase.phase)||!healthy(phase.bossHp)||phase.bossHp<data.bossHp||
     !time(phase.seconds)||!Number.isSafeInteger(phase.damage)||phase.damage>data.damage)return false;
  const expected=(layouts[phase.phase]??[]).map(([position,id])=>({position,id,level:40}));
  if(!sameTactics(phase.opening,expected)&&!(phase.phase==='normal'&&sawMonkey&&Array.isArray(phase.opening)&&!phase.opening.length))return false;
  if(index){
   const previous=phases[index-1];
   if(!next[previous.phase].includes(phase.phase)||phase.seconds<previous.seconds||phase.damage<previous.damage||
      phase.bossHp>previous.bossHp||
      (phase.phase==='elite'&&(sawMonkey||phase.bossHp>data.maximumHp*.5))||
      (phase.phase==='flee'&&(!sawMonkey||data.monkeyBonus===null||gate.startedAt===null||phase.seconds<gate.startedAt||phase.bossHp>data.maximumHp*.2))||
      (phase.phase===result&&gate.skill!==skill))return false;
  }else if(phase.phase!=='opening'||phase.seconds!==0||phase.damage!==0||phase.bossHp!==data.maximumHp)return false;
  if(phase.phase==='elite')sawMonkey=true;
 }
 if(!report.completed)return data.reason==='incomplete'&&report.wavesCleared===0;
 if(report.outcome==='win')return data.reason==='boss-defeated'&&data.bossHp===0&&report.wavesCleared===1;
 return report.outcome==='loss'&&report.wavesCleared===0&&(data.reason==='team-defeated'||
  data.reason==='window-expired'&&data.combatSeconds===settings.windowSeconds);
}

function validMirage(report,settings,plan){
 const data=report.mirage,source=mirage;
 if(!data||report.sceneId!==source.sceneId||report.waveCount!==1||!sameTactics(data.settings,settings)||
    !validScoringTactics(data,plan,source.boss)||data.burstSeconds!==source.burstSeconds||
    !Number.isSafeInteger(data.damage)||data.damage<0||!Number.isFinite(data.combatSeconds)||data.combatSeconds<0||
    !Number.isFinite(data.maximumHp)||data.maximumHp<1||!Array.isArray(data.mirrorRoster)||
    !sameTactics(data.mirrorRoster.slice().sort((a,b)=>a-b),plan.members.map(({hero})=>Number(hero.heroId)).sort((a,b)=>a-b)))return false;
 const healthy=hp=>Number.isFinite(hp)&&hp>=0&&hp<=data.maximumHp;
 const {phases}=data;
 if(!healthy(data.bossHp)||!Array.isArray(phases)||!phases.length||phases.length!==report.formationsVerified)return false;
 const order=['normal','elite','house','mirror','burst','crab'];
 for(const [index,phase] of phases.entries()){
  const state=order[index%order.length];
  const unitId=state==='elite'?source.general:state==='house'?source.paper:null;
  const expectedCount=unitId||state==='mirror'?source.positions.length:0;
  if(phase?.phase!==state||!healthy(phase.bossHp)||phase.bossHp<data.bossHp||
     !Number.isFinite(phase.seconds)||phase.seconds>data.combatSeconds||
     !Number.isSafeInteger(phase.damage)||phase.damage>data.damage||
     !Array.isArray(phase.opening)||phase.opening.length!==expectedCount)return false;
  if(phase.opening.some((unit,i)=>unit?.position!==source.positions[i]||unit.level!==40||
    (state==='mirror'?[data.mirrorRoster[i],source.general].includes(unit.id)===false||
      unit.trueMirror!==settings.truePositions.includes(unit.position):unit.id!==unitId)))return false;
  if(index){
   const prior=phases[index-1],duration=phase.seconds-prior.seconds;
   if(duration<0||phase.damage<prior.damage||phase.bossHp>prior.bossHp||
      (state==='elite'&&duration+1e-6<settings.generalSeconds)||(state==='crab'&&duration+1e-6<source.burstSeconds))return false;
  }else if(phase.seconds!==0||phase.damage!==0||phase.bossHp!==data.maximumHp)return false;
 }
 if(!report.completed)return data.reason==='incomplete'&&report.wavesCleared===0;
 if(report.outcome==='win')return data.reason==='boss-defeated'&&data.bossHp===0&&report.wavesCleared===1;
 return report.outcome==='loss'&&report.wavesCleared===0&&(data.reason==='team-defeated'||
  data.reason==='window-expired'&&data.combatSeconds===settings.windowSeconds);
}

function validSongstress(report,window,plan){
 const data=report.songstress,source=songstress;
 if(!data||data.windowSeconds!==window||report.sceneId!==source.sceneId||report.waveCount!==1||
    !validScoringTactics(data,plan,source.singer)||
    !Number.isSafeInteger(data.damage)||data.damage<0||!Number.isFinite(data.combatSeconds)||data.combatSeconds<0||
    !Number.isSafeInteger(data.punishments)||data.punishments<0||
    !Number.isSafeInteger(data.whiteMaidsDefeated)||data.whiteMaidsDefeated<0)return false;
 const validHealth=(hp,max)=>Number.isFinite(hp)&&hp>=0&&Number.isFinite(max)&&max>=1&&hp<=max;
 const {phases,remainingMaidsAtRescue:maids}=data;
 if(!validHealth(data.singerHp,data.singerMaximum)||!validHealth(data.umbrellaHp,data.umbrellaMaximum)||
    !Array.isArray(phases)||!phases.length||phases.length>3||phases.length!==report.formationsVerified||
    (phases.length===3?![0,1,2,3].includes(maids):maids!==null)||phases.length===1&&data.punishments!==0)return false;
 const maidsByPhase=[source.whiteMaids,source.blackMaids,[]];
 for(const [index,phase] of phases.entries()){
  const units=[source.singer,source.umbrella,...maidsByPhase[index]].map((id,i)=>({id,position:i+1,level:40}));
  if(index===2)for(let position=6;position<=11;position++)units.push({id:source.paper,position,level:40});
  if(phase?.phase!==index+1||!sameTactics(phase.opening,units)||!validHealth(phase.singerHp,data.singerMaximum)||
     !Number.isFinite(phase.seconds)||phase.seconds>data.combatSeconds||
     !Number.isSafeInteger(phase.damage)||phase.damage>data.damage)return false;
  if(index){
   const previous=phases[index-1];
   if(phase.seconds<previous.seconds||phase.damage<previous.damage||
      index===1&&phase.singerHp>data.singerMaximum*.7||index===2&&maids>0&&phase.singerHp!==0)return false;
  }else if(phase.seconds!==0||phase.damage!==0||phase.singerHp!==data.singerMaximum)return false;
 }
 if(!report.completed)return data.reason==='incomplete'&&report.wavesCleared===0;
 if(report.outcome==='win')return data.reason==='singer-rescued'&&phases.length===3&&data.singerHp>0&&
  data.umbrellaHp===0&&report.wavesCleared===1;
 return report.outcome==='loss'&&report.wavesCleared===0&&(data.reason==='team-defeated'||
  data.reason==='singer-defeated'&&phases.length===3&&data.singerHp===0||
  data.reason==='window-expired'&&data.combatSeconds===window);
}

function validDuskWraith(report,settings,plan){
 const data=report.duskWraith,source=duskWraith;
 if(!data||report.sceneId!==source.sceneId||report.waveCount!==1||!sameTactics(data.settings,settings)||
    !validScoringTactics(data,plan,source.bossId)||
    !Number.isSafeInteger(data.damage)||data.damage<0||!Number.isFinite(data.combatSeconds)||data.combatSeconds<0||
    !Number.isFinite(data.maximumHp)||data.maximumHp<1)return false;
 const health=hp=>Number.isFinite(hp)&&hp>=0&&hp<=data.maximumHp;
 const {phases,eliteDefeatOrder:order}=data;
 if(!health(data.bossHp)||!Array.isArray(phases)||!phases.length||phases.length>4||
    phases.length!==report.formationsVerified||!Array.isArray(order)||new Set(order).size!==order.length||
    !order.every(pos=>source.elitePositions.includes(pos))||phases.length===1&&order.length||
    phases.length>=3&&order.length!==source.elitePositions.length)return false;
 const boss=[{id:source.bossId,position:1,level:40}];
 const elites=source.elitePositions.map((position,i)=>({id:source.eliteIds[i],position,level:40}));
 const gifts=source.elitePositions.map(position=>({id:source.giftId,position,level:40}));
 const openings=[boss,elites,boss,[...boss,...gifts]];
 for(const [index,phase] of phases.entries()){
  const previous=phases[index-1];
  if(phase?.phase!==index+1||phase.sceneId!==(index===1?source.eliteSceneId:source.sceneId)||
     !sameTactics(phase.opening,openings[index])||!health(phase.bossHp)||phase.bossHp<data.bossHp||
     !Number.isFinite(phase.seconds)||phase.seconds>data.combatSeconds||
     !Number.isSafeInteger(phase.damage)||phase.damage>data.damage)return false;
  if(previous){
   if(phase.seconds<previous.seconds||phase.damage<previous.damage||phase.bossHp>previous.bossHp||
      index===1&&phase.bossHp>data.maximumHp*.9||index===3&&phase.bossHp>data.maximumHp*.35)return false;
  }else if(phase.seconds!==0||phase.damage!==0||phase.bossHp!==data.maximumHp)return false;
 }
 if(!report.completed)return data.reason==='incomplete'&&report.wavesCleared===0;
 if(report.outcome==='win')return data.reason==='boss-defeated'&&phases.length===4&&data.bossHp===0&&report.wavesCleared===1;
 return report.outcome==='loss'&&report.wavesCleared===0&&(data.reason==='team-defeated'||
  data.reason==='window-expired'&&data.combatSeconds===settings.windowSeconds);
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

function validMapBossReport(report,route,players,qinfeiFoodPiles){
 const data=report.mapBoss,rewards=data?.rewardInputs;
 if(report.sceneId!==route.sceneId||data?.kind!==route.kind||
    data.level!==route.level||data.players!==players||!sameTactics(data.positions,mapBoss.partyPositions(route.battleMode,players)))return false;
 if(route.kind==='qinfeiFood'){
  const stages=[report.stageId,...(qinfeiFoodPiles??[])],observed=data.waves?.length,cleared=data.clearedPiles;
  return report.waveCount===stages.length&&data.totalPiles===stages.length&&sameTactics(data.stages,stages)&&
   Array.isArray(data.waves)&&observed>=1&&observed<=stages.length&&report.formationsVerified===observed&&
   Number.isSafeInteger(cleared)&&cleared>=0&&cleared<=observed&&observed<=cleared+1&&report.wavesCleared===cleared&&
   (report.outcome!=='win'||cleared===stages.length)&&(report.outcome!=='loss'||observed===cleared+1)&&
   data.archived===route.archived&&data.blessingId===0&&data.foodId===route.foodId&&
   data.waves.every((wave,i)=>sameTactics(wave,mapBoss.stages[stages[i]].waves[0]));
 }
 if(report.waveCount!==route.waves.length)return false;
 if(route.kind==='meituan'){
  return report.formationsVerified===1&&data.bossId===route.waves[0][0][1]&&sameTactics(data.opening,route.waves[0])&&
   sameTactics(data.lineupSlots,route.lineupSlots)&&sameTactics(data.skills,route.skills)&&data.openingHp===1&&
   Number.isFinite(data.targetHp)&&data.targetHp>1&&Number.isFinite(data.completionHp)&&data.completionHp>=1&&
   data.completionHp<=data.targetHp&&Number.isSafeInteger(data.personalSatisfaction)&&data.personalSatisfaction>=0&&
   Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&(report.outcome!=='win'||data.completionHp===data.targetHp);
 }
 if(route.lineupSlots){
  const phases=data.phases,expectedPhases=['step_1','step_2','step_3'];
  return report.formationsVerified===1&&data.bossId===route.waves[0][0][1]&&sameTactics(data.opening,route.waves[0])&&
   sameTactics(data.lineupSlots,route.lineupSlots)&&data.passiveSkill===route.passiveSkill&&
   Array.isArray(phases)&&phases[0]===expectedPhases[0]&&sameTactics(phases,expectedPhases.filter(phase=>phases.includes(phase)))&&
   Number.isFinite(data.openingHp)&&data.openingHp>0&&Number.isFinite(data.remainingHp)&&data.remainingHp>=0&&
   data.remainingHp<=data.openingHp&&Number.isSafeInteger(data.personalDamage)&&data.personalDamage>=0&&
   typeof data.timedOut==='boolean'&&Number.isFinite(data.roomElapsedSeconds)&&data.roomElapsedSeconds>=0&&
   data.raidWindowSeconds===(route.raidWindowSeconds??null)&&
   (!data.timedOut||report.outcome==='loss'&&data.raidWindowSeconds>0&&data.roomElapsedSeconds>=data.raidWindowSeconds)&&
   (report.outcome!=='win'||!data.timedOut&&data.remainingHp===0);
 }
 if(route.deadlineSeconds&&(data.deadlineSeconds!==route.deadlineSeconds||data.passiveSkill!==route.passiveSkill||
    !Number.isFinite(data.combatSeconds)||data.combatSeconds<0||typeof data.timedOut!=='boolean'||
    (data.timedOut&&(report.outcome!=='loss'||data.combatSeconds<route.deadlineSeconds))))return false;
 if(route.waves.length>1||route.deadlineSeconds||route.kind==='lbsHistory'){
  const count=data.waves?.length;
  return Array.isArray(data.waves)&&count>=1&&count<=route.waves.length&&report.formationsVerified===count&&
   report.wavesCleared<=count&&(report.outcome!=='win'||report.wavesCleared===route.waves.length)&&
   sameTactics(data.waves,route.waves.slice(0,count));
 }
 return report.formationsVerified===1&&data.bossId===route.waves[0][0][1]&&sameTactics(data.opening,route.waves[0])&&
  (report.outcome==='win'?report.wavesCleared===1&&Number.isFinite(rewards?.phaseDamageRatio)&&rewards.phaseDamageRatio>=0&&
   Number.isSafeInteger(rewards.paperManCount)&&rewards.paperManCount>=0&&
   rewards.paperManCount<=({stone:0,angryStone:4,yearBeast:5}[route.kind]):rewards===null);
}

function validPveClock(report,data,deadlineSeconds){
 return data?.deadlineSeconds===deadlineSeconds&&typeof data.timedOut==='boolean'&&
  Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds+0.000001&&
  (!data.timedOut||deadlineSeconds!==null&&report.outcome!=='win'&&data.combatSeconds>=deadlineSeconds);
}

function validQinfeiSide(report,route){
 const data=report.qinfeiSide,count=data?.waves?.length;
 return report.sceneId===route.sceneId&&report.waveCount===route.waves.length&&
  Number.isSafeInteger(count)&&count>=1&&count<=report.waveCount&&report.formationsVerified===count&&
  report.wavesCleared<=count&&(report.outcome!=='win'||report.wavesCleared===report.waveCount)&&
  validPveClock(report,data,route.deadlineSeconds)&&
  Array.isArray(data.waves)&&data.waves.every((wave,i)=>sameTactics(wave,
   route.waves[i].map((id,index)=>[index+1,id,40])));
}

function validDojoAreaReport(report,request){
 const data=report.dojoArea,limit=dojoAreaRules.deadlineSeconds[request.blockType];
 if(report.waveCount!==1||report.formationsVerified!==1||data?.year!==request.year||data.playId!==request.playId||
    data.blockType!==request.blockType||data.regionState!==request.regionState||data.areaType!==(request.blockType>4?1:request.blockType)||
    data.deadlineSeconds!==limit||!Number.isFinite(data.combatSeconds)||data.combatSeconds<0||
    typeof data.timedOut!=='boolean'||data.timedOut&&data.combatSeconds<limit-1||!Number.isSafeInteger(data.damage)||data.damage<0||
    !Array.isArray(data.opening)||data.opening.length!==(request.blockType===4?1:6)||
    !data.damageByEnemy||typeof data.damageByEnemy!=='object'||Array.isArray(data.damageByEnemy))return false;
 const positions=new Set(data.opening.map(unit=>String(unit?.position)));
 return positions.size===data.opening.length&&
  data.opening.every(unit=>positive(unit?.id)&&positive(unit.level)&&positive(unit.position)&&Number.isFinite(unit.hp)&&unit.hp>0)&&
  Object.entries(data.damageByEnemy).every(([position,damage])=>positions.has(position)&&Number.isSafeInteger(damage)&&damage>=0);
}

function validForestReport(report,request,plan){
 const data=report.guildForest;
 if(report.waveCount!==1||report.formationsVerified!==1||report.sceneId!==request.sceneId||
    data?.eventId!==request.eventId||data.encounterType!==request.encounterType||
    data.terrainSkill!==request.terrainSkill||data.terrainLevel!==request.terrainLevel||
    data.deadlineSeconds!==forestRules.deadlineSeconds||!Number.isFinite(data.combatSeconds)||data.combatSeconds<0||
    typeof data.timedOut!=='boolean'||data.timedOut&&data.combatSeconds<data.deadlineSeconds-1||
    !Number.isSafeInteger(data.damage)||data.damage<0||!Number.isFinite(data.rawDamage)||data.rawDamage<0||
    !Array.isArray(data.opening)||!data.opening.length||
    !data.damageByEnemy||typeof data.damageByEnemy!=='object'||Array.isArray(data.damageByEnemy)||
    !Number.isSafeInteger(data.damageUpdates)||data.damageUpdates<0)return false;
 const positions=new Set(data.opening.map(unit=>String(unit?.position))),damage=Object.entries(data.damageByEnemy);
 const ids=plan.members.map(unit=>Number(unit.hero.heroId)).sort((a,b)=>a-b);
 return Array.isArray(data.affected)&&JSON.stringify(data.affected.slice().sort((a,b)=>a-b))===JSON.stringify(ids)&&
  positions.size===data.opening.length&&data.opening.every(unit=>
   positive(unit?.id)&&positive(unit.position)&&positive(unit.level)&&Number.isFinite(unit.hp)&&unit.hp===unit.maxHp&&unit.hp>0)&&
  damage.every(([position,amount])=>positions.has(position)&&Number.isSafeInteger(amount)&&amount>=0)&&
  damage.reduce((sum,[,amount])=>sum+amount,0)===data.damage&&
  (!report.completed||Math.abs(data.rawDamage-data.damage)<=damage.length);
}

function validTenAnniversary(report,stageId,bonuses){
 const data=report.tenAnniversary,limit=ten.deadlineFor(stageId);
 return report.waveCount===1&&report.formationsVerified===1&&data?.actId===12130&&data.hard===ten.hard(stageId)&&
  data.deadlineSeconds===limit&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
  typeof data.timedOut==='boolean'&&(!data.timedOut||data.combatSeconds>=limit-1)&&
  JSON.stringify(data.bonuses)===JSON.stringify([ten.defaultBonus,...bonuses])&&
  Array.isArray(data.opening)&&data.opening.length>0&&data.opening.every(unit=>
   positive(unit.id)&&positive(unit.position)&&positive(unit.level)&&Number.isFinite(unit.hp)&&unit.hp>0)&&
  data.assists?.length===1&&data.assists[0].configId===105&&data.assists[0].heroId===10608&&data.assists[0].position===101;
}

function validTenBoss(report){
 const data=report.tenAnniversaryBoss,limit=tenBoss.deadlineSeconds;
 if(report.sceneId!==tenBoss.firstSceneId||report.waveCount!==tenBoss.formationSizes.length||
    data?.actId!==tenBoss.activityId||data.deadlineSeconds!==limit||
    !Number.isFinite(data.combatSeconds)||data.combatSeconds<0||
    typeof data.timedOut!=='boolean'||data.timedOut&&data.combatSeconds<limit-1||
    !Number.isSafeInteger(data.damage)||data.damage<0||
    !Object.entries(tenBoss.actor).every(([key,value])=>key==='name'||data.actor?.[key]===value)||
    !Array.isArray(data.actor.skills)||!data.actor.skills.length||
    !Array.isArray(data.phases)||data.phases.length<1||data.phases.length>report.waveCount||
    report.formationsVerified!==data.phases.length||report.wavesCleared!==data.phases.length-1||
    !Number.isSafeInteger(data.minionRespawns)||data.minionRespawns<0||
    data.minionRespawns>0&&data.phases.length!==report.waveCount||
    !Array.isArray(data.assists))return false;
 return data.phases.every((phase,i)=>phase.phase===i+1&&phase.sceneId===tenBoss.firstSceneId+i&&
  phase.stageId===tenBoss.stageId+i&&Number.isFinite(phase.seconds)&&phase.seconds>=0&&phase.seconds<=data.combatSeconds&&
  Array.isArray(phase.enemies)&&phase.enemies.length===tenBoss.formationSizes[i]&&
  new Set(phase.enemies.map(unit=>unit.position)).size===phase.enemies.length&&
  phase.enemies.every(unit=>positive(unit.id)&&positive(unit.position)&&unit.level===40&&
   unit.protectedBoss===(phase.phase===report.waveCount&&unit.position===1)))&&
  data.assists.every(assist=>positive(assist.phase)&&assist.phase<=data.phases.length&&
   Number.isSafeInteger(assist.configId)&&assist.configId>=106&&assist.configId<=113&&
   positive(assist.heroId)&&[101,102,103].includes(assist.position));
}

function validTenExplore(report,plan){
 const data=report.tenAnniversaryExplore,limit=tenExplore.deadlineSeconds;
 const expected=[[tenExplore.actorId,plan.actorLevel===1?10:plan.actorLevel],...plan.members];
 return report.waveCount===1&&report.formationsVerified===1&&data?.actId===12130&&
  data.actorLevel===plan.actorLevel&&data.deadlineSeconds===limit&&
  Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
  typeof data.timedOut==='boolean'&&(!data.timedOut||data.combatSeconds>=limit-1)&&
  Array.isArray(data.party)&&data.party.length===expected.length&&data.party.every((unit,index)=>
   unit.id===expected[index][0]&&unit.level===expected[index][1]&&unit.position===index+1&&
   positive(unit.suitId)&&Array.isArray(unit.suitSkills)&&unit.suitSkills.every(positive)&&
   Array.isArray(unit.skills)&&unit.suitSkills.every(id=>unit.skills.some(([skill,level])=>skill===id&&level===1))&&
   [unit.hp,unit.speed,unit.attack,unit.defense,unit.critRate].every(Number.isFinite))&&Array.isArray(data.opening)&&data.opening.length>0;
}

function readReport(report,{battleMode,stageId,groupId,seed,input,suitInput,damageFloor,rounds,retreat,region,resource,hunlingRoute,capture,qilingEntry,qilingWindow,sixRealmsRoute,sixRealmsEvent,trialSlot,sixRealmsState,journeyRoute,journeySettings,creviceRoute,creviceWindow,ghostRoute,ghostSettings,historicalGhostRoute,historicalGhostWindow,mapBossRoute,mapBossPlayers,tianfaTeam,qinfeiBoss,qinfeiFoodPiles,pveDeadlineSeconds,dojoArea,forest,tenBonuses,devilFeastHp,yinyangBoss,towerSettings,laolaoSettings,fusionSettings,duskSettings,songWindowSeconds,mirageSettings,catfishSettings,skeletonSettings,longcheSettings,spiderLiveSettings,spiderNormalSettings}){
 const secret=battleMode===266?secretOpenings.floors[stageId]:null;
 const qinfeiSide=battleMode===3?mapBoss.qinfeiSideBattles[stageId]:null;
 const pveDeadline=report?.pveDeadline;
 const expectedPveDeadline=pveDeadlineSeconds??pveDeadline?.deadlineSeconds;
 const engine=sixRealmsRoute?{name:sixRealmsRoute.engine,sha256:sixRealmsRoute.sha256,
  route:`six-realms-${sixRealmsState?'configured':'full-health'}-${sixRealmsEvent?'encounter':'trial'}`}:
  resource?{name:resource.engine,route:resource.route,sha256:resource.engineSHA256??resourceEncounters.engineSHA256}:
  secret?.entrance==='race'?{...engines[battleMode],route:'secret-race-solo'}:
  secret?.entrance==='team'?{...engines[battleMode],route:'secret-team-solo'}:
  tianfaTeam?{...engines[battleMode],route:'tianfa-team'}:
  qinfeiSide?{...engines[battleMode],route:'qinfei-side-static-formation'}:engines[battleMode];
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
    (qinfeiBoss&&!validQinfeiBoss(report,qinfeiBoss,rounds[0]))||
    (qinfeiSide&&!validQinfeiSide(report,qinfeiSide))||
    (dojoArea&&!validDojoAreaReport(report,dojoArea))||
    (forest&&!validForestReport(report,forest,rounds[0]))||
    (ten.modes[battleMode]&&!validTenAnniversary(report,stageId,tenBonuses??[]))||
    (battleMode===tenBoss.battleMode&&!validTenBoss(report))||
    (battleMode===tenExplore.battleMode&&!validTenExplore(report,rounds[0]))||
    (!qinfeiSide&&(pveDeadlineSeconds!==undefined||pveDeadline!==undefined)&&
     (battleMode!==3||!positive(expectedPveDeadline)||!validPveClock(report,pveDeadline,expectedPveDeadline)))||
    (yanwu&&!validFengmoYanwu(report,yanwu,rounds[0]))||
    (battleMode===fengmoBand.battleMode&&!validFengmoBand(report,stageId))||
    (battleMode===devilFeast.battleMode&&!validDevilFeast(report,devilFeast.stage(stageId),devilFeastHp))||
    (battleMode===ghostKingTower.battleMode&&!validGhostKingTower(report,ghostKingTower.stage(stageId),towerSettings))||
    (battleMode===laolao.battleMode&&!validLaolaoChallenge(report,laolao.stage(stageId),laolaoSettings))||
    (battleMode===fusion.battleMode&&!validLaolaoFusion(report,fusionSettings))||
    (battleMode===duskWraith.battleMode&&!validDuskWraith(report,duskSettings,rounds[0]))||
    (battleMode===songstress.battleMode&&!validSongstress(report,songWindowSeconds,rounds[0]))||
    (battleMode===mirage.battleMode&&!validMirage(report,mirageSettings,rounds[0]))||
    (battleMode===catfish.battleMode&&!validCatfish(report,catfishSettings,rounds[0]))||
    (battleMode===skeleton.battleMode&&!validSkeleton(report,skeletonSettings,rounds[0]))||
    (battleMode===longche.battleMode&&!validLongche(report,longcheSettings,rounds[0]))||
    (battleMode===spiderLive.battleMode&&!validSpiderLive(report,spiderLiveSettings,rounds[0]))||
    (battleMode===spiderNormal.battleMode&&!validSpiderNormal(report,spiderNormalSettings,rounds[0]))||
    (activityScore.modes[battleMode]&&!validActivityScore(report,rounds[0],activityScore.modes[battleMode]))||
    (battleMode===tianfa.battleMode&&!validTianfaReport(report,tianfa.stages[stageId],tianfaTeam))||
    (journeyRoute&&!validJourneyReport(report,journeyRoute,journeySettings))||
    (battleMode===yinYang.battleMode&&!validYinYangBoss(report,yinyangBoss))||
    (mapBossRoute&&!validMapBossReport(report,mapBossRoute,mapBossPlayers,qinfeiFoodPiles))||
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
    const [awake,secret,yuling,resource,hunt,underworld,retreat,regional,yanwu,band,bandPractice,feast,fusionAvailable,duskAvailable,songAvailable,mirageAvailable,catfishAvailable,skeletonAvailable,longcheAvailable,spiderLiveAvailable,spiderNormalAvailable,spider,trueOrochi,spirit,qiling,shilian,generalSoul,journey,tianfaAvailable,crevice,ghost,mapBossAvailable,qinfeiAvailable,dojoAreaAvailable,forestAvailable,tenAvailable,tenBossAvailable,tenExploreAvailable]=await Promise.all([has('awake_stage.py'),has('secret_stage.py'),has('yuling_stage.py'),
     has('resource_stage.py'),has('guild_hunt_stage.py'),has('underworld_stage.py'),has('guild_retreat_stage.py'),has('regional_boss_stage.py'),
     has('fengmo_yanwu_stage.py'),has('fengmo_band_stage.py'),has('fengmo_band_together.py'),has('devil_feast_stage.py'),has('laolao_fusion_stage.py'),has('fengmo_dusk_stage.py'),has('fengmo_songstress_stage.py'),has('fengmo_mirage_stage.py'),has('fengmo_catfish_stage.py'),has('fengmo_skeleton_stage.py'),has('fengmo_longche_stage.py'),has('fengmo_spider_stage.py'),has('fengmo_spider_normal_stage.py'),has('tuzhizhu_practice.py'),has('true_orochi_stage.py'),has('hunling_stage.py'),has('qiling_group_stage.py'),
     Promise.all([has('shilian_stage.py'),has('shilian_routes.py')]).then(files=>files.every(Boolean)),has('general_soul_stage.py'),has('journey_hard_stage.py'),has('tianfa_stage.py'),has('guild_crevice_stage.py'),has('superghost_stage.py'),has('map_boss_stage.py'),has('qinfei_boss_stage.py'),has('dojo_area_stage.py'),has('guild_forest_stage.py'),has('ten_anniversary_stage.py'),has('ten_anniversary_boss.py'),has('ten_anniversary_explore.py')]);
    return {available:true,resourceVersion,battleModes:[3,...(awake?[29]:[]),...(secret?[266]:[]),...(yuling?[267]:[]),
     ...(resource?[firstExperience.battleMode]:[]),...(hunt?[2000]:[]),...(underworld?[2001]:[]),...(retreat?[306]:[]),...(regional?regionModes:[]),
     ...(yanwu?[fengmoYanwu.battleMode]:[]),...(band?[fengmoBand.battleMode]:[]),...(bandPractice?[bandTogether.battleMode]:[]),
     ...(feast?[devilFeast.battleMode,laolao.battleMode]:[]),...(feast&&resource?[ghostKingTower.battleMode]:[]),
     ...(feast&&fusionAvailable?[fusion.battleMode]:[]),...(duskAvailable?[duskWraith.battleMode]:[]),...(songAvailable?[songstress.battleMode]:[]),...(mirageAvailable?[mirage.battleMode]:[]),...(catfishAvailable?[catfish.battleMode]:[]),...(skeletonAvailable?[skeleton.battleMode]:[]),...(longcheAvailable?[longche.battleMode]:[]),...(spiderLiveAvailable?[spiderLive.battleMode]:[]),
     ...(spiderNormalAvailable&&spiderLiveAvailable?[spiderNormal.battleMode]:[]),
     ...(spider?Object.keys(tuzhizhuPractice.modes).map(Number):[]),...(trueOrochi?[orochi.battleMode]:[]),
     ...(spirit?hunling.battleModes:[]),...(qiling?[qilingGroups.battleMode]:[]),...(shilian?sixRealmsModes:[]),
     ...(generalSoul?Object.keys(activityScore.modes).map(Number):[]),...(journey?[journeyHard.battleMode,yinYang.battleMode]:[]),...(tianfaAvailable?[tianfa.battleMode]:[]),
     ...(crevice?[guildCrevice.battleMode]:[]),...(ghost?[superGhost.battleMode,superGhost.historicalBattleMode]:[]),
     ...(mapBossAvailable?mapBoss.battleModes:[]),...(qinfeiAvailable&&retreat?[qinfei.battleMode]:[]),
     ...(dojoAreaAvailable&&yanwu?[dojoAreaRules.battleMode]:[]),...(forestAvailable?[forestRules.battleMode]:[]),
     ...(tenAvailable&&yanwu?Object.keys(ten.modes).map(Number):[]),...(tenAvailable&&tenBossAvailable?[tenBoss.battleMode]:[]),
     ...(tenAvailable&&yanwu&&tenExploreAvailable?[tenExplore.battleMode]:[])]};
   }catch(error){
    return {available:false,reason:error.code==='ENOENT'?'缺少本机 PvE 复跑资料':'本机 PvE 复跑配置无效'};
   }
  },
  async run(plan,{battleMode=3,stageId,groupId,seed,damageFloor=false,retreat,region,capture,qilingWindow,sixRealmsEvent,trialSlot,sixRealmsState,journeyHard:journeySettings,creviceWindow,ghostSettings,historicalGhostWindow,mapBossPlayers,tianfaTeam=false,qinfeiBoss,qinfeiFoodPiles,pveDeadlineSeconds,dojoArea,forest,tenBonuses,bandScores,devilFeastHp,yinyangBoss,towerSettings,laolaoSettings,fusionSettings,duskSettings,songWindowSeconds,mirageSettings,catfishSettings,skeletonSettings,longcheSettings,spiderLiveSettings,spiderNormalSettings}={}){
   if(current)throw Error('已有库存复跑正在运行');
   const rounds=battleMode===2001&&Object.hasOwn(plan??{},'rounds')?plan.rounds:[plan];
   const minMembers=battleMode===2001?5:1;
   const maxMembers=[fengmoYanwu.battleMode,songstress.battleMode,orochi.battleMode,tianfa.battleMode,...sixRealmsModes].includes(battleMode)?6:5;
   const stageActor=battleMode===tenBoss.battleMode||battleMode===266&&secretOpenings.floors[stageId]?.replacement;
   const explore=battleMode===tenExplore.battleMode;
   const validPlan=explore?tenExplore.validPlan(plan):Array.isArray(rounds)&&rounds.length>=1&&rounds.length<=4&&
    rounds.every(row=>row&&(stageActor||row.onmyoji)&&Array.isArray(row.members)&&
     row.members.length>=minMembers&&row.members.length<=maxMembers&&validTactics(row,battleMode));
   if(!Number.isInteger(battleMode)||!Object.hasOwn(engines,battleMode)||!positive(stageId)||!positive(groupId)||!Number.isSafeInteger(seed)||seed<0||seed>=10000||
      typeof damageFloor!=='boolean'||!validPlan||!validTactics(plan,battleMode))
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
   if(battleMode===3&&dojoAreaRules.isStage(stageId))throw Error('八百八狸需要专用计分战斗入口');
   if(battleMode===dojoAreaRules.battleMode){
    const {year,playId,blockType,regionState}=dojoArea??{};
    if(dojoAreaRules.resourceVersion!==resourceVersion||![2025,2026].includes(year)||!positive(playId)||
       !positive(blockType)||Math.floor(playId/10000)!==blockType||!dojoAreaRules.stageMatches(stageId,year,blockType)||
       !(year===2026?[0,3]:[0]).includes(regionState)||plan.members.length!==5)
     throw Error('八百八狸需要正确的场次版本、地格配置和五位自有式神');
   }else if(dojoArea!==undefined)throw Error('八百八狸地格配置仅适用于其专用战斗入口');
   if(battleMode===3&&forestRules.isStage(stageId))throw Error('青森之秘需要原版活动战斗入口');
   if(battleMode===forestRules.battleMode){
    const {eventId,encounterType,terrainSkill,terrainLevel,sceneId}=forest??{};
    if(forestRules.resourceVersion!==resourceVersion||!forestRules.isStage(stageId)||groupId!==stageId||
       !positive(eventId)||!Object.hasOwn(forestRules.types,encounterType)||!positive(terrainLevel)||terrainLevel>5||
       !Object.values(forestRules.terrainSkills).includes(terrainSkill)||![42135,42136,42137].includes(sceneId)||
       plan.members.length!==5)throw Error('青森之秘需要原版事件、地形和五位自有式神');
   }else if(forest!==undefined)throw Error('青森之秘事件配置仅适用于其活动入口');
   if(battleMode===3&&ten.isStage(stageId))throw Error('拾光永恒需要原版活动战斗入口');
   if(battleMode===3&&(fengmoBand.isStage(stageId)||bandTogether.stages.includes(stageId)||bandTogether.onlineStages.includes(stageId)))
    throw Error('逢魔乐队需要原版战斗入口');
   if(battleMode===fengmoBand.battleMode&&(!fengmoBand.isStage(stageId)||groupId!==stageId||plan.members.length!==5))
    throw Error('逢魔乐队单人首领需要对应编组和五位自有式神');
   const bandPractice=battleMode===bandTogether.battleMode;
   if(bandPractice?(stageId!==bandTogether.stages[0]||groupId!==stageId||plan.members.length!==5||!bandTogether.validScores(bandScores)):
      bandScores!==undefined)throw Error('逢魔乐队共斗练习需要从第一段开始，并提供两段音游分数和五位自有式神');
   if(battleMode===3&&devilFeast.stage(stageId))throw Error('鬼王之宴需要原版活动入口');
   const towerRoute=ghostKingTower.stage(stageId),towerMode=battleMode===ghostKingTower.battleMode;
   if(towerMode&&(ghostKingTower.resourceVersion!==resourceVersion||!towerRoute||groupId!==stageId||
      plan.members.length!==5||!ghostKingTower.validSettings(towerSettings,towerRoute.kind))||towerSettings!==undefined&&!towerMode)
    throw Error('百妖退治需要历史关卡、五位自有式神和有效的挑战条件');
   if(battleMode===3&&towerRoute)throw Error('百妖退治需要使用历史活动入口');
   const laolaoRoute=laolao.stage(stageId),laolaoMode=battleMode===laolao.battleMode;
   if(laolaoMode&&(laolao.resourceVersion!==resourceVersion||!laolaoRoute||groupId!==stageId||
      plan.members.length!==laolao.memberCount||!laolao.validSettings(laolaoSettings))||laolaoSettings!==undefined&&!laolaoMode)
    throw Error('姥姥火来袭需要历史难度、五位自有式神和有效的信仰之佑');
   if(battleMode===3&&(laolaoRoute||stageId===laolao.fusionStageId))throw Error('姥姥火需要使用历史活动入口');
   const spiderNormalMode=battleMode===spiderNormal.battleMode;
   if(spiderNormalMode&&(fengmoLive.resourceVersion!==resourceVersion||stageId!==spiderNormal.stageId||groupId!==stageId||
      plan.members.length!==spiderNormal.memberCount||!spiderNormal.validSettings(spiderNormalSettings))||
      spiderNormalSettings!==undefined&&!spiderNormalMode)throw Error('稀有·土蜘蛛需要对应的原版关卡、五位自有式神和有效的部位条件');
   const spiderLiveMode=battleMode===spiderLive.battleMode;
   if(spiderLiveMode&&(fengmoLive.resourceVersion!==resourceVersion||stageId!==spiderLive.stageId||groupId!==stageId||
      plan.members.length!==spiderLive.memberCount||!spiderLive.validSettings(spiderLiveSettings))||
      spiderLiveSettings!==undefined&&!spiderLiveMode)throw Error('极·土蜘蛛需要对应的原版关卡、五位自有式神和有效的突变词条');
   const longcheMode=battleMode===longche.battleMode;
   if(longcheMode&&(fengmoLive.resourceVersion!==resourceVersion||stageId!==longche.stageId||groupId!==stageId||
      plan.members.length!==longche.memberCount||!longche.validSettings(longcheSettings))||
      longcheSettings!==undefined&&!longcheMode)throw Error('胧车需要对应的原版关卡、五位自有式神和有效的修理条件');
   const skeletonMode=battleMode===skeleton.battleMode;
   if(skeletonMode&&(fengmoLive.resourceVersion!==resourceVersion||stageId!==skeleton.stageId||groupId!==stageId||
      plan.members.length!==skeleton.memberCount||!skeleton.validSettings(skeletonSettings))||
      skeletonSettings!==undefined&&!skeletonMode)throw Error('荒骷髅需要对应的原版关卡、五位自有式神和有效的阶段条件');
   const catfishMode=battleMode===catfish.battleMode;
   if(catfishMode&&(fengmoLive.resourceVersion!==resourceVersion||stageId!==catfish.stageId||groupId!==stageId||
      plan.members.length!==catfish.memberCount||!catfish.validSettings(catfishSettings))||
      catfishSettings!==undefined&&!catfishMode)throw Error('地震鲶需要对应的原版关卡、五位自有式神和有效的模拟条件');
   const mirageMode=battleMode===mirage.battleMode;
   if(mirageMode&&(fengmoLive.resourceVersion!==resourceVersion||stageId!==mirage.stageId||groupId!==stageId||
      plan.members.length!==mirage.memberCount||!mirage.validSettings(mirageSettings))||
      mirageSettings!==undefined&&!mirageMode)throw Error('蜃气楼需要对应的原版关卡、五位自有式神和有效的阶段条件');
   const songMode=battleMode===songstress.battleMode;
   if(songMode&&(fengmoLive.resourceVersion!==resourceVersion||stageId!==songstress.stageId||groupId!==stageId||
      plan.members.length!==songstress.memberCount||!positive(songWindowSeconds)||songWindowSeconds>songstress.windowLimit)||
      songWindowSeconds!==undefined&&!songMode)throw Error('鬼灵歌伎需要对应的原版关卡、六位自有式神和有效的计分时长');
   const duskMode=battleMode===duskWraith.battleMode;
   if(duskMode&&(fengmoLive.resourceVersion!==resourceVersion||stageId!==duskWraith.stageId||groupId!==stageId||
      plan.members.length!==duskWraith.memberCount||!duskWraith.validSettings(duskSettings))||duskSettings!==undefined&&!duskMode)
    throw Error('夜荒魂需要对应的原版关卡、五位自有式神、有效的乐律顺序和计分时长');
   const fusionMode=battleMode===fusion.battleMode;
   if(fusionMode&&(fusion.resourceVersion!==resourceVersion||stageId!==fusion.stageId||groupId!==stageId||
      plan.members.length!==fusion.memberCount||!fusion.validSettings(fusionSettings))||fusionSettings!==undefined&&!fusionMode)
    throw Error('姥姥火·合魂需要原版关卡、五位自有式神、有效共享生命和计分时长');
   const feast=battleMode===devilFeast.battleMode?devilFeast.stage(stageId):null;
   if(battleMode===devilFeast.battleMode&&(!feast||groupId!==stageId||plan.members.length!==5))
    throw Error('鬼王之宴需要对应的关卡、编组和五位自有式神');
   if(devilFeastHp!==undefined&&(feast?.kind!=='boss'||!devilFeast.validHp(devilFeastHp)))
    throw Error('大妖考验的开场首领生命需大于 0');
   if(ten.modes[battleMode]){
    if(!ten.validBonuses(tenBonuses??[]))throw Error(`拾光永恒最多可选 ${ten.bonusSlots} 项不同的额外增益`);
    if(ten.resourceVersion!==resourceVersion||ten.modeFor(stageId)!==battleMode||stageId!==groupId||
       plan.members.length!==5)throw Error('拾光永恒需要对应的关卡和五位自有式神');
   }else if(tenBonuses!==undefined)throw Error('石长姬养成增益仅适用于虚无精锐和遭遇战');
   if(battleMode===tenBoss.battleMode&&(ten.resourceVersion!==resourceVersion||stageId!==tenBoss.stageId||
      groupId!==stageId||plan.members.length!==5))throw Error('炼石成金从第一层开始，需要五位自有式神');
   if(explore&&(ten.resourceVersion!==resourceVersion||!ten.exploration(stageId)||groupId!==stageId))
    throw Error('巡于黄金之河需要对应的普通探索关卡');
   if(battleMode===3&&activityScore.stages[stageId])throw Error(`${activityScore.stages[stageId].label}需要使用原版活动计分入口`);
   const tianfaStage=tianfa.stages[stageId];
   if(typeof tianfaTeam!=='boolean'||tianfaTeam&&battleMode!==tianfa.battleMode)throw Error('三人复跑设置只适用于彼世逢魔');
   if(battleMode===tianfa.battleMode&&(tianfa.resourceVersion!==resourceVersion||!tianfaStage||
      groupId!==stageId||plan.members.length!==tianfa.memberCount))
    throw Error('彼世逢魔需要对应难度的原版关卡和六位自有式神');
   if(battleMode===3&&(tianfaStage||stageId===tianfa.lobbyStageId))throw Error('彼世逢魔需要使用原版挑战入口');
   const journeyRoute=battleMode===journeyHard.battleMode?journeyHard.routes[stageId]:null;
   if(battleMode===journeyHard.battleMode&&(journeyHard.resourceVersion!==resourceVersion||!journeyRoute||stageId!==groupId||
      plan.members.length!==journeyHard.memberCount||!validJourneySettings(journeySettings))||journeySettings!==undefined&&!journeyRoute)
    throw Error('京畿净化需要原版首领关卡、祝福层数、战斗时限和五位自有式神');
   if(battleMode===3&&journeyHard.routes[stageId])throw Error('京畿净化需要使用原版首领挑战入口');
   const yinYangMode=battleMode===yinYang.battleMode;
   if(yinYangMode&&(yinYang.resourceVersion!==resourceVersion||stageId!==yinYang.stageId||groupId!==stageId||
      plan.members.length!==yinYang.memberCount||!yinYang.validSettings(yinyangBoss))||yinyangBoss!==undefined&&!yinYangMode)
    throw Error('秘境鬼王需要原版关卡、剩余烽鼓、强力加成和五位自有式神');
   if(battleMode===3&&stageId===yinYang.stageId)throw Error('秘境鬼王需要使用原版首领挑战入口');
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
   if(battleMode===qinfei.battleMode){
    const {raidId,difficulty,windowSeconds}=qinfeiBoss??{};
    if(qinfei.resourceVersion!==resourceVersion||stageId!==qinfei.stageId||groupId!==stageId||plan.members.length!==5||
       !positive(raidId)||!positive(difficulty)||!Object.hasOwn(qinfei.profiles,[raidId,difficulty])||
       !positive(windowSeconds)||windowSeconds>qinfei.maxWindowSeconds)
     throw Error('寝肥本体需要正确的首领档、计分时长和五位自有式神');
   }else if(qinfeiBoss!==undefined)throw Error('寝肥首领档仅适用于寝肥本体');
   if(battleMode===3&&(mapBoss.stages[stageId]?.kind==='qinfeiFood'||mapBoss.qinfeiStaticStages.includes(stageId)))
    throw Error('寝肥关卡需要使用该玩法的原版入口');
   if(battleMode===3&&mapBoss.qinfeiSideBattles[stageId]&&
      (mapBoss.qinfeiSideSource.resourceVersion!==resourceVersion||groupId!==stageId||plan.members.length!==5))
    throw Error('寝肥编组演练需要匹配的原表编组和五位自有式神');
   if(pveDeadlineSeconds!==undefined&&(battleMode!==3||!positive(pveDeadlineSeconds)||pveDeadlineSeconds>10800))
    throw Error('通用 PvE 时限必须与客户端关卡配置一致');
   if(battleMode===3&&(mapBoss.stages[stageId]||mapBoss.archivedNianStages.includes(stageId)))
    throw Error('该关卡需要地图首领的原版组队入口');
   const mapBossMode=mapBoss.battleModes.includes(battleMode);
   const mapBossRoute=mapBossMode?mapBoss.stages[stageId]:null;
   const mapBossPositions=mapBossMode?mapBoss.partyPositions(battleMode,mapBossPlayers):null;
   if(mapBossMode&&(mapBossRoute?.battleMode!==battleMode||mapBoss.resourceVersion!==resourceVersion||groupId!==stageId||
      !mapBossPositions||plan.members.length!==mapBossPositions.flat().length)||
      mapBossPlayers!==undefined&&!mapBossRoute)throw Error('地图首领需要正确的关卡、参战人数和阵容');
   if(qinfeiFoodPiles!==undefined){
    const allowed=mapBossRoute?.kind==='qinfeiFood'?new Set(mapBoss.qinfeiFoodChoices(mapBossRoute).map(([id])=>Number(id))):null;
    if(!allowed||!Array.isArray(qinfeiFoodPiles)||qinfeiFoodPiles.length<1||qinfeiFoodPiles.length>=mapBoss.qinfeiFoodMaxPiles||
       !Array.from(qinfeiFoodPiles).every(id=>allowed.has(id)))throw Error('寝肥连战最多五堆，请选择同种食材及版本的关卡');
   }
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
   const deadlineMs=spider||spiderLiveMode||spiderNormalMode?645000:bandPractice?420000:fusionMode||duskMode||songMode||mirageMode||catfishMode||skeletonMode||longcheMode?325000:towerMode||laolaoMode?200000:yinYangMode||battleMode===306||qilingEntry||ghostRoute||historicalGhostRoute||qinfeiBoss?245000:feast||sixRealmsRoute||tianfaStage||creviceRoute||mapBossRoute?.raidWindowSeconds||qinfeiFoodPiles?175000:
    hunlingRoute||[2001,orochi.battleMode].includes(battleMode)?155000:100000+(pveDeadlineSeconds??0)*100;
   const cancel=new AbortController(),deadline=AbortSignal.timeout(deadlineMs);
   let release,dir;
   current={cancel,done:new Promise(resolve=>{release=resolve;})};
   try{
    const config=await readConfig(configPath);
    cancel.signal.throwIfAborted();
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-pve-stage-'));
    const team=path.join(dir,'team.json'),suitIndex=path.join(dir,'suits.json');
    await Promise.all([fs.writeFile(team,input,'utf8'),fs.writeFile(suitIndex,suitInput,'utf8')]);
    const args=['-X','utf8',entry,'--runtime',path.resolve(configPath),'--mode',String(battleMode),'--seed',String(seed),
     '--team',team,'--suit-index',suitIndex];
    if(damageFloor)args.push('--minimum-damage');
    if(pveDeadlineSeconds!==undefined)args.push('--pve-deadline',String(pveDeadlineSeconds));
    if(dojoArea)args.push('--dojo-area',String(dojoArea.year),String(dojoArea.playId),String(dojoArea.regionState));
    if(forest)args.push('--forest-event',String(forest.eventId));
    if(tenBonuses?.length)args.push('--ten-bonuses',...tenBonuses.map(String));
    if(devilFeastHp!==undefined)args.push('--devil-feast-hp',String(devilFeastHp));
    if(towerMode)args.push('--tower-settings',JSON.stringify(towerSettings));
    if(laolaoMode)args.push('--laolao-settings',JSON.stringify(laolaoSettings));
    if(fusionMode)args.push('--fusion-settings',JSON.stringify(fusionSettings));
    if(duskMode)args.push('--dusk-settings',JSON.stringify(duskSettings));
    if(songMode)args.push('--song-window',String(songWindowSeconds));
    if(mirageMode)args.push('--mirage-settings',JSON.stringify(mirageSettings));
    if(catfishMode)args.push('--catfish-settings',JSON.stringify(catfishSettings));
    if(skeletonMode)args.push('--skeleton-settings',JSON.stringify(skeletonSettings));
    if(longcheMode)args.push('--longche-settings',JSON.stringify(longcheSettings));
    if(spiderLiveMode)args.push('--spider-live-settings',JSON.stringify(spiderLiveSettings));
    if(spiderNormalMode)args.push('--spider-normal-settings',JSON.stringify(spiderNormalSettings));
    if(battleMode===306)args.push('--boss',String(groupId),'--raid-round',String(retreat.raidRound),
     '--guild-members',String(retreat.guildMembers),'--window-seconds',String(retreat.windowSeconds));
    if(regionModes.includes(battleMode))args.push('--region',JSON.stringify(region));
    if(capture)args.push('--capture-item',String(capture.itemId),'--capture-cards',...capture.cards.map(String));
    if(sixRealmsRoute)args.push('--shilian-trial-slot',String(trialSlot));
    if(sixRealmsState)args.push('--shilian-state',JSON.stringify(sixRealmsState));
    if(journeyRoute)args.push('--journey-blessings',String(journeySettings.blessingCount),'--journey-deadline',String(journeySettings.deadlineSeconds));
    if(yinYangMode){
     args.push('--yinyang-drums',String(yinyangBoss.remainingDrums));
     if(yinyangBoss.buffIds.length)args.push('--yinyang-buffs',...yinyangBoss.buffIds.map(String));
    }
    if(isSixRealmsEvent)args.push('--shilian-event-id',String(sixRealmsEvent.id),'--shilian-difficulty',String(sixRealmsEvent.difficulty),
     '--shilian-moves',String(sixRealmsEvent.moves));
    if(qilingEntry){
     args.push('--qiling-window',String(qilingWindow.windowSeconds));
     if(qilingWindow.startingHp!==undefined)args.push('--qiling-hp',String(qilingWindow.startingHp));
    }
    if(creviceRoute)args.push('--crevice-window',String(creviceWindow));
    if(ghostRoute)args.push('--ghost-settings',JSON.stringify(ghostSettings));
    if(historicalGhostRoute)args.push('--historical-ghost-window',String(historicalGhostWindow));
    if(mapBossRoute)args.push('--map-boss-players',String(mapBossPlayers));
    if(qinfeiFoodPiles)args.push('--qinfei-food-next',...qinfeiFoodPiles.map(String));
    if(qinfeiBoss)args.push('--qinfei-profile',String(qinfeiBoss.raidId),String(qinfeiBoss.difficulty),'--window-seconds',String(qinfeiBoss.windowSeconds));
    if(tianfaTeam)args.push('--tianfa-team');
    const expected={battleMode,seed,input,suitInput,damageFloor,rounds,resource,hunlingRoute,capture,qilingEntry,qilingWindow,sixRealmsRoute,sixRealmsEvent,trialSlot,sixRealmsState,journeyRoute,journeySettings,creviceRoute,creviceWindow,ghostRoute,ghostSettings,historicalGhostRoute,historicalGhostWindow,mapBossRoute,mapBossPlayers,tianfaTeam,qinfeiBoss,qinfeiFoodPiles,pveDeadlineSeconds,dojoArea,forest,tenBonuses,devilFeastHp,yinyangBoss,towerSettings,laolaoSettings,fusionSettings,duskSettings,songWindowSeconds,mirageSettings,catfishSettings,skeletonSettings,longcheSettings,spiderLiveSettings,spiderNormalSettings,
     retreat:battleMode===306?retreat:null,region:regionModes.includes(battleMode)?region:null};
    async function runStage(stageId,groupId,extra=[]){
     const output=path.join(dir,`battle-${stageId}.json`);
     const code=await launch(config.python,[...args,'--stage',String(stageId),'--output',output,...extra],dir,
      AbortSignal.any([cancel.signal,deadline]));
     cancel.signal.throwIfAborted();
     if(code!==0&&code!==2)throw Error('本机原版引擎未能运行此关卡，请核对资料、阵容和入场条件');
     const report=JSON.parse(await fs.readFile(output,'utf8'));
     cancel.signal.throwIfAborted();
     return readReport(report,{...expected,stageId,groupId});
    }
    const first=await runStage(stageId,groupId,bandPractice?['--band-score',String(bandScores[0])]:[]);
    if(!bandPractice)return first;
    if(!validBandTogetherPhase(first,0,bandScores[0],0,0))throw Error('共斗练习第一段战报与入场设置不符');
    const {damage,buffLevel,rhythmScore}=first.fengmoBandPhase;
    if(!first.completed||rhythmScore===null)return combineBandTogether(first);
    const secondStage=bandTogether.stages[1];
    const second=await runStage(secondStage,secondStage,
     ['--band-score',String(bandScores[1]),'--band-carry',String(damage),String(buffLevel)]);
    if(!validBandTogetherPhase(second,1,bandScores[1],damage,buffLevel)||second.nativeSHA256!==first.nativeSHA256||
       second.scriptIndexSHA256!==first.scriptIndexSHA256)throw Error('共斗练习第二段战报与结转条件不符');
    return combineBandTogether(first,second);
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
