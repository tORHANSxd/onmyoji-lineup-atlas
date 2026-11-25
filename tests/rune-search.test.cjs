'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js');
const G=require('../app/game-config.js');
const R=require('../app/rune-candidate.js');
const T=require('../desktop/ta-codec.cjs');
const {candidates,teamKey,sampleSeeds,baseSampleSeeds,hun13Candidates,hun13Key,hun13SampleSeeds}=require('../app/rune-search.js');
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
 assert.deepEqual(sampleSeeds,[0,1,2,3,7,42,8929,2016,7698]);
});

test('不足五名可用式神时不补造角色和配装',()=>{
 const raw=inventory();
 delete raw.heroes['hero-389'];
 assert.deepEqual(candidates(C.parseAccount(raw),data),[]);
});

test('只有同种子的有效结算可以判为通关或落败',()=>{
 const win={seed:0,completed:true,outcome:'win',wavesCleared:3,engineSeconds:18.2};
 assert.equal(R.sampleVerdict(win,0),'pass');
 assert.equal(R.sampleVerdict({...win,outcome:'loss',wavesCleared:1},0),'loss');
 for(const report of [{...win,seed:1},{...win,completed:false,outcome:'loss'},
  {...win,wavesCleared:2},{...win,outcome:'unknown'},{...win,engineSeconds:NaN}]){
  assert.equal(R.sampleVerdict(report,0),'unknown');
 }
 assert.equal(R.passed(sampleSeeds.map(seed=>({...win,seed}))),true);
 assert.equal(R.passed(sampleSeeds.filter(seed=>seed!==8929).map(seed=>({...win,seed}))),false);
 assert.equal(R.passed(sampleSeeds.map(seed=>({...win,seed,...(seed===8929?{outcome:'loss',wavesCleared:1}:{})}))),false);
 assert.equal(R.passed([win]),false);
});

test('共同种子计时包含慢场次，并为所有可比队伍选用同一时钟',()=>{
 const trials=(combat,engine,hardSeed)=>sampleSeeds.map(seed=>({seed,engineSeconds:seed===hardSeed?engine:160,
  animationPlayback:{combatElapsedMs:seed===hardSeed?combat:140000}}));
 const a={samples:trials(416800,427.9,7698)},b={samples:trials(152480,164.5,2016)};
 const comparable=R.commonSampleTiming([a,b]);
 assert.deepEqual(comparable.get(a),{combat:true,seed:7698,seconds:416.8});
 assert.deepEqual(comparable.get(b),{combat:true,seed:2016,seconds:152.48});
 delete b.samples[0].animationPlayback;
 const fallback=R.commonSampleTiming([a,b]);
 assert.deepEqual(fallback.get(a),{combat:false,seed:7698,seconds:427.9});
 assert.deepEqual(fallback.get(b),{combat:false,seed:2016,seconds:164.5});
});

test('采样候选的游戏码带条件，本机配装经过持久化后可以精确复跑',async()=>{
 const account=C.parseAccount(inventory());
 const [row]=candidates(account,data);
 row.samples=sampleSeeds.map(seed=>({seed,completed:true,outcome:'win',wavesCleared:3,engineSeconds:20}));
 const fields=await R.template(row,data);
 const code=T.encodeLineupData(T.validateGameLineup(fields,data));
 const parsed=C.adaptTA(T.decodeInput(code),data);
 const saved=await R.receipt(row,account,code);
 const lineup={...parsed,runeReceipts:[JSON.parse(JSON.stringify(saved))]};
 assert.equal(parsed.members.length,6);
 assert.equal(parsed.gameSceneId,1001001);
 assert.deepEqual(parsed.members[0].skills.map(s=>s.id),[1008,1011]);
 for(const [i,m] of parsed.members.slice(1).entries()){
  const gear=row.plan.members[i].souls.map(q=>account.souls[q.id]);
  assert.deepEqual(C.equipmentGaps(gear,m.config,data.effects),[]);
  assert.deepEqual(C.checkPanel(row.panels[i],m.config),[]);
  assert.ok(!JSON.stringify(parsed.raw).includes(row.plan.members[i].instanceId));
  assert.ok(gear.every(q=>!JSON.stringify(parsed.raw).includes(q.id)));
 }
 const restored=C.restoreAccount(account);
 assert.deepEqual(await R.restore(lineup,restored),row.plan);
 const {dungeonId,...legacy}=saved;
 const older={...lineup,runeReceipts:[{...legacy,samples:saved.samples.slice(0,6)}]};
 assert.deepEqual(await R.restore(older,restored),row.plan);
 assert.equal(await R.restore(lineup,{...restored,id:'other'}),null);
 await assert.rejects(R.restore({...lineup,code:code+'a'},restored),/有变化/);
 const soul=row.plan.members[0].souls[0].id;
 const altered=C.restoreAccount(account);
 altered.souls[soul].raw.mainAttrValue++;
 await assert.rejects(R.restore(lineup,altered),/有变化/);
 await assert.rejects(R.template({...row,samples:row.samples.slice(1)},data),/全部采样/);
});

