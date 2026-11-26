/* Eight-Hundred Tanuki battle registration and versioned map tables. */
(() => {
 'use strict';
 const battleMode=2182,teamType=3182;
 const stageRanges={
  2025:{1:[5114001,5114040],2:[5115001,5115014],3:[5116001,5116014],4:[5117001,5117001]},
  2026:{1:[5124001,5124034],2:[5125001,5125015],3:[5126001,5126001],4:[5127001,5127001],
   5:[5124035,5124037],6:[5124038,5124040]},
 };
 const types={1:'普通战斗',2:'精英挑战',3:'神社战斗',4:'首领战',5:'租借处',6:'传送门'};
 const stageMatches=(id,year,type)=>{
  const range=stageRanges[year]?.[type];
  return Number.isSafeInteger(id)&&range!==undefined&&id>=range[0]&&id<=range[1];
 };
 const data={resourceVersion:'0.0.816',battleMode,teamType,types,stageMatches,
  isStage:id=>Object.keys(stageRanges).some(year=>Object.keys(stageRanges[year]).some(type=>stageMatches(id,year,type))),
  deadlineSeconds:{1:60,2:120,3:120,4:180,5:60,6:60},
  tableSHA256:{
   dojo2025_bbbl_block_play:'d82bddb693b8e42a66b436ed05da4cc8ef53bdb6126cc655f1d8b4475652c330',
   dojo2026_bbbl_block_play:'93a19aa684ab028ad7063db2a945565b466efccbbe5635ff76f815f381957e19',
   dojo2025_bbbl_map:'7f12100e756a6c69ed0b74fe3b013852623091ea8bcc6ace5ed6c54e1ee888fa',
   dojo2026_bbbl_map:'68eadf27c644e84ae527f4a12ae898f537ef7d803caf108ed166d73c64f269d7',
   dojo2026_bbbl_const:'81ef6805894c589514667aa15f25bf1dbace5a64b6e84c4f18eaab0691b1c402',
   pve_stage_data:'7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
   BattleMonstersInfo:'8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
  },
  routeSHA256:'68303746756b34340758e803fa105e3207a51551ab6e6f2bc382bb236d7fc796',
  engine:{name:'DojoArea2025BattleEngine',route:'dojo-area-solo-score',
   sha256:'223488ec34289ba8c86d3ac114736c9c05a0d3b5179127535baadfcd2e5e9280'},
 };
 if(typeof module==='object'&&module.exports)module.exports=data;
 else globalThis.AtlasDojoArea=data;
})();
