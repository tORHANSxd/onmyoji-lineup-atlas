const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../app/core.js'),E=require('../app/exact-solver.js'),D=require('../data/bundle.json');
const plain={attack:1000,defense:500,maxHp:10000,speed:100,critRate:.1,critPower:.5,debuffEnhance:0,debuffResist:0};
const roster=['1','2'].map(id=>({id,name:id,assets:{baseAttrs40:{1:plain}}}));
const config=(other={})=>({suitRequirements:[],suitSelectionComplete:true,mainStats:{},ranges:[],metricId:7,scope:'all',...other});
const hero=(id,sid)=>({instanceId:id,shikigamiId:sid,level:40,star:6,awake:1,skills:[]});
function fixture(two=true){const souls={};for(let slot=1;slot<=6;slot++)for(let j=0;j<(two?2:1);j++){const id=slot+'-'+j;souls[id]={id,slot,set:'招财猫',level:15,star:6,mainStat:'attack',stats:{speed:j+slot},unknown:[],raw:{mainAttrValue:0,subAttributes:[]}};}return {heroes:{a:hero('a','1'),b:hero('b','2')},souls,presets:[],completeness:'complete'};}
const member=(index,sid,c=config())=>({index,kind:'shikigami',shikigamiId:sid,name:sid,awakening:1,skills:[],config:c});
const lineup=members=>({code:'|TA|test',decodeState:'decoded-local',requirementsComplete:true,members});
function finish(l,a){const it=E.search(l,a,roster,D.effects);let step;do{step=it.next();}while(!step.done);return step.value;}
function brute(l,a){
 const options=l.members.map(m=>{const h=Object.values(a.heroes).find(h=>h.shikigamiId===m.shikigamiId),base=C.baseFromRoster(h,roster),out=[];function walk(slot,items){if(slot===7){const p=C.panel(base,items,D.effects,m.config.extraAttributes);if(!C.equipmentGaps(items,m.config,D.effects).length&&!C.panelGaps(p.values,m.config).length)out.push({ids:items.map(q=>q.id),value:C.score(p.values,m.config.metricId)});return;}for(const q of Object.values(a.souls).filter(q=>q.slot===slot))walk(slot+1,[...items,q]);}walk(1,[]);return out;});
 let best=null;function join(i,used,v){if(i===options.length){if(!best||v.some((x,j)=>x>best[j]&&v.slice(0,j).every((y,k)=>y===best[k])))best=v;return;}for(const b of options[i])if(b.ids.every(id=>!used.has(id)))join(i+1,new Set([...used,...b.ids]),[...v,b.value]);}join(0,new Set(),[]);return best;
}
test('精确搜索对照独立笛卡尔积穷举，按成员顺序全局最优且不重复御魂',()=>{
 for(let seed=0;seed<4;seed++){const a=fixture(),l=lineup([member(0,'1',config({ranges:[{stat:'speed',max:128+seed}]})),member(1,'2',config({ranges:[{stat:'speed',min:124}]}))]);for(const q of Object.values(a.souls))q.stats.speed+=(seed*Number(q.id[0]))%3;const expected=brute(l,a),r=finish(l,a);assert.equal(r.proof.state,expected?'optimal':'infeasible');assert.deepEqual(r.proof.vector,expected);if(r.assignment)assert.equal(new Set(r.assignment.flatMap(b=>b.soulIds)).size,12);}
});
test('没有足够御魂或同式神不同实例时，证明无解而不放宽要求',()=>{
 const a=fixture(false),l=lineup([member(0,'1'),member(1,'2')]);assert.equal(finish(l,a).proof.state,'infeasible');const b=fixture();assert.equal(finish(lineup([member(0,'1'),member(1,'1')]),b).proof.state,'infeasible');
});
test('面板上下限、技能硬约束、套装和乘积指标参与精确约束',()=>{
 const a=fixture();for(const q of Object.values(a.souls)){q.stats.attack=Number(q.id[2])*10;q.stats.critDamage=Number(q.id[0])*.01;}
 const l=lineup([member(0,'1',config({metricId:1,suitRequirements:[{name:'招财猫',count:6}],ranges:[{stat:'critDamage',min:175,percentage:true}]}))]);assert.deepEqual(finish(l,a).proof.vector,brute(l,a));
 l.members[0].skills=[{id:101,level:3}];assert.equal(finish(l,a).proof.state,'infeasible');
});
test('生成器暂停后保留搜索栈，恢复与一次运行结果完全相同；不完整库存不证明无解',()=>{
 const a=fixture(),l=lineup([member(0,'1'),member(1,'2')]),it=E.search(l,a,roster,D.effects);assert.equal(it.next().done,false);let r;do{r=it.next();}while(!r.done);assert.deepEqual(r.value.proof.vector,finish(l,a).proof.vector);a.completeness='partial';assert.equal(finish(l,a).proof.state,'blocked');
});
test('最高属性比较沿用原码次序，后成员不能占用超越前成员的御魂',()=>{
 const a=fixture(),l=lineup([member(0,'1',config({highestStats:['speed']})),member(1,'2')]);const r=finish(l,a);assert.equal(r.proof.state,'optimal');assert.ok(r.assignment[1].panel.speed<=r.assignment[0].rawPanel.speed-.1);
});
test('相同御魂实例只消除对称排列，仍保留足够份数供同队重复式神使用',()=>{
 const a=fixture();a.heroes.b=hero('b','1');for(const q of Object.values(a.souls))q.stats.speed=Number(q.id[0]);
 const l=lineup([member(0,'1'),member(1,'1')]),r=finish(l,a);assert.deepEqual(r.proof.vector,brute(l,a));assert.equal(new Set(r.assignment.flatMap(b=>b.soulIds)).size,12);assert.equal(new Set(r.assignment.map(b=>b.heroId)).size,2);assert.ok(r.proof.nodes<100);
});
test('只有主角没有式神的阵容不产生空最优方案，异常负基础属性不获得证明',()=>{
 const a=fixture();assert.equal(finish(lineup([{index:0,kind:'onmyoji',name:'晴明'}]),a).proof.state,'blocked');
 const badRoster=structuredClone(roster);badRoster[0].assets.baseAttrs40[1].attack=-1;const it=E.search(lineup([member(0,'1')]),a,badRoster,D.effects);let step;do{step=it.next();}while(!step.done);assert.equal(step.value.proof.state,'blocked');
});
test('精算和缺口标签不受主角契灵术印影响，旧映射只忽略主角侧未知字段',()=>{
 const a=fixture(false),base=lineup([member(0,'1')]),actor={index:1,kind:'onmyoji',name:'晴明',level:60,skills:[{id:1,level:5}],aiSkill:10,qiling:{id:1,star:6,lv:20,marks:[1,99999]},config:{protocolUncertainties:['未收录的主角字段']}};
 const expected=finish(base,a),l={...base,mapperVersion:3,requirementsComplete:false,members:[...base.members,actor]},before=structuredClone(l),r=finish(l,a);
 assert.equal(r.status,expected.status);assert.equal(r.gapCategory,'ready');assert.deepEqual(r.gapAssessment,expected.gapAssessment);assert.deepEqual(r.assignment,expected.assignment);assert.deepEqual(r.reasons,expected.reasons);assert.deepEqual(r.checks,[]);assert.deepEqual(l,before);
 l.members[0].config.protocolUncertainties=['未识别式神范围'];assert.equal(finish(l,a).gapCategory,'unknown');
});
test('缺口按两轴区分：只缺式神、只缺御魂、都缺，假设不写入账号',()=>{
 const l=lineup([{...member(0,'1'),level:40,star:6}]),a=fixture(false);delete a.heroes.a;
 const before=structuredClone(a),onlyHero=finish(l,a);assert.equal(onlyHero.gapCategory,'hero-only');assert.equal(onlyHero.assignment,null);assert.equal(onlyHero.gapAssessment.assignment[0].soulIds.length,6);assert.deepEqual(a,before);
 a.souls={};assert.equal(finish(l,a).gapCategory,'both');a.heroes.a=hero('a','1');assert.equal(finish(l,a).gapCategory,'soul-only');
 assert.equal(finish(l,fixture(false)).gapCategory,'ready');
});
test('培养不符、重复实例和全队御魂占用都参与缺口分类，未知基础属性不猜',()=>{
 const m={...member(0,'1'),level:40,star:6,skills:[{id:101,level:3}]},a=fixture(false);
 assert.equal(finish(lineup([m]),a).gapCategory,'hero-only');
 const two=lineup([{...member(0,'1'),level:40,star:6},{...member(1,'1'),level:40,star:6}]);
 assert.equal(finish(two,a).gapCategory,'both');assert.equal(finish(two,fixture()).gapCategory,'hero-only');
 delete a.heroes.a;m.level=20;assert.equal(finish(lineup([m]),a).gapCategory,'unknown');a.completeness='partial';assert.equal(finish(two,a).gapCategory,'unknown');
});
test('式神实例总数足够但不能满足不同技能要求时，不能算式神齐全',()=>{
 const a=fixture();a.heroes.b=hero('b','1');a.heroes.a.skills=[{id:101,level:3}];a.heroes.b.skills=[{id:101,level:1}];
 const m={...member(0,'1'),skills:[{id:101,level:3}]};assert.equal(E.heroAvailability([m,{...m,index:1}],a).state,'missing');
});
test('来源要求或式神技能觉醒不完整时，不能进入单缺和可配出分类',()=>{
 for(const change of [l=>l.requirementsComplete=false,l=>l.members[0].skills=null,l=>l.members[0].awakening=null]){
  const l=lineup([{...member(0,'1'),level:40,star:6}]);change(l);const a=fixture(false);
  assert.equal(finish(l,a).gapCategory,'unknown');delete a.heroes.a;assert.equal(finish(l,a).gapCategory,'unknown');
 }
});

