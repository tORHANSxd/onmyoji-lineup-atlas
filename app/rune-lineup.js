(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 const api=factory(common?require('./game-config.js'):root.AtlasGame);
 if(common)module.exports=api;else root.AtlasRuneLineup=api;
})(globalThis,function(G){
'use strict';
const sceneId=1001001,resourceVersion='0.0.816',dungeonId=102;

function autoSkill(member,game,skills){
 const setting=member.aiSkill??0;
 if(!G.aiChoices(game,{hero_id:Number(member.shikigamiId||member.onmyojiId),awake:member.awakening,skills}).some(choice=>choice.value===setting)){
  throw Error(`${member.name}的自动施法设置未能核实`);
 }
 return setting;
}

function inventorySpirit(actor,account,game){
 const target=actor.qiling,template=game.spirits?.[target.id];
 const usableMarks=marks=>Array.isArray(marks)&&marks.length<=6&&marks.every(id=>Number.isSafeInteger(id)&&Object.hasOwn(game.marks,id));
 if(!template?.heroes.includes(Number(actor.onmyojiId))||!Number.isInteger(target.star)||target.star<1||target.star>6||
    !Number.isInteger(target.lv)||target.lv<0||!usableMarks(target.marks))throw Error('阵容码的契灵配置缺少已核对的角色、等级或术印');
 if(!Array.isArray(account.raw?.hunlings))throw Error('库存未提供契灵，请从平安志导出包含契灵的角色档案');
 const counts=marks=>new Map(G.markLevels({marks}).map(({id,level})=>[id,level]));
 const demands=counts(target.marks);
 const eligible=account.raw.hunlings.filter(row=>{
  if(row?.id!==target.id||!Number.isInteger(row.star)||row.star<target.star||row.star>6||
     !Number.isInteger(row.lv)||row.lv<target.lv||row.lv>game.spiritMaxLevel[row.star]||
     typeof row.shiny!=='boolean'||typeof row.uid!=='string'||!row.uid||!usableMarks(row.marks))return false;
  const actual=counts(row.marks);
  return [...demands].every(([mark,level])=>(actual.get(mark)||0)>=level);
 });
 const owned=eligible.sort((a,b)=>a.star-b.star||a.lv-b.lv||a.marks.length-b.marks.length)[0];
 if(!owned)throw Error(`库存缺少满足原码星级、等级和术印要求的${template.name}`);
 return {id:owned.id,star:owned.star,lv:owned.lv,shiny:owned.shiny,marks:owned.marks};
}

function team(lineup,result,account,game){
 if(Number(lineup.gameSceneId)!==sceneId)throw Error('该阵容码不属于御魂神罚');
 if(!result?.ready||!result.completed||result.proof?.state!=='optimal'||!Array.isArray(result.assignment)){
  throw Error('精算未给出已核对的库存配装');
 }
 const occupied=lineup.members.filter(member=>member.occupied!==false);
 const actors=occupied.filter(member=>member.kind==='onmyoji');
 const members=occupied.filter(member=>member.kind==='shikigami').sort((a,b)=>a.index-b.index);
 if(actors.length!==1||members.length!==5||result.assignment.length!==members.length)throw Error('阵容码缺少魂王战斗所需的完整阵容');
 const actor=actors[0],heroId=Number(actor.onmyojiId),actorRules=game.heroes[heroId];
 if(actorRules?.kind!=='onmyoji'||!Array.isArray(actor.skills)||!Number.isInteger(actor.level)||!Number.isInteger(actor.star)||actor.awakening!==0){
  throw Error('阵容码没有提供完整的阴阳师培养与技能配置');
 }
 const configured=actor.skills.map(skill=>[skill.id,skill.level]);
 const levels=new Map(configured),basic=actorRules.skills[0];
 const order=G.skillOrder(game,{hero_id:heroId,skills:configured});
 const skills=order.map(id=>[id,levels.get(id)??(id===basic?G.levels(game,basic,0)[0]?.level:undefined)]);
 if(skills.some(([id,level])=>!G.skill(game,id,level,0)))throw Error('阵容码包含客户端未核对的阴阳师技能');
 const onmyoji={heroId,level:actor.level,star:actor.star,awake:0,skinfo:skills,aiSkill:autoSkill(actor,game,configured)};
 const builds=new Map(result.assignment.map(build=>[build.index,build]));
 const spirit=actor.qiling?inventorySpirit(actor,account,game):null;
 const plan={onmyoji,...(spirit?{spirit}:{}),members:members.map(member=>{
  const build=builds.get(member.index),hero=account.heroes[build?.heroId];
  if(!hero?.raw||String(member.shikigamiId)!==hero.shikigamiId||build.soulIds?.length!==6){
   throw Error(`${member.name}的库存配装已变化，请重新精算`);
  }
  const souls=build.soulIds.map(id=>account.souls[id]?.raw);
  if(souls.some(row=>!row))throw Error(`${member.name}的部分御魂已不在当前库存，请重新精算`);
  return {instanceId:hero.instanceId,hero:hero.raw,souls,aiSkill:autoSkill(member,game,hero.raw.skinfo)};
 })};
 return {plan,conditions:['阴阳师按阵容码培养和携带技能复跑，平安志未提供其实际培养。普攻等级缺失时使用客户端最低等级。']};
}

return {sceneId,resourceVersion,dungeonId,team};
});
