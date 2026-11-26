(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 const api=factory(common?require('./core.js'):root.AtlasCore,common?require('./game-config.js'):root.AtlasGame,
  common?require('./fengmo-yanwu.js'):root.AtlasFengmoYanwu,
  common?require('./tuzhizhu-practice.js'):root.AtlasTuzhizhuPractice);
 if(common)module.exports=api;else root.AtlasRuneSearch=api;
})(globalThis,function(C,G,yanwu,practice){
'use strict';

// 神罚的开场属性来自同版本的 RuneFbEngine。定位按客户端技能说明选取，
// 例如雪御前的击败转火、因幡辉夜姬的愿力、不见岳的初始防御增伤。
const openings=[[612,6123],[611,6113],[608,6083],[607,6073],[591,5913],[556,5563],[364,3643],[392,3923]];
const finishers=[[612,6123],[611,6113],[608,6083],[607,6073],[389,3893],[579,5793],[568,5683],[392,3923],[591,5913],[556,5563]];
const openingOrbs=[[601,6013],[596,5963],[395,3953],[205,2054],[280,2803]];
// Released set descriptions in 0.0.816 equip_suit name these chance effects.
const volatileSuits=new Set(['魅妖','钟灵','招财猫','幽谷响','返魂香','应声虫','镜姬','木魅','狰','日女巳时',
 '魍魉之匣','地藏像','轮入道','雪幽魂','胧车','针女','网切','薙魂','共潜','反枕']);
const allowedSoul=soul=>!soul.unknown.length&&!volatileSuits.has(soul.set);
const roles={
 opener:{heroes:openings,metric:1,sets:['海月火玉','破势','狂骨'],damage:true},
 finisher:{heroes:finishers,metric:1,sets:['隐念','片叶之苇','心眼'],damage:true},
 fastFinisher:{heroes:finishers,metric:1,sets:['隐念','心眼'],damage:true},
 bossDamage:{heroes:[[608,6083],[579,5793],[389,3893],[591,5913],[612,6123],[611,6113]],
  metric:1,sets:['隐念','海月火玉','狂骨'],damage:true},
 debuff:{heroes:[[609,6093],[557,5573],[341,3413],[583,5832]],metric:7,sets:['元兴寺','遗念火']},
 orbs:{heroes:[[372,3722],...openingOrbs],metric:7,sets:['火灵']},
 openingOrbs:{heroes:openingOrbs,metric:7,sets:['火灵']},
 support:{heroes:[[379],[601],[583,5832]],metric:6,sets:[]},
 healer:{heroes:[[554,5543],[594,5943],[576],[200,2002]],metric:10,sets:['火灵','树妖']},
 tempo:{heroes:[[609,6093],[596,5963],[341,3413],[601]],metric:7,sets:['火灵','遗念火']},
 groupHeal:{heroes:[[238,2383],[594,5943],[347,3473],[200,2002]],metric:10,sets:['树妖']},
 amplify:{heroes:[[347,3473],[594,5943],[557,5573]],metric:10,sets:['火灵']},
 criticalHeal:{heroes:[[554,5543],[594,5943],[200,2002]],metric:10,sets:['火灵','树妖'],auto:11},
 accelerate:{heroes:[[609,6093],[237,2372],[261,2612],[596,5963],[601]],metric:7,sets:['火灵','遗念火']},
 markAmp:{heroes:[[609,6093],[369,3693],[363,3632],[367,3672],[583,5832]],metric:7,sets:['遗念火','火灵']},
 bossMark:{heroes:[[609,6093],[583,5832],[363,3632],[367,3673]],metric:7,sets:['遗念火','火灵']},
 lightDamage:{heroes:[...openings,[568,5683]],metric:1,sets:['海月火玉','破势','狂骨'],damage:true},
};
const groupBuff={name:'群疗增伤',roles:['orbs','amplify','groupHeal','opener','support']};
const groupDebuff={name:'群疗与破防',roles:['openingOrbs','debuff','opener','groupHeal','support']};
const groupDamage={name:'群疗与双输出',roles:['openingOrbs','groupHeal','opener','fastFinisher','criticalHeal']};
const openingDamage={name:'开场输出与尾刀',roles:['opener','finisher','orbs','debuff','support']};
const turnAdvance={name:'行动推进与治疗',roles:['opener','finisher','tempo','healer','support']};
const sustain={name:'持续供火与续航',roles:['opener','finisher','orbs','healer','debuff']};
// 神罚的罪凝在低于七成生命时压低伤害，优先试恢复和破防组合。
const soulKingStrategies=[groupBuff,groupDebuff,groupDamage,openingDamage,turnAdvance,sustain];
const sorrowStrategies=[groupBuff,turnAdvance,groupDamage,sustain,openingDamage,groupDebuff];
const hun13Pace={name:'拉条双输出',roles:['accelerate','orbs','lightDamage','fastFinisher','support']};
const hun13Mark={name:'拉条增伤',roles:['accelerate','orbs','markAmp','opener','fastFinisher']};
const hun13Hold={name:'拉条与治疗',roles:['accelerate','orbs','lightDamage','finisher','criticalHeal']};
const hun13Strategies=[[hun13Pace,hun13Mark,hun13Hold,openingDamage,groupBuff,turnAdvance],
 [hun13Mark,hun13Hold,hun13Pace,sustain,openingDamage,groupDamage]];
// Paper figures cannot be selected. Concentrate damage on the boss before it
// accrues buffs and keep a recovery option for teams that take counterattacks.
const yulingStrategies=[
 {name:'首领双输出',roles:['accelerate','orbs','bossMark','bossDamage','bossDamage']},
 {name:'增伤与首领输出',roles:['accelerate','orbs','bossMark','bossDamage','support']},
 {name:'首领输出与续航',roles:['orbs','bossMark','bossDamage','criticalHeal','support']},
];
const clearAdds=['orbs','bossMark','lightDamage','bossDamage','support'];
const advanceAndClear=['accelerate','orbs','lightDamage','fastFinisher','healer'];
const dualDamageHeal={name:'双输出与治疗',roles:['orbs','bossMark','lightDamage','bossDamage','criticalHeal']};
const guildHuntStrategies=[{name:'清小麒麟与首领输出',roles:clearAdds},dualDamageHeal,
 {name:'拉条与分裂清场',roles:advanceAndClear}];
const guildRetreatStrategies=[{name:'清小怪与首领输出',roles:clearAdds},dualDamageHeal,
 {name:'拉条与范围清怪',roles:advanceAndClear}];
const spiderStrategies=[
 {name:'范围伤害与双增伤',roles:['accelerate','lightDamage','amplify','orbs','markAmp']},
 {name:'双范围输出与续航',roles:['lightDamage','fastFinisher','orbs','criticalHeal','markAmp']},
 {name:'拉条、群攻与收尾',roles:['accelerate','lightDamage','fastFinisher','orbs','support']},
 sustain,
];
const limit=6;
// Check the observed losing seed before the two long fights found in the full-domain audit.
const baseSampleSeeds=Object.freeze([0,1,2,3,7,42]);
const sampleSeeds=Object.freeze([...baseSampleSeeds,8929,2016,7698]);
const extraSeeds=Object.freeze(Array.from({length:24},(_,seed)=>seed).filter(seed=>!sampleSeeds.includes(seed)));
const hun13SampleSeeds=Object.freeze([0,1,2,3,7,42,9999]);
function samplesForDungeon(id){
 if(id===102)return sampleSeeds;
 return Number.isSafeInteger(id)&&G.runeOpeningStage('0.0.816',id)?.battleMode===27?baseSampleSeeds:null;
}

function searchProfile(dungeonId){
 const stage=G.runeOpeningStage('0.0.816',dungeonId);
 if(!stage||![101,102].includes(dungeonId))throw Error('当前副本未接入库存备选搜索');
 if(dungeonId===102){
  return {strategies:soulKingStrategies,openingSpeed:G.runeOpeningStats('0.0.816',102,4742287).speed+1,
   bossSpeed:G.runeOpeningStats('0.0.816',102,4740061).speed+1,
   earlySpeed:G.runeOpeningStats('0.0.816',102,4741297).speed+2};
 }
 const fastest=wave=>Math.max(...wave.map(enemy=>enemy.speed));
 return {strategies:sorrowStrategies,openingSpeed:fastest(stage.waves[0])+1,
  bossSpeed:fastest(stage.waves[2])+1,earlySpeed:Math.max(...stage.waves.map(fastest))+2};
}

function actor(game,heroId=10){
 const awake=0,hero=game.heroes[heroId];
 const skills=heroId===10?[1003,1008,1011]:hero?.skills;
 if(hero?.kind!=='onmyoji'||skills?.length!==3)throw Error('当前版本缺少指定阴阳师的技能资料');
 const skinfo=skills.map(id=>[id,G.levels(game,id,awake).at(-1)?.level]);
 if(skinfo.some(([,level])=>!level))throw Error('当前版本缺少指定阴阳师的技能等级资料');
 return {heroId,level:60,star:2,awake,skinfo,aiSkill:2};
}

const chanceText=text=>/随机|概率|几率/.test(text.replace(/(?<![\d.])100(?:\.0+)?\s*%\s*(?:的)?\s*(?:基础)?\s*(?:概率|几率)/g,''));

function ownedSpirit(account,game,heroId){
 const owned=Array.isArray(account.raw?.hunlings)?account.raw.hunlings:[];
 const known=q=>{
  const spirit=game.spirits?.[q?.id],description=G.levels(game,spirit?.skillId,0).at(-1)?.description;
  return spirit?.heroes.includes(heroId)&&description&&!chanceText(description);
 };
 const legal=owned.filter(q=>known(q)&&
  Number.isSafeInteger(q.star)&&q.star>=1&&q.star<=6&&Number.isSafeInteger(q.lv)&&
  q.lv>=0&&q.lv<=game.spiritMaxLevel[q.star]&&typeof q.shiny==='boolean'&&
  Array.isArray(q.marks)&&q.marks.length<=6&&q.marks.every(id=>Object.hasOwn(game.marks,id)));
 const row=legal.sort((a,b)=>Number(b.id===101)-Number(a.id===101)||b.star-a.star||b.lv-a.lv)[0];
 if(row)return {id:row.id,star:row.star,lv:row.lv,shiny:row.shiny,marks:[...row.marks]};
}

function skillRisk(hero,game){
 const seen=new Set();
 let risks=0;
 function visit(id,level){
  if(seen.has(id))return;
  seen.add(id);
  const row=G.skill(game,id,level,hero.awake)??G.levels(game,id,hero.awake).at(-1);
  if(!row?.description){risks+=2;return;}
  risks+=Number(chanceText([row.description,row.upgrade].filter(Boolean).join(' ')));
  for(const child of [...row.branches,...(row.aiBranches||[]),...row.related])visit(child,level);
 }
 for(const [id,level] of hero.raw.skinfo)visit(id,level);
 return risks;
}

function preference(hero,game,rosterIndex){
 const entry=rosterIndex.get(hero.shikigamiId),released=entry?.releasedAt;
 return {released:/^\d{4}-\d{2}-\d{2}$/.test(released||'')?released:'',
  highRarity:entry?.rarity==='SSR'||entry?.rarity==='SP',randomRisk:skillRisk(hero,game)};
}
function preferred(a,b){
 return b.released.localeCompare(a.released)||Number(b.highRarity)-Number(a.highRarity)||
  a.randomRisk-b.randomRisk||Number(b.hero.shikigamiId)-Number(a.hero.shikigamiId);
}

function roleOptions(name,heroes,game,roster,rosterIndex){
 const result=[];
 const role=roles[name];
 for(const [priority,[id,preferred]] of role.heroes.entries()){
  for(const hero of heroes){
   const skills=hero.raw?.skinfo;
   if(hero.shikigamiId!==String(id)||hero.level<(role.damage?40:30)||hero.star<(role.damage?6:4)||
    !Array.isArray(skills)||!skills.length||!C.baseFromRoster(hero,roster))continue;
   const actual=new Map(skills);
   if(skills.some(([skill,level])=>!G.skill(game,skill,level,hero.awake)))continue;
   const setting=G.aiChoices(game,{hero_id:id,awake:hero.awake,skills}).find(x=>x.id===preferred&&actual.has(x.id));
   if(preferred&&!setting)continue;
   const skillLevel=actual.get(preferred??game.heroes[id]?.skills[1])||0;
   result.push({hero,id,aiSkill:role.auto??setting?.value??11,...preference(hero,game,rosterIndex),
    rank:hero.level+hero.star*5+skillLevel*5-priority*2});
  }
 }
 // Alternate species before considering extra copies of the same skill kit.
 const seen=new Set();
 return result.sort((a,b)=>preferred(a,b)||b.rank-a.rank||a.hero.instanceId.localeCompare(b.hero.instanceId))
  .filter(({id})=>{if(seen.has(id))return false;seen.add(id);return true;}).slice(0,4);
}

function configFor(name,id,openingSpeed,bossSpeed,earlySpeed,set){
 const role=roles[name],ranges=[],mainStats={};
 let metricId=role.metric;
 if(role.damage){
  ranges.push({stat:'speed',min:name==='opener'?openingSpeed:name==='fastFinisher'?earlySpeed-1:bossSpeed});
  mainStats[4]=id===612?['hpPercent']:['attackPercent'];
  if(id===612)metricId=10;
  mainStats[6]=id===392?['critDamage']:['crit','critDamage'];
  if(id!==392)ranges.push({stat:'crit',min:100,percentage:true});
 }else if(id===372){
  metricId=9;mainStats[6]=['critDamage'];
 }else if(id===379){
  for(const slot of [2,4,6])mainStats[slot]=['defensePercent'];
 }else if(metricId===10){
  mainStats[2]=['speed'];mainStats[6]=['crit','critDamage'];
  ranges.push({stat:'speed',min:id===238?earlySpeed+6:earlySpeed},{stat:'crit',min:100,percentage:true});
  if(id===238){metricId=1;mainStats[4]=['attackPercent'];}
 }else{
  mainStats[2]=['speed'];
  ranges.push({stat:'speed',min:earlySpeed});
  if(name==='support')metricId=7;
 }
 return {metricId,ranges,mainStats,sixStarOnly:true,levelRange:[15,15],suitRequirements:set?[{name:set,count:4}]:[]};
}

function teamKey(plan){
 const tactics=plan.tactics&&Object.keys(plan.tactics).sort().map(key=>{
  const value=plan.tactics[key];
  if(key==='autoMode')return [key,[value.slot,value.mode]];
  if(key==='manualOpening'&&value!==true)return [key,[value.actorSlot,value.skillId,value.target]];
  return [key,value];
 });
 return JSON.stringify([plan.onmyoji,plan.spirit,plan.members.map(({instanceId,souls,aiSkill})=>
  [instanceId,souls.map(row=>row.id).sort(),aiSkill]),...(tactics?.length?[tactics]:[])]);
}

function candidates(account,data,alternatives=[],dungeonId=102){
 return buildCandidates(account,data,searchProfile(dungeonId),alternatives,dungeonId);
}

function roleAssignments(strategy,available){
 const order=strategy.roles.map((name,index)=>({name,index,options:available[name]}))
  .sort((a,b)=>a.options.length-b.options.length||a.index-b.index);
 const width=6;
 function canFill(first,reserved){
  const owners=new Map();
  function assign(slot,seen){
   for(const option of order[slot].options){
    if(reserved.has(option.id)||seen.has(option.id))continue;
    seen.add(option.id);
    const prior=owners.get(option.id);
    if(prior!==undefined&&!assign(prior,seen))continue;
    owners.set(option.id,slot);return true;
   }
   return false;
  }
  for(let i=first;i<order.length;i++)if(!assign(i,new Set()))return false;
  return true;
 }
 let beam=[{members:[],used:new Set(),cost:0}];
 for(const [depth,slot] of order.entries()){
  beam=beam.flatMap(branch=>slot.options.flatMap((option,rank)=>{
   if(branch.used.has(option.id))return [];
   const used=new Set([...branch.used,option.id]);
   if(!canFill(depth+1,used))return [];
   return [{used,cost:branch.cost+rank,members:[...branch.members,{...option,name:slot.name,index:slot.index}]}];
  })).sort((a,b)=>a.cost-b.cost).slice(0,width);
  if(!beam.length)break;
 }
 return beam.map(branch=>branch.members.sort((a,b)=>a.index-b.index));
}

function fitTeam(chosen,strategy,{openingSpeed,bossSpeed,earlySpeed},inventory,account,roster,effects,variant){
 const profiles=chosen.map(role=>{
  const {name,id}=role;
  const sets=id===392?['镇墓兽']:id===372||id===379?[]:roles[name].sets;
  const set=strategy.sets?.[name]??sets[variant%Math.max(1,sets.length)];
  const speed=name==='accelerate'?earlySpeed+25:earlySpeed;
  const config=configFor(name,id,openingSpeed,bossSpeed,speed,set);
  const speedNeeded=config.ranges.find(row=>row.stat==='speed')?.min??0;
  return {...role,set,config,speedNeeded};
 }).sort((a,b)=>b.speedNeeded-a.speedNeeded||b.config.ranges.length-a.config.ranges.length||a.index-b.index);
 const used=new Set(),members=[],panels=[];
 for(const {hero,index,aiSkill,set,config} of profiles){
  const remaining=inventory.filter(soul=>!used.has(soul.id));
  const find=rules=>C.findBuilds(hero,rules,account,roster,effects,{inventory:remaining,width:22,perSet:3,limit:1000});
  const matched=find(config);
  const relaxed=set&&!matched.builds.length?find({...config,suitRequirements:[]}):null;
  const closest=matched.closest;
  const build=matched.builds[0]||relaxed?.builds[0]||
   (relaxed?.closest&&(!closest||relaxed.closest.distance<closest.distance)?relaxed.closest:closest);
  if(build?.soulIds.length!==6||build.soulIds.some(id=>used.has(id)))return null;
  const souls=build.soulIds.map(id=>account.souls[id].raw);
  for(const id of build.soulIds)used.add(id);
  members[index]={instanceId:hero.instanceId,hero:hero.raw,souls,aiSkill};
  panels[index]=build.rawPanel;
 }
 return {members,panels};
}

function buildCandidates(account,{gameConfig:game,roster,effects},profile,alternatives,dungeonId,max=limit){
 const onmyoji=actor(game,profile.actorId??10),spirit=ownedSpirit(account,game,onmyoji.heroId);
 const heroes=Object.values(account.heroes),inventory=Object.values(account.souls).filter(allowedSoul);
 const rosterIndex=new Map(roster.map(row=>[String(row.id),row]));
 const names=new Set(profile.strategies.flatMap(strategy=>strategy.roles));
 const available=Object.fromEntries([...names].map(name=>[name,roleOptions(name,heroes,game,roster,rosterIndex)]));
 const sampled=[],seen=new Set(alternatives);
 const paths=profile.strategies.map(strategy=>({strategy,crews:roleAssignments(strategy,available)})).filter(row=>row.crews.length);
 const depth=Math.max(0,...paths.map(row=>row.crews.length));
 for(let pass=0;pass<depth+2&&sampled.length<max;pass++){
  for(const {strategy,crews} of paths){
   const chosen=pass<depth?crews[pass]:crews[0];
   if(!chosen)continue;
   const fit=fitTeam(chosen,strategy,profile,inventory,account,roster,effects,pass<depth?0:pass-depth+1);
   if(!fit)continue;
   const plan={onmyoji,...(spirit?{spirit}:{}),members:fit.members,damageFloor:true};
   const key=teamKey(plan);
   if(seen.has(key))continue;
   seen.add(key);
   sampled.push({dungeonId,title:strategy.name,heroIds:chosen.map(row=>row.id),plan,panels:fit.panels,
    combatRoles:chosen.map(row=>row.name)});
   if(sampled.length===max)break;
  }
 }
 return sampled;
}

function scoreVariants(item,game){
 const {plan,panels,combatRoles}=item;
 const slots=plan.members.map((member,index)=>{
  const panel=panels?.[index],id=Number(member.hero.heroId),role=combatRoles?.[index];
  const attack=id===612?panel?.hp:panel?.attack;
  const estimate=(attack??0)*(1+Math.min(1,panel?.crit??0)*Math.max(0,(panel?.critDamage??1)-1));
  const offensive=role?!!roles[role]?.damage:roles.bossDamage.heroes.some(([hero])=>hero===id);
  return {slot:index+1,member,panel,offensive,estimate};
 });
 const [output,second]=[...slots].sort((a,b)=>Number(b.offensive)-Number(a.offensive)||b.estimate-a.estimate);
 const first=[...slots].sort((a,b)=>(b.panel?.speed??0)-(a.panel?.speed??0))[0];
 const variant=(title,tactics,slot,aiSkill)=>({...item,title:`${item.title} · ${title}`,plan:{...plan,tactics,
  members:slot?plan.members.map((member,i)=>i+1===slot?{...member,aiSkill}:member):plan.members}});
 const red={redBoss:true},marks={...red,greenSlot:output.slot};
 const probes=[variant('开场红绿标',marks),variant('首动手动普攻',{manualOpening:true,...marks})];
 const variants=[variant('开场红标',red),
  variant('自动妖术',{...marks,autoMode:{slot:output.slot,mode:'spell'}},output.slot,0),
  variant('自动普攻',{...marks,autoMode:{slot:first.slot,mode:'basic'}},first.slot,0)];
 const {hero}=output.member;
 const lock=G.aiChoices(game,{hero_id:hero.heroId,awake:hero.awake,skills:hero.skinfo}).filter(choice=>choice.slot>1&&choice.value!==output.member.aiSkill).at(-1);
 if(lock)variants.push(variant(`锁定第 ${lock.slot} 技能`,marks,output.slot,lock.value));
 if(second?.offensive)variants.push(variant('绿标另一位输出',{...red,greenSlot:second.slot}));
 return {probes,variants};
}

function pveCandidates(account,data,memberCount,alternatives=[],openingEnemySpeed=0,battleMode=3,actorId=null){
 const {gameConfig:game,roster}=data;
 const scoring=battleMode===2000||battleMode===306||battleMode===yanwu.battleMode;
 const strategies=[
  [{name:'单式神输出',roles:['opener']},{name:'单式神持续输出',roles:['finisher']}],
  [{name:'输出与供火',roles:['opener','orbs']},{name:'输出与治疗',roles:['finisher','healer']}],
  [{name:'双输出与供火',roles:['opener','finisher','orbs']},{name:'输出供火与续航',roles:['opener','orbs','healer']},
   {name:'拉条增伤与输出',roles:['accelerate','markAmp','lightDamage']}],
  [{name:'供火增伤与双输出',roles:['orbs','markAmp','opener','finisher']},
   {name:'拉条供火与治疗',roles:['accelerate','orbs','lightDamage','healer']}],
  battleMode===306||battleMode===yanwu.battleMode?[...guildRetreatStrategies,hun13Pace,sustain]:
   scoring?[...guildHuntStrategies,hun13Pace,sustain]:
   Object.hasOwn(practice.modes,battleMode)?spiderStrategies:
   battleMode===267?[...yulingStrategies,hun13Pace,turnAdvance]:[hun13Pace,hun13Hold,groupBuff,turnAdvance,openingDamage,sustain],
  battleMode===yanwu.battleMode?[
   {name:'双输出与双增伤',roles:['accelerate','orbs','bossMark','amplify','lightDamage','bossDamage']},
   {name:'范围清怪与首领输出',roles:['orbs','bossMark','lightDamage','fastFinisher','bossDamage','support']},
   {name:'续航与首领输出',roles:['orbs','bossMark','lightDamage','bossDamage','criticalHeal','support']},
  ]:null,
 ][memberCount-1];
 if(!strategies)throw Error('当前关卡的上阵人数未接入库存备选');
 const speed=Number.isFinite(openingEnemySpeed)&&openingEnemySpeed>0?Math.floor(openingEnemySpeed)+1:0;
 const poolSize=scoring?10:limit,damageFirstLimit=scoring?2:1;
 const primaryLimit=scoring?poolSize-1-(speed?damageFirstLimit:0):limit-1;
 const candidates=buildCandidates(account,data,{strategies,actorId,openingSpeed:speed,bossSpeed:speed,earlySpeed:speed},alternatives,null,primaryLimit);
 if(speed){
  const tried=[...alternatives,...candidates.map(row=>teamKey(row.plan))];
  const damageFirst=buildCandidates(account,data,{strategies,actorId,openingSpeed:0,bossSpeed:0,earlySpeed:0},tried,null,damageFirstLimit);
  for(const row of damageFirst)candidates.push({...row,title:row.title+'（输出优先）'});
 }
 const onmyoji=actor(game,actorId??10),spirit=ownedSpirit(account,game,onmyoji.heroId);
 const {byHero}=C.equipmentOwnership(account),kinds=game.heroes;
 const rosterIndex=new Map(roster.map(row=>[String(row.id),row]));
 const equipped=Object.values(account.heroes).flatMap(hero=>{
  const gear=byHero.get(hero.instanceId),id=hero.shikigamiId,skills=hero.raw?.skinfo;
  if(!gear||!gear.every(allowedSoul)||kinds[id]?.kind!=='shikigami'||!C.baseFromRoster(hero,roster)||
     !skills?.length||skills.some(([skill,level])=>!G.skill(game,skill,level,hero.awake)))return [];
  return [{hero,gear,...preference(hero,game,rosterIndex),quality:gear.reduce((score,soul)=>score+soul.star*4+soul.level,0)}];
 }).sort((a,b)=>preferred(a,b)||b.hero.star-a.hero.star||b.hero.level-a.hero.level||b.quality-a.quality||
  a.hero.instanceId.localeCompare(b.hero.instanceId));
 const distinct=new Set(),team=equipped.filter(({hero})=>{
  if(distinct.has(hero.shikigamiId))return false;
  distinct.add(hero.shikigamiId);return true;
 }).slice(0,memberCount);
 if(team.length===memberCount){
  const plan={onmyoji,...(spirit?{spirit}:{}),members:team.map(({hero,gear})=>({
   instanceId:hero.instanceId,hero:hero.raw,souls:gear.map(soul=>soul.raw),aiSkill:0,
  })),damageFloor:true};
  const key=teamKey(plan);
  const panels=team.map(({hero,gear})=>{
   const panel=C.panel(C.baseFromRoster(hero,roster),gear,data.effects);
   return panel.unsupported.length?null:panel.values;
  });
  if(!alternatives.includes(key)&&!candidates.some(row=>teamKey(row.plan)===key))
   candidates.unshift({title:'当前穿戴',heroIds:team.map(({hero})=>Number(hero.shikigamiId)),plan,panels});
 }
 return candidates;
}

const relayKey=plan=>JSON.stringify(plan.rounds.map(teamKey));
const hun13Key=relayKey;

function remainingStock(account,plan){
 const heroes=new Set(plan.members.map(member=>member.instanceId));
 const souls=new Set(plan.members.flatMap(member=>member.souls.map(soul=>soul.id)));
 const remove=(from,used)=>Object.fromEntries(Object.entries(from).filter(([id])=>!used.has(id)));
 return {...account,heroes:remove(account.heroes,heroes),souls:remove(account.souls,souls)};
}

function underworldCandidates(account,data,alternatives=[]){
 const {gameConfig:game}=data;
 const compositions=[hun13Pace,hun13Hold,groupBuff,turnAdvance,openingDamage,sustain];
 const profile={strategies:compositions,openingSpeed:140,bossSpeed:140,earlySpeed:145};
 const actors=[[11,1101,1102,1107],[12,1201,1203,1204],[13,1301,1302,1305]].map(([heroId,...skills])=>{
  const skinfo=skills.map(id=>[id,G.levels(game,id,0).at(-1)?.level]);
  if(skinfo.some(([,level])=>!level))throw Error('本版本缺少阴界之门备选阴阳师技能');
  return {heroId,level:60,star:2,awake:0,skinfo,aiSkill:0};
 });
 const leads=buildCandidates(account,data,profile,[],null,3),rows=[],seen=new Set(alternatives);
 for(const lead of leads){
  const rounds=[lead];
  let remaining=remainingStock(account,lead.plan);
  for(const onmyoji of actors){
   const [item]=buildCandidates(remaining,data,profile,[],null,1);
   if(!item)break;
   const {members}=item.plan;
   const plan={members,onmyoji,damageFloor:true};
   remaining=remainingStock(remaining,plan);
   rounds.push({...item,plan});
  }
  const plan={rounds:rounds.map(row=>row.plan),damageFloor:true},key=relayKey(plan);
  if(seen.has(key))continue;
  seen.add(key);
  rows.push({title:`${lead.title}开场 · ${rounds.length} 队接力`,heroIds:lead.heroIds,rounds,plan});
 }
 return rows;
}

function hun13Candidates(account,data,alternatives=[]){
 const stage=G.runeOpeningStage('0.0.816',103);
 if(stage?.engine!=='Hun13Engine'||stage.waves.length!==2)throw Error('缺少本版本虚无两波的原版开场资料');
 const profiles=stage.waves.map((wave,index)=>{
  const maximum=Math.max(...wave.map(enemy=>enemy.speed));
  return {strategies:hun13Strategies[index],openingSpeed:maximum+1,bossSpeed:maximum+1,earlySpeed:maximum+8};
 });
 const unseen=new Set(alternatives),rows=[];
 // Allocate the strongest gear to each wave in turn. The other wave may
 // still use another instance of the same character if the account has it.
 const leads=profiles.map(profile=>buildCandidates(account,data,profile,[],103));
 for(let i=0;i<limit&&rows.length<limit;i++)for(const wave of [0,1]){
  const lead=leads[wave][i];
  if(!lead||rows.length===limit)continue;
  const remaining=remainingStock(account,lead.plan);
  for(const partner of buildCandidates(remaining,data,profiles[1-wave],[],103,2)){
   const rounds=wave===0?[lead,partner]:[partner,lead];
   const plan={rounds:rounds.map(row=>row.plan),damageFloor:true},key=hun13Key(plan);
   if(unseen.has(key))continue;
   unseen.add(key);rows.push({plan,rounds});break;
  }
 }
 return rows;
}

return {candidates,teamKey,pveCandidates,scoreVariants,hun13Candidates,hun13Key,underworldCandidates,relayKey,hun13SampleSeeds,baseSampleSeeds,sampleSeeds,extraSeeds,samplesForDungeon};
});
