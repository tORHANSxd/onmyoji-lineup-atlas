((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasYanmo = source;
})(globalThis, () => {
  'use strict';
  const activityId=7456,battleMode=912,trialMode=914,sceneId=469051,bonusRoundLimit=10;
  const actor=Object.freeze({id:1670,level:40,star:6});
  const resources=['金币','经验','御魂','觉醒'];
  const firstCard=1476130,lastCard=1476535;

  function practice(stageId){
    if(!Number.isSafeInteger(stageId)||stageId<602801||stageId>602840)return null;
    const index=stageId-602801,resourceType=Math.floor(index/10)+1;
    return {entryId:index+1,resourceType,resource:resources[resourceType-1],layer:index%10+1};
  }

  function isTrial(stageId){
    return Number.isSafeInteger(stageId)&&stageId>=602851&&stageId<=602900;
  }

  function validSettlement(report,data){
    return report.sceneId===sceneId&&report.waveCount===1&&report.formationsVerified===1&&
      data?.activityId===activityId&&data.actor?.id===actor.id&&data.actor.level===actor.level&&
      data.actor.star===actor.star&&data.deadlineSeconds===null&&data.timedOut===false&&
      Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds;
  }

  function validReport(report){
    const stage=practice(report.stageId),data=report.yanmoPractice;
    return !!stage&&report.battleMode===battleMode&&validSettlement(report,data)&&data.entryId===stage.entryId&&
      data.resourceType===stage.resourceType&&data.layer===stage.layer&&
      Number.isSafeInteger(data.rounds)&&data.rounds>=0&&data.bonusRoundLimit===bonusRoundLimit&&
      data.lampBonusCondition===(report.outcome==='win'&&data.rounds<=bonusRoundLimit);
  }

  function validTrialPlan(plan){
    return !!plan&&Object.keys(plan).length===1&&Array.isArray(plan.cards)&&plan.cards.length===5&&
      plan.cards.every(id=>Number.isSafeInteger(id)&&id>=firstCard&&id<=lastCard);
  }

  function validTrialReport(report,cards){
    const data=report.yanmoTrial;
    return report.battleMode===trialMode&&isTrial(report.stageId)&&validSettlement(report,data)&&
      Array.isArray(data.recruits)&&data.recruits.length===cards.length&&data.recruits.every((row,index)=>
        row?.cardId===cards[index]&&row.position===index+2&&Number.isSafeInteger(row.heroId)&&row.heroId>0&&
        Number.isSafeInteger(row.star)&&row.star>=2&&row.star<=6&&Number.isSafeInteger(row.suitId)&&row.suitId>0);
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
    trial:Object.freeze({battleMode:trialMode,resourceVersion:'0.0.816',validPlan:validTrialPlan,validReport:validTrialReport,
      cardIds:Object.freeze(Array.from({length:lastCard-firstCard+1},(_,i)=>firstCard+i)),
      sceneSHA256:'c134a2af08e493ad8431f17b69130ac54520d9e1d53be83a033a1fa5e2a2bf63',
      engine:Object.freeze({name:'SpYanMoTestEngine',route:'yanmo-trial-original-solo',
        sha256:'f87eb9736d75538030e7f63b5b4fc9df9e0cc1b359a181d0f83c58a94d5c65ec'}),
      tableSHA256:Object.freeze({sp_yanmo_hero:'d7f6fe95e3619e01f7e52d5a220a5200fdaa57d1e1892951476b4c8f5b2d2477',
        sp_yanmo_trial_attr:'ebe74e857d6f5a50413f1b6a0d019a8b44a72c815af91d52b99485bd3f5ac71f',
        normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66',
        normal_battle_yys_replace:'0ed028082bc8f51caa6343fe206f1320283782593afdb8b1898c0d2324d19c5d'})}),
  });
});
