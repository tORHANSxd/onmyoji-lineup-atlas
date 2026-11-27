((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasGtwBoss = source;
})(globalThis, () => {
  'use strict';
  const battleMode=934,sceneId=44135,maxHp=1005053940000000,windowLimit=180,rewardMinimum=4000000;
  const stages=Object.freeze({
    813000:Object.freeze({phase:1,bossId:46102,minHp:maxHp/2,maxHp,defaultHp:maxHp}),
    813001:Object.freeze({phase:2,bossId:46103,minHp:1,maxHp:maxHp/2-1,defaultHp:maxHp/2-1}),
  });
  function validHp(hp,stage){
    return !!stage&&(hp===null||Number.isSafeInteger(hp)&&hp>=stage.minHp&&hp<=stage.maxHp);
  }
  function validWindow(seconds){
    return Number.isInteger(seconds)&&seconds>=1&&seconds<=windowLimit;
  }
  function validSettings(settings,stage){
    return !!settings&&Object.keys(settings).length===2&&validHp(settings.hp,stage)&&validWindow(settings.windowSeconds);
  }
  function validReport(report,settings){
    const stage=stages[report.stageId],data=report.gtwBoss;
    return validSettings(settings,stage)&&report.sceneId===sceneId&&report.waveCount===1&&report.formationsVerified===1&&
      data?.phase===stage.phase&&data.bossId===stage.bossId&&data.nativeLimitSeconds===windowLimit&&
      data.sharedMaxHp===maxHp&&data.startHp===(settings.hp??stage.defaultHp)&&
      Number.isFinite(data.remainingHp)&&data.remainingHp>=0&&data.remainingHp<=maxHp&&
      data.windowSeconds===settings.windowSeconds&&Number.isFinite(data.combatSeconds)&&data.combatSeconds>=0&&
      data.combatSeconds<=report.engineSeconds&&typeof data.windowExpired==='boolean'&&
      (!data.windowExpired||data.windowSeconds<windowLimit&&Math.abs(data.combatSeconds-data.windowSeconds)<=0.02)&&
      typeof data.nativeTimedOut==='boolean'&&Number.isSafeInteger(data.damage)&&data.damage>=0&&
      data.meetsRewardMinimum===(data.damage>=rewardMinimum)&&
      data.defeated===(report.completed&&data.remainingHp===0)&&typeof data.cleared==='boolean'&&
      (!data.cleared||data.defeated)&&report.wavesCleared===Number(data.cleared);
  }
  return Object.freeze({resourceVersion:'0.0.816',battleMode,sceneId,maxHp,windowLimit,rewardMinimum,stages,
    validHp,validWindow,validSettings,validReport,stakeId:2,progressId:7,
    engine:Object.freeze({name:'SpGtwBossEngine',route:'gtw-boss-local-shared-hp',
      sha256:'f5a75e507f106cd7d259eb1915be99fdcfbda8d963a457bd45732a7c9bf6f380'}),
    tableSHA256:Object.freeze({
      stake_boss:'60ab59f169fd58ec7d2af41cafa702234c7548b7acdcd08a94b7ee158348cd4d',
      global_progress:'9c7ac5c2bce0a786f68753c8194380668f514df9da2497eb4771df1080fb6e76',
      normal_battle_constant:'f6c26741f76448d131bcb63083e0c9a4e6e9fd0fec6ce2dd1d91ea8d63a45e38',
    }),
  });
});
