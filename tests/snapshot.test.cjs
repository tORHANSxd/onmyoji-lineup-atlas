const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../app/core.js'),E=require('../app/exact-solver.js');

// Synthetic records following the September export shape; no private inventory.
const snapshot=(extra={})=>({
 format:'mumu-snapshot-v1',source:'synthetic-export',capturedAt:'2026-09-23T00:00:00Z',completeness:'complete',
 player:{serverId:1,shortId:'synthetic',name:'合成库存',level:60,platform:'android',playerMeta:{exp:123}},
 heroes:{example:{heroId:'1',level:40,star:6,awake:1,lock:true,skinfo:[[101,1],[103,5],[102,3]],attrs:[[1000,0,0,0],[100,0,0,0],[.5,0,0,0],[.1,0,0,0],[100,0,0,0],[100,0,0,0],0,0]}},
 heroCount:1,excludedHeroCount:0,
 hero_equips:Array.from({length:6},(_,i)=>({id:'soul-'+i,slot:i+1,quality:6,level:15,setId:'招财猫',mainAttrType:'attack_flat',mainAttrValue:10,subAttributes:[{type:'crit_rate',value:.03}],equippedState:null,initialSubstatCount:4})),
 inventoryCount:6,retainedCount:6,excludedCount:0,equipPresets:[['合成预设',Array.from({length:6},(_,i)=>'soul-'+i)]],
 scope:{heroes:true,souls:true,items:true,realmCards:true,guild:true,taskRecords:false},
 currency:{coin:42,jade:0},heroesBagEntries:[['synthetic-stack-a',9],['synthetic-stack-b',2]],heroesBagCount:11,
 heroBookShards:[[1,8,0,1]],realmCards:[['synthetic-card',3,6,[1,2]]],storyTasks:[[101,[0,1]]],heroStoryProgress:{1:[1,0,0]},
 taskRecords:{},guild:{level:8,members:[{id:'synthetic-member'}]},warnings:['导出器提供的提醒'],diagnostics:[],...extra
});
const desktopSnapshot=(raw=snapshot())=>{const {hero_equips,scope,...rest}=raw;return {...rest,format:'yys-desktop-cache-v1',souls:hero_equips};};
const roster=[{id:'1',name:'合成式神',gameRules:{baseHit:0,baseResist:0,awakeBonus:{}},assets:{baseAttrs40:{1:{attack:100,defense:100,maxHp:1000,speed:100,critRate:.1,critPower:.5,debuffEnhance:0,debuffResist:0}}}}];
const lineup={code:'|TA|synthetic',decodeState:'decoded-local',requirementsComplete:true,members:[{index:1,kind:'shikigami',shikigamiId:'1',name:'合成式神',awakening:1,skills:[],config:{suitRequirements:[],suitSelectionComplete:true,mainStats:{},ranges:[],scope:'all',metricId:null}}]};
const effects=[{name:'防御加成',stat:'defensePercent',value:.3,suitNames:['招财猫']}];
const finish=a=>{const it=E.search(lineup,a,roster,effects);let s;do{s=it.next();}while(!s.done);return s.value;};

test('新版快照保留所有扩展字段，摘要不把堆叠素材算成战斗实例',()=>{
 const raw=snapshot({futureSection:{value:123}}),before=JSON.stringify(raw),a=C.parseAccount(raw);
 assert.equal(Object.keys(a.heroes).length,1);assert.equal(a.heroes.example.locked,true);
 assert.deepEqual(a.heroes.example.skills,[{id:101,level:1},{id:103,level:5},{id:102,level:3}]);
 assert.equal(a.souls['soul-0'].stats.crit,.03);assert.equal(a.souls['soul-0'].stats.attack,10);
 assert.equal(a.snapshot.stackedHeroes,11);assert.equal(a.snapshot.sections.heroesBagEntries,2);
 assert.equal(a.snapshot.sections.heroBookShards,1);assert.equal(a.snapshot.sections.realmCards,1);
 assert.equal(a.snapshot.sections.storyTasks,1);assert.equal(a.snapshot.sections.heroStoryProgress,1);
 assert.equal(a.snapshot.sections.currency,2);assert.equal(a.snapshot.sections.taskRecords,0);
 assert.equal(a.snapshot.sections.guild,1);assert.equal(a.snapshot.scope.taskRecords,false);
 assert.ok(a.warnings.includes('导出器提供的提醒'));assert.deepEqual(a.coverage,{heroes:true,souls:true});
 assert.deepEqual(C.restoreAccount(JSON.parse(JSON.stringify(a))).raw,raw);assert.equal(JSON.stringify(raw),before);
});

