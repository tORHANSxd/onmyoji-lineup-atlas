/* Dedicated experience and coin encounters in client 0.0.816. */
((root)=>{
 'use strict';
 const firstExperience={stageId:2111,groupId:2111,sceneId:400221,battleMode:528,memberCount:5,requiredKills:30,deadlineSeconds:150,
  route:'resource-first-new-server-exp',engine:'NewExpEngine',ids:Array(6).fill(14442),
  enemy:{id:14442,level:10,hp:1063.2,speed:88,attack:166,defense:94,critRate:0.1}};
 const dailyExperience={stageId:2109,groupId:2109,sceneId:400221,battleMode:528,memberCount:5,requiredKills:30,deadlineSeconds:150,
  route:'resource-daily-exp-solo',engine:'NewExpEngine',ids:[14412,14413,14414,14415,14416,14417],
  reinforcementIds:[14418,14419,14420,14421,14422,14423,14424,14425,14426,14427,14428,14429,14430,14432,14433,14434,14435,14436,14437,14438,14439,14440,14441],
  enemy:{level:40,hp:108730.3,speed:98,attack:1339.5,defense:352,critRate:0.1}};
 const coin={stageId:2009,groupId:2009,sceneId:400233,battleMode:528,memberCount:5,deadlineSeconds:150,
  route:'resource-daily-coin-solo',engine:'NewCoinEngine',baseRange:[5000,7500],
  engineSHA256:'f84893f2cac8f541556a6da6f1aceb7f0f867c441ad01968f0916977e56194a8',
  enemy:{id:15232,level:40,hp:3624320.7,speed:98,attack:1875.3,defense:352,critRate:0.1}};
 const rules={
  resourceVersion:'0.0.816',
  engineSHA256:'b28f2dd8720d52fad468846119c8108e2c6bbd7821dde4d3206dec6be3d5833a',
  tableSHA256:{
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
   Constant:'41f1b29a54f6105bd47d75dcefaf9b5e4451fc6f54703c055d3c5a65c1e40b56',
  },
  firstExperience,dailyExperience,coin,
  routes:{2111:firstExperience,2109:dailyExperience,2009:coin},
  isResourceStage:row=>row?.name==='经验副本'||row?.name==='金币副本',
 };
 if(typeof module==='object'&&module.exports)module.exports=rules;
 else root.AtlasResourceEncounters=rules;
})(typeof globalThis==='object'?globalThis:this);
