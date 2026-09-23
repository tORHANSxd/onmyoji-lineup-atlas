const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js'),Categories=require('../app/categories.js');
const Library=require('../app/library-model.js');
const row=(id,title,code,time,extra={})=>({id,title,code,members:[],updatedAt:time,...extra});
const library=(lineups=[],extra={})=>({schemaVersion:1,lineups,accounts:[],deletedPresetIds:[],...extra});
test('backup merges local-only records and resolves transitive title, code and ID conflicts by time',()=>{
 const presets=[row('preset','预设','|TA|preset','2026-01-01')];
 const local=library([row('a','同名','|TA|a','2026-06-01'),row('only','本机独有','|TA|only','2026-01-01')]);
 const backup=library([row('b',' 同名 ','|TA|b','2026-04-01'),row('c','另一名','|TA|b','2026-07-01'),row('c','最新','|TA|preset','2026-08-01')]);
 const before=JSON.stringify({presets,local,backup}),result=C.reconcileLibrary(presets,local,backup);
 assert.deepEqual(result.state.lineups.map(l=>l.id).sort(),['c','only']);
 assert.equal(result.state.lineups.find(l=>l.id==='c').title,'最新');
 assert.equal(result.summary.candidates,6);assert.equal(result.summary.removed,4);
 assert.deepEqual(C.libraryLineups(presets,result.state).map(l=>l.id).sort(),['c','only']);
 assert.equal(JSON.stringify({presets,local,backup}),before);
});
test('backup compares actual content times and does not freshen records on restore',()=>{
 const presets=[row('p','甲','|TA|p','2026-06-01')];
 const local=library([row('x','甲','|TA|x','invalid',{parsedAt:'2026-07-01',createdAt:'2026-01-01'})]);
 const backup=library([row('y','甲','|TA|y','2026-06-20',{lastParseAttemptAt:'2099-01-01'})],{exportedAt:'2099-01-01'});
 const result=C.reconcileLibrary(presets,local,backup);
 assert.equal(result.state.lineups[0].id,'x');assert.equal(result.state.lineups[0].updatedAt,'invalid');
 assert.equal(C.lineupTimestamp({updatedAt:'2026-02-01',parsedAt:'2026-03-01',date:'2026-01-01'}),Date.parse('2026-03-01'));
 assert.equal(C.reconcileLibrary([],library([row('local','甲','|TA|l')]),library([row('backup','甲','|TA|b')])).state.lineups[0].id,'local');
 assert.equal(C.reconcileLibrary(presets,library([row('local','甲','|TA|l','2026-06-01')]),library([row('backup','甲','|TA|b','2026-06-01')])).state.lineups[0].id,'local');
});
test('backup recognizes normalized full codes and verified short aliases without changing opaque key case',()=>{
 const result=C.reconcileLibrary([],library([
  row('full','甲','#TA#YWJjZGVm','2026-02-01',{shortCode:'|TA|shared'}),
  row('upper','大写','|TA|CASE','2026-02-01'),row('empty-a','','|TA|empty-a','2026-02-01')
 ]),library([
  row('bare','乙','YWJjZGVm','2026-01-01'),row('short','丙','｜ｔａ｜shared','2026-03-01'),
  row('lower','小写','|TA|case','2026-01-01'),row('empty-b','','|TA|empty-b','2026-01-01')
 ]));
 assert.deepEqual(result.state.lineups.map(l=>l.id).sort(),['empty-a','empty-b','lower','short','upper']);
});
test('backup retargets merged IDs and drafts and preserves local targets only for restored accounts',()=>{
 const local=library([row('old','同名','|TA|old','2026-01-01'),row('only','独有','|TA|only','2026-01-01')],{accounts:[{id:'keep'},{id:'drop'}],targetLineups:{keep:['old','only'],drop:['old']}});
 const backup=library([row('new','同名','|TA|new','2026-02-01')],{accounts:[{id:'keep'}],activeAccount:'keep',targetLineups:{keep:['old','new','missing']},builderDraft:{savedId:'old',title:'未保存草稿'}});
 const result=C.reconcileLibrary([],local,backup).state;
 assert.deepEqual(result.targetLineups,{keep:['new','only']});assert.equal(result.builderDraft.savedId,'new');
 assert.equal(result.builderDraft.title,'未保存草稿');assert.deepEqual(result.accounts,[{id:'keep'}]);
 assert.deepEqual(C.reconcileLibrary([],result,backup).state,result);
});
test('suppressed presets stay merged across reloads but a later preset can win on the next merge',()=>{
 const presets=[row('p','旧预设','|TA|same','2026-01-01')],local=library([row('custom','新自建','|TA|same','2026-02-01')]);
 const first=C.reconcileLibrary(presets,local).state;
 assert.deepEqual(first.lineupReplacements,{p:'custom'});
 assert.equal(C.libraryLineups(presets,JSON.parse(JSON.stringify(first))).length,1);
 assert.deepEqual(C.reconcileLibrary(presets,first,JSON.parse(JSON.stringify(first))).state,first);
 const latest=[{...presets[0],updatedAt:'2026-03-01'}],next=C.reconcileLibrary(latest,first).state;
 assert.equal(next.lineups[0].id,'p');assert.deepEqual(next.lineupReplacements,{custom:'p'});
 const removed=C.removeLibraryLineups(first,presets,['custom']);
 assert.equal(C.reconcileLibrary(presets,removed).state.lineups.length,0);
 assert.equal(C.libraryLineups(presets,Library.reset(first)).length,1);
 assert.deepEqual(Library.reset(first).lineupReplacements,{});
});
test('backup includes independent records from both sides and respects explicitly deleted presets',()=>{
 const presets=[row('p','删除项','|TA|p','2026-01-01')],local=library([row('l','本机','|TA|l','2026-01-01')],{deletedPresetIds:['p']});
 const result=C.reconcileLibrary(presets,local,library([row('b','备份','|TA|b','2026-01-01')]));
 assert.deepEqual(result.state.lineups.map(l=>l.id).sort(),['b','l']);
 assert.deepEqual(C.libraryLineups(presets,result.state).map(l=>l.id).sort(),['b','l']);
});
test('separately edited descendants sharing a historical ID still merge and retarget to the latest',()=>{
 const original=library([row('old','原名','|TA|old','2026-01-01')]);
 const branch=(id,time)=>C.reconcileLibrary([],original,library([row(id,'原名','|TA|'+id,time)])).state;
 const left=branch('left','2026-02-01'),right=branch('right','2026-03-01');
 left.lineups[0]={...left.lineups[0],title:'本机改名'};right.lineups[0]={...right.lineups[0],title:'备份改名'};
 right.accounts=[{id:'account'}];right.targetLineups={account:['old']};right.builderDraft={savedId:'old'};
 const result=C.reconcileLibrary([],left,right).state;
 assert.deepEqual(result.lineups.map(l=>l.id),['right']);assert.deepEqual(result.targetLineups,{account:['right']});
 assert.equal(result.builderDraft.savedId,'right');assert.deepEqual(result.lineupReplacements,{left:'right',old:'right'});
});
test('all bundled presets deduplicate deterministically without rewriting the preset source',()=>{
 const presets=require('../data/bundle.json').lineups,result=C.reconcileLibrary(presets,library());
 assert.equal(presets.length,373);assert.equal(result.state.lineups.length,318);
 assert.equal(C.libraryLineups(presets,result.state).length,318);
 assert.equal(new Set(result.state.lineups.map(l=>l.title.trim())).size,318);
});
test('manual multiple destinations survive decoding and preset hydration',()=>{
 const paths=[{category:'用户',subcategory:'甲',section:'分组',dungeon:'一'},{category:'用户',subcategory:'乙',dungeon:'二',extended:true}];
 const old={id:'x',code:'|TA|x',title:'自选',members:[],manualClassification:true,manualPaths:paths,...paths[0]};
 const parsed={...old,manualPaths:undefined,manualClassification:undefined,section:'原码',category:'自动',raw:{},members:[]};
 const merged=C.mergeDecodedLineup(old,parsed),result=Categories.resolve(merged,{stageCatalog:{scenes:[]}});
 assert.deepEqual(result.classificationPaths,paths);assert.equal(result.section,'分组');
});
test('reviewed preset takes priority over a placeholder game stage',()=>{
 const lineup={id:'iron',code:'|TA|iron',title:'铁鼠',gameSceneId:1};
 const paths=[{category:'寮活动',subcategory:'首领退治',dungeon:'贪婪的铁鼠'}];
 const data={stageCatalog:{scenes:[{gameSceneId:1,level1:'阴阳寮',level2:'首领退治',level3:'年兽'}]},lineupCuration:{entries:{'|TA|iron':{paths,reason:'标题与来源一致'}}}};
 assert.deepEqual(Categories.resolve(lineup,data).classificationPaths,paths);
});
test('reviewed duplicate choices retain the official export stage identifier',()=>{
 const p={category:'御魂',subcategory:'业原火',dungeon:'痴之阵',extended:true};
 const choices=Categories.choices({stageCatalog:{scenes:[{gameSceneId:7,level1:'御魂',level2:'业原火',level3:'痴之阵'}]},extendedStages:[p],lineupCuration:{entries:{x:{paths:[p]}}}});
 assert.equal(choices.length,1);assert.equal(choices[0].gameSceneId,7);assert.equal(choices[0].extended,false);
});
test('preset curation covers every code and keeps restricted uses explicit',()=>{
 const data=require('../data/bundle.json'),entries=data.lineupCuration.entries;
 assert.equal(Object.keys(entries).length,data.lineups.length);
 assert.equal(entries['|TA|552839fe8296b35bfd006f6556ed9a8d'].paths.find(p=>p.subcategory==='狭间暗域').dungeon,'精英（除神龙）');
 assert.equal(entries['|TA|5665373c41d9a578231bf3408bc3b918'].paths.find(p=>p.subcategory==='狭间暗域').section,'极难度（仅2倍血量）');
 assert.equal(entries['|TA|620a1feebd6885e96ab1b8b628629334'].paths[0].dungeon,'拾层');
 assert.equal(entries['|TA|f3b9ace97465bdce393fbdbc41057b18'].verification,'needs-review');
 const native=new Set(data.stageCatalog.scenes.map(s=>Categories.caption(Categories.normalize({category:s.level1,subcategory:s.level2,dungeon:s.level3}))));
 for(const e of Object.values(entries))for(const p of e.paths)if(!native.has(Categories.caption(p)))assert.equal(p.extended,true);
});
