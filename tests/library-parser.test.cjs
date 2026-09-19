const {test}=require('node:test');
const assert=require('node:assert/strict');
const {LibraryParser}=require('../app/library-parser.js');
const E=require('../app/parse-errors.js');
test('批次跳过新旧已过期记录，暂时失败和ObjectId兼容失败可恢复；手动失败也保存且只保存一次',async()=>{
 const items=[{code:'expired-old',lastParseError:"Error invoking remote method 'ta-query': Error: 服务器未返回该阵容（代码 31279）；分享可能已失效"},{code:'expired-new',lastParseFailure:E.fromServer(31279)},{code:'temporary',lastParseError:"Error invoking remote method 'ta-query': Error: 服务器未返回该阵容（代码 90011）；分享可能已失效"},{code:'objectid',lastParseError:'ObjectId 必须为12字节'}],calls=[],failures=[];
 const parser=new LibraryParser({items:()=>items,decode:async c=>{calls.push(c);return {ok:false,error:E.fromServer(90011,3).message,failure:E.fromServer(90011,3)};},save:async()=>{},saveFailure:async(item,message,valid,failure)=>{failures.push({code:item.code,failure});}});
 const report=await parser.run();assert.deepEqual(calls,['temporary','objectid']);assert.equal(report.failed,2);assert.equal(failures.length,2);assert.equal(failures[0].failure.attempts,3);
 await assert.rejects(parser.parseOne(items[0],{force:true}));assert.equal(failures.length,3);assert.equal(calls.at(-1),'expired-old');
});
test('失败记录落盘失败暂停批次，不重复写入或继续下一条',async()=>{
 let calls=0,writes=0;const parser=new LibraryParser({items:()=>[{code:'a'},{code:'b'}],decode:async()=>{calls++;return {ok:false,error:'network'};},save:async()=>{},saveFailure:async()=>{writes++;throw new Error('disk full');}});
 const report=await parser.run();assert.equal(report.phase,'paused');assert.equal(calls,1);assert.equal(writes,1);
});
function fixture(items,decode){const written=[],errors=[];const parser=new LibraryParser({items:()=>items,decode,save:async(item,payload,valid)=>{assert.equal(valid(),true);const saved={...item,members:payload.members,decodeState:'decoded-server'};written.push(saved);for(const row of items.filter(x=>x.code===item.code))Object.assign(row,saved);return saved;},saveFailure:async(item,error)=>errors.push({code:item.code,error})});return {parser,written,errors};}
test('登录批量仅解析未解析原码，重复原码合并、逐项保存、重启复用',async()=>{
 const items=[{code:'a',members:[{}]},{code:'b'},{code:'b'},{code:'c'}],calls=[];
 const {parser,written}=fixture(items,async code=>{calls.push(code);return {ok:true,members:[{name:code}]};});
 await parser.run();assert.deepEqual(calls,['b','c']);assert.equal(written.length,2);
 assert.equal(items[1].members.length,1);assert.equal(items[2].members.length,1);await parser.run();assert.deepEqual(calls,['b','c']);
 await parser.parseOne(items[0],{force:true});assert.deepEqual(calls,['b','c','a']);
});
test('单条失败保留已保存内容，批量继续处理其他可解析内容',async()=>{
 const items=[{code:'bad'},{code:'ok'}];const {parser,written,errors}=fixture(items,async code=>code==='bad'?{ok:false,error:'分享码不存在'}:{ok:true,members:[{}]});
 const r=await parser.run();assert.equal(r.phase,'partial');assert.equal(r.failed,1);assert.equal(r.succeeded,1);assert.equal(written[0].code,'ok');assert.equal(errors.length,1);
 items[1].title='用户备注';parser.decode=async()=>{throw new Error('暂不可用');};await assert.rejects(parser.parseOne(items[1],{force:true}));assert.equal(items[1].members.length,1);assert.equal(items[1].title,'用户备注');
});
test('退出或切换会话后不保存迟到的解析结果，也不继续批量',async()=>{
 let finish;const {parser,written}=fixture([{code:'a'},{code:'b'}],()=>new Promise(resolve=>finish=resolve));
 const run=parser.run();parser.cancel();finish({ok:true,members:[{}]});await run;assert.equal(written.length,0);
});
test('暂停保存正在完成的条目，继续时只处理剩余内容；失败逐项汇总继续',async()=>{
 const items=[{code:'a'},{code:'b'}];let finish,calls=0;const {parser,written}=fixture(items,()=>{calls++;return calls===1?new Promise(resolve=>finish=resolve):Promise.resolve({ok:true,members:[{}]});});
 const run=parser.run();parser.pause();finish({ok:true,members:[{}]});await run;assert.equal(written.length,1);assert.equal(parser.report.phase,'paused');
 await parser.run();assert.equal(written.length,2);
 const limited=fixture([{code:'a'},{code:'b'}],async()=>{throw new Error('429 请求过于频繁');});await limited.parser.run();assert.equal(limited.errors.length,2);assert.equal(limited.parser.report.phase,'partial');assert.equal(limited.parser.report.failures.length,2);
});
test('导入后新码优先解析；只恢复原队列时不会带上未选自动解析的新码',async()=>{
 const items=[{code:'old-a'},{code:'old-b'},{code:'new-a'},{code:'new-b'}],calls=[];
 const {parser}=fixture(items,async code=>{calls.push(code);return {ok:true,members:[{}]};});
 await parser.run({codes:['old-a']});assert.deepEqual(calls,['old-a']);
 await parser.run({prioritize:['new-b','new-a']});assert.deepEqual(calls,['old-a','new-b','new-a','old-b']);
});

test('155条批次在第46条及连续失败、超时之后继续，成功和失败总数严格相加',async()=>{
 const items=Array.from({length:155},(_,i)=>({id:String(i),code:String(i),title:'阵容'+i})),bad=new Set([45,46,47,90,154]);
 const {parser,written}=fixture(items,async code=>{if(bad.has(Number(code)))throw new Error(code==='90'?'阵容查询超时':'分享已失效');return {ok:true,members:[{}]};});const report=await parser.run();
 assert.equal(report.completed,155);assert.equal(report.failed,5);assert.equal(report.succeeded,150);assert.equal(written.length,150);assert.equal(report.phase,'partial');assert.deepEqual(report.failures.map(f=>f.code),[...bad].map(String));assert.ok(written.some(l=>l.code==='153'));
});
test('网络失败跳过，但本地保存失败必须暂停，即使错误清单随后能写入',async()=>{
 let calls=0;const parser=new LibraryParser({items:()=>[{code:'a'},{code:'b'}],decode:async()=>{calls++;return {ok:true};},save:async()=>false,saveFailure:async()=>{}});
 const r=await parser.run();assert.equal(calls,1);assert.equal(r.phase,'paused');assert.equal(r.failed,1);assert.equal(r.succeeded,0);
});

test('一键重试包含已有缓存但刷新失败的记录，跳过失效码与未选条目',async()=>{
 const items=[{code:'cached',members:[{}],decodeState:'decoded-server',lastParseFailure:E.fromServer(90011)},{code:'pending',lastParseError:'network'},{code:'expired',lastParseFailure:E.fromServer(31279)},{code:'other'}],calls=[];
 const {parser}=fixture(items,async(code,options)=>{calls.push({code,force:options.force});return {ok:true,members:[{}]};});
 const report=await parser.run({codes:['cached','pending','expired'],force:true});
 assert.deepEqual(calls,[{code:'cached',force:true},{code:'pending',force:true}]);
 assert.equal(report.succeeded,2);assert.equal(report.total,2);
});
