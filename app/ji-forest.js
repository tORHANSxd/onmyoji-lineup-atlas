((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasJiForest = source;
})(globalThis, () => {
  'use strict';
  const activityId=8051,normalMode=923,eliteMode=924,sceneId=127,deadlineSeconds=180,lastPreview=81;
  const modes=Object.freeze([normalMode,eliteMode]);
  const normalRowOrder=[null,2,4,3,1];
  const eliteEffects=[67751,67752,67753,67756,67757];

  function entry(stageId){
    if(!Number.isSafeInteger(stageId))return null;
    if(stageId>=505201&&stageId<=505300){
      const level=stageId-505200;
      return {battleMode:eliteMode,entryId:level,level,elite:true,available:level<=lastPreview,
        enemies:level>=80||level%5===0?1:6,fieldEffects:eliteEffects.slice(0,Math.ceil(level/10))};
    }
    const row=normalRowOrder[stageId%10];
    if(stageId<505001||stageId>505094||!row)return null;
    const level=Math.floor((stageId-505000)/10)+1;
    return {battleMode:normalMode,entryId:(level-1)*4+row,level,elite:false,available:true,enemies:6,fieldEffects:[]};
  }

  function sameList(actual,expected){
    return Array.isArray(actual)&&actual.length===expected.length&&expected.every((value,i)=>actual[i]===value);
  }

  function validReport(report){
    const stage=entry(report.stageId),data=report.jiForest;
    return !!stage?.available&&report.battleMode===stage.battleMode&&report.sceneId===sceneId&&report.waveCount===1&&
      report.formationsVerified===1&&data?.activityId===activityId&&data.entryId===stage.entryId&&data.level===stage.level&&
      data.elite===stage.elite&&sameList(data.fieldEffects,stage.fieldEffects)&&data.deadlineSeconds===deadlineSeconds&&
      Number.isSafeInteger(data.damage)&&data.damage>=0&&(!data.damage||stage.elite)&&
      sameList(data.ghostFireIncrements,stage.fieldEffects.includes(67757)?[0,1,2,2,2,2]:[3,4,5,5,5,5])&&
      typeof data.timedOut==='boolean'&&(!data.timedOut||report.outcome==='loss')&&
      Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds;
  }

  return Object.freeze({resourceVersion:'0.0.816',activityId,normalMode,eliteMode,sceneId,deadlineSeconds,lastPreview,
    modes,entry,sameList,validReport,
    engine:Object.freeze({name:'JiNormalBattleEngine',route:'ji-forest-original-solo',
      sha256:'388cde6b0fa00a5f4a0717918f3f0d4750b22bf6640e67a07fcf2bb6ad37632a'}),
    tableSHA256:Object.freeze({ji_tower_elite:'67789e0c1983693f32df039fdf6345681303c795f0814ae6788f893665304b42',
      ji_tower_monster:'c3944f28b42e2b83e8635d332df3ddf4831eaf698ac5ce61a26a4848a008dbec',
      normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'}),
  });
});
