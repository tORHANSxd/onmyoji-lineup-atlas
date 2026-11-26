(() => {
'use strict';

const trial={resourceVersion:'0.0.816',battleMode:2507,teamType:3507,actId:10771,
 activityRow:4,stageId:3504732,sceneId:5069600,codeStageId:100935,deadlineSeconds:180,memberCount:5,
 label:'将魂试炼',engine:'FakeGod7GeneralSoulBattleEngine',route:'general-soul-activity-solo',reportKey:'generalSoulTrial',
 enemies:[27988592,27988368,27988279,27988318,27988370,27988259],
 engineSHA256:'c337409be3a67ba594ad92f2f23df7ee0643a104dbd90f0c5137f4601670bcb8',
 tableSHA256:{
  act_team_battle:'544fb0f27d76eaa5efc3c5e31a6a58e46d0cba68a93463219f98c9e57155aa47',
  pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
  BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66',
 },
};
const legacy=Object.freeze(trial);
const soloFields={resourceVersion:trial.resourceVersion,tableSHA256:trial.tableSHA256,deadlineSeconds:300,
 memberCount:5,route:'solo-activity-score',reportKey:'activityScore'};
const snow={...soloFields,label:'雪山修行',battleMode:2069,teamType:3069,actId:11510,activityRow:58,
 stageId:7287242,sceneId:3064595,codeStageId:100973,
 enemies:[75294258,75294590,75294322,75294300,75294394,75294379],engine:'SijinshenGeneralSoulBattleEngine',
 engineSHA256:'e27732ffb01aa82a77ece359f26e77ccefcd3c5af278a2b9de640738bd167983'};
const instant={...soloFields,label:'刹那试炼',battleMode:6086,teamType:6086,actId:12440,activityRow:6082,
 stageId:3334472,sceneId:3647228,codeStageId:101009,
 enemies:[43483331,43483220,43483300,43483558,43483577,43483344],engine:'XiaoyeBaitiBattleEngine',
 engineSHA256:'cb98b0fd37d34f1be074ee91dedf39d3a032ea826123e60a71fb75f51d5a628a'};
const solo=[legacy,snow,instant];
const modes=Object.fromEntries(solo.map(row=>[row.battleMode,row]));
const stages=Object.fromEntries(solo.map(row=>[row.stageId,row]));
const encounters={...legacy,modes,stages};
if(typeof module==='object'&&module.exports)module.exports=encounters;
else globalThis.AtlasGeneralSoulTrial=encounters;
})();
