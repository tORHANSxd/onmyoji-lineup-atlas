'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js');
const G=require('../app/game-config.js');
const {candidates,teamKey,sampleSeeds}=require('../app/rune-search.js');
const data=require('../data/bundle.json');

function inventory(){
 const ids=[591,389,596,557,379];
 const heroes=Object.fromEntries(ids.map(id=>{
  const skills=data.gameConfig.heroes[id].skills.map(skill=>[skill,G.levels(data.gameConfig,skill,1).at(-1).level]);
  return ['hero-'+id,{heroId:id,level:40,star:6,awake:1,equips:[],skinfo:skills}];
 }));
 const types=['attack_flat','speed','defense_flat','attack_rate','hp_flat','crit_rate'];
 const values=[486,57,104,.55,2052,.55];
 const gear=Array.from({length:36},(_,index)=>{
  const slot=index%6;
  return {id:'soul-'+index,setId:['海月火玉','针女','火灵','元兴寺','心眼','网切'][Math.floor(index/6)],
   slot:slot+1,level:15,quality:6,mainAttrType:types[slot],mainAttrValue:values[slot],
   subAttributes:[{type:'crit_rate',value:.1}]};
 });
 return {format:'mumu-snapshot-v1',player:{serverId:1,shortId:'fixture'},completeness:'complete',heroes,hero_equips:gear,
  hunlings:[{uid:'private-fixture',id:100,lv:3,star:6,marks:[36],shiny:false}]};
}

test('魂王独立于阵容码生成队伍，只使用互不重复的库存实例',()=>{
 const account=C.parseAccount(inventory());
 const found=candidates(account,data);
 assert.ok(found.length>0&&found.length<=6);
 const candidate=found[0];
 const members=candidate.plan.members;
 assert.equal(new Set(members.map(row=>row.instanceId)).size,5);
 assert.ok(members.every(row=>row.hero===account.heroes[row.instanceId].raw));
 const souls=members.flatMap(row=>row.souls);
 assert.equal(new Set(souls.map(row=>row.id)).size,30);
 assert.ok(souls.every(row=>row===account.souls[row.id].raw));
 assert.ok(members.every(row=>new Set(row.souls.map(q=>q.slot)).size===6));
 assert.deepEqual(candidate.plan.onmyoji.skinfo,[[1003,5],[1008,5],[1011,5]]);
 assert.equal(candidate.plan.onmyoji.aiSkill,2);
 assert.equal(candidate.plan.spirit.id,100);
 assert.equal(Object.hasOwn(candidate.plan.spirit,'uid'),false);
 const existing=found.map(row=>teamKey(row.plan));
 assert.ok(candidates(account,data,existing).every(row=>!existing.includes(teamKey(row.plan))));
});

test('魂王有可用群疗式神时优先试能抵消低生命惩罚的配搭',()=>{
 const raw=inventory();
 raw.heroes['hero-238']={heroId:238,level:40,star:6,awake:1,equips:[],skinfo:[[2381,5],[2382,5],[2383,5]]};
 const [first]=candidates(C.parseAccount(raw),data);
 assert.match(first.title,/^群疗/);
 assert.ok(first.heroIds.includes(238));
 assert.equal(first.plan.members[first.heroIds.indexOf(238)].aiSkill,3);
 assert.deepEqual(sampleSeeds,[0,1,2,3,7,42]);
});

test('不足五名可用式神时不补造角色和配装',()=>{
 const raw=inventory();
 delete raw.heroes['hero-389'];
 assert.deepEqual(candidates(C.parseAccount(raw),data),[]);
});
