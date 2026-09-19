'use strict';
// Import the statically verified facts and decoded original PNGs. No game code runs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=path.resolve(process.argv[2]||'user-data/client-v071');
const rows=JSON.parse(fs.readFileSync(path.join(source,'resolved-marks.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(rows.length,48);assert.equal(new Set(rows.map(r=>r.id)).size,48);
const sourceLabel='用户提供的网易客户端原图',snapshot='20260912_211558_280259';
const assets=[],marks=[];
for(const row of rows){
 assert.ok(Number.isInteger(row.id)&&row.id>=1&&row.id<=48);
 assert.equal(row.skillId,77800+row.id-1);assert.equal(row.resource.name,`skill/${row.skillId}.png`);
 assert.deepEqual(row.levels.map(l=>l.level),[1,2,3]);assert.ok(row.levels.every(l=>typeof l.description==='string'&&l.description));
 const bytes=fs.readFileSync(path.join(source,'marks-png',row.id+'.png'));
 assert.equal(sha(bytes),row.pngSha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(bytes.readUInt32BE(16),row.width);assert.equal(bytes.readUInt32BE(20),row.height);
 const localPath=`data/images/game/hunlingMark/${row.id}.png`;
 fs.mkdirSync(path.dirname(localPath),{recursive:true});fs.writeFileSync(localPath,bytes);
 assets.push({id:String(row.id),name:row.name,library:'hunlingMark',localPath,width:row.width,height:row.height,format:'png',sha256:row.pngSha256,bytes:bytes.length,sourceLabel,clientResource:'icon/'+row.resource.name,sourceSnapshot:snapshot,sourceDigest:row.resource.digest,sourceSha256:row.ktxSha256,conversion:'KTX1 ASTC 5x5 → PNG, original dimensions and pixel order'});
 marks.push({id:row.id,skillId:row.skillId,name:row.name,groupId:row.groupId,levels:row.levels});
}
const catalog=JSON.parse(fs.readFileSync('data/game-assets.json','utf8'));
catalog.items=[...catalog.items.filter(a=>a.library!=='hunlingMark'),...assets];
fs.writeFileSync('data/game-assets.json',JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync('data/qiling-marks.json',JSON.stringify({schemaVersion:1,source:{kind:'user-supplied-client',snapshot,skillResource:'com/data/cdata/skill.nxs3',skillDigest:'8618878c0ff6fb046902bb332f1859a4',resolution:'skill data with _proto_key inheritance; combatDesc by level; opaque bindict variant 1101 retained only for matching'},marks},null,2)+'\n');
console.log(JSON.stringify({imported:assets.length,descriptions:marks.reduce((n,m)=>n+m.levels.length,0)}));
