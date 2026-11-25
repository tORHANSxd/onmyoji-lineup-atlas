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

test('魂王复跑拒绝未精算、库存已变化和未核对的契灵输入',()=>{
 const {lineup,account,result}=match();
 assert.throws(()=>team(lineup,{...result,completed:false},account,bundle.gameConfig),/未给出/);
 const soul=result.assignment[0].soulIds[0];
 delete account.souls[soul];
 assert.throws(()=>team(lineup,result,account,bundle.gameConfig),/已不在当前库存/);
 lineup.members[0].qiling={id:100};
 assert.throws(()=>team(lineup,result,account,bundle.gameConfig),/契灵/);
});
