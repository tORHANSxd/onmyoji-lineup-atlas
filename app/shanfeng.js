((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasShanFeng = source;
})(globalThis, () => {
  'use strict';
  const battleMode=660,deadlineSeconds=180;
  const actor=Object.freeze({id:1454,level:40,position:1});
  function contains(stageId){
    return Number.isInteger(stageId)&&stageId>=3340001&&stageId<=3340022;
  }
  function stage(stageId){
    if(!contains(stageId))return null;
    const index=stageId-3340001,day=index<16?0:Math.floor((index-16)/2)+1;
    if(day&&index%2)return null;
    return {day,sceneId:index<16?42120+Math.floor(index/4):42123+day};
  }
  function validReport(report){
    const entry=stage(report.stageId),data=report.shanFeng;
    return !!entry&&report.sceneId===entry.sceneId&&report.waveCount===1&&report.formationsVerified===1&&
      data?.day===entry.day&&data.deadlineSeconds===deadlineSeconds&&data.actor?.id===actor.id&&
      data.actor.level===actor.level&&data.actor.position===actor.position&&Number.isSafeInteger(data.damage)&&data.damage>=0&&
      typeof data.timedOut==='boolean'&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds;
  }
  return Object.freeze({resourceVersion:'0.0.816',battleMode,deadlineSeconds,actor,contains,stage,validReport,
    engine:Object.freeze({name:'SpShanFengHardEngine',route:'shan-feng-base-state',
      sha256:'1c19a9c038a3c9cdb95d6fa2b97469c3745859fe7cd28db276c8edcba17f935f'}),
    tableSHA256:Object.freeze({
      super_ghost6_pve:'03e8cfd222b33c94d7adfbd49bc170cdc3072aa76d0ae8dc10d244760a21019e',
      super_ghost6_constant:'76a913700fd649ef9fdce10ecb3436a4614bbdad42ba1d8b16a3e3d83b586150',
    }),
  });
});
