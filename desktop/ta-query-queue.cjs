'use strict';

const QUERY_INTERVAL_MS = 1500;
const REPEAT_COOLDOWN_MS = 60000;
const RETRY_DELAYS_MS = [3000,6000];

// All renderer entry points share one queue, including batch and manual queries.
class TAQueryQueue {
  constructor({execute, now=Date.now, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)), intervalMs=QUERY_INTERVAL_MS, cooldownMs=REPEAT_COOLDOWN_MS, retryDelays=RETRY_DELAYS_MS, onProgress=()=>{}}) {
    this.execute=execute; this.now=now; this.sleep=sleep;
    this.intervalMs=intervalMs; this.cooldownMs=cooldownMs;
    this.tail=Promise.resolve(); this.pending=new Map(); this.attempts=new Map();
    this.lastStarted=-Infinity; this.generation=0;
    this.retryDelays=[...retryDelays];this.onProgress=onProgress;this.notBefore=0;
  }
  reset() { this.generation++; this.pending.clear(); this.notBefore=0;this.onProgress(null); }
  query(code, check) {
    if(typeof code!=='string'||!/^\|TA\|[^\s|\x00-\x1f\x7f\u200b-\u200d\u2060\ufeff]{1,4096}$/.test(code))return Promise.reject(new Error('请输入一条完整的 |TA| 文字码'));
    check();
    const existing=this.pending.get(code);
    if(existing)return existing;
    const recent=this.attempts.get(code),remaining=recent==null?0:this.cooldownMs-(this.now()-recent);
    if(remaining>0)return Promise.reject(new Error(`请勿频繁重复解析同一阵容，请在 ${Math.ceil(remaining/1000)} 秒后重试；已保存内容可以直接查看`));
    const generation=this.generation;
    const current=()=>{check();if(generation!==this.generation)throw new Error('登录会话已变化，已取消旧会话的解析');};
    const job=this.tail.then(async()=>{
      try{
        for(let attempt=1;;attempt++){
          current();
          const retryAt=Math.max(this.notBefore,this.lastStarted+this.intervalMs);
          this.onProgress({code,phase:'waiting',attempt,maxAttempts:this.retryDelays.length+1,retryAt});
          while(this.now()<retryAt){await this.sleep(Math.min(250,retryAt-this.now()));current();}
          current();
          this.lastStarted=this.now();this.attempts.set(code,this.lastStarted);
          this.onProgress({code,phase:'querying',attempt,maxAttempts:this.retryDelays.length+1});
          const result=await this.execute(code);current();
          const associated=result?.code===code&&result?.share_key===code.slice(4);
          if(associated&&result.err===90011){
            this.notBefore=this.now()+(this.retryDelays[Math.min(attempt-1,this.retryDelays.length-1)]||0);
            if(attempt<=this.retryDelays.length)continue;
          }
          return result&&typeof result==='object'?{...result,queryAttempts:attempt}:result;
        }
      }finally{if(generation===this.generation)this.onProgress(null);}
    });
    this.tail=job.catch(()=>{});
    this.pending.set(code,job);
    job.finally(()=>{if(this.pending.get(code)===job)this.pending.delete(code);}).catch(()=>{});
    return job;
  }
}
module.exports={TAQueryQueue,QUERY_INTERVAL_MS,REPEAT_COOLDOWN_MS,RETRY_DELAYS_MS};
