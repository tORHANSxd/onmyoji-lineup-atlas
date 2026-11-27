((root,factory)=>{
 const source=factory();
 if(typeof module==='object'&&module.exports)module.exports=source;
 else root.AtlasChajiSide=source;
})(globalThis,()=>{
 'use strict';
 const drill=Object.freeze({stageId:1014000,battleMode:9548,activityId:10169,waveCount:1,deadlineSeconds:180,
  engine:Object.freeze({name:'SPChaJiYanWuBattleEngine',route:'chaji-drill-original-solo',
   sha256:'5ca8382b0f932df5d1cd2b82ec4f4555ee4c080ed86c0f089391ba04a8d9f8f4'})});
 const rift=Object.freeze({stageId:1014001,battleMode:9549,activityId:10250,waveCount:10,deadlineSeconds:600,teamRoute:1229,
  engine:Object.freeze({name:'SPChaJiFissureBattleEngine',route:'chaji-rift-original-solo',
   sha256:'180b302e4994f7b0684963a4b48075d473fd678036062fa200354d92aa8a7b78'})});
 const modes=Object.freeze({[drill.battleMode]:drill,[rift.battleMode]:rift});
 const sceneId=4002434;
 const entry=stageId=>stageId===drill.stageId?drill:stageId===rift.stageId?rift:null;

 function validReport(report){
  const route=entry(report.stageId);
  if(!route)return false;
  const data=route===rift?report.chajiRift:report.chajiDrill;
  return report.battleMode===route.battleMode&&report.sceneId===sceneId&&report.waveCount===route.waveCount&&
   Number.isSafeInteger(report.formationsVerified)&&report.formationsVerified>=1&&report.formationsVerified<=route.waveCount&&
   report.wavesCleared<=report.formationsVerified&&report.formationsVerified<=report.wavesCleared+1&&
   data?.activityId===route.activityId&&data.deadlineSeconds===route.deadlineSeconds&&typeof data.timedOut==='boolean'&&
   Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds&&
   Number.isSafeInteger(data.rounds)&&data.rounds>=0&&(route===rift?
    (data.firstDeathWave===null||Number.isSafeInteger(data.firstDeathWave)&&data.firstDeathWave>=1&&
      data.firstDeathWave<=report.formationsVerified)&&[0,1,2,3].includes(data.rewardChoice)&&
    (!report.completed||data.rewardChoice!==3):
    (!data.timedOut||report.outcome!=='win'));
 }

 return Object.freeze({resourceVersion:'0.0.816',sceneId,drill,rift,modes,entry,validReport,
  tableSHA256:Object.freeze({
   activity_tower_act:'6fd136376f2bff0a0ebe572e1897f74f5fdd1f1b89488db5139cb68d2df8db85',
   activity_tower_floor:'903f11674bf6c5b403d6bec65864bc25c25f8125fa8d09b96c30b316197ef0c6',
   sp_chaji_const:'f8bcf955ab7670147832738c02df52e5ad509fb6f217cb63bd689e694d80c747',
   normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'})});
});
