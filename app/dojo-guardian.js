((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasDojoGuardian = source;
})(globalThis, () => {
  'use strict';
  const guardians=Object.freeze({
    40051:Object.freeze({id:1400001,adjustment:3600,maxHp:46598400}),
    40052:Object.freeze({id:1400002,adjustment:4200,maxHp:54364800}),
    40053:Object.freeze({id:1400003,adjustment:3600,maxHp:46598400}),
    40054:Object.freeze({id:1400004,adjustment:500,maxHp:6472000}),
  });
  const maxWindow=300;
  function validSettings(settings,guardian){
    if(!guardian||!settings||Object.keys(settings).length!==2)return false;
    const {hp,windowSeconds}=settings;
    return Number.isInteger(windowSeconds)&&windowSeconds>=1&&windowSeconds<=maxWindow&&
      (hp===null||Number.isSafeInteger(hp)&&hp>=1&&hp<=guardian.maxHp);
  }
  return Object.freeze({resourceVersion:'0.0.816',battleMode:4004,defenderMode:4003,codeStageId:10020203,
    maxWindow,guardians,validSettings,
    engine:Object.freeze({name:'JiejieTuPoGym2BossEngine',route:'dojo-guardian-shared-hp',
      sha256:'2ceb49173ceab8de60f98e42c23d8cbd517d2e79dedb5b58563af93d7aa57760'}),
    tableSHA256:Object.freeze({
      pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
      BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
      dg_guardian:'f5032e5a5871aa666e3dc7718e5ac990845481c3c9633f769af3b6ee99996773',
      battle_mode_routes:'861d63b9444ad4f787b3984964b2d280f358bbed312fc5a04ea524e9e6c62d52',
      team_assist_stage:'be09e09b10982685db13ae74b3ef617b910b02295f9d88ba6356d7b5618d6720',
    }),
  });
});
