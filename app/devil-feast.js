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
 return {
  resourceVersion:'0.0.816',battleMode:445,teamType:190,stage,
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
