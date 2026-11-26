(() => {
 'use strict';
 const recruitIds=[200,201,205,232,237,249,251,260,262,280,295,300,311,335,339,347,354,372,379,383,395,586,591,594,601,602];
 const route={
  resourceVersion:'0.0.816',battleMode:6089,teamType:6089,actorId:80611,actorLevel:40,
  actorName:'大天狗·高天铁羽',deadlineSeconds:180,maxMasks:500,maskRecipients:[217,315,611,80611],
  recruitLevels:Object.fromEntries(recruitIds.map(id=>[id,40])),
  routeSHA256:'4bd6d10c2958c347d8a2e474b50d640f18ad9493112e5c575efd56dd71b02d55',
  engine:{name:'URDTGExploreBattleEngine',route:'urdtg-map-exploration',
   sha256:'84b2da8084f7f2ac0a8967276d6309d1322d813e84667af7367996a196aa4b8f'},
  tableSHA256:{
   urdtg_dungeon_battle:'c217c0378cb90674b6664f456b4d50be598ad901bd1d436417359367b06b79fe',
   urdtg_hero:'2a54b003e8aa40c18da599080449fd8b7d18f9c5eb0e8ba6d757180e3070ac7c',
   urdtg_hero_attr:'2cfaf40ecb3f5d18a14f6e0ef5cd64981d3d0a4759f9f3cb4891ac9ee8fc4e83',
   urdtg_const:'eb7b817c48e4fbbe577a1c23f87dae84eeb250746ca6bd5df6f12a9ec65d13f7',
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  },
  training:{
   activityId:12232,battleMode:6092,teamType:6087,stageId:510014,codeStageId:101014,sceneId:43017,
   formation:[51014217,51014200,51014201,51014203,51014205,51014206],
   routeSHA256:'2aa31019f3119edf9feddace9fd2f45bf14e0553dd53df87db97c895d5370f5c',
   engine:{name:'UrDTGTrainBattleEngine',route:'urdtg-training',
    sha256:'2e755a908a69c6aed5b356f9d870472c3ecd6b28b38ac7470e96fb02396f348c'},
  },
  isStage:id=>Number.isSafeInteger(id)&&(id>=12140016&&id<=12140033||id>=12140036&&id<=12140038),
  validPlan(plan){
   const {actorLevel,skillLevel,masks,members}=plan??{};
   return actorLevel===40&&route.validConditions({skillLevel,masks})&&Array.isArray(members)&&members.length>=1&&members.length<=5&&
    members.every(row=>Array.isArray(row)&&row.length===2&&recruitIds.includes(row[0])&&row[1]===40)&&
    new Set(members.map(([id])=>id)).size===members.length;
  },
  validConditions(settings){
   const {skillLevel,masks}=settings??{};
   return Number.isSafeInteger(skillLevel)&&skillLevel>=1&&skillLevel<=3&&
    Number.isSafeInteger(masks)&&masks>=0&&masks<=route.maxMasks;
  },
 };
 if(typeof module==='object'&&module.exports)module.exports=route;
 else globalThis.AtlasUrDtgExplore=route;
})();
