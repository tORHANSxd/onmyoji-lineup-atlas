((root,factory)=>{
 const source=factory();
 if(typeof module==='object'&&module.exports)module.exports=source;
 else root.AtlasSplyjTower=source;
})(globalThis,()=>{
 'use strict';
 const battleMode=6058,activityId=11442,sceneId=3064601,deadlineSeconds=180,assistConfig=98,assistId=61320;
 const stages=[9637271,9637272,9637273],floors=[664,665,666];

 function entry(stageId){
  const index=stages.indexOf(stageId);
  return index<0?null:{floorId:floors[index],layer:index+1};
 }

 function validReport(report){
  const floor=entry(report.stageId),data=report.splyjTower;
  return !!floor&&report.battleMode===battleMode&&report.sceneId===sceneId&&report.waveCount===1&&
   report.formationsVerified===1&&data?.activityId===activityId&&data.floorId===floor.floorId&&
   data.layer===floor.layer&&data.assistId===assistId&&data.deadlineSeconds===deadlineSeconds&&
   typeof data.timedOut==='boolean'&&(!data.timedOut||report.outcome!=='win')&&
   Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds&&
   Number.isSafeInteger(data.rounds)&&data.rounds>=0;
 }

 return Object.freeze({resourceVersion:'0.0.816',battleMode,activityId,sceneId,deadlineSeconds,assistConfig,assistId,entry,validReport,
  engine:Object.freeze({name:'SPlyjTowerBattleEngine',route:'splyj-tower-original-solo',
   sha256:'28c9915a76bcff6f6ac897c5e075168279e635d0a86af412c31516244ae551af'}),
  tableSHA256:Object.freeze({
   activity_tower_act:'6fd136376f2bff0a0ebe572e1897f74f5fdd1f1b89488db5139cb68d2df8db85',
   activity_tower_floor:'903f11674bf6c5b403d6bec65864bc25c25f8125fa8d09b96c30b316197ef0c6',
   normal_battle_assist_hero:'12a458cabd758009220dd8b7a3cf2b42be839f6e3997d9e74629ea628a711394',
   normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'})});
});
