((root,factory)=>{
 const source=factory();
 if(typeof module==='object'&&module.exports)module.exports=source;
 else root.AtlasChajiMap=source;
})(globalThis,()=>{
 'use strict';
 const battleMode=9547,activityId=10250,teamRoute=1218,deadlineSeconds=180,sceneId=4002434,hardSkill=83211;
 const tails=[200,203,205,207,210,216,217,220,222,223,224,227,228,229,234,235,237,240,241,252,255,257,262,265,
  271,277,278,279,280,296,304,305,307,312,314,319,320,332,333,334,335,337,338,341,342];
 const stages=Object.freeze([6771000,6772000].flatMap(base=>tails.map(tail=>base+tail)));

 function entry(stageId){
  if(!stages.includes(stageId))return null;
  return {hard:stageId>=6772000};
 }

 function validReport(report){
  const route=entry(report.stageId),data=report.chajiMap;
  return !!route&&report.battleMode===battleMode&&report.sceneId===sceneId&&report.waveCount===1&&
   report.formationsVerified===1&&data?.activityId===activityId&&data.hard===route.hard&&
   data.deadlineSeconds===deadlineSeconds&&typeof data.timedOut==='boolean'&&(!data.timedOut||report.outcome!=='win')&&
   Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds&&
   Number.isSafeInteger(data.rounds)&&data.rounds>=0&&data.hardSkill===(route.hard?hardSkill:null)&&
   Array.isArray(data.skillPositions)&&data.skillPositions.length===(route.hard?6:0)&&
   data.skillPositions.every((pos,index)=>pos===index+1);
 }

 return Object.freeze({resourceVersion:'0.0.816',battleMode,activityId,teamRoute,deadlineSeconds,sceneId,hardSkill,stages,entry,validReport,
  engine:Object.freeze({name:'SPChaJiMapPointBattleEngine',route:'chaji-map-original-solo',
   sha256:'be8ae8aa296ac054dd2e279f6b76d7bfe7888efbc0d2c05d7f658e094a482275'}),
  tableSHA256:Object.freeze({
   sp_chaji_sub_event_battle:'cd1ca6f9a589b44ba6beee32bbdf7d99574f0ff7d1df0a12f5940a50f281e670',
   normal_battle_assist_hero:'12a458cabd758009220dd8b7a3cf2b42be839f6e3997d9e74629ea628a711394',
   normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'})});
});
