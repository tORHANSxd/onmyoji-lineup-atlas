(() => {
'use strict';

const routes={
 731001:{challengeId:1,enemies:[[1,7203000],[2,7024290],[3,7024329],[4,7024276],[5,7024287],[6,7024306]]},
 731002:{challengeId:2,enemies:[[1,7203001],[5,7024301],[6,7024296]]},
 731004:{challengeId:3,enemies:[[1,7203003],[2,7024221],[4,7024251],[5,7024331],[6,7024217]]},
 731003:{challengeId:4,enemies:[[1,7024335],[3,7024253]]},
 731005:{challengeId:5,enemies:[[1,7024332],[2,7024321],[3,7024330],[4,7024220],[5,7024262],[6,7024312]]},
};
const boss={
 resourceVersion:'0.0.816',battleMode:409,stageId:731010,sceneId:50015,memberCount:5,
 baseSeconds:180,drumSeconds:60,maxDrums:9,timeBuffId:29,timeBuffSeconds:30,
 enemies:[[1,7203014],[2,7025332],[3,7203005],[4,7025335],[5,7203012],[6,7203011]],
 buffIds:Array.from({length:30},(_,i)=>i+1),
 engineSHA256:'93155e18b620983af75bfd3d3abfca600a8412322a6534695dcd5dbf8fba96b4',
 tableSHA256:{
  defence_dungeon_multiple_buff:'77f390271d15a5dd3e791d4d5cf38638ee74d1d8241cf141cd85026f6944438f',
  pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
  BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  Constant:'41f1b29a54f6105bd47d75dcefaf9b5e4451fc6f54703c055d3c5a65c1e40b56',
 },
};
boss.validSettings=settings=>settings&&Number.isInteger(settings.remainingDrums)&&settings.remainingDrums>=0&&
 settings.remainingDrums<=boss.maxDrums&&Array.isArray(settings.buffIds)&&
 Array.from(settings.buffIds).every(id=>boss.buffIds.includes(id));
boss.deadlineSeconds=settings=>boss.baseSeconds+settings.remainingDrums*boss.drumSeconds+
 settings.buffIds.filter(id=>id===boss.timeBuffId).length*boss.timeBuffSeconds;
const value={resourceVersion:'0.0.816',battleMode:402,sceneId:50015,memberCount:5,blessingSkill:799,routes,
 boss,
 engineSHA256:'8187430f673787f702577fb3c292d6cafe2517bd46800e9befe44dd16dee90de',
 tableSHA256:{
  journey_hardbattle:'3f7d8b87ea68bbfccd133ae38e7a12000dedda113eb55120696e5593fc143623',
  pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
  BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  Constant:'41f1b29a54f6105bd47d75dcefaf9b5e4451fc6f54703c055d3c5a65c1e40b56',
 },
};
if(typeof module==='object'&&module.exports)module.exports=value;
else globalThis.AtlasJourneyHard=value;
})();
