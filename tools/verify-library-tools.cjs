'use strict';
// Production renderer/preload/Worker, isolated synthetic inventory and local IPC.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),C=require('../app/core.js');
const root=path.resolve(__dirname,'..'),appRoot=process.argv[2]?path.resolve(process.argv[2]):root,profile=path.join(root,'user-data',process.argv[2]?'qa-lineup-tools-packaged':'qa-lineup-tools');app.setPath('userData',profile);
let win,stored,exported,failSave=false;const errors=[],report={};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),ui=code=>win.webContents.executeJavaScript(code);
async function until(code,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await ui(code))return;await sleep(25);}throw Error('UI timeout: '+code);}
async function capture(name){win.webContents.invalidate();await sleep(250);await win.webContents.capturePage();await sleep(100);await fs.writeFile(path.join(profile,name+'.png'),(await win.webContents.capturePage()).toPNG());}
async function main(){
 await app.whenReady();await fs.mkdir(profile,{recursive:true});await fs.rm(path.join(profile,'error.txt'),{force:true});await fs.rm(path.join(profile,'report.json'),{force:true});
 const data=require('../data/bundle.json');data.officialUpdate={autoUpdate:false};
 const cfg={metricId:7,scope:'all',suitSelectionComplete:true,suitRequirements:[],ranges:[],mainStats:{}};
 const member={index:0,kind:'shikigami',shikigamiId:'217',name:'大天狗',level:40,star:6,awakening:1,skills:[],config:cfg};
 data.lineups=Array.from({length:33},(_,i)=>({id:'qa-'+i,title:'测试阵容 '+String(i).padStart(2,'0'),code:'|TA|'+i.toString(16).padStart(32,'0'),decodeState:'decoded-local',requirementsComplete:true,mapperVersion:4,manualClassification:true,category:'御魂',subcategory:'八岐大蛇',dungeon:'八岐大蛇·拾层',members:[structuredClone(member)]}));
 data.lineups[0].members[0].config.ranges=[{stat:'speed',min:1,max:2}];
 data.lineups[1].members[0].config.suitRequirements=[{name:'心眼',count:4}];
 data.lineups[2].members[0]={...member,shikigamiId:'219',name:'妖刀姬'};
 data.lineups[3].members[0].skills=[{id:2171,level:5}];
 const raw={format:'mumu-snapshot-v1',completeness:'complete',player:{name:'测试库存甲',serverId:'10014',shortId:'test-a',serverName:'测试区'},heroes:{a:{heroId:217,level:40,star:6,awake:1,skinfo:[[2171,1]]}},hero_equips:Array.from({length:6},(_,i)=>({id:'q-'+i,slot:i+1,setId:'招财猫',quality:6,level:15,mainAttrType:['attack_flat','speed','defense_flat','attack_rate','hp_flat','crit_rate'][i],mainAttrValue:[486,10,104,.55,2052,.55][i],subAttributes:[]}))};
 const a=C.parseAccount(raw),b=C.parseAccount({...raw,player:{...raw.player,name:'测试库存乙',shortId:'test-b'}});
 stored={schemaVersion:1,lineups:[],accounts:[a,b],activeAccount:a.id};
 const local=(name,fn)=>ipcMain.handle(name,(_e,...args)=>fn(...args));
 local('load-data',()=>data);local('load-state',()=>stored);local('save-state',async state=>{if(failSave){failSave=false;throw Error('synthetic save failure');}stored=structuredClone(state);await fs.writeFile(path.join(profile,'library-v1.json'),JSON.stringify(stored));return {saved:true};});
 local('save-parsed-state',()=>{throw Error('Unexpected parsing');});local('ta-status',()=>({authenticated:false,stage:'idle',servers:[],remembered_accounts:[]}));local('ta-action',()=>({authenticated:false,stage:'idle',servers:[]}));
 for(const name of ['official-status','official-auto','official-refresh','official-cancel'])local(name,()=>({autoUpdate:false}));
 local('copy-code',()=>({copied:true}));local('export-json',p=>{exported=p;return true;});
 win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{preload:path.join(appRoot,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',d=>{if(d.level==='error'&&!/synthetic save failure/.test(d.message))errors.push(d.message);});
 await win.loadFile(path.join(appRoot,'app/index.html'));await until('!!DATA && document.getElementById("loading").hidden');
 assert.equal(await ui('worker===null'),true);assert.equal(await ui('Object.values(matchResults).every(r=>r.proof.state==="idle")'),true);
 assert.equal(await ui('document.querySelector("[data-target-directory]").textContent.includes("目标阵容")'),true);report.noStartupCalculation=true;
 await ui('document.getElementById("search").value="测试阵容";document.getElementById("search").dispatchEvent(new Event("input"))');
 assert.equal(await ui('document.querySelectorAll(".lineup-card").length'),24);
 await ui('document.getElementById("select-filtered").click()');assert.equal(await ui('selectedLineups.size'),33);
 await ui('document.getElementById("next-page").click()');assert.equal(await ui('[...document.querySelectorAll("[data-select-lineup]")].every(e=>e.checked)'),true);
 await ui('document.getElementById("select-invert").click()');assert.equal(await ui('selectedLineups.size'),0);
 await ui('document.getElementById("select-invert").click()');assert.equal(await ui('selectedLineups.size'),33);
 await ui('document.getElementById("select-clear").click();document.getElementById("previous-page").click();document.querySelector("[data-select-lineup=qa-0]").click();document.querySelector("[data-select-lineup=qa-1]").click()');
 assert.equal(await ui('document.getElementById("select-filtered").indeterminate'),true);
 await ui('saveTargets()');assert.deepEqual(stored.targetLineups[a.id].sort(),['qa-0','qa-1']);
 await ui('document.getElementById("category").value="御魂";document.getElementById("category").dispatchEvent(new Event("change"))');assert.equal(await ui('selectedLineups.size'),0);assert.equal(await ui('targetIds().size'),2);
 await ui('document.getElementById("active-account").value='+JSON.stringify(b.id)+';document.getElementById("active-account").dispatchEvent(new Event("change"))');
 await until('STATE.activeAccount==='+JSON.stringify(b.id));assert.equal(await ui('targetIds().size'),0);assert.equal(await ui('worker===null'),true);
 await ui('document.querySelector("[data-select-lineup=qa-2]").click();saveTargets()');assert.deepEqual(stored.targetLineups[b.id],['qa-2']);
 await ui('document.getElementById("active-account").value='+JSON.stringify(a.id)+';document.getElementById("active-account").dispatchEvent(new Event("change"))');await until('targetIds().size===2');
 await ui('document.getElementById("clear-filters").click();document.querySelector("[data-target-directory]").click()');assert.equal(await ui('filteredLineups().length'),2);await capture('target-lineups');
 await ui('document.getElementById("select-filtered").click()');failSave=true;await ui('saveTargets(true)');assert.equal(await ui('targetIds().size'),2);
 await ui('saveTargets(true)');assert.equal(await ui('filteredLineups().length'),0);assert.equal(await ui('lineups().length'),33);
 await ui('document.getElementById("clear-filters").click();document.getElementById("search").value="测试阵容";document.getElementById("search").dispatchEvent(new Event("input"));document.querySelector("[data-select-lineup=qa-0]").click();document.querySelector("[data-select-lineup=qa-1]").click();saveTargets()');
 await ui('document.getElementById("export-backup").click()');await sleep(40);const backup=JSON.stringify(exported.data);
 await ui('importMode="accounts";handleFiles([{name:"updated.json",size:1,text:async()=>'+JSON.stringify(JSON.stringify({...raw,capturedAt:'2026-09-19T00:00:00Z'}))+'}])');assert.deepEqual(stored.targetLineups[a.id].sort(),['qa-0','qa-1']);assert.equal(await ui('worker===null'),true);
 await ui('STATE.targetLineups={};importMode="backup";handleFiles([{name:"backup.json",size:1,text:async()=>'+JSON.stringify(backup)+'}])');assert.deepEqual(stored.targetLineups[b.id],['qa-2']);
 await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await until('!!DATA && document.getElementById("loading").hidden');assert.equal(await ui('targetIds().size'),2);assert.equal(await ui('worker===null'),true);report.targetsPersisted=true;
 await ui('document.getElementById("search").value="测试阵容";document.getElementById("search").dispatchEvent(new Event("input"));document.querySelector("[data-select-lineup=qa-0]").click();document.querySelector("[data-select-lineup=qa-4]").click();document.getElementById("match-selected").click()');
 await until('worker===null');assert.equal(await ui('matchResults["qa-0"].gapAssessment.souls'), 'missing');assert.equal(await ui('matchResults["qa-4"].proof.state'),'optimal');assert.equal(await ui('Object.values(matchResults).filter(r=>r.completed).length'),2);report.selectedOnly=true;
 await ui('document.getElementById("gap-statistics").click()');assert.equal(await ui('document.getElementById("gap-dialog").open'),true);await until('worker===null');
 assert.equal(await ui('Object.values(matchResults).filter(r=>r.completed).length'),33);assert.ok((await ui('document.getElementById("gap-statistics-body").textContent')).includes('心眼'));assert.ok((await ui('document.getElementById("gap-statistics-body").textContent')).includes('妖刀姬'));
 await ui('document.querySelector("#gap-statistics-body details").open=true');await capture('gap-statistics');
 await ui('document.querySelector("#gap-statistics-body [data-stat-detail]").click()');assert.equal(await ui('document.getElementById("detail-dialog").open'),true);await ui('document.getElementById("detail-dialog").close();document.getElementById("close-gap-statistics").click()');report.statisticsAutoScoped=true;
 await ui('document.getElementById("search").value=lineups().find(l=>l.id==="qa-1").code;document.getElementById("search").dispatchEvent(new Event("input"));matchResults={};document.getElementById("gap-statistics").click()');await until('worker===null');assert.equal(await ui('Object.values(matchResults).filter(r=>r.completed).length'),1);assert.deepEqual(await ui('statsSnapshot.ids'),['qa-1']);await ui('document.getElementById("close-gap-statistics").click()');
 // Exercise pause/resume and append a second scope before the first tick returns.
 await ui('startMatch(["qa-4"]);toggleMatchPause();startMatch(["qa-5"]);toggleMatchPause()');await sleep(50);assert.equal(await ui('matchPaused'),true);await ui('toggleMatchPause()');await until('worker===null');assert.equal(await ui('matchResults["qa-4"].completed&&matchResults["qa-5"].completed'),true);
 await ui('startMatch(["qa-6"]);document.getElementById("active-account").value='+JSON.stringify(b.id)+';document.getElementById("active-account").dispatchEvent(new Event("change"))');await sleep(100);assert.equal(await ui('worker===null&&Object.values(matchResults).every(r=>!r.completed)'),true);report.accountIsolation=true;
 await ui('document.getElementById("clear-filters").click();document.getElementById("match-all").click()');await until('worker===null');assert.equal(await ui('Object.values(matchResults).filter(r=>r.completed).length'),33);report.manualAll=true;
 const alignments=[];
 await ui('showLineup({...lineups().find(l=>l.id==="qa-4"),id:"qa-alignment",members:[...lineups().find(l=>l.id==="qa-4").members,{...lineups().find(l=>l.id==="qa-4").members[0],index:1}]})');
 for(const [width,zoom] of [[1440,1],[1100,1],[900,1],[1440,1.25]]){
  win.setSize(width,1000);win.webContents.setZoomFactor(zoom);await sleep(80);
  const boxes=await ui('[...document.querySelectorAll(".soul-ring")].map(r=>{const ring=r.getBoundingClientRect(),center=r.querySelector(".soul-center").getBoundingClientRect(),img=r.querySelector(".soul-center .avatar").getBoundingClientRect();return {offset:Math.abs(img.x+img.width/2-(ring.x+ring.width/2)),textOffset:Math.abs(img.x+img.width/2-(center.x+center.width/2))}})');
  assert.ok(boxes.every(b=>b.offset<1&&b.textOffset<1));alignments.push({width,zoom,boxes});
 }
 win.webContents.setZoomFactor(1);win.setSize(1440,1000);await capture('centered-avatars');report.alignments=alignments;
 await ui('document.getElementById("detail-dialog").close();document.getElementById("clear-filters").click()');await capture('library-home');
 await ui('matchResults["qa-0"]={completed:false,proof:{state:"computing"},status:"unknown",gapCategory:"pending"};document.getElementById("status-filter").value="unknown";renderLibrary()');assert.equal(await ui('filteredLineups().length'),0);
 await ui('matchResults["qa-0"].completed=true;matchResults["qa-0"].proof.state="blocked";matchResults["qa-0"].gapCategory="unknown";renderLibrary()');assert.equal(await ui('filteredLineups().length'),1);report.unknownFilterExcludesComputing=true;
 assert.deepEqual(errors,[]);report.consoleErrors=errors;report.passed=true;
 await fs.writeFile(path.join(profile,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.quit();
}
main().catch(async e=>{console.error(e.stack);try{await fs.mkdir(profile,{recursive:true});await fs.writeFile(path.join(profile,'error.txt'),e.stack);if(win)await capture('failure');}catch{}app.exit(1);});
