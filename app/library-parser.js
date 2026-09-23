(function(root,factory){const common=typeof module==='object'&&module.exports;const api=factory(common?require('./parse-errors.js'):root.AtlasParseErrors);if(common)module.exports=api;else root.AtlasLibraryParser=api;})(typeof self!=='undefined'?self:globalThis,function(Errors){
'use strict';
const parsed=item=>Array.isArray(item?.members)&&item.members.some(m=>m.occupied!==false)&&!['reference','failed','unattempted','lookup-required'].includes(item.decodeState);
const canAttempt=item=>!parsed(item)&&!Errors.isExpired(item);
class LibraryParser {
 constructor({items,decode,save,saveFailure=async()=>{},active=()=>true,onProgress=()=>{}}){
  Object.assign(this,{items,decode,save,saveFailure,active,onProgress});
  this.generation=0;this.running=null;this.paused=false;this.inflight=new Map();
  this.report={phase:'idle',total:0,completed:0,succeeded:0,failed:0,current:'',error:'',failures:[]};
 }
 emit(){this.onProgress({...this.report});}
 cancel(){this.generation++;this.paused=true;this.inflight.clear();}
 pause(){this.paused=true;if(this.running){this.report.phase='pausing';this.emit();}}
 parseOne(item,{force=false}={}){
  if(!force&&parsed(item))return Promise.resolve(item);
  if(this.inflight.has(item.code))return this.inflight.get(item.code);
  const generation=this.generation,valid=()=>this.generation===generation&&this.active();
  const job=(async()=>{
   if(!valid())throw new Error('登录会话已结束，解析已取消');
   const payload=await this.decode(item.code,{force});
   if(!valid())throw new Error('登录会话已结束，旧解析结果未保存');
   if(!payload?.ok){const error=new Error(payload?.error||'没有取得有效的阵容内容');error.failure=payload?.failure;error.storageFailure=payload?.state==='storage-error';throw error;}
   let saved;
   try{saved=await this.save(item,payload,valid);if(!saved)throw new Error('解析结果未能保存到本地，请保留备份后重试');}
   catch(error){error.storageFailure=true;throw error;}
   if(!valid())throw new Error('登录会话已结束');
   return saved;
  })().catch(async error=>{
   error.failure=error.failure||Errors.fromMessage(error.message);
   error.sessionFailure=error.failure.kind==='assistant-unavailable';
   if(error.sessionFailure)error.message=error.failure.message;
   if(valid()&&!error.storageFailure&&!error.sessionFailure){
    try{await this.saveFailure(item,error.message,valid,error.failure);}
    catch(saveError){saveError.storageFailure=true;throw saveError;}
   }
   throw error;
  });
  this.inflight.set(item.code,job);
  job.finally(()=>{if(this.inflight.get(item.code)===job)this.inflight.delete(item.code);}).catch(()=>{});
  return job;
 }
 run({codes=null,prioritize=[],force=false}={}){
  if(this.running)return this.running;
  const allowed=codes==null?null:new Set(codes),priority=new Map(prioritize.map((code,index)=>[code,index]));
  const items=[...new Map(this.items().filter(item=>item.code&&(force?!Errors.isExpired(item):canAttempt(item))&&(!allowed||allowed.has(item.code))).map(item=>[item.code,item])).values()];
  items.sort((a,b)=>(priority.get(a.code)??Infinity)-(priority.get(b.code)??Infinity));
  const generation=this.generation,valid=()=>this.generation===generation&&this.active();
  this.paused=false;this.report={phase:'running',total:items.length,completed:0,succeeded:0,failed:0,current:'',error:'',failures:[],startedAt:Date.now()};this.emit();
  const job=(async()=>{
   for(const item of items){
    if(!valid()||this.paused)break;
    const latest=this.items().find(row=>row.code===item.code)||item;
    this.report.current=latest.title||'未命名阵容';this.emit();
    const started=Date.now();
    this.report.currentStartedAt=started;
    const pulse=setInterval(()=>{if(valid()){this.report.elapsedMs=Date.now()-this.report.startedAt;this.emit();}},1000);pulse.unref?.();
    try{await this.parseOne(latest,{force});if(!valid())break;this.report.succeeded++;}
    catch(error){
     if(!valid())break;
     this.report.failed++;this.report.error=error.message;
     if(error.storageFailure||error.sessionFailure)this.paused=true;
     this.report.failures.push({id:latest.id,code:latest.code,title:latest.title,reason:error.message,failure:error.failure,durationMs:Date.now()-started,at:new Date().toISOString()});
    }
    finally{clearInterval(pulse);}
    if(!valid())break;this.report.completed++;this.report.elapsedMs=Date.now()-this.report.startedAt;this.emit();
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(valid()){this.report.phase=this.paused?'paused':this.report.failed?'partial':'complete';this.report.current='';this.emit();}
   return {...this.report};
  })();
  this.running=job;job.finally(()=>{if(this.running===job)this.running=null;}).catch(()=>{});return job;
 }
}
return {LibraryParser,hasParsedContent:parsed,canAttempt};
});
