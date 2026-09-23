'use strict';
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const codec=require('../desktop/ta-codec.cjs'),QRCode=require('qrcode');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'user-data','creator-ui');
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,stored,failSave=false,holdBuild=false,heldBuilds=[],copied='',qrExports=0;
const results=[],errors=[],sleep=ms=>new Promise(r=>setTimeout(r,ms)),ui=code=>win.webContents.executeJavaScript(code);
async function until(code){for(let i=0;i<200;i++){if(await ui(code))return;await sleep(25);}throw Error('UI timeout: '+code);}
async function check(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});console.error(name,e.stack);}finally{failSave=false;holdBuild=false;heldBuilds.splice(0).forEach(r=>r());}}
async function capture(name){await ui('Promise.all([...document.querySelectorAll("#view-builder img")].map(async img=>{img.loading="eager";try{await img.decode();}catch{}}))');await ui('document.getElementById("toast").classList.remove("show")');win.webContents.invalidate();await sleep(350);await win.webContents.capturePage();await sleep(80);await fs.writeFile(path.join(profile,name+'.png'),(await win.webContents.capturePage()).toPNG());}
async function main(){
 await app.whenReady();await fs.mkdir(profile,{recursive:true});
 const data=JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8'));
 stored={schemaVersion:1,lineups:[],accounts:[],activeAccount:'',deletedPresetIds:[],targetLineups:{}};
 const local=(name,fn)=>{ipcMain.handle(name,(_e,...args)=>fn(...args));if(name==='export-json')ipcMain.handle('export-json-text',(_e,p)=>fn({name:p.name,data:JSON.parse(p.text)}));if(['load-data','load-state'].includes(name))ipcMain.handle(name+'-json',async(_e,...args)=>JSON.stringify(await fn(...args)));if(['save-state','save-parsed-state'].includes(name))ipcMain.handle(name+'-json',(_e,text)=>fn(JSON.parse(text)));};
 local('parse-json',text=>JSON.parse(text));local('save-parsed-delta',()=>({needsSnapshot:true}));
 const status={authenticated:false,query_ready:false,busy:false,servers:[],stage:'idle',remembered_accounts:[]};
 local('load-data',()=>data);local('load-state',()=>stored);
 for(const name of ['save-state','save-parsed-state'])local(name,async s=>{if(failSave)throw Error('synthetic disk full');stored=structuredClone(s);return {saved:true};});
 local('ta-status',()=>status);local('ta-action',()=>status);local('ta-logout',()=>status);
 local('ta-query',()=>{throw Error('offline fixture');});local('ta-share',code=>({code:'|TA|verified-ui-key',cacheSaved:true}));
 local('decode',code=>codec.decodeInput(code));local('find-short-code',()=>null);
 local('build-lineup',async input=>{if(holdBuild)await new Promise(r=>heldBuilds.push(r));codec.validateGameLineup(input,data);const code=codec.encodeLineupData(input);return {code,payload:codec.decodeInput(code),image:await QRCode.toDataURL(code)};});
 local('copy-code',code=>{copied=code;return {copied:true};});local('export-qr',()=>{qrExports++;return true;});local('export-json',()=>true);local('import-files',()=>[]);
 for(const name of ['official-status','official-auto','official-refresh','official-cancel'])local(name,()=>({autoUpdate:false}));
 win=new BrowserWindow({width:1440,height:960,show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 await win.loadFile(path.join(root,'app/index.html'));await until('!!DATA&&document.getElementById("loading").hidden');await ui('TALogin.ready()');
 await check('筛选全选覆盖全部分页，排序保持选择',async()=>{
  await ui('selectView("manage");document.getElementById("manage-select-all").click()');
  assert.equal(await ui('manageSelected.size'),373);await ui('document.getElementById("manage-next").click();document.getElementById("manage-sort").value="title";document.getElementById("manage-sort").dispatchEvent(new Event("change",{bubbles:true}))');
  assert.equal(await ui('manageSelected.size'),373);
  await ui('document.getElementById("manage-search").value="铁鼠";document.getElementById("manage-search").dispatchEvent(new Event("input",{bubbles:true}))');
  await until('manageSelected.size===0');assert.equal(await ui('manageSelected.size'),0);await ui('document.getElementById("manage-search").value="";renderManage()');
 });
 await check('固定阴阳师位置，完整阵容保存御魂范围与多组两件套',async()=>{
  await ui('selectView("builder");openBuilderPicker();document.querySelector("[data-builder-hero=\\"10\\"]").click()');
  assert.equal(await ui('builderDraft.members[0].h.hero_id'),10);
  for(const id of [554,201,202,203,554])await ui('openBuilderPicker();document.querySelector("[data-builder-hero=\\"'+id+'\\"]").click()');
  await ui('document.querySelectorAll("[data-builder-member]")[1].click();document.querySelector("[data-builder-min=\\"spd\\"]").value="180";document.querySelector("[data-builder-min=\\"spd\\"]").dispatchEvent(new Event("input",{bubbles:true}));window.testSuitIds=Object.keys(DATA.suits).slice(0,3);document.querySelectorAll("[data-builder-suit=\\"2\\"]").forEach((s,i)=>{s.value=testSuitIds[i];s.dispatchEvent(new Event("input",{bubbles:true}));});');
  await ui('saveBuilder()');assert.equal(stored.lineups.length,0);assert.match(await ui('document.getElementById("builder-state").textContent'),/副本/);
  await ui('document.getElementById("builder-stage").value=String(DATA.stageCatalog.scenes.find(s=>AtlasGame.slots(DATA.gameConfig,s.gameSceneId).length===6).gameSceneId);document.getElementById("builder-stage").dispatchEvent(new Event("input",{bubbles:true}));saveBuilder()');
  assert.equal(stored.lineups.length,1);assert.equal(stored.lineups[0].relations,undefined);
  assert.deepEqual(stored.lineups[0].raw.hconf[1].equip_info.limit.spd,[180,-1]);assert.deepEqual(stored.lineups[0].raw.hconf[1].equip_info.suit.map(s=>s[1]),[2,2,2]);
 });
 await check('技能真名、等级上限、分支锁定和逐级说明',async()=>{
  assert.match(await ui('document.getElementById("builder-editor").textContent'),/守缘刃/);
  assert.equal(await ui('document.querySelector("[data-builder-skill=\\"5542\\"]").options.length'),2);
  assert.equal(await ui('document.querySelector("[data-builder-field=\\"ai_skill\\"] option[value=\\"5\\"]").textContent'), '守缘刃 · 胜天之缘·赤');
  await ui('document.querySelector("[data-open-skill=\\"5542\\"]").click()');
  assert.match(await ui('document.getElementById("skill-dialog").textContent'),/1 鬼火/);assert.match(await ui('document.getElementById("skill-dialog").textContent'),/神力/);
  assert.equal(await ui('document.getElementById("skill-dialog").open'),true);await ui('Promise.all([...document.querySelectorAll("#skill-dialog img")].map(i=>i.decode()))');await capture('skill-details');await ui('document.querySelector("[data-close-skill]").click()');
 });
 await check('阴阳师携带技能与契灵术印按等级保存',async()=>{
  await ui('document.querySelectorAll("[data-builder-member]")[0].click();var change=(el,value)=>{el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};change(document.querySelector("[data-builder-equipped=\\"0\\"]"),"1009");change(document.querySelector("[data-builder-equipped=\\"1\\"]"),"1011");change(document.querySelector("[data-builder-spirit]"),"100");change(document.querySelector("[data-builder-mark=\\"0\\"]"),"1");change(document.querySelector("[data-builder-mark-level=\\"0\\"]"),"3");saveBuilder()');
  assert.equal(await ui('[...document.querySelector("[data-builder-equipped-level]\").options].some(o=>o.value==="")'),false);
  assert.deepEqual(stored.lineups[0].raw.hconf[0].skills,[[1009,1],[1011,1]]);assert.deepEqual(stored.lineups[0].raw.hconf[0].qiling_info.marks,[1,1,1]);
  assert.equal(await ui('document.querySelector("[data-builder-field=\\"awake\\"]")===null'),true);
 });
 await check('编辑其他字段不会清掉历史契灵的零等级、所属组和额外术印',async()=>{
  const q={id:100,star:6,lv:0,mark_gid:2,marks:[9,10,11,10,12,10]};
  await ui('builderDraft.members[0].h.qiling_info='+JSON.stringify(q)+';renderBuilderEditor();document.getElementById("builder-title").value="历史契灵保留";document.getElementById("builder-title").dispatchEvent(new Event("input",{bubbles:true}));saveBuilder()');
  assert.deepEqual(stored.lineups[0].raw.hconf[0].qiling_info,q);
 });
 await check('游戏二维码与完整码同源，导出无增强关系入口',async()=>{
  await ui('buildBuilderPreview()');assert.equal(await ui('document.getElementById("builder-add-relation")===null'),true);
  await ui('document.getElementById("builder-copy").click();document.getElementById("builder-export-qr").click()');await sleep(50);assert.ok(copied.startsWith('#TA#'));assert.equal(qrExports,1);assert.equal(codec.decodeLineupData(copied).hconf[0].hero_id,10);
 });
 await check('式神排序保留阴阳师首位，不能越过固定位置',async()=>{
  const actor=await ui('builderDraft.members[0].key');await ui('moveBuilderMember(builderDraft.members[1].key,0)');assert.equal(await ui('builderDraft.members[0].key'),actor);
  const first=await ui('builderDraft.members[1].key');await ui('moveBuilderMember(builderDraft.members[1].key,2)');assert.equal(await ui('builderDraft.members[2].key'),first);assert.equal(await ui('builderDraft.members[0].key'),actor);
 });
 await check('手动多副本优先级在制作器再保存后保留',async()=>{
  await ui('editLineup(builderDraft.savedId);editPaths=[{category:"限时活动",subcategory:"测试",dungeon:"扩展甲",extended:true},{category:"御魂",subcategory:"测试",dungeon:"扩展乙",extended:true}];document.getElementById("edit-auto-category").checked=false;renderEditPaths();saveLineupManagement()');
  await until('!libraryBusy');
  await ui('saveBuilder()');assert.equal(stored.lineups[0].manualPaths.length,2);assert.equal(stored.lineups[0].manualPaths[0].dungeon,'扩展甲');
 });
 await check('保存失败保留原阵容、草稿和可重试状态',async()=>{
  const old=JSON.stringify(stored);failSave=true;await ui('document.getElementById("builder-title").value="失败不丢稿";document.getElementById("builder-title").dispatchEvent(new Event("input",{bubbles:true}));saveBuilder()');
  assert.equal(JSON.stringify(stored),old);assert.equal(await ui('builderDraft.title'),'失败不丢稿');assert.equal(await ui('builderSaving||libraryBusy'),false);
 });
 await check('慢保存期间复位被阻止，迟到保存不会穿过复位',async()=>{
  holdBuild=true;await ui('void saveBuilder()');for(let i=0;i<100&&!heldBuilds.length;i++)await sleep(10);assert.equal(heldBuilds.length,1);
  await ui('previewLibraryReset()');assert.equal(await ui('!!document.getElementById("confirm-library-reset")'),false);
  holdBuild=false;heldBuilds.splice(0).forEach(r=>r());await until('!builderSaving');
 });
 await check('首次保存期间继续编辑，第二次保存更新同一条阵容',async()=>{
  const before=stored.lineups.length;
  await ui('delete builderDraft.savedId;delete builderDraft.createdAt;builderDraft.title="首次慢保存";renderBuilder();builderChanged()');
  holdBuild=true;await ui('void saveBuilder()');for(let i=0;i<100&&!heldBuilds.length;i++)await sleep(10);assert.equal(heldBuilds.length,1);
  await ui('document.getElementById("builder-title").value="保存时继续输入";document.getElementById("builder-title").dispatchEvent(new Event("input",{bubbles:true}))');
  holdBuild=false;heldBuilds.splice(0).forEach(r=>r());await until('!builderSaving');
  const first=stored.lineups.at(-1).id;assert.equal(await ui('builderDraft.savedId'),first);assert.equal(await ui('builderDraft.title'),'保存时继续输入');
  await ui('saveBuilder()');assert.equal(stored.lineups.length,before+1);assert.equal(stored.lineups.at(-1).id,first);assert.equal(stored.lineups.at(-1).title,'保存时继续输入');
 });
 await check('短码排队保存时继续编辑，不丢失返回结果或误读新草稿',async()=>{
  await ui('buildBuilderPreview();window.realParserLogin=requireParserLogin;requireParserLogin=()=>true;void 0');
  await until('!!builderOutput');const id=await ui('builderDraft.savedId');
  await ui('stateWrites=new Promise(resolve=>window.releaseStateQueue=resolve);void(window.sharingTest=shareBuilder(document.getElementById("builder-share")))');
  await until('!!builderOutput.shortCode');
  await ui('document.getElementById("builder-title").value="短码返回后继续编辑";document.getElementById("builder-title").dispatchEvent(new Event("input",{bubbles:true}));window.releaseStateQueue();window.sharingTest');
  assert.equal(stored.lineups.find(l=>l.id===id).shortCode,'|TA|verified-ui-key');assert.equal(await ui('builderDraft.title'),'短码返回后继续编辑');
  await ui('requireParserLogin=window.realParserLogin;void 0');
 });
 await check('相同原生内容保留短码，内容变化后清除过期关联',async()=>{
  const id=await ui('builderDraft.savedId');
  await ui('builderDraft.title=STATE.lineups.find(l=>l.id===builderDraft.savedId).title;renderBuilder();builderChanged();saveBuilder()');
  assert.equal(stored.lineups.find(l=>l.id===id).shortCode,'|TA|verified-ui-key');
  await ui('showLineup(lineups().find(l=>l.id===builderDraft.savedId))');
  assert.equal(await ui('document.querySelector(".relation-summary")===null'),true);
  await ui('document.getElementById("detail-dialog").close();builderDraft.title="示例：双式神配速";renderBuilder();builderChanged();saveBuilder()');
  assert.equal(stored.lineups.find(l=>l.id===id).shortCode,undefined);
 });
 for(const width of [1440,900,720]){
  win.setContentSize(width,960);await ui('selectView("builder");window.scrollTo(0,0)');await sleep(100);
  await check('制作器 '+width+' 布局无横向溢出',async()=>assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true));
  await capture('builder-'+width);await ui('document.getElementById("builder-editor").scrollIntoView({block:"start"})');await capture('builder-editor-'+width);
 }
 win.setContentSize(1440,960);await ui('selectView("manage");previewLibraryReset()');await capture('reset-preview');
 await check('真实五秒倒计时前不可复位，失败不清空资料',async()=>{
  assert.equal(await ui('document.getElementById("confirm-library-reset").disabled'),true);const count=stored.lineups.length;await ui('applyLibraryReset()');assert.equal(stored.lineups.length,count);
  await sleep(5100);failSave=true;await ui('applyLibraryReset()');assert.equal(stored.lineups.length,count);
  assert.equal(await ui('document.getElementById("detail-dialog").open'),true);
 });
 await check('复位清除所有用户阵容与草稿，恢复373预设且保留账号',async()=>{
  const oldAccounts=JSON.stringify(stored.accounts);await ui('applyLibraryReset()');assert.equal(stored.lineups.length,0);assert.equal(stored.builderDraft,null);
  assert.deepEqual(stored.deletedPresetIds,[]);assert.deepEqual(stored.targetLineups,{});assert.equal(JSON.stringify(stored.accounts),oldAccounts);assert.equal(await ui('lineups().length'),373);
 });
 await check('复位取消尚未返回的文件导入，迟到数据不能重建阵容',async()=>{
  const code=require('../tests/fixtures/public-qr-samples.json').samples[0].code;
  await ui('importMode="payload";window.pendingImportTest=importTAFiles([{name:"late.txt",size:100,text:()=>new Promise(resolve=>window.releaseImportTest=resolve)}]);previewLibraryReset();resetRequest.readyAt=0;applyLibraryReset()');
  assert.equal(stored.lineups.length,0);
  await ui('window.releaseImportTest('+JSON.stringify(code)+');window.pendingImportTest');
  assert.equal(stored.lineups.length,0);assert.equal(await ui('lineups().length'),373);
 });
 await check('恢复与撤销取消已经排队的资料导入',async()=>{
  const code=require('../tests/fixtures/public-qr-samples.json').samples[0].code;
  for(const operation of ['restore','undo']){
   await ui('importMode="payload";void(window.pendingImportTest=importTAFiles([{name:"late.txt",size:100,text:()=>new Promise(resolve=>window.releaseImportTest=resolve)}]))');
   if(operation==='restore')await ui('pendingBackup={backup:{...STATE,lineups:[],builderDraft:null},revision:sessionRevision};previewBackupRestore();applyBackupRestore()');
   else await ui('undoBackupRestore()');
   await ui('window.releaseImportTest('+JSON.stringify(code)+');window.pendingImportTest');assert.equal(stored.lineups.length,operation==='restore'?318:0);assert.equal(stored.lineups.some(l=>l.code===code),false);
  }
 });
 await check('资料更新时取消尚未执行的保存队列项目',async()=>{
  await ui('stateWrites=new Promise(resolve=>window.releaseStateQueue=resolve);window.oldDataRevision=dataRevision;window.staleCommit=commitState(s=>({...s,staleFlag:true}),sessionRevision,null,null,()=>dataRevision===window.oldDataRevision);invalidatePendingImports();window.releaseStateQueue();window.staleCommit');
  assert.equal(stored.staleFlag,undefined);assert.equal(await ui('STATE.staleFlag'),undefined);
 });
 await check('公开完整码无需登录即可解析并保存',async()=>{
  const code=require('../tests/fixtures/public-qr-samples.json').samples[0].code;
  await ui('selectView("decode");document.getElementById("code-input").value='+JSON.stringify(code)+';codeRevision++;localDecode()');
  assert.equal(stored.lineups.length,1);assert.ok(stored.lineups[0].members.length>=6);
 });
 await check('制作草稿备份恢复不沿用上一个编辑器内容',async()=>{
  await ui('selectView("builder");builderDraft.title="旧草稿";builderChanged();window.resetBuilder();renderBuilder()');
  assert.equal(await ui('builderDraft.title'),'我的阵容');
 });
 const report={version:require('../package.json').version,results,errors,method:'生产 Electron 页面和预加载；实际编码/二维码生成；合成 IPC 不连接游戏。'};
 await fs.writeFile(path.join(profile,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(root,'verification','creator-ui-v'+report.version.replaceAll('.','')+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),errors,profile},null,2));app.exit(results.every(r=>r.passed)&&errors.length===0?0:1);
}
main().catch(e=>{console.error(e);app.exit(1);});
