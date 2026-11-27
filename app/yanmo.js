((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasYanmo = source;
})(globalThis, () => {
  'use strict';
  const activityId=7456,battleMode=912,sceneId=469051,bonusRoundLimit=10;
  const actor=Object.freeze({id:1670,level:40,star:6});
  const resources=['金币','经验','御魂','觉醒'];

  function practice(stageId){
    if(!Number.isSafeInteger(stageId)||stageId<602801||stageId>602840)return null;
    const index=stageId-602801,resourceType=Math.floor(index/10)+1;
    return {entryId:index+1,resourceType,resource:resources[resourceType-1],layer:index%10+1};
  }

  function isTrial(stageId){
    return Number.isSafeInteger(stageId)&&stageId>=602851&&stageId<=602900;
  }

  function validReport(report){
    const stage=practice(report.stageId),data=report.yanmoPractice;
    return !!stage&&report.battleMode===battleMode&&report.sceneId===sceneId&&report.waveCount===1&&
      report.formationsVerified===1&&data?.activityId===activityId&&data.entryId===stage.entryId&&
      data.resourceType===stage.resourceType&&data.layer===stage.layer&&data.actor?.id===actor.id&&
      data.actor.level===actor.level&&data.actor.star===actor.star&&data.deadlineSeconds===null&&data.timedOut===false&&
      Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds&&
      Number.isSafeInteger(data.rounds)&&data.rounds>=0&&data.bonusRoundLimit===bonusRoundLimit&&
      data.lampBonusCondition===(report.outcome==='win'&&data.rounds<=bonusRoundLimit);
  }

  return Object.freeze({resourceVersion:'0.0.816',activityId,battleMode,sceneId,bonusRoundLimit,actor,
    practice,isTrial,validReport,
    sceneSHA256:'8a0c61ab0fd66c979ab272e52e5ff4982e428b2b7b723382f92f1ef77a4420c3',
    engine:Object.freeze({name:'SpYanMoPracticeEngine',route:'yanmo-practice-original-solo',
      sha256:'a6f7e88288ead6e84811bb0f9104258af5117e7a8d663e79918937a354ae4923'}),
    tableSHA256:Object.freeze({
      sp_yanmo_xx_fuben:'6c3ffb5d0917ebf4b74198e8d80bdb2b5c33d871f6de8b74751064cb238916bb',
      sp_yanmo_constant:'083ef4a241bf1656540aabcb4ebd442ce45bf1233a99466a2ff5eee943542345',
      normal_battle_yys_replace:'0ed028082bc8f51caa6343fe206f1320283782593afdb8b1898c0d2324d19c5d',
      normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'}),
  });
});
