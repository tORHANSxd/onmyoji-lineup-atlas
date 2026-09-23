'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Background}=require('../desktop/background.cjs');

test('background snapshots and deltas preserve accounts and publish atomically',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-state-test-')),file=path.join(root,'state.json'),worker=new Background({statePath:file});
 try{
  assert.equal(await worker.run('load-state'),null);
  assert.deepEqual(await worker.run('prepare-state',{delta:{upserts:[],removeIds:[]}}),{needsSnapshot:true});
  const old={schemaVersion:1,accounts:[{id:'local-account'}],activeAccount:'local-account',lineups:[{id:'a',title:'旧'}],targetLineups:{'local-account':['a']}};
  const prepared=await worker.run('prepare-state',{state:old});
  await assert.rejects(fs.readFile(file),{code:'ENOENT'});
  await fs.rename(prepared.file,file);await worker.run('commit-state');
  const next=await worker.run('prepare-state',{delta:{upserts:[{id:'a',title:'新'},{id:'b',title:'新增'}],removeIds:[]}});
  assert.deepEqual(JSON.parse(await fs.readFile(file)),old);
  await fs.rename(next.file,file);await worker.run('commit-state');
  const saved=await worker.run('load-state');assert.deepEqual(saved.accounts,old.accounts);assert.deepEqual(saved.targetLineups,old.targetLineups);assert.equal(saved.lineups[0].title,'新');
  const {lineups,...fields}=saved;fields.accounts=[{id:'new-account',raw:{storyTasks:[[1,[0,1]],[1,[1,0]]]}}];fields.activeAccount='new-account';
  const accountSave=await worker.run('prepare-state',{fieldsJson:JSON.stringify(fields)});
  assert.deepEqual(JSON.parse(await fs.readFile(file)),saved,'prepare must not publish');
  await worker.run('discard-state');assert.deepEqual(await worker.run('load-state'),saved,'cancel must retain all fields');
  const accountCommit=await worker.run('prepare-state',{fieldsJson:JSON.stringify(fields)});
  await fs.rename(accountCommit.file,file);await worker.run('commit-state');
  assert.deepEqual((await worker.run('load-state')).lineups,lineups);assert.deepEqual((await worker.run('load-state')).accounts,fields.accounts);
  await assert.rejects(worker.run('prepare-state',{fieldsJson:JSON.stringify({...fields,lineups:[]})}),/参数/);
  const restored=await worker.run('prepare-state',{state:saved});await fs.rename(restored.file,file);await worker.run('commit-state');
  await worker.run('prepare-state',{delta:{upserts:[],removeIds:['a']}});
  await worker.run('discard-state');assert.deepEqual(await worker.run('load-state'),saved);assert.deepEqual(JSON.parse(await fs.readFile(file)),saved);
 }finally{await worker.close();await fs.rm(file,{force:true});await fs.rm(file+'.tmp',{force:true});await fs.rmdir(root);}
});

test('large JSON work yields the host event loop and preserves errors',async()=>{
 const worker=new Background();let ticks=0,timer;
 try{
  await worker.run('parse-json','{}');
  const text=JSON.stringify({rows:Array.from({length:3000},(_,id)=>({id,payload:'x'.repeat(11000)}))});
  timer=setInterval(()=>ticks++,1);
  const data=await worker.run('parse-json',text);assert.equal(data.rows.length,3000);assert.ok(ticks>1,'host timer must keep running during parsing');
  await assert.rejects(worker.run('parse-json','broken'),/JSON|Unexpected/);
  assert.deepEqual(await worker.run('parse-json','{"recovered":true}'),{recovered:true});
 }finally{clearInterval(timer);await worker.close();}
});

test('production background export rejects missing native stages before QR creation',async()=>{
 const worker=new Background(),catalog=require('../data/bundle.json');
 try{
  await assert.rejects(worker.run('build',{input:{title:'测试',hconf:[{hero_id:222}]},catalog}),/副本/);
  const G=require('../app/game-config.js'),stage=catalog.stageCatalog.scenes[0].gameSceneId,input={title:'测试',select_stage_id:stage,hconf:G.slots(catalog.gameConfig,stage).map(kind=>G.defaultMember(catalog.gameConfig,kind==='onmyoji'?10:222))};
  const result=await worker.run('build',{input,catalog});assert.equal(result.payload.ok,true);assert.match(result.image,/^data:image\/png;base64,/);
  assert.equal(require('../desktop/ta-codec.cjs').decodeLineupData(result.code).select_stage_id,input.select_stage_id);
 }finally{await worker.close();}
});

test('corrupt response cache still falls back when parsed in the background',async()=>{
 const {TAResponseCache}=require('../desktop/ta-response-cache.cjs'),worker=new Background(),root=await fs.mkdtemp(path.join(os.tmpdir(),'yuqi-cache-test-'));
 const cache=new TAResponseCache(root,{parse:text=>worker.run('parse-json',text)}),code='|TA|corrupt-fixture';
 try{await fs.writeFile(cache.file(code),'broken');assert.equal(await cache.read(code),null);}finally{await worker.close();await fs.rm(cache.file(code),{force:true});await fs.rmdir(root);}
});
