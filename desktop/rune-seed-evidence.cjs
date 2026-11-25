'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {readConfig}=require('./rune-runner.cjs');
const {dungeonId:soulKing,resourceVersion}=require('../app/rune-lineup.js');
const {sampleVerdict,hun13Verdict}=require('../app/rune-candidate.js');
const {engineSHA256}=require('../app/rune-openings.js');
const {isHun13Plan}=require('./hun13-runner.cjs');

const seedCount=10000;
const seedOrder=[9999,...Array.from({length:seedCount},(_,index)=>(index*3167)%seedCount).filter(seed=>seed!==9999)];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=async file=>sha256(await fs.readFile(file));
const readJSON=async file=>{
 try{return JSON.parse(await fs.readFile(file,'utf8'));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
};

async function createOnce(file,value){
 const temp=file+'.'+randomUUID()+'.tmp';
 try{
  await fs.writeFile(temp,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
  await fs.link(temp,file);
 }catch(error){if(error.code!=='EEXIST')throw error;}
 finally{await fs.rm(temp,{force:true});}
}

async function buildScope({configPath,scriptRoot,suits,dungeonId=soulKing},plan){
 if(![101,soulKing,103].includes(dungeonId))throw Error('当前副本未接入全种子验收');
 const isSorrow=dungeonId===101,isHun13=dungeonId===103;
 if(!(isHun13?isHun13Plan(plan):plan?.onmyoji&&Array.isArray(plan.members)&&plan.members.length===5)||
    Buffer.byteLength(JSON.stringify(plan))>(isHun13?512:256)*1024)throw Error('无效的全种子验收配装');
 const config=await readConfig(configPath);
 const indexBytes=await fs.readFile(config.scriptIndex);
 const index=JSON.parse(indexBytes);
 const proof=JSON.parse(await fs.readFile(path.join(config.opcodeProof,'opcode-map.json'),'utf8'));
 const nativeEvidence=JSON.parse(await fs.readFile(path.join(config.opcodeProof,'native-evidence.json'),'utf8'));
 const nativeSHA256=nativeEvidence.elfSHA256;
 if(!/^[a-f\d]{64}$/.test(nativeSHA256)||!Array.isArray(index.modules)||
    (index.resourceVersion??resourceVersion)!==resourceVersion||(index.nativeSHA256??nativeSHA256)!==nativeSHA256)throw Error('客户端原生库和脚本索引的验证资料不一致');
 const battleTools=isHun13?['verify-hun13.py','rune_floor_host.py']:isSorrow?['verify-rune-floor.py','rune_floor_host.py']:['verify-rune-runtime.py'];
 const evidenceFiles={
  python:config.python,
  update:path.join(config.snapshot,'raw','extra','update.ini'),
  scriptNames:path.join(config.snapshot,'raw','extra','thd','script3.thx'),
  modelNames:path.join(config.snapshot,'raw','extra','thd','model_info.thx'),
  ...Object.fromEntries(['opcode-map.json','script-index.json',proof.compilerProof,proof.nativeEvidence]
   .map(name=>['proof/'+name,path.join(config.opcodeProof,name)])),
  ...Object.fromEntries(['game_resources.py','original_battle.py','original_host.py','original_modules.py','native_oracle.py']
   .map(name=>['host/'+name,path.join(config.gameTools,name)])),
  ...Object.fromEntries([...battleTools,
   'extract-dungeon-catalog.py','rune_team.py','rune_replay.py','rune_random.py']
   .map(name=>['tools/'+name,path.join(scriptRoot,name)])),
  runner:path.join(__dirname,'rune-runner.cjs'),
  ...(isSorrow?{floorRunner:path.join(__dirname,'rune-floor-runner.cjs')}:{ }),
  ...(isHun13?{hun13Runner:path.join(__dirname,'hun13-runner.cjs')}:{ }),
 };
 const inputSHA256=Object.fromEntries(await Promise.all(Object.entries(evidenceFiles).map(async ([name,file])=>[name,await digest(file)])));
 return {schema:1,route:isHun13?'normal-solo-hun13':'local-solo-rune',dungeonId,resourceVersion,stepMs:20,seedCount,
  nativeSHA256,scriptIndexSHA256:sha256(indexBytes),
  teamSHA256:sha256(JSON.stringify(plan)),suitIndexSHA256:sha256(JSON.stringify(suits)),inputSHA256,
  ...(isHun13?{engineSHA256:engineSHA256.Hun13Engine}:{})};
}

function resultVerdict(row,seed,scope,auditId){
 if(row?.auditId!==auditId||!['nativeSHA256','scriptIndexSHA256','teamSHA256','suitIndexSHA256'].every(key=>row[key]===scope[key])||
    !/^[a-f\d]{64}$/.test(row.recordSHA256)||
    row.combatMs!==null&&(!Number.isSafeInteger(row.combatMs)||row.combatMs<0))return 'unknown';
 if(scope.dungeonId===103){
  const rounds=row.rounds;
  if(row.engineSHA256!==scope.engineSHA256||!Array.isArray(rounds)||rounds.length!==2||
     !rounds.every((x,i)=>x?.wave===i+1&&typeof x.cleared==='boolean'&&Number.isFinite(x.seconds)&&x.seconds>=0&&Number.isSafeInteger(x.availableSeconds))||
     rounds[0].availableSeconds!==120||!Number.isFinite(rounds[0].carriedSeconds)||
     !Number.isSafeInteger(rounds[0].carriedBudgetSeconds)||rounds[1].availableSeconds!==120+rounds[0].carriedBudgetSeconds||
     rounds[1].cleared!==(row.outcome==='win')||row.wavesCleared!==rounds.filter(round=>round.cleared).length)return 'unknown';
  return hun13Verdict(row,seed);
 }
 return Number.isSafeInteger(row.bouts)&&row.bouts>=0?sampleVerdict(row,seed):'unknown';
}

const scopeId=scope=>sha256(JSON.stringify(scope));
function addResult(results,row,verdict){
 results.seeds.add(row.seed);
 if(verdict==='loss'){results.loss??=row;return;}
 results.wins++;
 if(row.rounds?.every(round=>round.cleared))results.bothWavesWins++;
 const slowest=results.slowest;
 if(!slowest||row.engineSeconds>slowest.engineSeconds||row.engineSeconds===slowest.engineSeconds&&row.seed<slowest.seed)results.slowest=row;
}

async function readCheckpoint(scope,dir){
 const auditId=scopeId(scope);
 const saved=await readJSON(path.join(dir,'manifest.json'));
 if(!saved)return null;
 if(saved.auditId!==auditId||!saved.scope||scopeId(saved.scope)!==auditId)throw Error('验收目录绑定了另一份阵容或运行环境');
 const results={auditId,seeds:new Set(),wins:0,bothWavesWins:0,loss:null,slowest:null};
 for(const name of await fs.readdir(dir)){
  if(!/^(0|[1-9]\d{0,3})\.json$/.test(name))continue;
  const seed=Number(name.slice(0,-5)),row=await readJSON(path.join(dir,name));
  const verdict=resultVerdict(row,seed,scope,auditId);
  if(verdict==='unknown')throw Error(`种子 ${seed} 的已有记录无法核验`);
  addResult(results,row,verdict);
 }
 return results;
}

function evidenceSummary(scope,{auditId,wins,bothWavesWins,loss,slowest},{attempted=0,uncertain=null,stopped=false}={}){
 return {auditId,scope:scope.route,resourceVersion:scope.resourceVersion,wins,total:seedCount,attempted,
  ...(scope.dungeonId===103?{bothWavesWins}:{}),
  slowest:slowest&&{seed:slowest.seed,engineSeconds:slowest.engineSeconds,combatMs:slowest.combatMs,
   ...(scope.dungeonId===103?{wavesCleared:slowest.wavesCleared,recordSHA256:slowest.recordSHA256}:{})},
  loss,uncertain,stopped,
  status:loss?'seed-loss':wins===seedCount?'all-local-seeds-passed':uncertain?'inconclusive':'incomplete'};
}

async function scanSeeds({scope,dir,runners,plan,limit=seedCount,signal,onProgress=()=>{}}){
 const auditId=scopeId(scope);
 await fs.mkdir(dir,{recursive:true});
 await createOnce(path.join(dir,'manifest.json'),{auditId,scope});
 const results=await readCheckpoint(scope,dir);
 const todo=seedOrder.filter(seed=>!results.seeds.has(seed)).slice(0,limit);
 let attempted=0,uncertain=null;
 const progress=()=>evidenceSummary(scope,results,{attempted,uncertain,stopped:signal?.aborted===true});
 onProgress(progress());
 let cursor=0;
 async function scan(runner){
  while(!signal?.aborted&&!results.loss&&!uncertain&&cursor<todo.length){
   const seed=todo[cursor++];attempted++;
   try{
    const row={...await runner.runSeedEvidence(plan,seed),auditId};
    const verdict=resultVerdict(row,seed,scope,auditId);
    if(verdict==='unknown')throw Error('本次复跑没有可核验的结算');
    const file=path.join(dir,`${seed}.json`);
    await createOnce(file,row);
    const savedRow=await readJSON(file);
    if(JSON.stringify(row)!==JSON.stringify(savedRow))throw Error('同一输入的种子结果发生冲突');
    addResult(results,row,verdict);onProgress(progress());
   }catch(error){
    if(!signal?.aborted){uncertain??={seed,message:error.message};onProgress(progress());}
   }
  }
 }
 const stop=()=>{for(const runner of runners)void runner.stop()?.catch(()=>{});};
 signal?.addEventListener('abort',stop,{once:true});
 try{await Promise.all(runners.map(scan));return progress();}
 finally{signal?.removeEventListener('abort',stop);}
}

function createSeedEvidenceRunner({directory,runner,...runtime}){
 let job=null;
 async function input(plan){
  const scope=await buildScope(runtime,plan);
  return {scope,dir:path.join(directory,scopeId(scope))};
 }
 return {
  get running(){return job!==null;},
  async lookup(plan){
   const {scope,dir}=await input(plan);
   const records=await readCheckpoint(scope,dir);
   return records?evidenceSummary(scope,records):null;
  },
  run(plan,onProgress){
   if(job)throw Error('已有全种子验收正在运行');
   const cancel=new AbortController();
   const pending=input(plan).then(args=>scanSeeds({...args,runners:[runner],plan,signal:cancel.signal,onProgress})).finally(()=>{job=null;});
   job={cancel,pending};
   return pending;
  },
  stop(){
   if(!job)return null;
   const {cancel,pending}=job;
   cancel.abort();
   return pending.catch(()=>{});
  },
 };
}

module.exports={buildScope,scanSeeds,seedOrder,createSeedEvidenceRunner};
