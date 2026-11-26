/* Dedicated experience and coin encounters in client 0.0.816. */
((root)=>{
 'use strict';
 const rules={
  resourceVersion:'0.0.816',
  engineSHA256:'b28f2dd8720d52fad468846119c8108e2c6bbd7821dde4d3206dec6be3d5833a',
  tableSHA256:{
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
   Constant:'41f1b29a54f6105bd47d75dcefaf9b5e4451fc6f54703c055d3c5a65c1e40b56',
  },
  firstExperience:{stageId:2111,groupId:2111,sceneId:400221,battleMode:528,memberCount:5,requiredKills:30,deadlineSeconds:150,
   enemy:{id:14442,level:10,hp:1063.2,speed:88,attack:166,defense:94,critRate:0.1}},
  isResourceStage:row=>row?.name==='经验副本'||row?.name==='金币副本',
 };
 if(typeof module==='object'&&module.exports)module.exports=rules;
 else root.AtlasResourceEncounters=rules;
})(typeof globalThis==='object'?globalThis:this);
