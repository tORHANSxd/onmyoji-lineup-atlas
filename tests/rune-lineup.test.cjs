const {test}=require('node:test');
const assert=require('node:assert/strict');
const bundle=require('../data/bundle.json');
const {team,sceneId}=require('../app/rune-lineup.js');

function match(){
 const lineup=structuredClone(bundle.lineups.find(l=>l.gameSceneId===sceneId&&l.members.length===6&&!l.members[0].qiling));
 const account={heroes:{},souls:{}};
 const assignment=lineup.members.filter(m=>m.kind==='shikigami').map(m=>{
  const heroId=`hero-${m.index}`,soulIds=Array.from({length:6},(_,i)=>`soul-${m.index}-${i}`);
  const raw={heroId:Number(m.shikigamiId),awake:m.awakening,level:m.level,star:m.star,skinfo:m.skills.map(s=>[s.id,s.level])};
  account.heroes[heroId]={raw,instanceId:heroId,shikigamiId:m.shikigamiId};
  soulIds.forEach((id,i)=>{account.souls[id]={raw:{id,slot:i+1}};});
  return {index:m.index,heroId,soulIds};
 });
 return {lineup,account,result:{ready:true,completed:true,proof:{state:'optimal'},assignment:assignment.reverse()}};
}

test('魂王复跑按原码槽位使用精算选中的库存实例和自动施法设置',()=>{
 const {lineup,account,result}=match();
 const {plan,conditions}=team(lineup,result,account,bundle.gameConfig);
 const actor=lineup.members[0];
 assert.equal(plan.onmyoji.heroId,Number(actor.onmyojiId));
 assert.equal(plan.onmyoji.aiSkill,actor.aiSkill);
 assert.equal(plan.onmyoji.skinfo[0][0],bundle.gameConfig.heroes[actor.onmyojiId].skills[0]);
 assert.equal(plan.members[0].instanceId,'hero-1');
 assert.equal(plan.members[0].aiSkill,lineup.members[1].aiSkill);
 assert.deepEqual(plan.members[0].souls.map(q=>q.id),result.assignment.at(-1).soulIds);
 assert.match(conditions[0],/平安志未提供/);
});

test('魂王复跑拒绝未精算、库存已变化和不完整的契灵配置',()=>{
 const {lineup,account,result}=match();
 assert.throws(()=>team(lineup,{...result,completed:false},account,bundle.gameConfig),/未给出/);
 const soul=result.assignment[0].soulIds[0];
 delete account.souls[soul];
 assert.throws(()=>team(lineup,result,account,bundle.gameConfig),/已不在当前库存/);
 lineup.members[0].qiling={id:100};
 assert.throws(()=>team(lineup,result,account,bundle.gameConfig),/契灵/);
});

test('魂王复跑按原版星级、等级和重复术印要求选取真实契灵',()=>{
 const {lineup,account,result}=match();
 const actor=lineup.members[0];
 actor.qiling={id:100,star:5,lv:3,mark_gid:5,marks:[36,38,36]};
 const base={id:100,star:6,lv:7,shiny:true,marks:[36,36,38,33]};
 account.raw={hunlings:[
  {...base,uid:'limited-marks',marks:[36,33,38]},
  {...base,uid:'limited-level',lv:1},
  {...base,uid:'limited-star',star:4},
  {...base,uid:'another-type',id:101},
 ]};
 assert.throws(()=>team(lineup,result,account,bundle.gameConfig),/库存缺少满足/);
 account.raw.hunlings.push({...base,uid:'owned-selected'});
 const {plan}=team(lineup,result,account,bundle.gameConfig);
 assert.deepEqual(plan.spirit,base);
 assert.equal(Object.hasOwn(plan.spirit,'uid'),false);
});
