const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../app/core.js'),{summarize}=require('../app/lineup-tools.js');
test('目标按账号保存，库存替换、旧备份和删除预设正确清理引用',()=>{
 const presets=[{id:'p',code:'|TA|p'}],saved={schemaVersion:1,accounts:[{id:'a'},{id:'b'}],lineups:[{id:'u',code:'|TA|u'}],targetLineups:{a:['p','u','u','gone'],b:['p'],other:['u']}};
 assert.deepEqual(C.normalizeTargets(saved,presets),{a:['p','u'],b:['p']});
 saved.accounts[0]={id:'a',capturedAt:'new'};assert.deepEqual(C.normalizeTargets(saved,presets).a,['p','u']);
 const removed=C.removeLibraryLineups(saved,presets,['p']);assert.deepEqual(removed.targetLineups,{a:['u'],b:[]});
 assert.deepEqual(C.normalizeTargets({...saved,targetLineups:undefined},presets),{a:[],b:[]});
});
test('缺口按阵容数去重排序，不把诊断候选套装缺口当作库存缺口',()=>{
 const lineups=['a','b','c','d'].map(id=>({id,title:id})),make=(heroes,souls,extra={})=>({completed:true,proof:{state:'infeasible'},gapAssessment:{heroes:'missing',souls:'missing',heroDeficits:heroes,soulShortages:souls,...extra}});
 const d={id:'1',name:'甲',shortage:2,training:0,required:3,owned:1},s={name:'心眼',reasons:['一号位缺少','二号位缺少']};
 const results={a:make([d,d],[s,s]),b:make([d],[s]),c:make([{id:'2',name:'乙',shortage:1,training:1,required:2,owned:1}],[]),d:{completed:false,proof:{state:'computing'},members:[{closest:{gaps:[{kind:'set',name:'火灵'}]}}]}};
 const r=summarize(lineups,results);assert.deepEqual(r.heroes.map(x=>[x.name,x.count]),[['甲',2],['乙',1]]);assert.equal(r.souls[0].count,2);assert.equal(r.souls.length,1);assert.equal(r.training[0].count,1);assert.equal(r.otherSouls[0].count,1);assert.equal(r.pending,1);assert.equal(r.done,3);
 assert.equal(summarize([lineups[1]],results).heroes[0].count,1);
});
