(function(root,factory){
 const common=typeof module==='object'&&module.exports;
 const api=factory(common?require('./core.js'):root.AtlasCore,common?require('./game-config.js'):root.AtlasGame);
 if(common)module.exports=api;else root.AtlasRuneSearch=api;
})(globalThis,function(C,G){
'use strict';

// 神罚的开场属性来自同版本的 RuneFbEngine。定位按客户端技能说明选取，
// 例如雪御前的击败转火、因幡辉夜姬的愿力、不见岳的初始防御增伤。
const openings=[[591,5913],[556,5563],[608,6083],[364,3643],[392,3923]];
const finishers=[[389,3893],[579,5793],[568,5683],[392,3923],[591,5913],[556,5563]];
const openingOrbs=[[596,5963],[395,3953],[205,2054],[280,2803]];
const roles={
 opener:{heroes:openings,metric:1,sets:['海月火玉','针女','破势'],damage:true},
 finisher:{heroes:finishers,metric:1,sets:['针女','隐念','片叶之苇'],damage:true},
 fastFinisher:{heroes:finishers,metric:1,sets:['针女','隐念'],damage:true},
 debuff:{heroes:[[557,5573],[341,3413],[583,5832]],metric:7,sets:['元兴寺','遗念火']},
 orbs:{heroes:[[372,3722],...openingOrbs],metric:7,sets:['火灵']},
 openingOrbs:{heroes:openingOrbs,metric:7,sets:['火灵']},
 support:{heroes:[[379],[601],[583,5832]],metric:6,sets:[]},
 healer:{heroes:[[554,5543],[594,5943],[576],[200,2002]],metric:10,sets:['火灵','树妖']},
 tempo:{heroes:[[596,5963],[341,3413],[601]],metric:7,sets:['火灵','遗念火']},
 groupHeal:{heroes:[[238,2383],[594,5943],[347,3473],[200,2002]],metric:10,sets:['树妖']},
 amplify:{heroes:[[347,3473],[594,5943],[557,5573]],metric:10,sets:['火灵']},
 criticalHeal:{heroes:[[554,5543],[594,5943],[200,2002]],metric:10,sets:['招财猫'],auto:11},
};
const strategies=[
 // 罪凝在低于七成生命时压低伤害，优先试能恢复全队的组合。
 {name:'群疗增伤',roles:['orbs','amplify','groupHeal','opener','support'],sets:{opener:'针女'}},
 {name:'群疗与破防',roles:['openingOrbs','debuff','opener','groupHeal','support']},
 {name:'群疗与双输出',roles:['openingOrbs','groupHeal','opener','fastFinisher','criticalHeal']},
 {name:'开场输出与尾刀',roles:['opener','finisher','orbs','debuff','support']},
 {name:'行动推进与治疗',roles:['opener','finisher','tempo','healer','support']},
 {name:'持续供火与续航',roles:['opener','finisher','orbs','healer','debuff']},
];
const limit=6;
// Check the observed losing seed before the two long fights found in the full-domain audit.
const baseSampleSeeds=Object.freeze([0,1,2,3,7,42]);
const sampleSeeds=Object.freeze([...baseSampleSeeds,8929,2016,7698]);
const extraSeeds=Object.freeze(Array.from({length:24},(_,seed)=>seed).filter(seed=>!sampleSeeds.includes(seed)));

function actor(game){
 const heroId=10,awake=0;
 const skinfo=[1003,1008,1011].map(id=>[id,G.levels(game,id,awake).at(-1)?.level]);
 if(skinfo.some(([,level])=>!level))throw Error('当前版本缺少晴明的技能资料');
 return {heroId,level:60,star:2,awake,skinfo,aiSkill:2};
}

function ownedSpirit(account,game,heroId){
 const owned=Array.isArray(account.raw?.hunlings)?account.raw.hunlings:[];
 const legal=owned.filter(q=>game.spirits?.[q?.id]?.heroes.includes(heroId)&&
  Number.isSafeInteger(q.star)&&q.star>=1&&q.star<=6&&Number.isSafeInteger(q.lv)&&
  q.lv>=0&&q.lv<=game.spiritMaxLevel[q.star]&&typeof q.shiny==='boolean'&&
  Array.isArray(q.marks)&&q.marks.length<=6&&q.marks.every(id=>Object.hasOwn(game.marks,id)));
 const row=legal.sort((a,b)=>Number(b.id===101)-Number(a.id===101)||b.star-a.star||b.lv-a.lv)[0];
 if(row)return {id:row.id,star:row.star,lv:row.lv,shiny:row.shiny,marks:[...row.marks]};
}

function roleOptions(name,heroes,game,roster){
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
   result.push({hero,id,aiSkill:role.auto??setting?.value??11,rank:hero.level+hero.star*5+skillLevel*5-priority*2});
  }
 }
 // Alternate species before considering extra copies of the same skill kit.
 const seen=new Set();
 return result.sort((a,b)=>b.rank-a.rank||a.hero.instanceId.localeCompare(b.hero.instanceId))
  .filter(({id})=>{if(seen.has(id))return false;seen.add(id);return true;}).slice(0,4);
}

