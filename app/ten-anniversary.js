/* Shichangji's 2026 inventory battle routes and client-table signatures. */
(() => {
 'use strict';
 const tower=9591,encounter=9593;
 const range=(id,min,max)=>Number.isSafeInteger(id)&&id>=min&&id<=max;
 const modes={
  [tower]:{teamType:2320,codeStageId:100998,name:'TenAnniversaryTowerBattleEngine',route:'ten-anniversary-tower',
   routeSHA256:'13d7fe12f9310b10dbaf7dc26a8e6cfd71355fad99985055a92184d19305debc',
   sha256:'6fa68668f4c91f78be4d07ed3aec45cc190b27d16d650b373eab89c96429353a'},
  [encounter]:{teamType:2321,codeStageId:101000,name:'TenAnniversaryZYBattleEngine',route:'ten-anniversary-map-encounter',
   routeSHA256:'9ecf229aab10c45d304b23af2a083683239311b5d02fd75a0efc5483e554d66a',
   sha256:'9b17f0bcf05221bc3a5f5f7ca7de2d69a0dbdac3905ac188d916c97cf562bbff'},
 };
 const modeFor=id=>range(id,12130001,12130002)?tower:range(id,12130069,12130075)?encounter:null;
 const boss=id=>range(id,12135001,12135005);
 const exploration=id=>range(id,12130016,12130059);
 const bonuses={
  810242:'每回合对各敌人的首段伤害提高 50%',
  810243:'助战石长姬速度提高 120%，伤害提高 200%',
  810244:'友方回合结束后获得 20% 增伤，最多五层',
  810245:'友方造成伤害时无视 100 点防御',
 };
 const bossRoute={
  battleMode:9592,teamType:2322,codeStageId:100999,stageId:12135001,activityId:12135,deadlineSeconds:180,
  actor:{name:'石长姬',id:30608,configId:217,level:40,star:6,position:1},
  formationSizes:[6,6,4,4,6],firstSceneId:1115303,
  routeSHA256:'277cc0ed77214464447db15b15d676c4469b31d4278242d7ebc33785717a0604',
  engine:{name:'TenAnniversaryBossBattleEngine',route:'ten-anniversary-boss-score',
   sha256:'1862c6eff43a9aa5b9d57f3d44502ca99270076e4ee627616742b7f20fbf2f9b'},
  tableSHA256:{
   stake_boss:'60ab59f169fd58ec7d2af41cafa702234c7548b7acdcd08a94b7ee158348cd4d',
   normal_battle_yys_replace:'0ed028082bc8f51caa6343fe206f1320283782593afdb8b1898c0d2324d19c5d',
  },
 };
 const data={resourceVersion:'0.0.816',modes,modeFor,boss,exploration,bonuses,defaultBonus:810241,
  bossRoute,
  isStage:id=>modeFor(id)!==null||boss(id)||exploration(id),
  hard:id=>id===12130002,
  deadlineFor:id=>range(id,12130069,12130073)?300:modeFor(id)===null?null:180,
  validBonuses:ids=>Array.isArray(ids)&&ids.every((id,i)=>
   Number.isSafeInteger(id)&&Object.hasOwn(bonuses,id)&&(!i||ids[i-1]<id)),
  tableSHA256:{
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
   ten_anni_2026_const:'2050c002e95c694ffd912d0a298732e1f3349fd8e9b5ac7f8702da5b9689ab1c',
   ten_anni_2026_dungeon_battle:'64548f1d2dcf6fcb58d97da7f3fa1b87a8950853627e7d0bc6ec607f53e7bd1c',
   ten_anni_2026_event:'681b841397e8fe8ad2a4bba9400a667439dedd323cadeed8061265dc125d4b68',
  },
 };
 if(typeof module==='object'&&module.exports)module.exports=data;
 else globalThis.AtlasTenAnniversary=data;
})();
