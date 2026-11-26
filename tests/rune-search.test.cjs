'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js');
const G=require('../app/game-config.js');
const R=require('../app/rune-candidate.js');
const asuraBoss=require('../app/asura-boss.js');
const T=require('../desktop/ta-codec.cjs');
const {candidates,pveCandidates,teamKey,sampleSeeds,baseSampleSeeds,hun13Candidates,hun13Key,hun13SampleSeeds}=require('../app/rune-search.js');
const data=require('../data/bundle.json');

test('天魔归来保留共享生命整数精度、原版槽位和终末之战计分门槛',()=>{
 const final=asuraBoss.entry(602000),tower=asuraBoss.entry(602002);
 const settings={level:30,skills:[31403],specialKeys:[1,7,13],enrage:true,activeTowers:[1,6],bossHp:asuraBoss.maxHp};
 assert.equal(asuraBoss.validSettings(settings,final),true);
 assert.equal(asuraBoss.validSettings({...settings,bossHp:(BigInt(asuraBoss.maxHp)+1n).toString()},final),false);
 assert.equal(asuraBoss.validSettings({...settings,level:29},final),false);
 assert.equal(asuraBoss.validSettings(settings,tower),false);
 assert.deepEqual(asuraBoss.monsterSkills(settings,final),[31425,31429]);
 assert.deepEqual(asuraBoss.monsterSkills({...settings,enrage:false},final),[31436]);
 assert.deepEqual(asuraBoss.monsterSkills(settings,tower),[31419]);
 const samples=[99999,100000].map(damage=>({completed:true,outcome:'win',asuraBattle:{damage}}));
 assert.equal(R.damageMode(final.battleMode),true);
 assert.equal(R.damageMode(tower.battleMode),false);
 assert.equal(R.damageResult(samples).credited,1);
});

test('日轮之陨的单波胜利算通过，误报三波视为结算异常',()=>{
 const reports=baseSampleSeeds.map(seed=>({seed,completed:true,outcome:'win',engineSeconds:21,wavesCleared:1}));
 assert.equal(R.passed(reports,1004),true);
 assert.equal(R.passed(reports,13),false);
 assert.equal(R.sampleVerdict({...reports[0],wavesCleared:3},0,1),'unknown');
});

test('地域鬼王只在共同种子回合与承伤均占优时判定更佳',()=>{
 const score=(seed,rounds,receivedDamage)=>({seed,completed:true,outcome:'win',regionalBoss:{metrics:{rounds,receivedDamage}}});
 const strong=R.regionalResult([score(0,4,500),score(1,5,600)]);
 const weak=R.regionalResult([score(0,5,500),score(1,5,700)]);
 const tradeoff=R.regionalResult([score(0,3,650),score(1,4,700)]);
 const otherSeed=R.regionalResult([score(2,5,500),score(1,5,700)]);
 assert.ok(R.regionalDominates(strong,weak));
 assert.equal(R.regionalDominates(weak,strong),false);
 assert.equal(R.regionalDominates(strong,tradeoff),false);
 assert.equal(R.regionalDominates(tradeoff,strong),false);
 assert.equal(R.regionalDominates(strong,otherSeed),false);
 assert.equal(R.regionalResult([{...score(0,4,500),outcome:'loss'}]),null);
});

test('计分搜索允许第二套阵容凭开场操作反超，且决选使用相同六个种子',async()=>{
 const groups=[[591,389,596,557,379],[591,389,596,554,379],[591,389,596,200,379]];
 const items=groups.map((heroIds,index)=>({
  title:String(index),heroIds,combatRoles:['bossDamage','lightDamage','orbs','healer','support'],
  panels:heroIds.map((_,i)=>({attack:5000-i*300,crit:1,critDamage:2,speed:120+i*10})),
  plan:{onmyoji:{heroId:10},members:heroIds.map(heroId=>({instanceId:String(heroId),souls:[],aiSkill:0,
   hero:{heroId,awake:1,skinfo:data.gameConfig.heroes[heroId].skills.map(id=>[id,1])}}))},
 }));
 const calls=[];
 const result=await R.rankedDamageSearch(items,data.gameConfig,{active:()=>true,async measure(trial,count){
  const index=trial.item.heroIds[3]===554?1:trial.item.heroIds[3]===200?2:0;
  const tactics=trial.item.plan.tactics;
  const damage=index===1&&tactics?.manualOpening?2200:[1600,1400,800][index];
  const seeds=baseSampleSeeds.slice(trial.samples.length,count);
  calls.push({index,tactics,seeds});
  return [...trial.samples,...seeds.map(seed=>({seed,completed:true,outcome:'win',guildHunt:{damage}}))];
 }});
 assert.ok(calls.some(call=>call.index===2&&call.tactics?.redBoss&&call.seeds.length===1));
 assert.ok(calls.some(call=>call.index===1&&call.tactics?.autoMode?.mode==='spell'));
 const winner=result.finalists[0];
 assert.equal(winner.item.heroIds[3],554);
 assert.equal(winner.item.plan.tactics.manualOpening,true);
 assert.ok(result.finalists.some(trial=>trial.item===items[0]));
 for(const trial of result.finalists)assert.deepEqual(trial.samples.map(report=>report.seed),baseSampleSeeds);
});

