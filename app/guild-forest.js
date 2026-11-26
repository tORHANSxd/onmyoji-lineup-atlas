/* Forest of Secrets encounter tables and native single-team registration. */
(() => {
 'use strict';
 const data={
  resourceVersion:'0.0.816',battleMode:813,teamType:668,deadlineSeconds:180,
  isStage:id=>Number.isSafeInteger(id)&&id>=500300&&id<=500560,
  types:{1:'普通怪',2:'精英',3:'首领',4:'巢穴',5:'宝箱'},
  terrainSkills:{61150:61154,61151:61155,61152:61156},
  terrainNames:{61154:'深林',61155:'崇山',61156:'激流'},
  tableSHA256:{
   guild_fake_god_event:'1e69baca28a0947db81247d442992c76335cd8d1694e5c3f9febad0085b06ed4',
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  },
  routeSHA256:'cb19cca59409fd901e213dc1107852dac00bf0a07fe592af549eca0b5f0351d4',
  engine:{name:'GuildFakeGodEngine',route:'guild-forest-single-team',
   sha256:'1327a27badce8be5e7df60f37d8dafc5741ddcd4d146d1b9e6aa4365f93060d7'},
 };
 if(typeof module==='object'&&module.exports)module.exports=data;
 else globalThis.AtlasGuildForest=data;
})();
