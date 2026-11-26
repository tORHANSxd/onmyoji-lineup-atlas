(() => {
'use strict';

const tianfa={resourceVersion:'0.0.816',battleMode:2600,engine:'TianFaBattleEngine',route:'tianfa-solo',
 engineSHA256:'41cbda284f4f2952ad20a5c63688cffa91c9c18da926633f0aaefe288aac3080',
 sceneId:2735048,codeStageId:100969,memberCount:6,
 tableSHA256:{
  xinghen_battle:'7f86b8a49598e96fd2d177e9c10ce18b678412054a99dcd0e4c6b376b02c7a5c',
  pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
  BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66',
 },
 stages:{
  2716061:{difficulty:1,name:'普通',boss:26030002,adds:26020005},
  2716062:{difficulty:2,name:'困难',boss:26030003,adds:26020006},
  2716063:{difficulty:3,name:'梦魇',boss:26030004,adds:26020007},
 },
};
const enemySlots=[1,3,4,5,6];
tianfa.formation=stage=>enemySlots.map(position=>[position,position===1?stage.boss:stage.adds]);
if(typeof module==='object'&&module.exports)module.exports=tianfa;
else globalThis.AtlasTianfa=tianfa;
})();