test('计分优先窗口内单场最高伤害，同分时优先较高的最低伤害',()=>{
 const score=(...damage)=>R.damageResult(damage.map(value=>({completed:true,outcome:'win',guildRetreat:{damage:value}})));
 const high=score(1200,400),stable=score(1000,1000),samePeak=score(1200,500),sameFloor=score(1200,400,1100);
 assert.ok(high.average<stable.average);
 assert.deepEqual([stable,high,samePeak,sameFloor].sort(R.compareDamage),[samePeak,sameFloor,high,stable]);
});

test('计分复评优先保留逐场伤害不同的操作',async()=>{
 const [item]=pveCandidates(C.parseAccount(inventory()),data,5);
 const result=await R.rankedDamageSearch([item],data.gameConfig,{active:()=>true,async measure(trial,count){
  const tactics=trial.item.plan.tactics;
  const damage=!tactics?1000:tactics.manualOpening?1800:tactics.autoMode?.mode==='basic'?2200:
   tactics.greenSlot===1?1600:2000;
  return [...trial.samples,...baseSampleSeeds.slice(trial.samples.length,count).map(seed=>
   ({seed,completed:true,outcome:'win',guildRetreat:{damage}}))];
 }});
 assert.ok(result.finalists.some(trial=>trial.item.plan.tactics.manualOpening));
 assert.ok(result.finalists.some(trial=>trial.item.plan.tactics.autoMode?.mode==='basic'));
 assert.ok(result.finalists.some(trial=>trial.item===item));
});

test('首动按原版可用技能探索指定目标，完整阵容码保留操作',async()=>{
 const [item]=candidates(C.parseAccount(inventory()),data);
 const actorSlot=item.plan.members.findIndex(({hero})=>hero.heroId===596)+1;
 const skillId=5963,requested={actorSlot,skillId,target:'self'};
 const metadata={actorSlot,skills:[{skillId,targets:['self','ally']}]};
 const result=await R.rankedDamageSearch([item],data.gameConfig,{active:()=>true,async measure(trial,count){
  const tactics=trial.item.plan.tactics,opening=tactics?.manualOpening;
  const damage=opening?.target==='self'?2400:opening?.skillId?2300:opening===true?2100:1000;
  return [...trial.samples,...baseSampleSeeds.slice(trial.samples.length,count).map(seed=>({
   battleMode:2000,stageId:61,groupId:61,waveCount:1,seed,completed:true,outcome:'win',guildHunt:{
    damage,tactics,...(opening===true?{manualChoices:metadata}:{}),
   },
  }))];
 }});
 const winner=result.finalists[0],{tactics}=winner.item.plan;
 assert.deepEqual(tactics.manualOpening,requested);
 assert.equal(winner.samples.length,6);
 assert.match(R.scoreInstructions(tactics,winner.item.plan,data.gameConfig),/神无月首动用第 3 技能「美梦赐予」，点自身后切自动/);
 const withMode={...tactics,autoMode:{slot:1,mode:'spell'}};
 const plan={...winner.item.plan,tactics:withMode};
 const template=await R.pveTemplate({...winner.item,plan,samples:winner.samples.map(report=>({
  ...report,guildHunt:{...report.guildHunt,tactics:withMode},
 }))},data,{battleMode:2000,stageId:61,groupId:61,waveCount:1,codeStageId:10020208,codeLabel:'麒麟狩猎'});
 const code=T.encodeLineupData(T.validateGameLineup(template,data));
 assert.deepEqual(R.readScoreInstructions(T.decodeLineupData(code).desc),withMode);
 assert.equal(teamKey(plan),teamKey({...plan,tactics:{...withMode,manualOpening:{target:'self',skillId,actorSlot}}}));
 assert.notEqual(teamKey(plan),teamKey({...plan,tactics:{...withMode,manualOpening:{...requested,target:2}}}));
});