function configFor(name,id,openingSpeed,bossSpeed,earlySpeed,set){
 const role=roles[name],ranges=[],mainStats={};
 let metricId=role.metric;
 if(role.damage){
  ranges.push({stat:'speed',min:name==='opener'?openingSpeed:name==='fastFinisher'?earlySpeed-1:bossSpeed});
  mainStats[4]=['attackPercent'];
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
 return JSON.stringify([plan.onmyoji,plan.spirit,plan.members.map(({instanceId,souls,aiSkill})=>
  [instanceId,souls.map(row=>row.id).sort(),aiSkill])]);
}

function candidates(account,{gameConfig:game,roster,effects},alternatives=[]){
 const onmyoji=actor(game),spirit=ownedSpirit(account,game,onmyoji.heroId);
 const heroes=Object.values(account.heroes),inventory=Object.values(account.souls).filter(q=>!q.unknown.length);
 const available=Object.fromEntries(Object.keys(roles).map(name=>[name,roleOptions(name,heroes,game,roster)]));
 const openingSpeed=G.runeOpeningStats('0.0.816',102,4742287).speed+1;
 const bossSpeed=G.runeOpeningStats('0.0.816',102,4740061).speed+1;
 const earlySpeed=G.runeOpeningStats('0.0.816',102,4741297).speed+2;
 const sampled=[],seen=new Set(alternatives);
 // Test different role combinations and sets. This bounds interactive search;
 // native replays, rather than the gear scoring, decide which teams clear waves.
 for(let variant=0;variant<4&&sampled.length<limit;variant++){
  for(const strategy of strategies){
   const chosen=[],species=new Set();
   for(const name of strategy.roles){
    const rows=available[name].filter(({id})=>!species.has(id));
    const row=rows[variant%Math.max(1,Math.min(rows.length,2))];
    if(!row)break;
    chosen.push({name,...row});species.add(row.id);
   }
   if(chosen.length!==5)continue;
   const members=[],panels=[],used=new Set();
   for(const {name,hero,id,aiSkill} of chosen){
    const remaining=inventory.filter(q=>!used.has(q.id));
    const sets=id===392?['镇墓兽']:id===372||id===379?[]:roles[name].sets;
    const set=strategy.sets?.[name]??sets[variant%sets.length];
    const find=setName=>C.findBuilds(hero,configFor(name,id,openingSpeed,bossSpeed,earlySpeed,setName),account,roster,effects,
     {inventory:remaining,width:22,perSet:3,limit:1000});
    const scored=find(set);
    const open=set&&!scored.builds.length?find(null):null;
    const build=scored.builds[0]||open?.builds[0]||
     (open&&open.closest?.distance<scored.closest?.distance?open.closest:scored.closest??open?.closest);
    if(build?.soulIds.length!==6||build.soulIds.some(id=>used.has(id)))break;
    const souls=build.soulIds.map(id=>account.souls[id].raw);
    for(const id of build.soulIds)used.add(id);
    members.push({instanceId:hero.instanceId,hero:hero.raw,souls,aiSkill});
    panels.push(build.rawPanel);
   }
   if(members.length!==5)continue;
   const plan={onmyoji,...(spirit?{spirit}:{}),members};
   const key=teamKey(plan);
   if(seen.has(key))continue;
   seen.add(key);
   sampled.push({title:strategy.name,heroIds:chosen.map(row=>row.id),plan,panels});
   if(sampled.length===limit)break;
  }
 }
 return sampled;
}

return {candidates,teamKey,baseSampleSeeds,sampleSeeds,extraSeeds};
});
