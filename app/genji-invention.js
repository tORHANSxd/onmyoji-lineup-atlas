((root,factory)=>{
 const source=factory();
 if(typeof module==='object'&&module.exports)module.exports=source;
 else root.AtlasGenjiInvention=source;
})(globalThis,()=>{
 'use strict';
 const battleMode=1290,activityId=20100,sceneId=2018208,deadlineSeconds=300,systemTrial=61316;
 const stages=[116004,116005,116006],enemyCounts=[1,3,6];
 const buffs=Object.freeze([98551,98552,98553,98554,98555]);
 const thresholds=Object.freeze([300000,500000,800000]);

 function entry(stageId){
  const index=stages.indexOf(stageId);
  return index<0?null:{id:index+1,enemies:enemyCounts[index]};
 }

 function validSettings(settings,memberCount){
  return !!settings&&Object.keys(settings).length===3&&
   Number.isInteger(settings.leadSlot)&&settings.leadSlot>=0&&settings.leadSlot<=6&&
   memberCount===(settings.leadSlot?6:5)&&
   (settings.finalAt===null||Number.isInteger(settings.finalAt)&&settings.finalAt>=0&&settings.finalAt<deadlineSeconds)&&
   (settings.buff===null||buffs.includes(settings.buff));
 }

 function validReport(report,settings,plan){
  const route=entry(report.stageId),data=report.genjiInvention;
  return !!route&&validSettings(settings,plan.members.length)&&report.battleMode===battleMode&&report.sceneId===sceneId&&
   report.formationsVerified===1&&report.waveCount===1&&report.wavesCleared===0&&
   data?.activityId===activityId&&data.entryId===route.id&&data.trialSlot===settings.leadSlot&&data.buff===settings.buff&&
   data.trialId===(settings.leadSlot?Number(plan.members[settings.leadSlot-1].hero.heroId):systemTrial)&&
   data.deadlineSeconds===deadlineSeconds&&data.finalAt===settings.finalAt&&typeof data.autoTriggered==='boolean'&&
   typeof data.timedOut==='boolean'&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds&&
   (data.triggerSeconds===null||Number.isFinite(data.triggerSeconds)&&data.triggerSeconds>=0&&data.triggerSeconds<=data.combatSeconds)&&
   (report.completed?Number.isSafeInteger(data.damage)&&data.damage>=0&&
    data.rewardTier===thresholds.filter(limit=>data.damage>=limit).length:data.damage===null&&data.rewardTier===null);
 }

 return Object.freeze({resourceVersion:'0.0.816',battleMode,activityId,sceneId,deadlineSeconds,systemTrial,buffs,thresholds,
  entry,validSettings,validReport,teamRouteSHA256:'68ed1be613474f326fb41eaad258921d7ed00f00435bee4057fe55c21abe74d0',
  engine:Object.freeze({name:'YiquanchaorenBattleEngine',route:'genji-invention-original',
   sha256:'ce9caaa9320c98baa6df4bf8f078a281c5edd608feb972db3f2e916421a44111'}),
  tableSHA256:Object.freeze({
   team_invent_stage:'2e74f80a70488fab5902462c2f0403d3fe2c60df2cd2810cec7e84f80678184e',
   team_invent_const:'eac1943442b4a84de7024a134a1725196370a5bb755a185cfb113bf8f1422480',
   asura_develop:'416ff9213f22c09526d4605f05c4191cb0d111c6d50a9b840daa50212f555699',
   asura_load:'827aae396458361c14b03de5447dafda6d196f4692d54fcd52e08fbde3bf72cf',
   normal_battle_develop_skill_new:'9c8f37291d3fc86f8f19b3ba530858621a65ad63ccff28f26eec42ac85818d9a',
   normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'})});
});
