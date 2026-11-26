(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 const api=factory(common?require('./game-config.js'):root.AtlasGame,common?require('./core.js'):root.AtlasCore);
 if(common)module.exports=api;else root.AtlasRuneLineup=api;
})(globalThis,function(G,C){
'use strict';
const sceneId=1001001,resourceVersion='0.0.816',dungeonId=102;
const hun13SceneId=1001000;
const replayStages=new Map([
 [1,1001012],[2,1001011],[3,1001010],[4,1001009],[5,1001008],
 [6,1001007],[7,1001006],[8,1001005],[9,1001004],[10,1001003],
 [11,10011003],[12,10011002],[13,10011001],[101,1001002],
 [1001,10012004],[1002,10012003],[1003,10012002],[1004,10012001],
 [dungeonId,sceneId],
]);
const runeFloorIds=[...replayStages.keys()].filter(id=>id!==dungeonId);
const twoRoundScenes=new Map([[103,hun13SceneId],[2001,10013004],[2002,10013003],[2003,10013002],[2005,10013001]]);
const hun13FloorIds=[...twoRoundScenes.keys()];
const sceneForDungeon=id=>replayStages.get(id)??twoRoundScenes.get(id)??null;

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

function team(lineup,result,account,game,floor=dungeonId){
 const scene=replayStages.get(floor);
 if(scene===undefined||Number(lineup.gameSceneId)!==scene)throw Error('该阵容码不属于当前复跑副本');
 const plan=selectedTeam(lineup,result,account,game);
 return {plan,conditions:['阴阳师按阵容码培养和携带技能复跑，平安志未提供其实际培养。普攻等级缺失时使用客户端最低等级。']};
}

function selectedTeam(lineup,result,account,game,memberCount=5){
 if(!result?.ready||!result.completed||result.proof?.state!=='optimal'||!Array.isArray(result.assignment)){
  throw Error('精算未给出已核对的库存配装');
 }
 const occupied=lineup.members.filter(member=>member.occupied!==false);
 const actors=occupied.filter(member=>member.kind==='onmyoji');
 const members=occupied.filter(member=>member.kind==='shikigami').sort((a,b)=>a.index-b.index);
 if(actors.length!==1||members.length!==memberCount||result.assignment.length!==members.length)throw Error('阵容码缺少战斗所需的完整阵容');
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
 return {onmyoji,...(spirit?{spirit}:{}),members:members.map(member=>{
  const build=builds.get(member.index),hero=account.heroes[build?.heroId];
  const mode=C.soulMode(member.config),ids=build?.soulIds;
  if(!hero?.raw||String(member.shikigamiId)!==hero.shikigamiId||!Array.isArray(ids)||
     (mode==='none'?ids.length!==0:mode==='current'?ids.length>6:ids.length!==6)){
   throw Error(`${member.name}的库存配装已变化，请重新精算`);
  }
  const souls=ids.map(id=>account.souls[id]?.raw);
  if(souls.some(row=>!row))throw Error(`${member.name}的部分御魂已不在当前库存，请重新精算`);
  return {instanceId:hero.instanceId,hero:hero.raw,souls,aiSkill:autoSkill(member,game,hero.raw.skinfo)};
 })};
}

function hun13Pair(lineups,floor=103){
 const scene=twoRoundScenes.get(floor),label=floor===103?'虚无':'永生之海';
 if(scene===undefined||lineups.length!==2)throw Error(`请选择${label}${floor===103?'两波':'两场'}使用的阵容码`);
 return orderedLineups(lineups,{scene,label,unit:floor===103?'波':'队',id:'hun13-pair',title:label+'双队库存精算'});
}

function underworldLineups(lineups){
 if(lineups.length<1||lineups.length>4)throw Error('请选择要依次上场的 1 至 4 套阴界之门阵容码');
 return orderedLineups(lineups,{scene:19005,label:'阴界之门',unit:'队',id:'underworld-relay',title:'阴界之门接力库存精算'});
}

function orderedLineups(lineups,{scene,label,unit,id,title}){
 const rounds=lineups.map((lineup,wave)=>{
  if(Number(lineup?.gameSceneId)!==scene||!C.hasParsedContent(lineup)||!C.shikigamiRequirementsComplete(lineup))
   throw Error(`第 ${wave+1} ${unit}需要已完整解析的${label}阵容码`);
  const members=lineup.members.filter(member=>member.occupied!==false);
  const actor=members.find(member=>member.kind==='onmyoji');
  const fighters=members.filter(member=>member.kind==='shikigami').sort((a,b)=>a.index-b.index);
  if(!actor||members.length!==6||fighters.length!==5)throw Error(`第 ${wave+1} ${unit}原码需要一位阴阳师和五位式神`);
  return {...lineup,members:[actor,...fighters.map((member,index)=>({...member,index:wave*5+index}))]};
 });
 return {rounds,combined:{id,title,decodeState:'decoded-local',requirementsComplete:true,
  members:rounds.flatMap(round=>round.members.filter(member=>member.kind==='shikigami'))}};
}

function hun13Plan({rounds},result,account,game){
 const assignments=result?.assignment;
 if(!Array.isArray(assignments)||assignments.length!==10||new Set(assignments.map(build=>build.heroId)).size!==10)
  throw Error('两场战斗需要十个不同的式神实例');
 const souls=assignments.flatMap(build=>build.soulIds);
 if(new Set(souls).size!==souls.length)throw Error('两场战斗的配装使用了同一件御魂');
 return orderedPlan(rounds,result,account,game);
}

function underworldPlan({rounds},result,account,game){
 const assignments=result?.assignment??[],souls=assignments.flatMap(build=>build.soulIds);
 if(assignments.length!==rounds.length*5||new Set(assignments.map(build=>build.heroId)).size!==assignments.length||
    new Set(souls).size!==souls.length)throw Error('接力队伍需要不同的式神实例和同时可用的御魂');
 const plan=orderedPlan(rounds,result,account,game);
 const remaining=new Set(plan.rounds.map(row=>row.onmyoji.heroId));
 const loadouts=new Map();
 for(const {onmyoji,spirit} of plan.rounds){
  const id=onmyoji.heroId;
  if(!remaining.has(id))throw Error('按当前出场顺序，该阴阳师已被原版换队规则禁用');
  if(remaining.size>1)remaining.delete(id);
  const loadout=JSON.stringify([{...onmyoji,aiSkill:0},spirit]);
  if(loadouts.has(id)&&loadouts.get(id)!==loadout)throw Error('重复上阵的阴阳师需要沿用同一培养、技能和契灵');
  loadouts.set(id,loadout);
 }
 return plan;
}

function orderedPlan(rounds,result,account,game){
 const assignments=result.assignment;
 return {rounds:rounds.map((round,wave)=>selectedTeam(round,{...result,
  assignment:assignments.filter(build=>build.index>=wave*5&&build.index<(wave+1)*5)},account,game))};
}

return {sceneId,resourceVersion,dungeonId,hun13SceneId,runeFloorIds,hun13FloorIds,sceneForDungeon,team,selectedTeam,hun13Pair,hun13Plan,underworldLineups,underworldPlan};
});
