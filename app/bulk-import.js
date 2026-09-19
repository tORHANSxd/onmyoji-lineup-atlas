(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.AtlasCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasBulkImport=api;})(typeof self!=='undefined'?self:globalThis,function(C){
'use strict';
const MAX_ROWS=1000,MAX_BYTES=5*1024*1024;
const TEMPLATE='// 每行一条，名称、用途和备注可省略。请把占位文字换成完整阵容码。\n阵容码 || 名称 || 副本/用途 || 备注\n在此粘贴完整阵容码 || 魂土速刷 || 魂土 || 配速与操作说明\n在此粘贴另一条完整阵容码';
function canonicalCode(value){const code=C.normalizeCode(value);return C.classifyCode(code)==='lineup-data'?'#TA#'+code:code;}
function parse(text,existing=[]){
 text=String(text??'').replace(/^\uFEFF/,'');
 const result={rows:[],entries:[],stats:{total:0,valid:0,duplicate:0,invalid:0},error:''};
 if(new TextEncoder().encode(text).length>MAX_BYTES){result.error='每次最多导入 5 MiB，请拆分文本后重试。';return result;}
 const lines=text.split(/\r\n|\n|\r/),seen=new Map(existing.filter(C.hasLineupCode).map(item=>[canonicalCode(item.code),0]));
 for(let index=0;index<lines.length;index++){
  const raw=lines[index].trim();if(!raw||raw.startsWith('//'))continue;
  const fields=raw.split(raw.includes('||')?'||':'\t').map(s=>s.trim());
  if(['阵容码','code'].includes(fields[0])&&(fields.length===1||fields.length<=4&&fields.slice(1).every((s,i)=>[['名称','title'],['副本/用途','副本 / 用途','用途','dungeon'],['备注','notes']][i].includes(s))))continue;
  if(++result.stats.total>MAX_ROWS){result.rows=[];result.entries=[];result.error='每次最多添加 1000 条，请拆分文本后重试。';return result;}
  const [input,title='',dungeon='',notes='']=fields,code=canonicalCode(input),kind=C.classifyCode(code);
  const provenance=C.codeProvenance(input),row={line:index+1,code,...provenance,title:title||'未命名阵容',dungeon:dungeon||'待分类',notes,status:'valid',reason:'可添加 · 内容待解析'};
  if(fields.length>4)row.reason='最多 4 列；名称、用途和备注中请勿使用分隔符 || 或制表符。';
  else if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/.test(raw))row.reason='含有无效字符；文件请另存为 UTF-8 文本。';
  else if(!['pipe-ta','hash-ta'].includes(kind))row.reason='未识别阵容码；请粘贴完整 |TA|、#TA# 或 Base64 内容。';
  else if(kind==='hash-ta'&&!/^[A-Za-z0-9+/]+={0,2}$/.test(code.slice(4)))row.reason='完整阵容内容应为 #TA# 后接 Base64 字符。';
  else if(title.length>200||dungeon.length>100||notes.length>8000)row.reason='名称最多 200 字，用途最多 100 字，备注最多 8000 字。';
  else if(seen.has(code)){row.status='duplicate';row.reason=seen.get(code)?`与第 ${seen.get(code)} 行重复，保留首次记录`:'阵容库已收录，保留已有内容与备注';}
  else{seen.set(code,row.line);result.entries.push({code,...provenance,title:row.title,dungeon:row.dungeon,notes});}
  if(row.status==='valid'&&row.reason!=='可添加 · 内容待解析')row.status='invalid';
  result.stats[row.status]++;result.rows.push(row);
 }
 return result;
}
return {parse,canonicalCode,TEMPLATE,MAX_ROWS,MAX_BYTES};
});