test('悲鸣库存备选按六种子生成悲鸣码，并隔离魂王凭据',async()=>{
 const account=C.parseAccount(inventory());
 const [row]=candidates(account,data,[],101);
 assert.equal(row.dungeonId,101);
 assert.equal(new Set(row.plan.members.flatMap(m=>m.souls.map(q=>q.id))).size,30);
 row.samples=baseSampleSeeds.map(seed=>({seed,completed:true,outcome:'win',wavesCleared:3,engineSeconds:20}));
 assert.equal(R.passed(row.samples,101),true);
 assert.equal(R.passed(row.samples,102),false);
 const template=await R.template(row,data);
 assert.match(template.title,/^魂土/);
 assert.match(template.desc,/6 个离线种子/);
 const code=T.encodeLineupData(T.validateGameLineup(template,data));
 const parsed=C.adaptTA(T.decodeInput(code),data);
 assert.equal(parsed.gameSceneId,1001002);
 const saved=await R.receipt(row,account,code);
 const lineup={...parsed,runeReceipts:[saved]};
 assert.deepEqual(await R.restore(lineup,account),row.plan);
 await assert.rejects(R.restore({...lineup,gameSceneId:1001001},account),/有变化/);
 await assert.rejects(R.template({...row,dungeonId:102},data),/全部采样/);
});

test('虚无备选跨波分配真实库存，同种式神可使用不同实例，胜利后生成两条可解析原码',async()=>{
 const raw=inventory();
 assert.deepEqual(hun13Candidates(C.parseAccount(raw),data),[]);
 raw.heroes={...raw.heroes,...Object.fromEntries(Object.entries(raw.heroes).map(([id,hero])=>[id+'-next',hero]))};
 raw.hero_equips=[...raw.hero_equips,...raw.hero_equips.map(soul=>({...soul,id:soul.id+'-next'}))];
 const account=C.parseAccount(raw),rows=hun13Candidates(account,data),row=rows[0];
 assert.ok(rows.length>0&&rows.length<=6);
 const members=row.plan.rounds.flatMap(round=>round.members),souls=members.flatMap(member=>member.souls);
 assert.equal(new Set(members.map(m=>m.instanceId)).size,10);
 assert.equal(new Set(souls.map(soul=>soul.id)).size,60);
 assert.ok(members.every(member=>account.heroes[member.instanceId].raw===member.hero));
 assert.ok(souls.every(soul=>account.souls[soul.id].raw===soul));
 const excluded=rows.map(value=>hun13Key(value.plan));
 assert.ok(hun13Candidates(account,data,excluded).every(value=>!excluded.includes(hun13Key(value.plan))));
 row.samples=hun13SampleSeeds.map(seed=>({seed,completed:true,outcome:'win',wavesCleared:1,engineSeconds:110}));
 assert.equal(R.passedHun13(row.samples),true);
 await assert.rejects(R.hun13Templates({...row,samples:row.samples.slice(1)},data),/全部采样/);
 const templates=await R.hun13Templates(row,data);
 for(const [index,request] of templates.entries()){
  const code=T.encodeLineupData(T.validateGameLineup(request,data));
  const parsed=C.adaptTA(T.decodeInput(code),data);
  assert.equal(parsed.gameSceneId,1001000);
  assert.match(parsed.title,new RegExp(`虚无第 ${index+1} 波`));
  assert.equal(parsed.members.length,6);
  for(const [i,m] of parsed.members.slice(1).entries()){
   const gear=row.rounds[index].plan.members[i].souls.map(q=>account.souls[q.id]);
   assert.deepEqual(C.equipmentGaps(gear,m.config,data.effects),[]);
   assert.deepEqual(C.checkPanel(row.rounds[index].panels[i],m.config),[]);
  }
 }
});
