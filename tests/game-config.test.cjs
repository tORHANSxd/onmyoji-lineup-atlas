'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../app/game-config.js'),D=require('../data/game-config.json');
const stage=Number(Object.keys(D.stages).find(id=>D.stages[id].shikigami===5));
test('魂王的原版开场属性只适用于已核验版本和关卡',()=>{
 const {source,dungeons}=require('../data/dungeon-rules.json');
 const stage=dungeons.find(row=>row.id===102);
 const stats=stage.waves.flat().map(unit=>G.runeOpeningStats(source.resourceVersion,stage.id,unit.id));
 assert.equal(stats.length,9);
 assert.deepEqual(stats.map(row=>row.speed),[141,132,145,137,148,152,135,127,127]);
 assert.equal(Math.round(stats[6].hp),800001);
 assert.equal(G.runeOpeningStats('0.0.817',stage.id,4740062),null);
 assert.equal(G.runeOpeningStats(source.resourceVersion,101,4740062),null);
});
test('八岐大蛇原版开场按副本、波次和槽位匹配，虚无按专用引擎核验两波',()=>{
 const {source,dungeons}=require('../data/dungeon-rules.json');
 const {floors,dungeonTableSHA256}=require('../app/rune-openings.js');
 const {runeFloorIds,sceneForDungeon}=require('../app/rune-lineup.js');
 const version=source.resourceVersion;
 assert.equal(dungeonTableSHA256,source.tables.dungeon_rune.marshalSHA256);
 assert.equal(Object.keys(floors).length,13);
 assert.deepEqual(runeFloorIds,[1,2,3,4,5,6,7,8,9,10,101]);
 for(const [id,floor] of Object.entries(floors)){
  const raw=dungeons.find(row=>row.id===Number(id));
  assert.equal(floor.scene,raw.scene);
  assert.deepEqual([floor.allyOrbs,floor.enemyOrbs],[3,2]);
  assert.equal(floor.waves.length,id==='103'?2:3);
  if(runeFloorIds.includes(raw.id)){
   assert.equal(floor.battleMode,27);
   assert.equal(sceneForDungeon(raw.id),raw.gameSceneId);
   assert.deepEqual([D.stages[raw.gameSceneId].actors,D.stages[raw.gameSceneId].shikigami],[1,5]);
  }
  for(const [i,wave] of floor.waves.entries()){
   assert.deepEqual(wave.map(({id,position,level})=>({id,position,level})),raw.waves[i].map(({id,position,level})=>({id,position,level})));
  }
 }
 assert.equal(G.runeOpeningStats(version,1,15405),null);
 assert.equal(G.runeOpeningStats(version,1,15405,3,2).speed,101);
 assert.equal(G.runeOpeningStats(version,1,15405,3,3).speed,101);
 assert.equal(G.runeOpeningStats(version,1,15405,1,2),null);
 assert.equal(G.runeOpeningStage(version,103).engine,'Hun13Engine');
 assert.equal(G.runeOpeningStage(version,103).battleMode,580);
 assert.equal(G.runeOpeningStage(version,103).baseRoundSeconds,120);
 assert.equal(G.runeOpeningStage(version,103,'changed-table'),null);
});
function lineup(){return {title:'官方结构测试',desc:'',select_stage_id:stage,hconf:[G.defaultMember(D,10),...[554,554,554,554,554].map(id=>G.defaultMember(D,id))]};}
test('客户端技能与原图覆盖每个可用角色，等级和标签按数据读取',()=>{
 for(const hero of Object.values(D.heroes))for(const id of hero.choices){const levels=G.levels(D,id,1);assert.ok(levels.length,hero.name);for(const s of levels){assert.ok(s.name);assert.ok(D.icons[s.icon]?.fileSHA256);assert.ok(s.tags.every(t=>D.tags[t]));}}
 assert.equal(G.skill(D,5542,1,1).name,'守缘刃');assert.equal(G.skill(D,5542,1,1).cost,1);
 assert.equal(G.levels(D,5542,1).length,1);assert.deepEqual(G.skill(D,5542,1,1).branches,[55421,55422]);
 assert.ok(D.heroes[10].equipSkills.includes(1009));assert.ok(!D.heroes[11].equipSkills.includes(1103));
});
test('官方槽位完整且首位固定为阴阳师，六式神副本按数据扩展',()=>{
 const good=lineup();assert.equal(G.validate(D,good),good);
 assert.throws(()=>G.validate(D,{...good,hconf:good.hconf.slice(1)}),/位置|阴阳师/);
 const swapped=structuredClone(good);[swapped.hconf[0],swapped.hconf[1]]=[swapped.hconf[1],swapped.hconf[0]];assert.throws(()=>G.validate(D,swapped),/阴阳师/);
 const six=Number(Object.keys(D.stages).find(id=>D.stages[id].shikigami===6));assert.equal(G.slots(D,six).length,7);
});
test('携带技能、技能等级和自动施法均遵循角色真实配置',()=>{
 const l=lineup();l.hconf[0].skills=[[1009,2],[1011,3]];assert.equal(G.validate(D,l),l);
 l.hconf[0].skills.push([1007,1]);assert.throws(()=>G.validate(D,l),/两个/);
 l.hconf[0].skills=[[1003,1]];assert.throws(()=>G.validate(D,l),/携带/);
 l.hconf[0].skills=[];l.hconf[1].skills=[[5542,5]];assert.throws(()=>G.validate(D,l),/技能等级/);
 l.hconf[1].skills=[[5542,1]];assert.ok(G.aiChoices(D,l.hconf[1]).some(s=>s.value===5&&s.id===55421));
 l.hconf[1].ai_skill=99;assert.throws(()=>G.validate(D,l),/自动施法/);
});
test('术印重复次数编码等级，并兼容游戏历史原码',()=>{
 const l=lineup(),q={id:100,star:6,lv:20,mark_gid:1,marks:[1,1,1,2,2]};l.hconf[0].qiling_info=q;G.validate(D,l);
 assert.deepEqual(G.markLevels(q),[{id:1,level:3},{id:2,level:2}]);
 q.marks=[1,1,1,1];assert.throws(()=>G.validate(D,l),/术印/);q.marks=[9];assert.throws(()=>G.validate(D,l),/术印/);
 q.marks=[9,9,10,11,12,12];q.mark_gid=2;q.lv=0;assert.equal(G.validate(D,l),l);
 q.marks.push(13);assert.throws(()=>G.validate(D,l),/术印/);
 assert.ok(G.spiritAttributes(D,{id:100,star:1,lv:2}).length);
});

