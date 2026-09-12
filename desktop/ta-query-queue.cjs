'use strict';

const QUERY_INTERVAL_MS = 2500;
const REPEAT_COOLDOWN_MS = 60000;

// All renderer entry points share one queue, including batch and manual queries.
class TAQueryQueue {
  constructor({execute, now=Date.now, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)), intervalMs=QUERY_INTERVAL_MS, cooldownMs=REPEAT_COOLDOWN_MS}) {
    this.execute=execute; this.now=now; this.sleep=sleep;
    this.intervalMs=intervalMs; this.cooldownMs=cooldownMs;
    this.tail=Promise.resolve(); this.pending=new Map(); this.attempts=new Map();
    this.lastStarted=-Infinity; this.generation=0;
  }
  reset() { this.generation++; this.pending.clear(); }
  query(code, check) {
    if(typeof code!=='string'||!/^\|TA\|[^\s|\x00-\x1f\x7f]{1,4096}$/.test(code))return Promise.reject(new Error('请输入一条完整的 |TA| 文字码'));
    check();
    const existing=this.pending.get(code);
    if(existing)return existing;
    const recent=this.attempts.get(code),remaining=recent==null?0:this.cooldownMs-(this.now()-recent);
    if(remaining>0)return Promise.reject(new Error(`请勿频繁重复解析同一阵容，请在 ${Math.ceil(remaining/1000)} 秒后重试；已保存内容可以直接查看`));
    const generation=this.generation;
    const current=()=>{check();if(generation!==this.generation)throw new Error('登录会话已变化，已取消旧会话的解析');};
    const job=this.tail.then(async()=>{
      current();
      const delay=this.intervalMs-(this.now()-this.lastStarted);
      if(delay>0)await this.sleep(delay);
      current();
      this.lastStarted=this.now();this.attempts.set(code,this.lastStarted);
      const result=await this.execute(code);current();return result;
    });
    this.tail=job.catch(()=>{});
    this.pending.set(code,job);
    job.finally(()=>{if(this.pending.get(code)===job)this.pending.delete(code);}).catch(()=>{});
    return job;
  }
}
module.exports={TAQueryQueue,QUERY_INTERVAL_MS,REPEAT_COOLDOWN_MS};