test('未采集式神不能据空数组判缺少，御魂仍保留自己的完整性',()=>{
 const a=C.parseAccount(snapshot({heroes:{},heroCount:0,scope:{heroes:false,souls:true}}));
 assert.equal(C.inventoryComplete(a,'heroes'),false);assert.equal(C.inventoryComplete(a,'souls'),true);
 assert.equal(E.inspectHeroes(lineup,a).assessment.heroes,'unknown');
 assert.equal(C.matchLineup(lineup,a,roster,effects).status,'unknown');
 assert.equal(finish(a).proof.state,'blocked');assert.match(a.warnings.join(' '),/未采集.*式神/);
});

test('未采集御魂不能证明无解，也不遮蔽已完整采集的式神',()=>{
 const a=C.parseAccount(snapshot({hero_equips:[],inventoryCount:0,retainedCount:0,scope:{heroes:true,souls:false}}));
 assert.equal(E.inspectHeroes(lineup,a).assessment.heroes,'ready');
 assert.equal(C.matchLineup(lineup,a,roster,effects).status,'unknown');assert.equal(finish(a).proof.state,'blocked');
 assert.deepEqual(C.inventoryComplete(a),false);assert.match(a.warnings.join(' '),/未采集.*御魂/);
});

test('过滤、数量不符与部分导出保持待核对；任务未采集不影响完整战斗库存',()=>{
 for(const patch of [{excludedHeroCount:1},{heroCount:9},{excludedCount:1},{retainedCount:9},{inventoryCount:9},{completeness:'partial'}]){
  const a=C.parseAccount(snapshot(patch));assert.equal(C.inventoryComplete(a),false);assert.equal(finish(a).proof.state,'blocked');
 }
 assert.equal(finish(C.parseAccount(snapshot())).proof.state,'optimal');
});

test('旧版缺少扩展字段可用，空集合与没有提供可区分，损坏附加字段有提醒',()=>{
 const raw=snapshot();for(const k of ['scope','currency','heroesBagEntries','heroesBagCount','heroBookShards','realmCards','storyTasks','heroStoryProgress','taskRecords','guild','warnings','diagnostics'])delete raw[k];
 const old=C.parseAccount(raw);assert.equal(C.inventoryComplete(old),true);assert.equal(old.snapshot.sections.realmCards,null);assert.equal(old.snapshot.stackedHeroes,null);
 const malformed=C.parseAccount(snapshot({heroesBagEntries:[['bad',-1]],realmCards:{bad:true},warnings:[null,'提醒']}));
 assert.equal(malformed.snapshot.stackedHeroes,null);assert.equal(malformed.snapshot.sections.realmCards,null);assert.ok(malformed.warnings.length>=2);
 assert.equal(Object.keys(malformed.heroes).length,1);assert.equal(Object.keys(malformed.souls).length,6);
});

test('新版和旧版增量合并后备份还原保持实例、扩展字段与不完整标记',()=>{
 const older=snapshot();older.heroes.older={...older.heroes.example};older.heroCount=2;
 const latest=snapshot({currency:{coin:7},futureSection:[1,2,3]}),a=C.mergeAccount(C.parseAccount(older),C.parseAccount(latest));
 const restored=C.restoreAccount(JSON.parse(JSON.stringify(a)));
 assert.equal(Object.keys(restored.heroes).length,2);assert.equal(restored.raw.heroCount,2);
 assert.deepEqual(restored.raw.currency,{coin:7});assert.deepEqual(restored.raw.futureSection,[1,2,3]);
 assert.equal(restored.snapshot.stackedHeroes,11);assert.equal(C.inventoryComplete(restored),false);
});

