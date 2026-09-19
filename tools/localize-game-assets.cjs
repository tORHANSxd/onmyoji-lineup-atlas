'use strict';
// Build-time download only. Runtime never sends inventory to these sources.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {imageHeader}=require('../desktop/official-data.cjs');
const origin='https://onmyoji-assets.fireschain.org';
const daruma={410:'3/36/eojulu7ezkn1eveaoy9oyjsraoubgcj',411:'3/33/ied6f011pv7wkyr32q68l7ydv6ip7yx',412:'a/a4/py5vuhgar5ztpozgnx3csq30evz854h',413:'2/2d/0ut0f2db5g57gxncsnisiwcyqym1rm0',499:'b/bb/htmdu52cp2d0bv8e0rfu6kh58e01smr'};
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(url+' HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}
(async()=>{
 const catalog=JSON.parse(await get(origin+'/assets/catalog.json')),data=JSON.parse(await fs.readFile('data/bundle.json','utf8'));
 const items=[];
 for(const library of ['yuhun','onmyoji','onmyojiSkill','hunling'])for(const item of catalog.libraries[library])items.push({id:item.id,name:item.names.zh,library,url:library==='yuhun'?(item.id==='300000'?'https://cbg-yys.res.netease.com/mvvm/rc716ccd9a15fdb6507c4fb57b/dist/icon-empty-equip-e5a3.png':'https://cbg-yys.res.netease.com/game_res/suit/'+item.id+'.png'):origin+item.avatar,sourcePage:library==='yuhun'?'https://yys.cbg.163.com/yuhun-collocation':'https://github.com/FiresChain/onmyoji-yuhun',sourceLabel:library==='yuhun'?'网易藏宝阁官方御魂图标':'FiresChain 游戏素材目录'});
 for(const [id,file] of Object.entries(daruma)){const name=data.roster.find(r=>r.id===id).name;items.push({id,name,library:'daruma',url:'https://patchwiki.biligame.com/images/yys/'+file+'.png',sourcePage:'https://wiki.biligame.com/yys/'+encodeURIComponent(name),sourceLabel:'BWiki 社区百科'});}
 let index=0;
 await Promise.all(Array.from({length:6},async()=>{while(index<items.length){const item=items[index++],bytes=await get(item.url),info=imageHeader(bytes);if(info.format!=='png'||bytes.length>12*1024*1024)throw new Error('Invalid game image');item.localPath=`data/images/game/${item.library}/${item.id.replace(':','-')}.png`;await fs.mkdir(path.dirname(item.localPath),{recursive:true});await fs.writeFile(item.localPath,bytes);Object.assign(item,info,{sha256:crypto.createHash('sha256').update(bytes).digest('hex'),retrievedAt:new Date().toISOString(),bytes:bytes.length});}}));
 const existing=JSON.parse(await fs.readFile('data/game-assets.json','utf8').catch(()=>'{}'));
 await fs.writeFile('data/game-assets.json',JSON.stringify({...existing,source:origin+'/assets/catalog.json',catalogVersion:catalog.catalogVersion,items:[...items,...(existing.items||[]).filter(a=>!items.some(b=>a.library===b.library&&a.id===b.id))]},null,2)+'\n');
 console.log('Localized '+items.length+' game images.');
})().catch(e=>{console.error(e);process.exitCode=1;});
