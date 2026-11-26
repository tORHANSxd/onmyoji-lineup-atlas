/* Versioned map boss routes shared by the catalog and offline runner. */
((root)=>{
 'use strict';
 const tableSHA256={
  map_boss:'d88b6c83b76e7daa399684185869702a2e4e94f179dc58f0c9cb8b718f8e2a2f',
  pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
  BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
 };
 const bossMode=3000,sealMode=855;
 const bossRoutes=[
  {base:14400,entries:[69],label:'石距',kind:'stone',sceneId:44,ids:[[23]]},
  {base:25300,entries:[73],label:'愤怒的石距',kind:'angryStone',sceneId:40055,ids:[[9991101,9997247,9998247]]},
  {base:14600,entries:[70,75],label:'年兽',kind:'yearBeast',sceneId:51,ids:[[30]]},
  {base:16100,entries:[74],label:'年兽·历史春节档',kind:'yearBeast',sceneId:51,ids:[[30,...Array(5).fill(9991111)]]},
 ];
 const sealRoutes=[
  [1000,[1],'跳跳哥哥',[[14404,11404,12404,13404],[14405,14408,11407,12408],[13233,14406,14407,14407,233,233]]],
  [1100,[2],'椒图',[[14406,11404,12404,13404],[14405,14404,11404,12404],[13234,11404,12406,13404,234,234]]],
  [1200,[3],'骨女',[[14408,11408,12408,13408],[14405,14404,11404,12404],[13223,14404,11404,12404,223,223]]],
  [1300,[4],'饿鬼',[[14409,11404,12404,13404],[14403,11404,12404,13404],[13214,14245,11245,12245,214,214]]],
  [1400,[5],'二口女',[[14408,14407,11407,12407],[14245,11408,12408,13408],[13263,14245,11245,12245,263,263]]],
  [1500,[6],'海坊主',[[14245,11406,12406,13406],[11407,10405,10404,12405],[13247,14245,11245,12245,247,247]]],
  [1600,[7],'鬼使黑',[[14405,11409,12409,13409],[14409,11408,12408,13408],[13211,14245,11245,12245,211,211]]],
  [1900,[63,64,65,66,67,68],'姑获鸟·历史活动',[[14405,14409,11409,12409],[14409,11408,12408,13408],[99262,14245,11245,12245,262,262]]],
  [2200,[101,102,103,104,105,106,107,108,109,110,111,112,113,114,115],'小松丸',
   [[14405,14409,11409,12409],[14409,11408,12408,13408],[99290,14245,11245,12245,290,290]]],
  [16000,[117],'日和坊',[[10297,12244,12285,12244],[10297,12261,17205,17201],[11297,18265,17219,12277,12278,12266]]],
 ].map(([base,entries,name,ids])=>({base,entries,label:'妖气封印 · '+name,kind:'seal',sceneId:39,ids}));
 const buildStages=(routes,battleMode)=>routes.flatMap(({ids, ...route})=>Array.from({length:9},(_,i)=>{
  const level=10+5*i,stageId=route.base+i;
  const waves=ids.map((wave,waveIndex)=>wave.map((id,slot)=>{
   // 椒图最低档第二波第三位保留原表的 1 级。
   const enemyLevel=stageId===1100&&waveIndex===1&&slot===2?1:
    Math.min(40,level-(battleMode===sealMode&&slot>0?3:0));
   return [slot+1,id,enemyLevel];
  }));
  return [stageId,{...route,battleMode,level,waves}];
 }));
 const stages=Object.fromEntries([...buildStages(bossRoutes,bossMode),...buildStages(sealRoutes,sealMode)]);
 const rules={resourceVersion:'0.0.816',battleModes:[bossMode,sealMode],sealMode,tableSHA256,stages,
  positions:{2:[[5,6],[2,3,4]],3:[[3],[2,5],[4,6]]},
  engineSHA256:'d11c14d3eb97e361bee50a58ac8666a56f3332b484e851a8dde36a80c7fe53b4',
 };
 if(typeof module==='object'&&module.exports)module.exports=rules;
 else root.AtlasMapBoss=rules;
})(typeof globalThis==='object'?globalThis:this);
