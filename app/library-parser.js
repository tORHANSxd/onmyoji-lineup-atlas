(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasLibraryParser=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const parsed=item=>Array.isArray(item?.members)&&item.members.some(m=>m.occupied!==false)&&!['reference','failed','unattempted','lookup-required'].includes(item.decodeState);
class LibraryParser {
 constructor({items,decode,save,saveFailure=async()=>{},active=()=>true,onProgress=()=>{}}){
  Object.assign(this,{items,decode,save,saveFailure,active,onProgress});
  this.generation=0;this.running=null;this.paused=false;this.inflight=new Map();
  this.report={phase:'idle',total:0,completed:0,succeeded:0,failed:0,current:'',error:''};
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
   const payload=await this.decode(item.code);
   if(!valid())throw new Error('登录会话已结束，旧解析结果未保存');
   if(!payload?.ok)throw new Error(payload?.error||'没有取得有效的阵容内容');
   const saved=await this.save(item,payload,valid);
   if(!valid())throw new Error('登录会话已结束');
   if(!saved)throw new Error('解析结果未能保存到本地，请保留备份后重试');
   return saved;
  })();
  this.inflight.set(item.code,job);
  job.finally(()=>{if(this.inflight.get(item.code)===job)this.inflight.delete(item.code);}).catch(()=>{});
  return job;
 }
 run(){
  if(this.running)return this.running;
  const items=[...new Map(this.items().filter(item=>item.code&&!parsed(item)).map(item=>[item.code,item])).values()];
  const generation=this.generation,valid=()=>this.generation===generation&&this.active();
  this.paused=false;this.report={phase:'running',total:items.length,completed:0,succeeded:0,failed:0,current:'',error:''};this.emit();
  const job=(async()=>{
   let consecutiveFailures=0;
   for(const item of items){
    if(!valid()||this.paused)break;
    const latest=this.items().find(row=>row.code===item.code)||item;
    this.report.current=latest.title||'未命名阵容';this.emit();
    try{await this.parseOne(latest);if(!valid())break;this.report.succeeded++;consecutiveFailures=0;}
    catch(error){
     if(!valid())break;
     this.report.failed++;consecutiveFailures++;this.report.error=error.message;
     await this.saveFailure(latest,error.message,valid);
     if(/限流|频繁|429|403|登录|连接|超时|timeout/i.test(error.message)||consecutiveFailures>=3)this.paused=true;
    }
    if(!valid())break;this.report.completed++;this.emit();
   }
   if(valid()){this.report.phase=this.paused?'paused':this.report.failed?'partial':'complete';this.report.current='';this.emit();}
   return {...this.report};
  })();
  this.running=job;job.finally(()=>{if(this.running===job)this.running=null;}).catch(()=>{});return job;
 }
}
return {LibraryParser,hasParsedContent:parsed};
});
