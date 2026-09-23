const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function worker(){
 let response;const context=vm.createContext({TextEncoder,TextDecoder});context.self=context;
 context.postMessage=result=>{response=structuredClone(result);};
 context.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../app',file),'utf8'),context));
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/json-worker.js'),'utf8'),context);
 return (action,value)=>{context.onmessage({data:{action,value}});return response;};
}
const raw=()=>({format:'mumu-snapshot-v1',completeness:'complete',player:{serverId:1,shortId:'synthetic'},heroes:{},hero_equips:[],scope:{heroes:false,souls:true},warnings:['合成提醒'],storyTasks:[[1,[0,1]],[1,[1,0]]]});
test('库存 Worker 合并 JSON 读取与规范化，保留 BOM、扩展集合和范围',()=>{
 const run=worker(),a=run('parse-account',{name:'合成',text:'\uFEFF'+JSON.stringify(raw())}).value;
 assert.equal(a.name,'合成');assert.deepEqual(a.coverage,{heroes:false,souls:true});assert.equal(a.snapshot.sections.storyTasks,2);
 assert.equal(a.raw.storyTasks.length,2);assert.ok(a.warnings.includes('合成提醒'));
 const bad=raw();bad.hero_equips=[{id:'broken'}];assert.match(run('parse-account',{text:JSON.stringify(bad)}).error,/御魂/);
 assert.equal(run('parse','{"ok":true}').value.ok,true);assert.equal(run('stringify',{ok:true}).value,'{"ok":true}');
});
test('旧账号重启与备份恢复都从 raw 重建新字段，保留合并与区服展示',()=>{
 const run=worker(),a={raw:raw(),name:'旧缓存',server:'已补全区服',completeness:'complete',heroes:{},souls:{},merged:true};
 const state={schemaVersion:1,accounts:[a],lineups:[],targetLineups:{x:['p']}};
 const loaded=run('load-state',JSON.stringify(state)).value;
 assert.equal(loaded.accounts[0].snapshot.sections.storyTasks,2);assert.equal(loaded.accounts[0].coverage.heroes,false);
 assert.equal(loaded.accounts[0].merged,true);assert.equal(loaded.accounts[0].server,'已补全区服');assert.deepEqual(loaded.targetLineups,state.targetLineups);
 assert.equal(run('restore-accounts',[a]).value[0].raw.storyTasks.length,2);
 assert.equal(run('load-state','null').value,null);assert.ok(run('load-state','broken').error);
});
test('桌面缓存格式通过后台导入、备份恢复和启动重建，损坏列表不被静默接受',()=>{
 const input=raw();input.format='yys-desktop-cache-v1';delete input.hero_equips;delete input.scope;
 input.heroes={example:{heroId:1,level:40,star:6,awake:1,skinfo:[[101,5]]}};
 input.souls=[{id:'desktop-soul',slot:1,quality:6,level:15,setId:'招财猫',mainAttrType:'attack_flat',mainAttrValue:12,subAttributes:[{type:'crit_rate',value:.03}],equippedState:null}];
 const run=worker(),parsed=run('parse-account',{name:'桌面合成库存',text:'\uFEFF'+JSON.stringify(input)});
 assert.equal(parsed.error,undefined);assert.equal(parsed.value.souls['desktop-soul'].stats.attack,12);assert.equal(parsed.value.heroes.example.skills[0].level,5);
 const cached={...parsed.value,heroes:{},souls:{},server:'已补全区服'},state={schemaVersion:1,accounts:[cached],lineups:[]};
 const results=[run('restore-accounts',[cached]),run('load-state',JSON.stringify(state)),run('restore-state',structuredClone(state))];
 for(const [index,result] of results.entries()){
  assert.equal(result.error,undefined);const account=index===0?result.value[0]:result.value.accounts[0];
  assert.equal(account.souls['desktop-soul'].stats.attack,12);assert.equal(account.souls['desktop-soul'].stats.crit,.03);
  assert.equal(account.heroes.example.skills[0].level,5);assert.deepEqual(account.raw,input);
  if(index>0)assert.equal(account.server,'已补全区服');
 }
 input.souls[0].mainAttrValue='invalid';const invalid=run('parse-account',{text:JSON.stringify(input)});
 assert.match(invalid.error,/御魂/);assert.equal(invalid.value,undefined);
});
