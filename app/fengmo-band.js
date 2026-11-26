(function(root,factory){
 const data=factory();
 if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasFengmoBand=data;
})(globalThis,function(){
 'use strict';
 const stageBase=501029,battleMode=5002;
 return {
  resourceVersion:'0.0.816',battleMode,teamType:633,sceneId:43006,deadlineSeconds:180,actorOnlyBuff:66055,
  isStage:id=>Number.isSafeInteger(id)&&id>stageBase&&id<=stageBase+60,
  bossFor:id=>id-stageBase,
  engine:{name:'LongCheMusicBossSingleEngine',route:'fengmo-band-personal-boss',
   sha256:'d64c043ec24f0c1d221b1d46c5039e3241a4a839e2153cbc3226cd4f8b88f05d'},
  routeSHA256:'d0a63b106cb5bbf7f0e284bdccdabc3383ee0693d539a2d0800c4f61db3575a1',
  tableSHA256:{
   fengmo_band_personal_boss:'797b09eee8a0286d911fb73f953c3d21400d300853b19ff24b914e9fba5571e2',
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111'
  }
 };
});
