(() => {
'use strict';

const resourceVersion='0.0.816',battleMode=921,eventMode=208,difficulty=1;
const tableSHA256={
 shilian_event_exam:'ece4724433f17119fbf5b29da9ba9cea75a0d564388abe695cb389a13f3a3df7',
 shilian_liudao:'a844aea0c9cb52aaeac319043e8bf60f8b1b885eb3b3cdc4a16d4bcd9e0aef9e',
 pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
 BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
};
const eventTableSHA256='16b323010f26def2b0db1b1b589e9f0151b82a80e5b5b0d293335613fb07d0eb';
const eventSceneIds=[469102,469109,469111,469112,469114,469115];
const trials=[
 {stageId:700036,dao:1,sceneId:469103,codeStageId:110150,eligible:[219,234,252],
  engine:'ShiLianYueDuEngine',sha256:'875bca1a805f379d5baf5499e8962325202e3e1d8a38dd7dc292fd03a21ead00',
  phases:[{sceneId:469103,bossId:6510589,position:1},{sceneId:469104,bossId:6511589,position:1}]},
 {stageId:700133,dao:2,sceneId:469110,codeStageId:110151,eligible:[217,264,238],
  engine:'ShiLianXunXiangXingEngine',sha256:'68eb9bb6141837fa993c166875822fea2f4082c7527f3f7b032d15bbabd531ad'},
 {stageId:700235,dao:3,sceneId:128,codeStageId:110152,eligible:[266,262,202],
  engine:'ShiLianJiEngine',sha256:'ece31c20d8510a7314eae3952426d03fd9936f2d084574d3113683ddb10ee9c9'},
 {stageId:700332,dao:4,sceneId:469113,codeStageId:110153,eligible:[265,201,209],
  engine:'ShiLianSPYunWaiJingEngine',sha256:'ea32cf8e530d20d6f61732d6d63d3d9d493a3e5ccf9d1a1e540668a605416ecf'},
 {stageId:700432,dao:5,sceneId:134,codeStageId:110154,eligible:[248,223,208],
  engine:'ShiLianYanLingEngine',sha256:'883252dbba2ba097575f21d92684bf810766b02d7f3a6c334f706d013d3c2d4b'},
 {stageId:700534,dao:6,sceneId:44154,codeStageId:110155,eligible:[259,254,249],
  engine:'ShiLianKongQueMingWangEngine',sha256:'25aaedad16cb1f1e317a1b9680790ad7c52efa99afc17b91130264dfb2e999fc'},
];
const routes=Object.fromEntries(trials.map(trial=>[trial.stageId,trial]));
const byDao=Object.fromEntries(trials.map(trial=>[trial.dao,trial]));
const eventRoute=stageId=>{
 const dao=Math.floor(stageId/100)-6999,trial=byDao[dao];
 if(!trial)return null;
 return {dao,sceneId:eventSceneIds[dao-1],eligible:trial.eligible,codeStageId:trial.codeStageId,engine:trial.engine,sha256:trial.sha256};
};
const value={resourceVersion,battleMode,eventMode,difficulty,tableSHA256,eventTableSHA256,routes,eventRoute};
if(typeof module==='object'&&module.exports)module.exports=value;
else globalThis.AtlasSixRealmsExams=value;
})();
