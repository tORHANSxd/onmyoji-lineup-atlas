((root,factory)=>{
 const common=typeof module==='object'&&module.exports;
 const source=factory(common?require('./qiling-group-openings.js'):root.AtlasQiLingGroups);
 if(common)module.exports=source;
 else root.AtlasQiLingGroupCapture=source;
})(globalThis,group=>{
 'use strict';
 const battleMode=1042,sceneId=800007,firstStage=810006;
 const recommended=Object.freeze({100:389,101:252,102:265,103:347});
 const items=Object.freeze({777800:'百物式盘',777801:'千咒式盘',777802:'万象式盘'});

 function entry(configId){
  const route=group.routes[configId];
  if(!route)return null;
  return {...route,groupId:firstStage+route.spiritId-100};
 }

 function isCatchStage(id){
  return Number.isInteger(id)&&id>=firstStage&&id<firstStage+4;
 }

 function validSelection(selection){
  return !!selection&&Object.keys(selection).length===2&&Number.isSafeInteger(selection.itemId)&&
   Object.hasOwn(items,selection.itemId)&&Array.isArray(selection.cards)&&selection.cards.length===3&&
   new Set(selection.cards).size===3&&Array.from(selection.cards).every(slot=>Number.isInteger(slot)&&slot>=1&&slot<=5);
 }

 function validReport(report,selection,plan){
  const route=entry(report.stageId),data=report.qilingCatch;
  return !!route&&validSelection(selection)&&plan.members.length===5&&report.battleMode===battleMode&&
   report.groupId===route.groupId&&report.sceneId===sceneId&&report.formationsVerified===1&&report.waveCount===1&&
   report.wavesCleared===0&&report.completed===false&&data?.state==='awaiting-server'&&data.success===null&&
   data.configId===report.stageId&&data.spiritId===route.spiritId&&data.enemyId===route.enemyId&&data.star===6&&
   data.itemId===selection.itemId&&Array.isArray(data.markIds)&&data.markIds.length===3&&
   data.markIds.every(id=>Number.isSafeInteger(id)&&id>0)&&Array.isArray(data.cards)&&data.cards.length===3&&
   selection.cards.every((slot,i)=>{
    const card=data.cards[i],heroId=Number(plan.members[slot-1].hero.heroId);
    return card?.slot===slot&&card.heroId===heroId&&card.recommended===(heroId===recommended[route.spiritId]);
   });
 }

 return Object.freeze({resourceVersion:group.resourceVersion,battleMode,sceneId,items,recommended,entry,isCatchStage,
  validSelection,validReport,
  engine:Object.freeze({name:'QiLingGroupBossCatchEngine',route:'qiling-collective-capture-client',
   sha256:'7f93c2e660fd478276ff8aad1e2539335bed9f15953e16f983e0d66e739bc4c0'}),
  tableSHA256:Object.freeze({...group.tableSHA256,
   hunling_prop:'3a055381f92e59f464a368b875c972003ba1d81ba63ab405ddf58098a2896272',
   hunling_weak_soul:'43d0789937f8fc7d2a20732b6a0b87af41036d20f42943ab1305c4c7fa9a030c'})});
});
