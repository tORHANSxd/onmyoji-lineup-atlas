'use strict';
// Explicit build-time collection. Community sources are never called by the official updater.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {imageHeader}=require('../desktop/official-data.cjs');
const definitions=[
 {id:'yorimitsu',name:'源赖光',url:'https://patchwiki.biligame.com/images/yys/9/9f/mj7qhs4396huljoyzgjrpo525x3m20b.png'},
 {id:'michinaga',name:'藤原道长',url:'https://patchwiki.biligame.com/images/yys/b/b4/aksoq9xviwo1sqccwctygeiss1gdfw3.png'}
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function get(url){const u=new URL(url);if(u.protocol!=='https:'||!['wiki.biligame.com','patchwiki.biligame.com'].includes(u.hostname))throw new Error('Unexpected source');const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok||Number(r.headers.get('content-length'))>12*1024*1024)throw new Error('Source HTTP '+r.status);const chunks=[];let length=0;for await(const b of r.body){length+=b.length;if(length>12*1024*1024)throw new Error('Oversized source');chunks.push(b);}return Buffer.concat(chunks);}
(async()=>{const actors=[];for(const d of definitions){
 const sourceURL='https://wiki.biligame.com/yys/'+encodeURIComponent(d.name),page=await get(sourceURL),html=page.toString('utf8');
 const tag=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]).find(s=>s.includes(`alt="${d.name}.png"`)&&s.includes(d.url));
 if(!html.includes('阴阳师立绘')||!tag)throw new Error(d.name+' source identity no longer matches');
 const bytes=await get(d.url),info=imageHeader(bytes),localPath=`data/images/actors/${d.id}/art-before.png`,retrievedAt=new Date().toISOString();
 if(info.format!=='png')throw new Error('Unexpected format');await fs.mkdir(path.dirname(localPath),{recursive:true});await fs.writeFile(localPath,bytes);
 actors.push({id:d.id,name:d.name,aliases:[d.name],gameId:null,sourceURL,sourceRegion:'COMMUNITY_BWIKI',sourceLabel:'BWiki 社区百科',autoUpdate:false,sourceEvidence:{pageSHA256:sha(page),imageTag:tag,checkedAt:retrievedAt,identity:'页面标题、阴阳师立绘章节与同名图片 alt 一致'},assets:{awakeningAvailability:'not_applicable',nativeCardStatus:'missing_unverified',variants:[{family:'art-before',requestedState:'default',verifiedState:'default',contentKind:'community_art',sourcePage:sourceURL,sourceRegion:'COMMUNITY_BWIKI',sourceLabel:'BWiki 社区百科',url:d.url,localPath,status:'downloaded_valid_image',...info,sha256:sha(bytes),bytes:bytes.length,retrievedAt,nativeCardVerified:false,identityVerified:true,stateVerified:true,visualReview:'pending'}]}});
 }await fs.writeFile('data/supplemental-actors.json',JSON.stringify(actors,null,2));console.log(JSON.stringify(actors.map(a=>({name:a.name,images:a.assets.variants.map(i=>({width:i.width,height:i.height,sha256:i.sha256}))}))));})().catch(e=>{console.error(e);process.exitCode=1;});