test('三个标签独立计数：实例短缺与培养不足不重复归因',()=>{
 const roles=[{...member(0,'1'),level:40,star:6,skills:[{id:101,level:3}]},{...member(1,'1'),level:40,star:6,skills:[{id:101,level:3}]}],a=fixture();
 a.heroes.a.skills=[{id:101,level:3}];
 let r=finish(lineup(roles),a);
 assert.equal(r.gapAssessment.heroShortage,1);assert.equal(r.gapAssessment.heroTraining,0);assert.equal(r.gapAssessment.souls,'ready');
 a.heroes.a.skills=[{id:101,level:1}];a.souls={};
 r=finish(lineup(roles),a);
 assert.equal(r.gapAssessment.heroShortage,1);assert.equal(r.gapAssessment.heroTraining,1);assert.equal(r.gapAssessment.souls,'missing');
 a.heroes.b=hero('b','1');a.heroes.b.skills=[{id:101,level:3}];
 r=finish(lineup(roles),a);
 assert.equal(r.gapAssessment.heroShortage,0);assert.equal(r.gapAssessment.heroTraining,1);
 delete a.heroes.a;delete a.heroes.b;r=finish(lineup(roles),a);
 assert.equal(r.gapAssessment.heroShortage,2);assert.equal(r.gapAssessment.heroTraining,0);
});
test('技能精确等级冲突、等级、星级与觉醒只产生培养缺口',()=>{
 const a=fixture();a.heroes.b=hero('b','1');a.heroes.a.skills=[{id:101,level:3}];a.heroes.b.skills=[{id:101,level:1}];
 const exact={...member(0,'1'),skills:[{id:101,level:3,exact:true}]};
 const coverage=E.heroAvailability([exact,{...exact,index:1}],a);assert.equal(coverage.shortage,0);assert.equal(coverage.training,1);
 for(const change of [h=>h.level=20,h=>h.star=4,h=>h.awake=0]){
  const b=fixture();change(b.heroes.a);
  const r=finish(lineup([{...member(0,'1'),level:40,star:6}]),b);
  assert.equal(r.gapAssessment.heroShortage,0);assert.equal(r.gapAssessment.heroTraining,1);
 }
});
test('资料不全不推断三种缺口，计算中也保留已知式神缺口',()=>{
 const l=lineup([{...member(0,'1'),level:40,star:6}]),a=fixture();delete a.heroes.a;
 const iterator=E.search(l,a,roster,D.effects);const first=iterator.next().value;
 assert.equal(first.gapAssessment.heroShortage,1);assert.equal(first.gapAssessment.heroTraining,0);iterator.return();
 for(const change of [(l,a)=>a.completeness='partial',(l,a)=>a.merged=true,l=>l.members[0].skills=null,l=>l.requirementsComplete=false]){
  const b=structuredClone(a),copy=structuredClone(l);change(copy,b);const r=finish(copy,b);
  assert.equal(r.gapAssessment.heroShortage,null);assert.equal(r.gapAssessment.heroTraining,null);
 }
});
