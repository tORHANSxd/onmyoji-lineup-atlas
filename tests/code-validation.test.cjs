const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../app/core.js'),TA=require('../desktop/ta-codec.cjs'),B=require('../app/bulk-import.js'),{validateAction}=require('../desktop/ta-session.cjs');
test('确定的排版修复保留原码、分享键大小写和修复记录，各入口一致',()=>{
 const key='AaBb0123456789aAbBcCdDeEfF001122',raw='\uFEFF ｜ｔＡ｜'+key.slice(0,12)+'\n\u200b'+key.slice(12)+' ';
 assert.equal(key.length,32);const r=C.inspectCode(raw);assert.equal(r.code,'|TA|'+key);assert.equal(r.originalCode,raw);assert.equal(r.repairs.length,3);assert.equal(C.classifyCode(raw),'pipe-ta');assert.equal(TA.extractShareKey(raw),key);assert.doesNotThrow(()=>validateAction('query',{code:r.code}));assert.equal(TA.decodeInput(raw).lookup.parameters.share_key,key);
 const pasted='｜ＴＡ｜'+key;assert.equal(B.parse(pasted).entries[0].originalCode,pasted);
});
test('不猜缺字符、不更改不透明分享键；无法确定的内嵌空白一律拒绝',()=>{
 for(const key of ['opaque_Key-7','0123']){assert.equal(C.normalizeCode('|TA|'+key),'|TA|'+key);assert.equal(B.parse('|TA|'+key).stats.valid,1);assert.doesNotThrow(()=>validateAction('query',{code:'|TA|'+key}));}
 for(const value of ['|TA|bad key','|TA|bad\u200bkey','|TA|a|b','|TA|','|TA|'+'a'.repeat(4097)]){assert.equal(C.classifyCode(value),'unknown');assert.throws(()=>validateAction('query',{code:value}));assert.equal(TA.decodeInput(value).ok,false);}
});
