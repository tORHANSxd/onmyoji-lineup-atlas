'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {parseArgs}=require('node:util');
const {createRuneRunner,readConfig}=require('../desktop/rune-runner.cjs');
const {dungeonId,resourceVersion}=require('../app/rune-lineup.js');
const {sampleVerdict}=require('../app/rune-candidate.js');

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

async function buildScope(configPath,plan,suits){
 const config=await readConfig(configPath);
 const indexBytes=await fs.readFile(config.scriptIndex);
 const index=JSON.parse(indexBytes);
 const proof=JSON.parse(await fs.readFile(path.join(config.opcodeProof,'opcode-map.json'),'utf8'));
 const nativeEvidence=JSON.parse(await fs.readFile(path.join(config.opcodeProof,'native-evidence.json'),'utf8'));
 const nativeSHA256=nativeEvidence.elfSHA256;
 if(!/^[a-f\d]{64}$/.test(nativeSHA256)||!Array.isArray(index.modules)||
    (index.resourceVersion??resourceVersion)!==resourceVersion||(index.nativeSHA256??nativeSHA256)!==nativeSHA256)throw Error('客户端原生库和脚本索引的验证资料不一致');
 const evidenceFiles={
  python:config.python,
  update:path.join(config.snapshot,'raw','extra','update.ini'),
  scriptNames:path.join(config.snapshot,'raw','extra','thd','script3.thx'),
  modelNames:path.join(config.snapshot,'raw','extra','thd','model_info.thx'),
  ...Object.fromEntries(['opcode-map.json','script-index.json',proof.compilerProof,proof.nativeEvidence]
   .map(name=>['proof/'+name,path.join(config.opcodeProof,name)])),
  ...Object.fromEntries(['game_resources.py','original_battle.py','original_host.py','original_modules.py','native_oracle.py']
   .map(name=>['host/'+name,path.join(config.gameTools,name)])),
  ...Object.fromEntries(['verify-rune-runtime.py','extract-dungeon-catalog.py','rune_team.py','rune_replay.py','rune_random.py']
   .map(name=>['tools/'+name,path.join(__dirname,name)])),
  runner:path.join(__dirname,'..','desktop','rune-runner.cjs'),
 };
 const inputSHA256=Object.fromEntries(await Promise.all(Object.entries(evidenceFiles).map(async ([name,file])=>[name,await digest(file)])));
 return {schema:1,route:'local-solo-rune',dungeonId,resourceVersion,stepMs:20,seedCount,
  nativeSHA256,scriptIndexSHA256:sha256(indexBytes),
  teamSHA256:sha256(JSON.stringify(plan)),suitIndexSHA256:sha256(JSON.stringify(suits)),inputSHA256};
}

function resultVerdict(row,seed,scope,auditId){
 if(row?.auditId!==auditId||!['nativeSHA256','scriptIndexSHA256','teamSHA256','suitIndexSHA256'].every(key=>row[key]===scope[key])||
    !/^[a-f\d]{64}$/.test(row.recordSHA256)||!Number.isSafeInteger(row.bouts)||row.bouts<0||
    row.combatMs!==null&&(!Number.isSafeInteger(row.combatMs)||row.combatMs<0))return 'unknown';
 return sampleVerdict(row,seed);
}

