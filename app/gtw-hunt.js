((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasGtwHunt = source;
})(globalThis, () => {
  'use strict';
  const huntMode=936,eventMode=933,barrierMode=935;
  const sceneId=44136,huntStage=814000,floorId=50,deadlineSeconds=3600,unlinkedStage=812100;
  const modes=Object.freeze([huntMode,eventMode,barrierMode]);
  const eventStages=Object.freeze({
    2:[812101,1],4:[812103,1],5:[812102,1],9:[812101,1],11:[812000,1],12:[812000,1],16:[812103,1],
    27:[812101,2],28:[812102,2],29:[812103,2],30:[812103,2],31:[812101,2],32:[812001,2],33:[812001,2],
    43:[812103,3],44:[812102,3],45:[812103,3],46:[812103,3],47:[812002,3],48:[812002,3],
  });
  function story(eventId){
    if(!Number.isSafeInteger(eventId)||!Object.hasOwn(eventStages,eventId))return null;
    const [stageId,chapterId]=eventStages[eventId];
    const barrier=stageId<812100;
    return {stageId,activityId:8778,chapterId,eventId,eventType:barrier?4:2,battleMode:barrier?barrierMode:eventMode};
  }
  function route(battleMode,stageId,eventId){
    if(battleMode===huntMode)return stageId===huntStage&&eventId===undefined?{activityId:8884,floorId}:null;
    const entry=story(eventId);
    return entry?.stageId===stageId&&entry.battleMode===battleMode?entry:null;
  }
  function ownsStage(stageId){
    return stageId===huntStage||stageId===unlinkedStage||Object.values(eventStages).some(r=>r[0]===stageId);
  }
  function validReport(report,eventId){
    const entry=route(report.battleMode,report.stageId,eventId),data=report.gtwHunt;
    return !!entry&&report.sceneId===sceneId&&report.waveCount===1&&report.formationsVerified===1&&
      data?.activityId===entry.activityId&&data.floorId===entry.floorId&&data.eventId===entry.eventId&&
      data.chapterId===entry.chapterId&&data.eventType===entry.eventType&&data.deadlineSeconds===deadlineSeconds&&
      typeof data.timedOut==='boolean'&&(!data.timedOut||report.outcome==='loss')&&
      Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&data.combatSeconds<=report.engineSeconds;
  }
  return Object.freeze({resourceVersion:'0.0.816',huntMode,huntStage,floorId,sceneId,unlinkedStage,
    modes,deadlineSeconds,story,route,ownsStage,validReport,
    engine:Object.freeze({name:'SpGtwNormalEngine',route:'gtw-hunt-original-solo',
      sha256:'023bf05d26f24e408748f7c55a8a46b9a05cc55e758b6240f4ab48fe637a96e6'}),
    tableSHA256:Object.freeze({
      activity_tower_act:'6fd136376f2bff0a0ebe572e1897f74f5fdd1f1b89488db5139cb68d2df8db85',
      activity_tower_floor:'903f11674bf6c5b403d6bec65864bc25c25f8125fa8d09b96c30b316197ef0c6',
      run_group_event:'2e991997a054258b494f1602b4f42bcd90ce5a9de4355acbf6915bfb36231131',
    }),
  });
});
