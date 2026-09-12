const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js'),data=require('../data/bundle.json'),TA=require('../desktop/ta-codec.cjs');
const vector=require('./fixtures/ta-vectors.json').find(v=>v.name==='apk_sample_v3');
const plain={attack:1000,defense:500,maxHp:10000,speed:100,critRate:.1,critPower:.5,debuffEnhance:0,debuffResist:0};
const roster=['1','2'].map(id=>({id,name:id,assets:{baseAttrs40:{1:plain}}}));
const config=(extra={})=>({suitRequirements:[],suitSelectionComplete:true,mainStats:{},ranges:[],metricId:7,scope:'all',...extra});
const hero=(instanceId='a',shikigamiId='1')=>({instanceId,shikigamiId,level:40,star:6,awake:1,skills:[]});
const soul=(slot,set='招财猫',stats={},id=String(slot))=>({id,slot,set,level:15,star:6,mainStat:'attack',stats,unknown:[],raw:{mainAttrValue:0,subAttributes:[]}});
const account=souls=>({heroes:{a:hero(),b:hero('b','2')},souls:Object.fromEntries(souls.map(s=>[s.id,s])),presets:[],completeness:'complete'});
const member=(index=0,sid='1',c=config())=>({index,kind:'shikigami',name:sid,shikigamiId:sid,awakening:1,skills:[],config:c});
test('APK确认的四种达摩名称与防御/无刀取二件套',()=>{
  for(const [id,name]of [[410,'招福达摩'],[411,'御行达摩'],[412,'奉为达摩'],[413,'大吉达摩']]){const r=data.roster.find(r=>r.id===String(id));assert.equal(r.name,name);assert.equal(r.isMaterial,true);}
  assert.equal(data.effects.find(e=>e.stat==='defensePercent').value,.3);assert.equal(data.effects.find(e=>e.stat==='critDamage').value,.2);
});
test('分页遍历每个实例，筛选后越界页码回到最后一页',()=>{
 const all=Array.from({length:4114},(_,i)=>i),seen=[];
 for(let p=1;p<=69;p++)seen.push(...C.paginate(all,p,60).items);
 assert.deepEqual(seen,all);assert.equal(C.paginate(all.slice(0,4),69,60).page,1);assert.equal(C.paginate([],1,60).start,0);
});
test('TA全部面板、额外属性、内外槽位、重复套装均正确转换',()=>{
 const l=C.adaptTA(TA.decodeInput(vector.payload),data),c=l.members[1].config;
 assert.deepEqual(Object.keys(c.mainStats),['2','4','6']);assert.equal(c.suitRequirements[0].count,6);
 assert.equal(c.ranges.find(r=>r.stat==='critDamage').min,250);assert.equal(c.ranges.find(r=>r.stat==='critDamage').percentage,true);
 assert.equal(c.extraAttributes.attack,2101.4);assert.equal(c.extraAttributes.attackPercent,.225);
 assert.deepEqual(l.members[2].config.twoPieceStats,['attackPercent','crit','hpPercent']);
});
test('六件同套重复二件加成，首领固定属性不重复加',()=>{
 const b=C.baseFromRoster(hero(),roster),souls=Array.from({length:6},(_,i)=>soul(i+1,'地藏像'));
 assert.equal(C.panel(b,souls,data.effects).values.hp,13000);
 const boss=[soul(1,'土蜘蛛',{crit:.08}),soul(2,'土蜘蛛',{crit:.08})];
 assert.equal(C.panel(b,boss,data.effects).values.crit,.26);
});
test('四件套本身的属性不能冒充额外指定的两件套属性',()=>{
 const c=config({suitRequirements:[{name:'破势',count:4}],twoPieceStats:['crit']});
 const souls=Array.from({length:6},(_,i)=>soul(i+1,i<4?'破势':'火灵'));
 assert.equal(C.suitMatches(souls,c,data.effects),false);
 souls[4].set=souls[5].set='针女';assert.equal(C.suitMatches(souls,c,data.effects),true);
 souls[4].set=souls[5].set='破势';assert.equal(C.suitMatches(souls,c,data.effects),true);
});
test('按导出实际等级基础值计算，觉醒攻击加成不乘到御魂加成上',()=>{
 const h={...hero('x','211'),level:30,star:4,attrs:[[5000,0,0,5000],[91,20,0,111],[.5,0,0,.5],[.1,0,0,.1],[200,0,0,200],[1000,0,0,1000],3,5]};
 const b=C.baseFromRoster(h,data.roster);assert.equal(b.attack,1000);assert.equal(b.effectHit,0);assert.equal(b.effectResist,0);
 assert.equal(C.panel(b,[soul(1,'破势',{attackPercent:.55})],data.effects).values.attack,1650);
 assert.equal(b.crit,.1);assert.equal(b.critDamage,1.5);
});
test('明确主属性缺口有位置建议，数值候选给实际差值',()=>{
 const a=account(Array.from({length:6},(_,i)=>soul(i+1))),c=config({mainStats:{2:['speed']},ranges:[{stat:'speed',min:130}]});
 const r=C.findBuilds(a.heroes.a,c,a,roster,data.effects);
 assert.equal(r.status,'missing');assert.equal(r.closest.soulIds.length,6);
 assert.equal(r.closest.gaps.find(g=>g.stat==='speed').delta,30);
 assert.ok(r.suggestions.some(s=>s.includes('2号位')&&s.includes('速度')));
});
test('属性有上限时给出降低建议，不盲目强化',()=>{
 const a=account(Array.from({length:6},(_,i)=>soul(i+1,'招财猫',{speed:10}))),c=config({ranges:[{stat:'speed',max:150}]});
 const r=C.findBuilds(a.heroes.a,c,a,roster,data.effects);
 assert.equal(r.closest.gaps.find(g=>g.stat==='speed').delta,10);assert.ok(r.suggestions.some(s=>s.includes('降低速度')));
});
test('最高属性按原码计算次序检查，不接受反向分配',()=>{
 const souls=Array.from({length:6},(_,i)=>soul(i+1,'招财猫',{speed:5}));souls.push(...Array.from({length:6},(_,i)=>soul(i+1,'招财猫',{speed:1},'b'+i)));
 const a=account(souls),l={requirementsComplete:true,members:[member(0,'1',config({highestStats:['speed'],ranges:[{stat:'speed',min:110}]})),member(1,'2',config())]};
 const r=C.matchLineup(l,a,roster,data.effects,{limit:1000});assert.equal(r.status,'available');assert.ok(r.assignment[0].panel.speed>=r.assignment[1].panel.speed+.1);assert.equal(new Set(r.assignment.flatMap(b=>b.soulIds)).size,12);
});
test('不同实例拥有不同基础属性时不会只检查前三个',()=>{
 const a=account(Array.from({length:6},(_,i)=>soul(i+1)));const localRoster=[{...roster[0],gameRules:{baseHit:0,baseResist:0,awakeBonus:{}}}];
 a.heroes=Object.fromEntries([100,100,100,140].map((speed,i)=>['h'+i,{...hero('h'+i),attrs:[[10000,0,0,10000],[speed,0,0,speed],[.5,0,0,.5],[.1,0,0,.1],[500,0,0,500],[1000,0,0,1000],0,0]}]));
 const r=C.matchLineup({requirementsComplete:true,members:[member(0,'1',config({ranges:[{stat:'speed',min:140}]}))]},a,localRoster,data.effects);assert.equal(r.status,'available');assert.equal(r.assignment[0].heroId,'h3');
});
test('有主角或契灵缺项只能标记式神御魂就绪，不能全部达标',()=>{
 const a=account(Array.from({length:6},(_,i)=>soul(i+1))),l={requirementsComplete:true,members:[member(),{index:1,kind:'onmyoji',name:'晴明',skills:[{id:1001,level:5}],qiling:{id:1,star:6,lv:20,marks:[1,2]}}]};
 const r=C.matchLineup(l,a,roster,data.effects);assert.equal(r.status,'unknown');assert.equal(r.ready,true);assert.ok(r.checks.some(s=>s.includes('契灵 ID 1')));
});
test('差距排序保持待解析最后，未知项目不能消失成可用',()=>{
 const rows=[{distance:null},{distance:20,status:'missing'},{distance:0,status:'unknown',checks:['契灵']},{distance:0,status:'available'}];rows.sort(C.compareMatches);assert.equal(rows[0].status,'available');assert.equal(rows[1].status,'unknown');assert.equal(rows[3].distance,null);
});
test('套装候选回溯给具体四件套留足位置',()=>{
 const effects=[{name:'任意效果',stat:'crit',value:.15,suitNames:['X','Y']},{name:'限定效果',stat:'attackPercent',value:.15,suitNames:['X']}],souls=Array.from({length:6},(_,i)=>soul(i+1,i<4?'X':'Y'));
 assert.equal(C.suitMatches(souls,config({suitRequirements:[{name:'任意效果',count:2},{name:'限定效果',count:4}]}),effects),true);
});
test('同一套穿六件只有两次二件套，不能冒充三组属性',()=>{
 const souls=Array.from({length:6},(_,i)=>soul(i+1,'破势'));
 assert.equal(C.suitMatches(souls,config({twoPieceStats:['crit','crit','crit']}),data.effects),false);
 assert.equal(C.suitMatches(souls,config({twoPieceStats:['crit','crit']}),data.effects),true);
});
test('共享计算缓存不能把其他账号的御魂分给当前账号',()=>{
 const cache=new Map(),a=account(Array.from({length:6},(_,i)=>soul(i+1))),b=account(Array.from({length:6},(_,i)=>soul(i+1,'招财猫',{},'other'+i)));
 C.findBuilds(a.heroes.a,config(),a,roster,data.effects,{cache});
 const r=C.findBuilds(b.heroes.a,config(),b,roster,data.effects,{cache});assert.ok(r.builds[0].soulIds.every(id=>id.startsWith('other')));
});
test('未知套装属性不能默认为没有加成后宣称找到方案',()=>{
 const a=account(Array.from({length:6},(_,i)=>soul(i+1,'未来套装'))),r=C.findBuilds(a.heroes.a,config(),a,roster,data.effects);
 assert.equal(r.status,'unknown');assert.equal(r.builds.length,0);
});
test('最高属性的参照使用此前式神实际穿戴值，不把其额外属性当作参照',()=>{
 const souls=Array.from({length:6},(_,i)=>soul(i+1));souls.push(...Array.from({length:6},(_,i)=>soul(i+1,'招财猫',{},'b'+i)));
 const a=account(souls),l={requirementsComplete:true,members:[member(0,'1',config({highestStats:['attack'],extraAttributes:{attack:5000}})),member(1,'2',config())]};
 const r=C.matchLineup(l,a,roster,data.effects);assert.equal(r.status,'unknown');assert.equal(r.assignment,null);
});
