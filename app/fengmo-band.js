(function(root,factory){
 const data=factory();
 if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasFengmoBand=data;
})(globalThis,function(){
 'use strict';
 const stageBase=501029,battleMode=5002;
 const together={
  battleMode:5001,teamType:634,onlineStages:[510001,510002],stages:[510003,510004],
  scenes:[43004,43005],monsters:[5100014,5100015],rhythmSeconds:[43.5,47.4],
  thresholds:[[500,1000,2000],[1000,3000,5000]],
  engine:{name:'LongCheMusicBossEngine',route:'fengmo-band-together-practice',
   sha256:'043e0453477e1b4e975ec679e4022ef99fe89b4f5bfd504ad2515a01e5344c4c'},
  routeSHA256:'032489bcde87c8cfebb08afb85f27bf8114dcb3d343d2169a3b83b4d3ed541bd',
  validScores:scores=>Array.isArray(scores)&&scores.length===2&&
   scores.every(score=>Number.isSafeInteger(score)&&score>=0),
 };
 return {
  resourceVersion:'0.0.816',battleMode,teamType:633,sceneId:43006,deadlineSeconds:180,actorOnlyBuff:66055,
  together,
  isStage:id=>Number.isSafeInteger(id)&&id>stageBase&&id<=stageBase+60,
  bossFor:id=>id-stageBase,
  engine:{name:'LongCheMusicBossSingleEngine',route:'fengmo-band-personal-boss',
   sha256:'d64c043ec24f0c1d221b1d46c5039e3241a4a839e2153cbc3226cd4f8b88f05d'},
  routeSHA256:'d0a63b106cb5bbf7f0e284bdccdabc3383ee0693d539a2d0800c4f61db3575a1',
  tableSHA256:{
   fengmo_band_personal_boss:'797b09eee8a0286d911fb73f953c3d21400d300853b19ff24b914e9fba5571e2',
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111'
  },
  togetherSource:{resourceVersion:'0.0.816',tableSHA256:{
   fengmo_band_together_battle:'ce4b3bc2f7441378ca87feb594f88c7b623a06e042e975bf8a486dc435f437ea',
   fengmo_band_constant:'a4772187ba0345e0f7a2280bc2e41c68fa78dbc7be21acefbe7b4f3e348e8ef8',
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  }}
 };
});
