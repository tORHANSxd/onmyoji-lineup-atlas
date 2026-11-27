((root,factory)=>{
 const source=factory();
 if(typeof module==='object'&&module.exports)module.exports=source;
 else root.AtlasChajiBoss=source;
})(globalThis,()=>{
 'use strict';
 const battleMode=9551,activityId=10180,teamRoute=1298,deadlineSeconds=180,assistConfig=71;
 const scenes=[400631,10681,4002211,2735022,4002433];
 const helperSHA256='4ce7f719202bfa7b57543c97efe31ddcf3dc03fbba78cc36f406e368d89b561e';

 function entry(stageId){
  if(!Number.isSafeInteger(stageId)||stageId<1014201||stageId>1014215)return null;
  const index=stageId-1014201,bossIndex=Math.floor(index/3),difficulty=index%3+1;
  return {entryId:index+1,bossId:bossIndex+1,difficulty,sceneId:scenes[bossIndex],
   scored:difficulty===3,enemies:bossIndex===4?1:2};
 }

 function validReport(report){
  const route=entry(report.stageId),data=report.chajiBoss;
  return !!route&&report.battleMode===battleMode&&report.sceneId===route.sceneId&&report.waveCount===1&&
   report.formationsVerified===1&&data?.activityId===activityId&&data.entryId===route.entryId&&
   data.bossId===route.bossId&&data.difficulty===route.difficulty&&data.scored===route.scored&&
   data.helperSHA256===helperSHA256&&data.deadlineSeconds===deadlineSeconds&&typeof data.timedOut==='boolean'&&
   Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds&&
   Number.isSafeInteger(data.damage)&&data.damage>=0&&
   (route.scored&&report.completed?[1,2].includes(data.originalWinCamp):data.originalWinCamp===null)&&
   Array.isArray(data.tasks)&&data.tasks.length===(route.scored?3:0)&&
   data.tasks.every((task,index)=>task?.id===(route.bossId-1)*3+index+1&&typeof task.label==='string'&&
    !!task.label&&[1,2,3].includes(task.result));
 }

 return Object.freeze({resourceVersion:'0.0.816',battleMode,activityId,teamRoute,deadlineSeconds,assistConfig,entry,validReport,
  engine:Object.freeze({name:'SPChaJiBossBattleEngine',route:'chaji-boss-original-solo',
   sha256:'8b14a53f4f1724c39a8380ef67a234b7e4d88ff2bc58a7ccac67db70d2826080'}),
  tableSHA256:Object.freeze({
   sp_chaji_boss_config:'c9ad675da1cbad09c59494b75256b9a3d2dd299d7ed102484521753a9710c48c',
   sp_chaji_boss_lv_config:'e62960a6ef2e1a963a83089aaaaa7b22d1aba4cbd27402fd5b84f1c11f02211f',
   sp_chaji_boss_task_config:'52538d2de481dbd0b08eabac95961bff34e053e20268b21a6853c38204a8ff06',
   normal_battle_assist_hero:'12a458cabd758009220dd8b7a3cf2b42be839f6e3997d9e74629ea628a711394',
   normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'})});
});
