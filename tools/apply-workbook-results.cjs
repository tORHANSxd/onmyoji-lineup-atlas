'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../app/core.js'),categories=require('../app/categories.js');
const root=path.resolve(__dirname,'..'),report=require('../verification/workbook-current.json'),excel=require('../data/excel.json'),bundle=require('../data/bundle.json');
assert.equal(report.sourceSha256,excel.sha256);
assert.equal(report.rows.length,excel.uniqueCodes);
const expected=new Set(excel.entries.map(e=>e.code));
assert.equal(new Set(report.rows.map(r=>r.code)).size,expected.size);
const results=report.rows.filter(r=>r.status==='decoded').map(r=>{
 assert.ok(expected.has(r.code));assert.ok(['live-official-response','cached-official-response'].includes(r.source));assert.equal(r.serverCode,0);assert.equal(r.lineup.code,r.code);
 const lineup=C.validateLineup(r.lineup);assert.ok(C.hasParsedContent(lineup));assert.equal(lineup.decodeState,'decoded-server');
 return {code:r.code,fetchedAt:r.fetchedAt,lineup};
});
const byCode=new Map(results.map(r=>[r.code,r]));
bundle.lineups=bundle.lineups.map(old=>{const result=byCode.get(old.code);return result?categories.resolve({...C.mergeDecodedLineup(old,result.lineup),sourceKind:old.sourceKind,parsedAt:result.fetchedAt,decodeError:null,lastParseError:null,lastParseFailure:null},bundle):old;});
Object.assign(bundle.excelAudit,{decoded:results.length,rejected:report.rows.filter(r=>r.serverCode&&r.serverCode!==0).length,queriedAt:new Date().toISOString(),method:'official-game-session'});
function write(file,value){fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}
write(path.join(root,'data/ta-workbook-results.json'),{sourceSha256:excel.sha256,sources:excel.sources,results});
write(path.join(root,'data/bundle.json'),bundle);
write(path.join(root,'verification/workbook-lineups-current.json'),bundle.lineups.filter(l=>byCode.has(l.code)));
console.log(JSON.stringify({updated:results.length,total:bundle.lineups.length,unresolved:expected.size-results.length}));
