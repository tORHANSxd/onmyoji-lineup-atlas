const {test}=require('node:test');
const assert=require('node:assert/strict');
const {LibraryParser}=require('../app/library-parser.js');
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
test('暂停保存正在完成的条目，继续时只处理剩余内容；限流后停止',async()=>{
 const items=[{code:'a'},{code:'b'}];let finish,calls=0;const {parser,written}=fixture(items,()=>{calls++;return calls===1?new Promise(resolve=>finish=resolve):Promise.resolve({ok:true,members:[{}]});});
 const run=parser.run();parser.pause();finish({ok:true,members:[{}]});await run;assert.equal(written.length,1);assert.equal(parser.report.phase,'paused');
 await parser.run();assert.equal(written.length,2);
 const limited=fixture([{code:'a'},{code:'b'}],async()=>{throw new Error('429 请求过于频繁');});await limited.parser.run();assert.equal(limited.errors.length,1);assert.equal(limited.parser.report.phase,'paused');
});
