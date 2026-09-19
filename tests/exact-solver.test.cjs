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
test('超过硬上限明确无解，无关未知御魂不影响证明，相关未知属性仍需补资料',()=>{
 const a=fixture(false),l=lineup([member(0,'1',config({sixStarOnly:true,ranges:[{stat:'speed',min:162,max:164}]}))]);
 for(const q of Object.values(a.souls))q.stats.speed=13.7666666667;
 a.souls.unknown={...a.souls['1-0'],id:'unknown',star:2,unknown:['new_attribute']};
 const r=finish(l,a);assert.equal(r.proof.state,'infeasible');assert.equal(r.gapAssessment.souls,'missing');assert.equal(r.gapCategory,'soul-only');
 a.souls.unknown.star=6;assert.equal(finish(l,a).proof.state,'blocked');
 a.souls.unknown.level=0;l.members[0].config.levelRange=[15,15];assert.equal(finish(l,a).proof.state,'infeasible');
 a.souls.unknown.level=15;a.souls.unknown.mainStat='hp';l.members[0].config.mainStats={1:['attack']};assert.equal(finish(l,a).proof.state,'infeasible');
 a.souls.unknown.mainStat='unrecognized';assert.equal(finish(l,a).proof.state,'blocked');
});
test('缺少配装资料属于待核对，不能因空配置变成计算异常',()=>{
 const l=lineup([member(0,'1',null)]),r=finish(l,fixture());assert.equal(r.proof.state,'blocked');assert.ok(r.reasons.includes('缺少御魂配置'));
});
test('套装缺口区分不同位置与全队实例不足，允许未知套装作为潜在候选',()=>{
 const a=fixture(false),roles=[member(0,'1',config({suitRequirements:[{name:'招财猫',count:4}]})),member(1,'2',config({suitRequirements:[{name:'招财猫',count:4}]}))];
 assert.ok(E.soulShortages(roles,a,D.effects)[0].reasons.some(s=>s.includes('同队共需8件')));
 roles.pop();a.souls['4-0'].set=a.souls['5-0'].set=a.souls['6-0'].set='火灵';assert.ok(E.soulShortages(roles,a,D.effects)[0].reasons.some(s=>s.includes('不同位置最多3')));
 a.souls['4-0'].set='未识别套装';assert.deepEqual(E.soulShortages(roles,a,D.effects),[]);
});
test('十二种目标与上下限：独立数学公式、套装枚举对照精算剪枝',()=>{
 const effects=[{name:'甲',suitNames:['甲'],stat:'crit',value:.15},{name:'乙',suitNames:['乙'],stat:'attackPercent',value:.15}];
 for(let metric=1;metric<=12;metric++)for(let seed=0;seed<4;seed++){
  const a=fixture(),c=config({metricId:metric,suitRequirements:[{name:'甲',count:4}],twoPieceStats:['attackPercent'],ranges:[{stat:'speed',min:120+seed*2,max:129,maxExclusive:seed===3},{stat:'crit',min:25,percentage:true}],extraAttributes:{attackPercent:.2,attack:123,crit:.04,critDamage:.17}}),l=lineup([member(0,'1',c)]);
  for(const q of Object.values(a.souls)){const j=Number(q.id[2]),i=q.slot;q.set=j?'乙':'甲';q.stats={speed:i+j+seed%2,attack:i*7+j*11,attackPercent:j*.03,hp:i*13+j*17,hpPercent:j*.02,defense:i*2+j*3,defensePercent:j*.01,crit:.01*j,critDamage:.02*i,effectHit:i*.011+j*.03,effectResist:i*.007+j*.02};}
  let expected=null;for(let mask=0;mask<64;mask++){
   const qs=Array.from({length:6},(_,i)=>a.souls[(i+1)+'-'+((mask>>i)&1)]),alpha=qs.filter(q=>q.set==='甲').length;if(alpha!==4)continue;
   const totals={};for(const q of qs)for(const [k,v] of Object.entries(q.stats))totals[k]=(totals[k]||0)+v;
   const p={attack:(1000*(1+(totals.attackPercent||0)+.15)+totals.attack)*1.2+123,hp:10000*(1+(totals.hpPercent||0))+totals.hp,defense:500*(1+(totals.defensePercent||0))+totals.defense,speed:100+totals.speed,crit:.1+.15+(totals.crit||0)+.04,critDamage:1.5+totals.critDamage+.17,effectHit:totals.effectHit,effectResist:totals.effectResist};
   if(p.speed<c.ranges[0].min||p.speed>129||seed===3&&p.speed>=129||p.crit<.25)continue;
   const scores=[null,p.attack*p.critDamage,p.effectHit,p.effectResist,p.hp,p.attack,p.defense,p.speed,p.crit,p.critDamage,p.hp*p.critDamage,p.effectHit+p.effectResist,p.defense*p.critDamage];
   expected=expected==null?scores[metric]:Math.max(expected,scores[metric]);
  }
  const it=E.search(l,a,roster,effects);let step;do{step=it.next();}while(!step.done);const r=step.value;
  assert.equal(r.proof.state,expected==null?'infeasible':'optimal',`metric=${metric}, seed=${seed}`);if(expected!=null)assert.ok(Math.abs(r.proof.vector[0]-expected)<1e-7);
 }
});
test('游戏的六条式神专用公式及孔雀动态覆盖用于排序、阈值和上界',()=>{
 const facts=require('../data/soul-objectives.json');assert.equal(facts.expressions.length,6);assert.equal(facts.overrides[0].heroId,550);
 const cases=[['344',1,p=>(p.attack+2*p.defense)*p.critDamage],['344',12,p=>(p.defense+.1*p.attack)*p.critDamage],['332',1,p=>p.attack*p.critDamage**2],['392',1,p=>p.attack*(p.critDamage-.5)],['550',1,p=>(p.attack+1000*(.75+p.effectHit))*p.critDamage],['590',1,p=>p.attack*(p.critDamage+p.effectResist)]];
 for(const [id,metric,score] of cases){
  const a=fixture(),r=[{id,assets:{baseAttrs40:{1:plain}}}];a.heroes={a:hero('a',id)};
  for(const q of Object.values(a.souls)){const j=Number(q.id[2]);q.stats={speed:q.slot,attack:j?0:40,defense:j?35:0,critDamage:j?.06:0,effectHit:j?.1:0,effectResist:j?.09:0};}
  const l=lineup([member(0,id,config({metricId:metric}))]);let best=-Infinity;
  for(let mask=0;mask<64;mask++){let attack=1000,defense=500*1.6,critDamage=1.5,effectHit=0,effectResist=0;for(let slot=1;slot<=6;slot++){const s=a.souls[slot+'-'+((mask>>(slot-1))&1)].stats;attack+=s.attack;defense+=s.defense;critDamage+=s.critDamage;effectHit+=s.effectHit;effectResist+=s.effectResist;}best=Math.max(best,score({attack,defense,critDamage,effectHit,effectResist}));}
  function run(){const it=E.search(l,a,r,D.effects);let step;do{step=it.next();}while(!step.done);return step.value;}
  const result=run();assert.equal(result.proof.state,'optimal');assert.ok(Math.abs(result.proof.vector[0]-best)<1e-7,`${id}/${metric}`);assert.equal(result.assignment[0].objective.heroId,id);
  l.members[0].config.targetScore=best+1;assert.equal(run().proof.state,'infeasible');
  l.members[0].config.targetScore=best-.001;assert.equal(run().proof.state,'optimal');
 }
});
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
