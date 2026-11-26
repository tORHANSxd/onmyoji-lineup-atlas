(function(root,factory){
 const data=factory();
 if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasDevilFeast=data;
})(globalThis,function(){
 'use strict';
 const ranged=(id,min,max)=>Number.isSafeInteger(id)&&id>=min&&id<=max;
 function stage(id){
  if(ranged(id,450200,450207))return {kind:'farm',table:'devil_battle',configId:id-450199,seconds:600,sceneId:51,elite:false};
  if(ranged(id,450210,450213))return {kind:'farm',table:'devil_battle',configId:id-450201,seconds:600,sceneId:51,elite:true};
  if(ranged(id,450215,450230)){
   const offset=id-450215;
   return {kind:'encounter',table:'devil_feast_event5',configId:(offset%4)*4+Math.floor(offset/4)+1,seconds:120,sceneId:1063};
  }
  if(ranged(id,450231,450238))return {kind:'boss',table:'devil_feast_event6',configId:id-450230,seconds:120,sceneId:1062};
  return null;
 }
 function towerStage(id){
  if(ranged(id,461001,461176))return {kind:'group',label:'妖灵退治群体战',table:'feast_for_devils_tower_event1',seconds:0};
  if(ranged(id,463001,463130))return {kind:'solo',label:'妖灵退治单体战',table:'feast_for_devils_tower_event1_danti',seconds:0};
  if(ranged(id,462026,462176))return {kind:'boss',label:'鬼王来袭',table:'feast_for_devils_tower_event1_boss',seconds:120,configId:id-462025};
  return null;
 }
 function validTowerSettings(settings,kind){
  if(!settings||Object.keys(settings).some(key=>!['blessings','factions','enemyHp'].includes(key)))return false;
  const {blessings,factions,enemyHp}=settings;
  if(!Array.isArray(blessings)||blessings.length>6||!Array.from(blessings).every(row=>
   Array.isArray(row)&&row.length===2&&ranged(row[0],1,18)&&ranged(row[1],1,11))||
   new Set(blessings.map(row=>row[0])).size!==blessings.length||!validFactions(factions))return false;
  return !Object.hasOwn(settings,'enemyHp')||kind==='boss'&&Array.isArray(enemyHp)&&enemyHp.length===6&&
   Array.from(enemyHp).every(hp=>typeof hp==='number'&&hp>=0&&hp<=Number.MAX_SAFE_INTEGER)&&enemyHp.some(Boolean);
 }
 function validFactions(factions){
  return Array.isArray(factions)&&Array.from(factions).every(id=>ranged(id,1100,1105))&&new Set(factions).size===factions.length;
 }
 const tower={
  resourceVersion:'0.0.816',battleMode:502,teamType:211,stage:towerStage,validSettings:validTowerSettings,
  blessingIds:Array.from({length:18},(_,i)=>i+1),factionIds:Array.from({length:6},(_,i)=>1100+i),
  engine:{name:'GhostKingEngine',route:'ghost-king-tower-archive',
   sha256:'1ffefd1ad7410850c8956b21b6c243a358813367515f52b2f9aefeb7752d3f85'},
  routeSHA256:'f43f433d0ac4037dfa138f76d193df89d1b77c73f0347fc22cc96b8ea437bf0c',
  tableSHA256:{
   feast_for_devils_tower_event1:'501ece59f5781daacdfb28ea77ccc30ff15ee2f2378489c5483d70a29c512264',
   feast_for_devils_tower_event1_danti:'bf758528a756e221aa91a50cad5378fcf734d7d7b3480a0087d2aeb082eefcce',
   feast_for_devils_tower_event1_boss:'d04b030fed1648c6b6f24e362475cc59ddeaacea6496fa0de96ddc991b7a36e3',
   feast_for_devils_tower_event6:'770b3db477b271dfe81c4a355938972abd89e8825ae03c69e498a190fd1ae2ae',
   feast_for_devils_dawnexpedition:'9f87699dbbc119126bcc42ea699d929beee1cfd3850b6d9dcce70c6cf355f40b',
   feast_for_devils_const:'56121d8b95f51421b859da1fa489df05cc1409b54a06bee9c3159b659f22a676',
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  },
 };
 const laolao={
  resourceVersion:'0.0.816',battleMode:503,teamType:213,sceneId:400205,memberCount:5,deadlineSeconds:180,
  fusionStageId:460000,eventTable:'feast_for_devils_tower_event7',faithTable:'feast_for_devils_tower_event6_b',
  faithIds:[1,2,3,4,5,6,7],factionIds:tower.factionIds,
  engine:{name:'JSHardEngine',route:'laolao-challenge-solo',
   sha256:'a5151052ddf183faa283c58de0cbb0a1660b2469aaf7955b080f8a12aa76761f'},
  routeSHA256:'acd6781b45eae54a90c245e1645b0a1ffbf0c35d33db4bcd6e618aa9723e3d0c',
  tableSHA256:{
   feast_for_devils_tower_event7:'38fbdb5e579ad26317547181a7ff245a3ffc1f58e4c806daeffc7f6ad4146c41',
   feast_for_devils_tower_event6_b:'1284803ff36003056b274994bafa63584d3c91d5f5206ae002a72020f077a7d9',
   feast_for_devils_dawnexpedition:tower.tableSHA256.feast_for_devils_dawnexpedition,
   feast_for_devils_const:tower.tableSHA256.feast_for_devils_const,
   pve_stage_data:tower.tableSHA256.pve_stage_data,
   BattleMonstersInfo:tower.tableSHA256.BattleMonstersInfo,
  },
  validSettings:settings=>settings&&Object.keys(settings).length===2&&Number.isSafeInteger(settings.faith)&&settings.faith>=0&&
   validFactions(settings.factions),
  stage:id=>{
   if(!ranged(id,462001,462024)||!ranged(id%10,1,4))return null;
   const ghost=id%10,difficulty=Math.floor((id-462000)/10)+1;
   return {ghost,difficulty,label:['简单','普通','困难'][difficulty-1],waveCount:ghost===1?3:1};
  },
 };
 return {
  resourceVersion:'0.0.816',battleMode:445,teamType:190,stage,tower,laolao,
  validHp:hp=>typeof hp==='number'&&Number.isFinite(hp)&&hp>0&&hp<=Number.MAX_SAFE_INTEGER,
  engine:{name:'DevilFeastEngine',route:'devil-feast-activity',
   sha256:'63b9fd2c3a691fd0cf5b0f1290d30bb08c8552873bcf86d25c865d669e9b7695'},
  routeSHA256:'62aafd67bed442898cf5755d300efe5c888944b27e1694207e0caa32406e62fa',
  tableSHA256:{
   devil_battle:'f92a158479df35fb011e93549b8ff57009bb5e430926781bf07bc525952e04ae',
   devil_feast_event5:'efba80263597811631f7269d7a9871a4d223080eb1331941b59b2e3e819a36be',
   devil_feast_event6:'4e4fb56d24369f673d01c9e1fd31300a2bca274bb46321a07a64f4e8d527e99c',
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  }
 };
});
