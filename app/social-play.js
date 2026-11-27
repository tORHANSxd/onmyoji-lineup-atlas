((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasSocialPlay = source;
})(globalThis, () => {
  'use strict';
  const activityId=8772,battleMode=938,sceneId=310001,deadlineSeconds=180;
  const positions=Object.freeze([1,2,3,4,5,6]);

  function stage(id){
    if(!Number.isSafeInteger(id)||id<310001||id>310028)return null;
    const levelId=id-310000;
    return {levelId,day:Math.floor((levelId-1)/4)+1,level:(levelId-1)%4+1};
  }

  function validReport(report){
    const entry=stage(report.stageId),data=report.socialPlay;
    return !!entry&&report.sceneId===sceneId&&report.waveCount===1&&report.formationsVerified===1&&
      data?.activityId===activityId&&data.levelId===entry.levelId&&data.day===entry.day&&data.level===entry.level&&
      data.automatic===true&&data.deadlineSeconds===deadlineSeconds&&
      Array.isArray(data.positions)&&data.positions.length===positions.length&&positions.every((pos,i)=>data.positions[i]===pos)&&
      typeof data.timedOut==='boolean'&&(!data.timedOut||report.outcome==='loss')&&
      Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds;
  }

  return Object.freeze({resourceVersion:'0.0.816',activityId,battleMode,sceneId,deadlineSeconds,positions,stage,validReport,
    engine:Object.freeze({name:'SocialTeamBattleEngine',route:'social-play-original-solo',
      sha256:'009ef7ac16fba7100c941ea535d375a53bde4def4833192ce53177f02eae3f05'}),
    tableSHA256:Object.freeze({social_play_stage:'194921fcec6f0658db4a08202d75bb15e98f4acfd6de1b8981393705e4f20393',
      normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'}),
  });
});
