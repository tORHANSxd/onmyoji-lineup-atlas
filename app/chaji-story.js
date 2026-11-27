((root,factory)=>{
 const source=factory();
 if(typeof module==='object'&&module.exports)module.exports=source;
 else root.AtlasChajiStory=source;
})(globalThis,()=>{
 'use strict';
 const fixed=Object.freeze({battleMode:9552,teamRoute:1214,sceneId:9806200,deadlineSeconds:180,
  engine:Object.freeze({name:'SPChaJiNormalStoryBattleEngine',route:'chaji-story-fixed-original',
   sha256:'d3b1229048e287caf241abc7caf9dff8b8e463b1a319ec729ab20d903d128fae'})});
 const special=Object.freeze({battleMode:9550,teamRoute:1277,sceneId:4002433,deadlineSeconds:300,
  engine:Object.freeze({name:'SPChaJiSpecialStoryBattleEngine',route:'chaji-story-special-original',
   sha256:'061d58281279f281806d0aa751f003bbdb382b2b7d675fe4ab50caa6e17bb63b'})});
 const modes=Object.freeze({[fixed.battleMode]:fixed,[special.battleMode]:special});
 const plots=Object.freeze({9808001:3,9808002:7,9808003:15});
 const specials=Object.freeze([1014101,1014102]);
 const entry=stageId=>Number.isSafeInteger(stageId)&&Object.hasOwn(plots,stageId)?fixed:specials.includes(stageId)?special:null;
 const cast=Object.freeze([2471,2472]);

 function validReport(report){
  const route=entry(report.stageId),data=report.chajiStory;
  if(!route||report.battleMode!==route.battleMode||report.sceneId!==route.sceneId||
     report.waveCount!==1||report.formationsVerified!==1||data?.fixed!==(route===fixed)||
     data.deadlineSeconds!==route.deadlineSeconds||typeof data.timedOut!=='boolean'||
     typeof data.scriptDefeat!=='boolean'||!Number.isFinite(data.combatSeconds)||
     data.combatSeconds<0||data.combatSeconds>report.engineSeconds||!Array.isArray(data.roster))return false;
  return route===fixed?data.bossRetainsHp===null&&!data.scriptDefeat&&data.roster.length===cast.length&&
   data.roster.every((member,index)=>member?.heroId===cast[index]&&member.position===index+1&&
    member.level===40&&member.star===6&&member.awake===1):
   data.bossRetainsHp===1&&data.roster.length===0&&(!report.completed||report.outcome==='loss');
 }

 return Object.freeze({resourceVersion:'0.0.816',fixed,special,modes,plots,specials,entry,cast,validReport,
  tableSHA256:Object.freeze({
   sp_chaji_plot:'29d5e2cd883f6a3994ff474627b3d1e9b548ef53b2ab8b01b6a34a68a9a8ab0d',
   DramaHeroInfo:'da7e6abef115faaa932518efba0defbb51aca09c8df2a979a767b3b299e07b8e',
   sp_chaji_const:'f8bcf955ab7670147832738c02df52e5ad509fb6f217cb63bd689e694d80c747',
   normal_battle_config:'51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66'})});
});
