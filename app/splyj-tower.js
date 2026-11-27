((root,factory)=>{
 const source=factory();
 if(typeof module==='object'&&module.exports)module.exports=source;
 else root.AtlasSplyjTower=source;
})(globalThis,()=>{
 'use strict';
 const battleMode=6058,activityId=11442,sceneId=3064601,deadlineSeconds=180,assistConfig=98,assistId=61320;
 const stages=[9637271,9637272,9637273],floors=[664,665,666];
 const fixedBuff=533001,optionalBuffs=Object.freeze([533002,533003,533004]);
 const sourceSlots=Object.freeze({fixed:29,optional:28});
 const skillMap=Object.freeze({533001:64651,533002:64652,533003:64653,533004:64654});
 const bossStages=Object.freeze([40129,40130,40131,40132]);
 const bossActivityId=11443,bossMode=6059,bossSceneId=50031,stakeId=20,mirrorSkillId=68653;
 const resourceVersion='0.0.816';

 function entry(stageId){
  const index=stages.indexOf(stageId);
  return index<0?null:{floorId:floors[index],layer:index+1};
 }

 function validBuff(id){
  return id===undefined||optionalBuffs.includes(id);
 }

 function validBattle(report,data,buff){
  const active=data?.buffIds,expected=buff===undefined?[fixedBuff]:[fixedBuff,buff];
  return validBuff(buff)&&Array.isArray(active)&&active.length===expected.length&&active.every((id,i)=>id===expected[i])&&
   report.waveCount===1&&report.formationsVerified===1&&data.assistId===assistId&&data.deadlineSeconds===deadlineSeconds&&
   typeof data.timedOut==='boolean'&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds;
 }

 function validReport(report,buff){
  const floor=entry(report.stageId),data=report.splyjTower;
  return !!floor&&report.battleMode===battleMode&&report.sceneId===sceneId&&validBattle(report,data,buff)&&
   data.activityId===activityId&&data.floorId===floor.floorId&&data.layer===floor.layer&&
   (!data.timedOut||report.outcome!=='win')&&Number.isSafeInteger(data.rounds)&&data.rounds>=0;
 }

 function bossEntry(stageId){
  const difficulty=bossStages.indexOf(stageId)+1;
  return difficulty?{difficulty,enemyId:1103210+difficulty,mirrorSkillLevel:5-difficulty}:null;
 }

 function validBossReport(report,buff){
  const route=bossEntry(report.stageId),data=report.splyjBoss;
  return !!route&&report.battleMode===bossMode&&report.sceneId===bossSceneId&&validBattle(report,data,buff)&&
   data.activityId===bossActivityId&&data.difficulty===route.difficulty&&data.enemyId===route.enemyId&&
   Number.isSafeInteger(data.damage)&&data.damage>=0&&Number.isSafeInteger(data.bossMaxHp)&&data.bossMaxHp>0&&
   Number.isInteger(data.usedSeconds)&&data.usedSeconds>=0&&data.usedSeconds<=deadlineSeconds&&
   typeof data.cleared==='boolean'&&report.wavesCleared===Number(data.cleared);
 }

 const tableSHA256=Object.freeze({
  activity_tower_act:'6fd136376f2bff0a0ebe572e1897f74f5fdd1f1b89488db5139cb68d2df8db85',
  activity_tower_floor:'903f11674bf6c5b403d6bec65864bc25c25f8125fa8d09b96c30b316197ef0c6',
  normal_battle_assist_hero:'12a458cabd758009220dd8b7a3cf2b42be839f6e3997d9e74629ea628a711394',
  normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66',
  splyj_const:'a03ae3b21cafba1d7a04cd878006ed2afcc6a515be05655b3406d69b6b754cdd',
  asura_load:'827aae396458361c14b03de5447dafda6d196f4692d54fcd52e08fbde3bf72cf',
  asura_develop:'416ff9213f22c09526d4605f05c4191cb0d111c6d50a9b840daa50212f555699',
  normal_battle_develop_skill:'440fd9ae42fc301080488d9818c6c3ac8ef984c646a21d1fc6988aba12ded6de'});
 const boss=Object.freeze({resourceVersion,battleMode:bossMode,activityId:bossActivityId,sceneId:bossSceneId,
  stakeId,mirrorSkillId,stages:bossStages,entry:bossEntry,validReport:validBossReport,
  engine:Object.freeze({name:'SPlyjBossBattleEngine',route:'splyj-boss-original-practice',
   sha256:'07e1ccf5ff9a99ab27748af81f1127a31c2487f50ef4c71afda392d837bdc5fd'}),
  tableSHA256:Object.freeze({...tableSHA256,
   stake_boss:'60ab59f169fd58ec7d2af41cafa702234c7548b7acdcd08a94b7ee158348cd4d',
   splyj_boss:'6b15d95af8dee387e51dafa9eee693e470a8ef17e9895ea3cb0c1fcec92a30fa'})});

 return Object.freeze({resourceVersion,battleMode,activityId,sceneId,deadlineSeconds,assistConfig,assistId,entry,validReport,
  fixedBuff,optionalBuffs,validBuff,skillMap,sourceSlots,boss,tableSHA256,
  engine:Object.freeze({name:'SPlyjTowerBattleEngine',route:'splyj-tower-original-solo',
   sha256:'28c9915a76bcff6f6ac897c5e075168279e635d0a86af412c31516244ae551af'})});
});
