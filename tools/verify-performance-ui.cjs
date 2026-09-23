'use strict';
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {Background}=require('../desktop/background.cjs'),C=require('../app/core.js'),codec=require('../desktop/ta-codec.cjs');
const version=require('../package.json').version.replaceAll('.',''),root=path.resolve(__dirname,'..'),profile=path.join(root,'user-data','performance-ui-v'+version),file=path.join(profile,'library-v1.json');
app.setPath('userData',profile);let win,bg,fullWrites=0,deltaWrites=0;const errors=[];
const ui=s=>win.webContents.executeJavaScript(s).catch(e=>{throw Error(String(e.message||e)+' UI: '+s.slice(0,300));}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(s){for(let i=0;i<600;i++){if(await ui(s))return;await sleep(25);}throw Error('UI timeout: '+s);}
async function main(){
 await app.whenReady();await fs.mkdir(profile,{recursive:true});const data=require('../data/bundle.json'),original=data.lineups;
 const sample=original.find(l=>C.hasParsedContent(l)&&l.raw?.hconf?.length),lineups=Array.from({length:3000},(_,i)=>({...sample,id:'perf-'+i,title:'性能阵容 '+i,code:'|TA|perf-'+i}));
 const raw={format:'mumu-snapshot-v1',completeness:'complete',player:{name:'合成库存',serverId:'10014',shortId:'performance-test'},heroes:Object.fromEntries(Array.from({length:5000},(_,i)=>['hero-'+i,{heroId:Number(data.roster[i%data.roster.length].id),level:40,star:6,awake:1,skinfo:[]}])),hero_equips:[]};
 const account=C.parseAccount(raw),state={schemaVersion:1,lineups,accounts:[account],activeAccount:account.id,deletedPresetIds:[]};data.lineups=[];
 await fs.writeFile(file,JSON.stringify(state));bg=new Background({statePath:file});
 const local=(name,fn)=>{ipcMain.handle(name,(_e,...args)=>fn(...args));if(name==='export-json')ipcMain.handle('export-json-text',(_e,p)=>fn({name:p.name,data:JSON.parse(p.text)}));if(['load-data','load-state'].includes(name))ipcMain.handle(name+'-json',async(_e,...args)=>JSON.stringify(await fn(...args)));if(['save-state','save-parsed-state'].includes(name))ipcMain.handle(name+'-json',(_e,text)=>fn(JSON.parse(text)));};
 const save=async(state,delta)=>{const p=await bg.run('prepare-state',{state,delta});if(p.needsSnapshot)return p;await fs.rename(p.file,file);return bg.run('commit-state');};
 local('load-data',()=>data);local('load-state',()=>bg.run('load-state'));local('save-state',s=>{fullWrites++;return save(s);});local('save-parsed-state',s=>{fullWrites++;return save(s);});local('save-parsed-delta',d=>{deltaWrites++;return save(undefined,d);});
 local('save-state-fields-json',async fieldsJson=>{const p=await bg.run('prepare-state',{fieldsJson});if(p.needsSnapshot)return p;await fs.rename(p.file,file);return bg.run('commit-state');});
 local('parse-json',s=>bg.run('parse-json',s));local('decode',input=>bg.run('decode',{input}));
 local('ta-status',()=>({authenticated:true,query_ready:true,risk_accepted:true,busy:false,selected_server:'10014',selected_avatar:'test',servers:[{id:'10014',name:'测试',available:true,roles:[{avatar_id:'test',name:'测试'}]}]}));
 const payload=require('../tests/fixtures/ta-vectors.json').find(v=>v.name==='apk_sample_v3').payload;
 local('ta-query',async code=>{await sleep(5);const result=await bg.run('decode',{input:{code,share_key:code.slice(4),err:0,lineup_data:payload}});return {...result,origin:'official-query'};});
 for(const n of ['official-status','official-auto','official-refresh','official-cancel'])local(n,()=>({autoUpdate:false}));local('find-short-code',()=>null);
 win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 console.log('loading renderer');await win.loadFile(path.join(root,'app/index.html'));console.log('renderer loaded');await until('!!DATA&&document.getElementById("loading").hidden');await ui('TALogin.ready()');console.log('boot ready');await ui('persist()');console.log('snapshot saved');await sleep(400);
 console.log('batch starting');const batch=await ui(`(async()=>{
  const gaps=[];let last=performance.now(),switches=0;const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now;},10);
  const navigation=setInterval(()=>{selectView(['manage','decode','library'][switches++%3]);},180);
  const at=performance.now();await startLibraryParse({codes:lineups().slice(0,20).map(l=>l.code),force:true});clearInterval(timer);clearInterval(navigation);
  gaps.sort((a,b)=>a-b);return {elapsedMs:performance.now()-at,ticks:gaps.length,maxGapMs:Math.max(...gaps),p95GapMs:gaps[Math.floor(gaps.length*.95)],switches,report:parseReport};
 })()`);
 console.log('batch complete',JSON.stringify(batch));assert.equal(batch.report.succeeded,20);assert.equal(deltaWrites,20);assert.ok(batch.switches>1);assert.ok(batch.ticks>20);assert.ok(batch.maxGapMs<250,JSON.stringify(batch));
 const qr=await ui(`(async()=>{const canvas=new OffscreenCanvas(1200,6000);const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,6000);const bitmap=canvas.transferToImageBitmap();let ticks=0;const t=setInterval(()=>ticks++,10),at=performance.now();const result=await scanQRImage(bitmap,()=>true);clearInterval(t);return {elapsedMs:performance.now()-at,ticks,count:result.codes.length};})()`);
 assert.ok(qr.ticks>10);assert.equal(qr.count,0);
 const importRun=await ui(`(async()=>{
  const timings=[],originalJSON=jsonTask;
  jsonTask=(action,value)=>{const at=performance.now(),pending=originalJSON(action,value);timings.push({action,syncMs:performance.now()-at});return pending.then(result=>{timings.push({action,totalMs:performance.now()-at});return result;});};
  const gaps=[];let last=performance.now();const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now;},10),at=performance.now();
  importMode='accounts';await handleFiles([new File([${JSON.stringify(JSON.stringify(raw))}],'synthetic-inventory.json',{type:'application/json'})]);await stateWrites;clearInterval(timer);
  jsonTask=originalJSON;return {elapsedMs:performance.now()-at,ticks:gaps.length,maxGapMs:Math.max(...gaps),heroes:Object.keys(account().heroes).length,timings};
 })()`);
 console.log('import',JSON.stringify(importRun));
 assert.equal(importRun.heroes,5000);assert.ok(importRun.ticks>2);assert.ok(importRun.maxGapMs<250,JSON.stringify(importRun));
 const cancel=await ui(`(async()=>{let active=true;const canvas=new OffscreenCanvas(1200,6000);canvas.getContext('2d');const bitmap=canvas.transferToImageBitmap();setTimeout(()=>active=false,10);return scanQRImage(bitmap,()=>active);})()`);assert.equal(cancel.cancelled,true);
 await ui('selectView("library")');await sleep(200);await fs.writeFile(path.join(profile,'library.png'),(await win.webContents.capturePage()).toPNG());
 const persisted=JSON.parse(await fs.readFile(file));assert.equal(persisted.lineups.length,3000);assert.equal(Object.keys(persisted.accounts[0].heroes).length,5000);assert.deepEqual(errors,[]);
 const report={lineups:3000,heroes:5000,batch,qr,importRun,cancellation:true,fullWrites,deltaWrites,errors,method:'真实 Electron 页面、preload、后台文件保存、库存导入与二维码线程；查询使用合成回包，无账号或真实网络'};
 await fs.writeFile(path.join(root,'verification/performance-ui-v'+version+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await bg.close();app.exit(0);
}
main().catch(async e=>{console.error(String(e.stack||e),JSON.stringify(errors));await bg?.close();app.exit(1);});