function inventory(){
 const ids=[591,389,596,557,379];
 const heroes=Object.fromEntries(ids.map(id=>{
  const skills=data.gameConfig.heroes[id].skills.map(skill=>[skill,G.levels(data.gameConfig,skill,1).at(-1).level]);
  return ['hero-'+id,{heroId:id,level:40,star:6,awake:1,equips:[],skinfo:skills}];
 }));
 const types=['attack_flat','speed','defense_flat','attack_rate','hp_flat','crit_rate'];
 const values=[486,57,104,.55,2052,.55];
 const gear=Array.from({length:48},(_,index)=>{
  const slot=index%6;
  return {id:'soul-'+index,setId:['海月火玉','针女','火灵','元兴寺','心眼','网切','破势','狂骨'][Math.floor(index/6)],
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
 assert.equal(candidate.plan.damageFloor,true);
 const members=candidate.plan.members;
 assert.equal(new Set(members.map(row=>row.instanceId)).size,5);
 assert.ok(members.every(row=>row.hero===account.heroes[row.instanceId].raw));
 const souls=members.flatMap(row=>row.souls);
 assert.equal(new Set(souls.map(row=>row.id)).size,30);
 assert.ok(souls.every(row=>row===account.souls[row.id].raw));
 assert.ok(souls.every(row=>!['针女','网切'].includes(row.setId)));
 assert.ok(members.every(row=>new Set(row.souls.map(q=>q.slot)).size===6));
 assert.deepEqual(candidate.plan.onmyoji.skinfo,[[1003,5],[1008,5],[1011,5]]);
 assert.equal(candidate.plan.onmyoji.aiSkill,2);
 assert.equal(candidate.plan.spirit.id,100);
 assert.equal(Object.hasOwn(candidate.plan.spirit,'uid'),false);
 const existing=found.map(row=>teamKey(row.plan));
 assert.ok(candidates(account,data,existing).every(row=>!existing.includes(teamKey(row.plan))));
});

test('库存搜索同等稀有度优先少随机技能，再优先有已核实日期的新式神',()=>{
 const raw=inventory();
 const ids=[556,591,608];
 const skills={...data.gameConfig.skills};
 raw.heroes=Object.fromEntries(ids.map(id=>{
  const sources=data.gameConfig.heroes[id].skills;
  const skinfo=sources.map(skillId=>{
   const entry=skills[skillId];
   skills[skillId]={...entry,variants:Object.fromEntries(Object.entries(entry.variants).map(([key,levels])=>
    [key,levels.map(row=>({...row,description:id===591?'有 25% 的概率追加攻击。':'固定攻击目标。',upgrade:'',
     branches:[],aiBranches:[],related:[]}))]))};
   return [skillId,G.levels(data.gameConfig,skillId,1).at(-1).level];
  });
  return ['hero-'+id,{heroId:id,level:40,star:6,awake:1,equips:[],skinfo}];
 }));
 const catalog={...data,gameConfig:{...data.gameConfig,skills}};
 assert.equal(pveCandidates(C.parseAccount(raw),catalog,1)[0].heroIds[0],608);
 delete raw.heroes['hero-608'];
 assert.equal(pveCandidates(C.parseAccount(raw),catalog,1)[0].heroIds[0],556);
});

test('三人库存搜索给只有一名合适式神的位置保留咲耶，并用笼梦祸津神输出',()=>{
 const catalog=require('../desktop/latest-heroes.cjs').applyLatestHeroes(data);
 const raw=inventory();
 raw.heroes=Object.fromEntries([609,237,612].map(id=>{
  const skinfo=catalog.gameConfig.heroes[id].skills.map(skill=>[skill,G.levels(catalog.gameConfig,skill,1).at(-1).level]);
  return ['hero-'+id,{heroId:id,level:40,star:6,awake:1,equips:[],skinfo}];
 }));
 const row=pveCandidates(C.parseAccount(raw),catalog,3).find(item=>item.title==='拉条增伤与输出');
 assert.equal(row.title,'拉条增伤与输出');
 assert.deepEqual(row.heroIds,[237,609,612]);
 assert.equal(new Set(row.plan.members.flatMap(member=>member.souls.map(soul=>soul.id))).size,18);
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
