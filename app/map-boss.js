/* Versioned map boss routes shared by the catalog and offline runner. */
((root)=>{
 'use strict';
 const tableSHA256={
  map_boss:'d88b6c83b76e7daa399684185869702a2e4e94f179dc58f0c9cb8b718f8e2a2f',
  pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
  BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
 };
 const routes=[
  {base:14400,entries:[69],label:'石距',kind:'stone',sceneId:44,enemies:[23]},
  {base:25300,entries:[73],label:'愤怒的石距',kind:'angryStone',sceneId:40055,enemies:[9991101,9997247,9998247]},
  {base:14600,entries:[70,75],label:'年兽',kind:'yearBeast',sceneId:51,enemies:[30]},
  {base:16100,entries:[74],label:'年兽·历史春节档',kind:'yearBeast',sceneId:51,enemies:[30,...Array(5).fill(9991111)]},
 ];
 const stages=Object.fromEntries(routes.flatMap(route=>Array.from({length:9},(_,i)=>
  [route.base+i,{...route,level:10+5*i}])));
 const rules={resourceVersion:'0.0.816',battleMode:3000,tableSHA256,stages,
  positions:{2:[[5,6],[2,3,4]],3:[[3],[2,5],[4,6]]},
  engineSHA256:'d11c14d3eb97e361bee50a58ac8666a56f3332b484e851a8dde36a80c7fe53b4',
 };
 if(typeof module==='object'&&module.exports)module.exports=rules;
 else root.AtlasMapBoss=rules;
})(typeof globalThis==='object'?globalThis:this);