test('增量导入旧版或未采集集合时保留旧扩展数据；明确采集的空集合可以清空',()=>{
 const old=C.parseAccount(snapshot());
 const legacy=snapshot({capturedAt:'2026-09-24T00:00:00Z'});
 for(const key of ['scope','currency','heroesBagEntries','heroesBagCount','heroBookShards','realmCards','storyTasks','heroStoryProgress','taskRecords','guild','warnings','diagnostics'])delete legacy[key];
 const a=C.mergeAccount(old,C.parseAccount(legacy)),restored=C.restoreAccount(JSON.parse(JSON.stringify(a)));
 assert.deepEqual(restored.raw.currency,old.raw.currency);assert.deepEqual(restored.raw.storyTasks,old.raw.storyTasks);
 assert.equal(restored.snapshot.stackedHeroes,11);assert.equal(restored.retainedSections.currency,old.capturedAt);
 const skipped=C.mergeAccount(old,C.parseAccount(snapshot({scope:{heroes:true,souls:true,items:false,realmCards:false,guild:false,taskRecords:false},currency:{},realmCards:[],guild:{}})));
 assert.deepEqual(skipped.raw.currency,old.raw.currency);assert.deepEqual(skipped.raw.realmCards,old.raw.realmCards);assert.deepEqual(skipped.raw.guild,old.raw.guild);
 const empty=C.mergeAccount(old,C.parseAccount(snapshot({currency:{},storyTasks:[],realmCards:[]})));
 assert.deepEqual(empty.raw.currency,{});assert.deepEqual(empty.raw.storyTasks,[]);assert.deepEqual(empty.raw.realmCards,[]);
 assert.equal(empty.retainedSections.currency,undefined);
});

test('桌面缓存快照保留技能、五条副属性、空预设和全部原始扩展数据',()=>{
 const raw=desktopSnapshot();raw.player={...raw.player,shortId:7,serverName:null,platform:null,playerMeta:null};
 raw.souls[0].initialSubstatCount=null;
 raw.souls[0].subAttributes=[{type:'crit_rate',value:.03},{type:'speed',value:4},{type:'attack_rate',value:.07},{type:'hp_flat',value:120},{type:'crit_damage',value:.08,fixedAttribute:true,enhancementCount:null}];
 raw.equipPresets.push(['空预设',[]],['五件预设',raw.souls.slice(0,5).map(q=>q.id)]);
 raw.storyTasks.push([101,[1,0]]);raw.heroStoryProgress={1:[['synthetic-story',[1,0]]]};
 raw.guild={members:[Array.from({length:19},(_,i)=>i)]};raw.futureSection={untouched:[1,2,3]};
 const before=JSON.stringify(raw),a=C.parseAccount(raw),restored=C.restoreAccount(JSON.parse(JSON.stringify(a)));
 assert.equal(a.id,'1:7');assert.equal(a.server,'1');assert.equal(Object.keys(a.heroes).length,1);assert.equal(Object.keys(a.souls).length,6);
 assert.equal(a.heroes.example.locked,true);assert.deepEqual(a.heroes.example.skills,[{id:101,level:1},{id:103,level:5},{id:102,level:3}]);
 assert.deepEqual(a.souls['soul-0'].stats,{attack:10,crit:.03,speed:4,attackPercent:.07,hp:120,critDamage:.08});
 assert.equal(a.souls['soul-0'].unknown.length,0);assert.equal(a.souls['soul-0'].equippedState,null);
 assert.deepEqual(a.presets,raw.equipPresets);assert.equal(a.snapshot.sections.storyTasks,2);assert.equal(a.snapshot.stackedHeroes,11);
 assert.deepEqual(a.coverage,{heroes:true,souls:true});assert.equal(C.inventoryComplete(a),true);assert.deepEqual(a.warnings,['导出器提供的提醒']);
 assert.equal(restored.raw.format,'yys-desktop-cache-v1');assert.deepEqual(restored.raw,raw);assert.equal(Object.hasOwn(restored.raw,'hero_equips'),false);
 assert.deepEqual(restored.souls,a.souls);assert.equal(JSON.stringify(raw),before);
});

