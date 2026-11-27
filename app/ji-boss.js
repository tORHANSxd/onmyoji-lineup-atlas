((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasJiBoss = source;
})(globalThis, () => {
  'use strict';
  const battleMode=926,sceneId=128;
  const fixedActor=Object.freeze({id:1805,level:40,star:6});
  function entry(stageId){
    if(!Number.isInteger(stageId)||stageId<505101||stageId>505106)return null;
    const day=Math.floor((stageId-505101)/2)+1,hard=stageId%2===0;
    return {levelId:day+(hard?3:0),day,hard,deadlineSeconds:hard?180:300,
      available:stageId!==505105,actor:stageId===505103?fixedActor:null};
  }
  function validReport(report,plan){
    const stage=entry(report.stageId),data=report.jiBoss,own=plan.onmyoji;
    const expected=stage?.actor??{id:Number(own?.heroId),level:own?.level,star:own?.star};
    return !!stage?.available&&report.sceneId===sceneId&&report.waveCount===1&&report.formationsVerified===1&&
      data?.day===stage.day&&data.hard===stage.hard&&data.deadlineSeconds===stage.deadlineSeconds&&
      data.actor?.id===expected.id&&data.actor.level===expected.level&&data.actor.star===expected.star&&
      data.actor.replaced===!!stage.actor&&Number.isSafeInteger(data.damage)&&data.damage>=0&&
      typeof data.timedOut==='boolean'&&(!data.timedOut||report.wavesCleared===0)&&
      Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds;
  }
  return Object.freeze({resourceVersion:'0.0.816',battleMode,sceneId,entry,validReport,
    engine:Object.freeze({name:'JiBossEngine',route:'shiki-boss-original-solo',
      sha256:'4c10da13bbc8cbc69d093b7e46f3415c86df42b73de9b3955808a4fa44fed8cc'}),
    sceneSHA256:'6bc602f46905f82df726a6dc44f9dc42ecff09d6b45c64a9645e561a57ce9bb0',
    tableSHA256:Object.freeze({
      shiki_boss:'4b0966d9946f37111cf92ef945da9350b3cd99632d2351b37795755d9eec4477',
      normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66',
      normal_battle_yys_replace:'0ed028082bc8f51caa6343fe206f1320283782593afdb8b1898c0d2324d19c5d',
    }),
  });
});