async function scanSeeds({scope,dir,runners,plan,limit=seedCount,signal,onProgress=()=>{}}){
 const auditId=sha256(JSON.stringify(scope));
 await fs.mkdir(dir,{recursive:true});
 const manifest=path.join(dir,'manifest.json');
 await createOnce(manifest,{auditId,scope});
 const saved=await readJSON(manifest);
 if(saved?.auditId!==auditId||sha256(JSON.stringify(saved.scope))!==auditId)throw Error('验收目录绑定了另一份阵容或运行环境');
 const file=seed=>path.join(dir,`${seed}.json`);
 const pending=[];
 let wins=0,loss=null,slowest=null,attempted=0,uncertain=null;
 function add(row,verdict){
  if(verdict==='loss')loss??=row;
  else{
   wins++;
   if(!slowest||row.engineSeconds>slowest.engineSeconds||row.engineSeconds===slowest.engineSeconds&&row.seed<slowest.seed)slowest=row;
  }
 }
 for(const name of await fs.readdir(dir)){
  if(!/^(0|[1-9]\d{0,3})\.json$/.test(name))continue;
  const seed=Number(name.slice(0,-5)),row=await readJSON(file(seed));
  const verdict=resultVerdict(row,seed,scope,auditId);
  if(verdict==='unknown')throw Error(`种子 ${seed} 的已有记录无法核验`);
  add(row,verdict);pending[seed]=true;
 }
 const todo=seedOrder.filter(seed=>!pending[seed]).slice(0,limit);
 const progress=()=>({auditId,scope:scope.route,resourceVersion:scope.resourceVersion,wins,total:seedCount,attempted,
  slowest:slowest&&{seed:slowest.seed,engineSeconds:slowest.engineSeconds,combatMs:slowest.combatMs},
  loss,uncertain,stopped:signal?.aborted===true,
  status:loss?'seed-loss':wins===seedCount?'all-local-seeds-passed':uncertain?'inconclusive':'incomplete'});
 onProgress(progress());
 let cursor=0;
 async function scan(runner){
  while(!signal?.aborted&&!loss&&!uncertain&&cursor<todo.length){
   const seed=todo[cursor++];attempted++;
   try{
    const row={...await runner.runSeedEvidence(plan,seed),auditId};
    const verdict=resultVerdict(row,seed,scope,auditId);
    if(verdict==='unknown')throw Error('本次复跑没有可核验的结算');
    await createOnce(file(seed),row);
    const savedRow=await readJSON(file(seed));
    if(JSON.stringify(row)!==JSON.stringify(savedRow))throw Error('同一输入的种子结果发生冲突');
    add(row,verdict);onProgress(progress());
   }catch(error){
    if(!signal?.aborted){uncertain??={seed,message:error.message};onProgress(progress());}
   }
  }
 }
 const stop=()=>{for(const runner of runners)void runner.stop().catch(()=>{});};
 signal?.addEventListener('abort',stop,{once:true});
 try{await Promise.all(runners.map(scan));return progress();}
 finally{signal?.removeEventListener('abort',stop);}
}

function boundedInteger(value,name,max){
 if(!/^[1-9]\d*$/.test(value)||Number(value)>max)throw Error(`${name} 必须是 1 到 ${max} 的整数`);
 return Number(value);
}

async function main(){
 const {values}=parseArgs({options:{team:{type:'string'},runtime:{type:'string'},out:{type:'string'},
  limit:{type:'string',default:String(seedCount)},workers:{type:'string',default:'1'},help:{type:'boolean'}}});
 if(values.help){
  console.log('node tools/verify-rune-seeds.cjs --team <复跑配装 JSON> --runtime <本地运行时 JSON> --out <验收目录> [--limit <本次种子数>] [--workers <1-8>]');return;
 }
 if(!values.team||!values.runtime||!values.out)throw Error('需要 --team、--runtime、--out。使用 --help 查看用法');
 const limit=boundedInteger(values.limit,'--limit',seedCount),workers=boundedInteger(values.workers,'--workers',8);
 const dir=path.resolve(values.out),configPath=path.resolve(values.runtime);
 const plan=JSON.parse((await fs.readFile(values.team,'utf8')).replace(/^\uFEFF/,''));
 if(!plan?.onmyoji||plan.members?.length!==5)throw Error('复跑配装需要一位阴阳师及五位式神');
 const {suits}=require('../data/bundle.json');
 const scope=await buildScope(configPath,plan,suits);
 const runners=Array.from({length:workers},()=>createRuneRunner({configPath,scriptRoot:__dirname,suits}));
 const cancellation=new AbortController(),cancel=()=>cancellation.abort();
 process.on('SIGINT',cancel);
 try{
  let last=-1;
  const result=await scanSeeds({scope,dir,runners,plan,limit,signal:cancellation.signal,onProgress:state=>{
   if(last===-1||state.wins>=last+10||state.loss||state.uncertain){last=state.wins;console.log(JSON.stringify(state));}
  }});
  console.log(JSON.stringify(result));
  process.exitCode=result.stopped?130:result.loss?1:result.uncertain?2:0;
 }finally{process.removeListener('SIGINT',cancel);}
}

module.exports={scanSeeds,seedOrder};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=2;});