test('铁鼠三技能与泷夜叉姬月之奥义按官方槽序锁定',()=>{
 const mouse=G.defaultMember(D,232);assert.equal(G.aiChoices(D,mouse).find(s=>s.value===3).id,2323);assert.equal(G.skillLabel(D,232,2323),'第 3 技能');
 const takiyasha=G.defaultMember(D,338);assert.equal(G.aiChoices(D,takiyasha).filter(s=>s.value>=33831&&s.value<=33844).length,8);
 assert.ok(G.memberSkills(D,G.defaultMember(D,410)).some(s=>s.id===4101));
});
test('历史契灵参数经过完整码重编码保持不变',()=>{
 const codec=require('../desktop/ta-codec.cjs');const l=lineup();l.hconf[0].qiling_info={id:101,star:6,lv:0,mark_gid:5,marks:[36,36,38,36]};
 G.validate(D,l);assert.deepEqual(codec.decodeLineupData(codec.encodeLineupData(l)).hconf[0].qiling_info,l.hconf[0].qiling_info);
});

test('内置全部真实已解析阵容符合当前角色、技能与术印规则',()=>{
 const bundle=require('../data/bundle.json'),rows=bundle.lineups.filter(l=>l.raw?.hconf);assert.equal(rows.length,328);
 const codec=require('../desktop/ta-codec.cjs');
 for(const row of rows){assert.doesNotThrow(()=>G.validate(D,row.raw),row.title);assert.deepEqual(codec.decodeLineupData(codec.encodeLineupData(row.raw)).hconf,row.raw.hconf,row.title);}
});

test('阴阳师技能编号随携带组合排序，全部技能目录不伪造战斗槽号',()=>{
 const h=G.defaultMember(D,10);h.skills=[[1011,1],[1009,1]];
 assert.equal(G.skillLabel(D,10,1009,h),'第 2 技能');assert.equal(G.skillLabel(D,10,1011,h),'第 3 技能');
 assert.equal(G.skillLabel(D,10,1009),'可携带技能');assert.equal(G.skillLabel(D,10,1003),'第 1 技能 · 普攻');assert.equal(G.skillLabel(D,11,1103),'被动技能');
 assert.equal(G.aiChoices(D,h).find(s=>s.id===1009).value,2);
});
