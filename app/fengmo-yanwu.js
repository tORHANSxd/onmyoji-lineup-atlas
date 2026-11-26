(function(root,factory){
 const data=factory();
 if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasFengmoYanwu=data;
})(globalThis,function(){
 'use strict';
 const routes={
  325001:{actId:10265,bossId:122081,sceneId:40225,name:'土蜘蛛',memberCount:5},
  325002:{actId:10268,bossId:9675001,sceneId:1422616,name:'荒骷髅',memberCount:5,codeStageId:100917},
  325003:{actId:10709,bossId:3250030,sceneId:40020,name:'地震鲶',memberCount:5,codeStageId:100939},
  325004:{actId:10721,bossId:10990,sceneId:400101,name:'胧车',memberCount:5,codeStageId:100951},
  325005:{actId:10875,bossId:1087501,sceneId:4002273,name:'夜荒魂',memberCount:5,codeStageId:100968},
  325006:{actId:11779,bossId:1087601,sceneId:4006511,name:'鬼灵歌伎',memberCount:6,codeStageId:100978},
  325007:{actId:12779,bossId:1087701,sceneId:4006611,name:'蜃气楼',memberCount:5,codeStageId:101012},
 };
 return {
  resourceVersion:'0.0.816',battleMode:8238,teamType:8237,
  engineSHA256:'088e10cae439d7c7427e329efc99fd9a6d9c13d7b8e404dbd3bdf0cf8d3d47ec',
  tableSHA256:{
   act_team_battle:'544fb0f27d76eaa5efc3c5e31a6a58e46d0cba68a93463219f98c9e57155aa47',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
   normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66',
   team_assist_stage:'be09e09b10982685db13ae74b3ef617b910b02295f9d88ba6356d7b5618d6720',
  },
  routes,
 };
});