test('按已知格式读取对应御魂列表，不猜测缺失字段或混用另一个列表',()=>{
 const modern=desktopSnapshot(),legacy=snapshot();
 modern.hero_equips=[{id:'ignored-legacy'}];legacy.souls=[{id:'ignored-desktop'}];
 assert.equal(Object.keys(C.parseAccount(modern).souls).length,6);assert.equal(Object.keys(C.parseAccount(legacy).souls).length,6);
 assert.throws(()=>C.parseAccount({...modern,souls:undefined}),/平安志/);
 assert.throws(()=>C.parseAccount({...legacy,hero_equips:undefined}),/平安志/);
 assert.throws(()=>C.parseAccount({...modern,format:'unverified-export'}),/平安志/);
 const empty=desktopSnapshot();empty.souls=[];empty.hero_equips=snapshot().hero_equips;empty.inventoryCount=empty.retainedCount=0;
 assert.equal(Object.keys(C.parseAccount(empty).souls).length,0);assert.equal(C.inventoryComplete(C.parseAccount(empty)),true);
});

test('桌面缓存快照继续拒绝损坏、重复及超限库存，并按实际采集范围判断完整性',()=>{
 const duplicate=desktopSnapshot();duplicate.souls.push(duplicate.souls[0]);assert.throws(()=>C.parseAccount(duplicate),/重复/);
 const malformed=desktopSnapshot();malformed.souls[0].mainAttrValue='invalid';assert.throws(()=>C.parseAccount(malformed),/御魂/);
 const skills=desktopSnapshot();skills.heroes.example.skinfo=[[101,'invalid']];assert.throws(()=>C.parseAccount(skills),/技能/);
 const oversized=desktopSnapshot();oversized.souls=Array(100001).fill(oversized.souls[0]);assert.throws(()=>C.parseAccount(oversized),/100000/);
 for(const patch of [{retainedCount:7},{inventoryCount:7},{excludedCount:1},{scope:{heroes:true,souls:false}}]){
  const a=C.parseAccount({...desktopSnapshot(),...patch});assert.equal(C.inventoryComplete(a,'souls'),false);assert.equal(C.inventoryComplete(a,'heroes'),true);
 }
});

for(const oldFormat of ['mumu-snapshot-v1','yys-desktop-cache-v1'])for(const nextFormat of ['mumu-snapshot-v1','yys-desktop-cache-v1']){
 test(`库存跨格式合并及恢复：${oldFormat} → ${nextFormat}`,()=>{
  const older=oldFormat==='mumu-snapshot-v1'?snapshot():desktopSnapshot(),latest=nextFormat==='mumu-snapshot-v1'?snapshot():desktopSnapshot();
  const oldKey=oldFormat==='mumu-snapshot-v1'?'hero_equips':'souls',nextKey=nextFormat==='mumu-snapshot-v1'?'hero_equips':'souls';
  older.heroes.older={...older.heroes.example};older.heroCount=2;
  older[oldKey].push({...older[oldKey][0],id:'older-only'});older.inventoryCount=older.retainedCount=7;
  latest[nextKey][0].mainAttrValue=25;latest.heroes.example.level=39;latest.capturedAt='2026-09-24T00:00:00Z';
  const before=JSON.stringify([older,latest]),merged=C.mergeAccount(C.parseAccount(older),C.parseAccount(latest));
  const restored=C.restoreAccount(JSON.parse(JSON.stringify(merged)));
  assert.equal(merged.raw.format,nextFormat);assert.equal(merged.raw[nextKey].length,7);
  assert.equal(Object.hasOwn(merged.raw,nextKey==='souls'?'hero_equips':'souls'),false);
  assert.equal(Object.keys(restored.souls).length,7);assert.equal(restored.souls['older-only'].stats.attack,10);assert.equal(restored.souls['soul-0'].stats.attack,25);
  assert.equal(Object.keys(restored.heroes).length,2);assert.equal(restored.heroes.example.level,39);assert.equal(restored.heroes.older.level,40);
  assert.deepEqual({...restored.souls},{...merged.souls});assert.equal(restored.merged,true);assert.equal(C.inventoryComplete(restored),false);
  assert.equal(JSON.stringify([older,latest]),before);
 });
}
