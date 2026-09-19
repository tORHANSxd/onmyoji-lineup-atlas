const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../app/bulk-import.js');
const code=n=>'|TA|'+n.toString(16).padStart(32,'0');
test('批量文本支持纯码、双竖线四列、可省略字段、CRLF、BOM、表头和注释',()=>{
 const r=B.parse('\uFEFF// 示例\r\n阵容码 || 名称 || 副本/用途 || 备注\r\n'+code(1)+'\r\n'+code(2)+' || 魂土 || 魂土 || 速度 155\r\n'+code(3)+' || || 契灵\r\n');
 assert.deepEqual(r.stats,{total:3,valid:3,duplicate:0,invalid:0});assert.deepEqual(r.entries[1],{code:code(2),title:'魂土',dungeon:'魂土',notes:'速度 155'});assert.equal(r.entries[0].title,'未命名阵容');assert.equal(r.entries[2].dungeon,'契灵');assert.equal(r.rows[0].line,3);
});
test('从表格粘贴的制表符分列保留名称、用途和备注',()=>{
 const r=B.parse('code\ttitle\tdungeon\tnotes\n'+code(1)+'\t名字\t用途\t备注');assert.equal(r.entries[0].notes,'备注');assert.equal(r.stats.valid,1);
});
test('按完整原码去重，现有内容不修改，本批首条优先',()=>{
 const existing=[{code:code(1),title:'原备注',members:[{}]}],snapshot=JSON.stringify(existing);
 const r=B.parse(code(1)+' || 改名\n'+code(2)+' || 首条\n'+code(2)+' || 重复',existing);
 assert.deepEqual(r.stats,{total:3,valid:1,duplicate:2,invalid:0});assert.equal(r.entries[0].title,'首条');assert.match(r.rows[2].reason,/第 2 行/);assert.equal(JSON.stringify(existing),snapshot);
});
test('Base64 与 #TA# 完整内容规范化为同一码，仍须解码验证内容',()=>{
 const base='eJwDAAAAAAE=';const r=B.parse(base+'\n#TA#'+base);assert.equal(r.stats.valid,1);assert.equal(r.stats.duplicate,1);assert.equal(r.entries[0].code,'#TA#'+base);assert.equal(B.parse(base,[{code:base}]).stats.duplicate,1);
});
test('坏行给出行号且不丢弃其他有效行',()=>{
 const r=B.parse('|TA|bad key\n'+code(1)+' || 名称 || 用途 || 备注 || 多一列\n乱码\n'+code(2)+'\n#TA#@bad\n'+code(3)+' || x\ufffd');
 assert.equal(r.stats.invalid,5);assert.equal(r.stats.valid,1);assert.equal(r.entries[0].code,code(2));assert.equal(r.rows[0].line,1);assert.match(r.rows[1].reason,/最多 4 列/);
});
test('格式模板占位文字不会被当作待查询原码，超长字段报错',()=>{
 assert.equal(B.parse(B.TEMPLATE).entries.length,0);assert.equal(B.parse(code(1)+' || '+'名'.repeat(201)).stats.invalid,1);
});
test('1000 条可导入，超过条数或 5 MiB 整批阻止且不产生部分提交',()=>{
 assert.equal(B.parse(Array.from({length:1000},(_,i)=>code(i)).join('\n')).entries.length,1000);
 const tooMany=B.parse(Array.from({length:1001},(_,i)=>code(i)).join('\n'));assert.match(tooMany.error,/1000/);assert.equal(tooMany.entries.length,0);
 const tooBig=B.parse('x'.repeat(B.MAX_BYTES+1));assert.match(tooBig.error,/5 MiB/);assert.equal(tooBig.entries.length,0);
});
