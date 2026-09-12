const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TAQueryQueue,QUERY_INTERVAL_MS,REPEAT_COOLDOWN_MS}=require('../desktop/ta-query-queue.cjs');
const code=n=>'|TA|'+String(n).repeat(32);
test('批量与手动查询串行执行，同码在途请求合并，默认间隔和冷却生效',async()=>{
 let time=0,finish;const calls=[];
 const queue=new TAQueryQueue({now:()=>time,sleep:async ms=>{time+=ms;},execute:async c=>{calls.push({c,time});if(c===code(1))await new Promise(resolve=>finish=resolve);return c;}});
 const first=queue.query(code(1),()=>{}),duplicate=queue.query(code(1),()=>{}),second=queue.query(code(2),()=>{});
 assert.equal(first,duplicate);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);finish();
 assert.deepEqual(await Promise.all([first,duplicate,second]),[code(1),code(1),code(2)]);
 assert.equal(calls.length,2);assert.ok(calls[1].time-calls[0].time>=QUERY_INTERVAL_MS);
 await assert.rejects(queue.query(code(1),()=>{}),/频繁重复解析/);
 time+=REPEAT_COOLDOWN_MS;assert.equal(await queue.query(code(2),()=>{}),code(2));
});
test('查询失败仍冷却该原码，其他原码可以继续',async()=>{
 let time=0;const queue=new TAQueryQueue({now:()=>time,sleep:async ms=>{time+=ms;},execute:async c=>{if(c===code(1))throw new Error('分享码不存在');return c;}});
 await assert.rejects(queue.query(code(1),()=>{}),/不存在/);await assert.rejects(queue.query(code(1),()=>{}),/频繁重复/);
 assert.equal(await queue.query(code(2),()=>{}),code(2));
});
test('注销会话取消等待队列且拒绝旧结果，不发出下一条请求',async()=>{
 let finish;const calls=[];const queue=new TAQueryQueue({execute:async c=>{calls.push(c);await new Promise(resolve=>finish=resolve);return c;}});
 const first=queue.query(code(1),()=>{}),second=queue.query(code(2),()=>{});
 const settled=Promise.allSettled([first,second]);await new Promise(resolve=>setImmediate(resolve));queue.reset();finish();
 const results=await settled;assert.ok(results.every(r=>r.status==='rejected'));assert.equal(calls.length,1);
});
