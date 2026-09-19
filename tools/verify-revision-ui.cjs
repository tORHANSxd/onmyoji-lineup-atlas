// Production HTML, renderer, workers and preload in Electron. Only NetEase and
// file dialogs are synthetic; no private profile or login credentials are read.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version.replaceAll('.',''),profile=path.join(root,'user-data','revision-ui-v'+version),C=require('../app/core.js'),TA=require('../desktop/ta-codec.cjs');
app.setPath('userData',profile);let win,epoch=0,stored,queries=0,exported,failNextSave=false,finishDeferred,retryFailure=false;const errors=[],attempts=new Map();
const {TAQueryQueue}=require('../desktop/ta-query-queue.cjs'),{encode,ExtData}=require('@msgpack/msgpack'),zlib=require('node:zlib');
const pack=entries=>zlib.deflateSync(Buffer.concat([Buffer.from([0x80+entries.length]),...entries.flatMap(([k,v])=>[Buffer.from(encode(k)),Buffer.from(encode(v))])])).toString('base64');
const phconf=[...Array.from({length:5},()=>[608,6,40,1,[1,0,0],[1,1,7,[],[[10],[10]],[null,null,null,null,null,null,[100,300]],[[],[],[]]],null,[],null,null]),[15,6,40,1,[[1,1]],[100,6,20,5,[4,4,1,8,6]],null]];
const code=n=>'|TA|'+n.toString(16).padStart(32,'0');
const server={id:'10014',name:'两情相悦',category:'网易双平台',available:true,roles:[{avatar_id:'qa',server_id:'10014',name:'验证角色'}],roles_known:true};
let status={authenticated:false,stage:'idle',busy:false,servers:[server],selected_server:'10014',selected_avatar:'',qr_image:''};
const publish=p=>{status={...status,...p};epoch++;win.webContents.send('ta-status-changed',status);};
const ui=s=>win.webContents.executeJavaScript(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(s,ms=30000){const end=Date.now()+ms;while(Date.now()<end){if(await ui(s))return;await sleep(30);}throw new Error('UI timeout: '+s);}
async function capture(name){win.webContents.invalidate();await sleep(350);await win.webContents.capturePage();await sleep(80);await fs.writeFile(path.join(profile,name+'.png'),(await win.webContents.capturePage()).toPNG());}
const payload=text=>{const n=parseInt(text.slice(4),16),hex='0123456789abcdefaabbccdd';return {code:text,share_key:text.slice(4),err:0,lineup_data:pack([[1,3],[2,phconf],[3,'测试配速'],[4,'测试官方名称'],[6,1001000],[8,new ExtData(42,Buffer.from(hex,n>=45&&n<58?'utf8':'hex'))]])};};
async function main(){
 await app.whenReady();await fs.mkdir(profile,{recursive:true});await fs.rm(path.join(profile,'error.txt'),{force:true});const data=JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8'));data.officialUpdate={autoUpdate:false};
  const presetLineups=data.lineups;
  data.lineups=Array.from({length:155},(_,n)=>({id:'qa-'+n,title:'验证阵容 '+n,code:code(n),members:[],category:'其他',dungeon:'待分类',decodeState:'unattempted'}));
 const raw={format:'mumu-snapshot-v1',completeness:'complete',player:{name:'本地测试库存',serverId:'10014',shortId:'synthetic',serverName:'XX区10014'},heroes:Object.fromEntries(Array.from({length:5},(_,i)=>['hero-'+i,{heroId:608,level:40,star:6,awake:1,skinfo:[[6081,1]]}])),hero_equips:Array.from({length:30},(_,i)=>({id:'soul-'+i,slot:i%6+1,setId:'招财猫',quality:6,level:15,mainAttrType:['attack_flat','speed','defense_flat','attack_rate','hp_flat','crit_rate'][i%6],mainAttrValue:[486,57,104,.55,2052,.55][i%6],subAttributes:[]}))};
 const a=C.parseAccount(raw);stored={schemaVersion:1,lineups:data.lineups.slice(45,77).map((l,i)=>({...l,lastParseError:i<13?'ObjectId 必须为12字节':`Error invoking remote method 'ta-query': Error: 服务器未返回该阵容（代码 ${i<23?90011:31279}）；分享可能已失效`})),accounts:[a],activeAccount:a.id};
 const local=(name,fn)=>ipcMain.handle(name,(_e,...args)=>fn(...args));const auth=(name,fn)=>local(name,async(...args)=>{if(!status.authenticated)throw new Error('请先扫码登录');const token=epoch,result=await fn(...args);if(token!==epoch)throw new Error('登录已结束');return result;});
 const loginActions=[];local('ta-status',()=>status);local('ta-action',(action,params)=>{loginActions.push({action,params});if(action==='risk')publish({risk_accepted:params.accepted});if(action==='forget')publish({remembered_accounts:status.remembered_accounts.filter(a=>a.id!==params.account_id)});return status;});local('ta-logout',()=>{publish({authenticated:false,selected_avatar:''});return status;});
  local('load-data',()=>data);local('load-state',()=>stored);const save=async s=>{if(failNextSave){failNextSave=false;throw new Error('simulated disk full');}stored=structuredClone(s);await fs.writeFile(path.join(profile,'library-v1.json'),JSON.stringify(stored));return {saved:true};};local('save-state',save);auth('save-parsed-state',save);auth('decode',TA.decodeInput);
  const queue=new TAQueryQueue({intervalMs:0,cooldownMs:0,retryDelays:[300,600],onProgress:p=>win.webContents.send('ta-query-progress',p),execute:async text=>{queries++;const n=parseInt(text.slice(4),16),attempt=(attempts.get(n)||0)+1;attempts.set(n,attempt);if(n>=68&&n<77||n===9000)return {code:text,share_key:text.slice(4),err:31279};if(n===8000)await new Promise(resolve=>finishDeferred=resolve);if(n===2&&retryFailure||n>=58&&n<68&&attempt===1)return {code:text,share_key:text.slice(4),err:90011};return payload(text);}});
 auth('ta-query',async text=>{const result=TA.decodeInput(await queue.query(text,()=>{if(!status.authenticated)throw Error('登录已结束');}));if(result.ok)result.origin='official-query';return result;});
 local('copy-code',()=>({copied:true}));for(const name of ['official-status','official-auto','official-refresh','official-cancel'])local(name,()=>({autoUpdate:false}));local('export-json',p=>{exported=p;return true;});local('import-files',()=>[]);
 win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 await win.loadFile(path.join(root,'app/index.html'));await until('!!DATA && !document.getElementById("loading").hidden===false');await ui('TALogin.ready()');
 assert.equal(queries,0);assert.equal(await ui('document.getElementById("app-shell").hidden'),false);assert.equal(await ui('document.getElementById("view-gallery")===null&&document.getElementById("soul-calculator")===null'),true);
 publish({remembered_accounts:[{id:'a'.repeat(64),label:'验证账号一'},{id:'b'.repeat(64),label:'验证账号二',needs_login:true}]});
 await ui('taLogin.action("risk",{accepted:true})');
 await ui('document.getElementById("open-login").click();document.getElementById("ta-saved-account").value="'+ 'a'.repeat(64) +'";document.getElementById("ta-saved-account").dispatchEvent(new Event("change"))');
 assert.equal(await ui('document.getElementById("ta-resume").disabled'),false);await ui('document.getElementById("ta-resume").click()');await sleep(40);assert.equal(loginActions.at(-1).action,'resume');assert.equal(loginActions.at(-1).params.account_id,'a'.repeat(64));await capture('remembered-accounts');
 await ui('document.getElementById("ta-forget").click()');await sleep(40);assert.equal(status.remembered_accounts.length,1);
 await ui('document.getElementById("ta-saved-account").value="'+ 'b'.repeat(64) +'";document.getElementById("ta-saved-account").dispatchEvent(new Event("change"))');assert.equal(await ui('document.getElementById("ta-resume").disabled'),true);assert.equal(await ui('document.getElementById("ta-forget").disabled'),false);
 publish({remembered_accounts:[]});await ui('document.getElementById("ta-enter").click()');
  await ui('selectView("decode")');assert.equal(await ui('document.getElementById("login-screen").hidden'),true);assert.equal(await ui('document.getElementById("save-code").disabled'),false);await ui('selectView("library")');
 assert.equal(await ui('document.querySelectorAll("#parse-failures tbody tr").length'),32);
 assert.equal(await ui('document.querySelectorAll("#parse-failures [data-edit-lineup]").length'),32);
 assert.ok((await ui('document.getElementById("parse-failures").textContent')).includes('暂时无法查询'));

 assert.equal(await ui('document.querySelectorAll("#parse-failures [data-delete-lineup]").length'),32);
 assert.equal(await ui('document.querySelector("#parse-failures [data-delete-expired]").closest("details")===null'),true);
 assert.equal(await ui('document.getElementById("retry-parse-failures").closest("details")===null'),true);
 assert.equal(await ui('document.querySelector("nav [data-view=manage] span").textContent'),'管');
 await ui('document.querySelector("#parse-failures [data-edit-lineup=qa-68]").click()');
 assert.equal(await ui('document.getElementById("edit-code").value'),code(68));
 assert.equal(await ui('view'),'library');await ui('document.getElementById("detail-dialog").close()');
 await ui('document.querySelector("#parse-failures [data-delete-lineup=qa-68]").click();document.getElementById("cancel-remove-lineups").click()');
 assert.equal(await ui('lineups().length'),155);

 await ui('document.querySelector("[data-failure-group=expired]").open=true');await capture('legacy-failure-categories');
 publish({authenticated:true,selected_avatar:'qa',stage:'roles_ready'});
 await until('queryProgress?.phase==="waiting"&&queryProgress.attempt===2',60000);
 assert.ok((await ui('document.querySelector("[data-parse-progress]").textContent')).includes('第 2 / 3 次'));
 await until('parseReport.phase==="complete"',60000);assert.equal(queries,156);const legacyQueries=queries;assert.equal(stored.lineups.filter(l=>l.members?.length).length,146);assert.equal(stored.lineups.filter(l=>l.lastParseError).length,9);
 assert.equal([...attempts.keys()].some(n=>n>=68&&n<77),false);
 assert.equal(await ui('lineups().filter(AtlasLibraryParser.canAttempt).length'),0);
 await ui('document.getElementById("export-parse-failures").click()');await sleep(50);assert.equal(exported.data.length,9);assert.ok(exported.data.every(r=>r.failure.serverCode===31279));
 await until('matchResults["qa-0"]?.proof?.state==="optimal"',60000);assert.ok((await ui('STATE.accounts[0].server'))!=='XX区10014');

 // Retry a cached row without leaving the library or changing the decode draft.
 await ui('clearTimeout(matchTimer);stopMatch();document.getElementById("code-input").value="保留的输入";[2,3,4].forEach(n=>Object.assign(STATE.lineups.find(l=>l.id==="qa-"+n),{lastParseError:"稍后再试",lastParseFailure:AtlasParseErrors.fromServer(90011)}));renderParseFailures();document.querySelector("[data-failure-group=recoverable]").open=true');
 retryFailure=true;const beforeRetry=queries;
 await ui('document.querySelector("#parse-failures [data-reparse=qa-2]").click()');
 await until('document.querySelector("#parse-failures [data-reparse=qa-2]")?.disabled===true');
 assert.equal(await ui('view'),'library');
 assert.equal(await ui('document.getElementById("code-input").value'),'保留的输入');
 await until('document.querySelector("#parse-failures [data-reparse=qa-2]")?.disabled===false');
 assert.equal(queries-beforeRetry,3);
 assert.equal(await ui('!!lineups().find(l=>l.id==="qa-2").lastParseFailure'),true);
 await capture('inline-retry-failure');
 retryFailure=false;await ui('document.querySelector("#parse-failures [data-reparse=qa-2]").click()');
 await until('!document.querySelector("#parse-failures [data-reparse=qa-2]")');
 assert.equal(await ui('view'),'library');
 assert.equal(await ui('document.getElementById("code-input").value'),'保留的输入');
 await ui('document.getElementById("retry-parse-failures").click()');
 await until('!document.getElementById("retry-parse-failures")&&parseReport.phase==="complete"');
 assert.equal(await ui('view'),'library');assert.equal(queries-beforeRetry,6);
 assert.equal(await ui('lineups().filter(AtlasParseErrors.isExpired).length'),9);
 await ui('selectView("manage");document.querySelector("#manage-list [data-reparse=qa-5]").click()');
 await until('!libraryParser.inflight.size');assert.equal(await ui('view'),'manage');
 await ui('selectView("library")');

 await ui('document.getElementById("parse-failures").scrollIntoView({block:"start"})');await capture('library-and-failures');await ui('showLineup(lineups()[0])');await until('document.querySelectorAll(".soul-slot").length===30');
 for(let slot=1;slot<=6;slot++){await ui('document.querySelector('+JSON.stringify('[data-soul-slot="'+slot+'"]')+').click()');assert.ok((await ui('document.querySelector(".soul-inspector h4").textContent')).includes(slot+'号位'));}
 await ui('Promise.all([...document.querySelectorAll("#detail-dialog img")].map(i=>{i.loading="eager";return i.decode().catch(()=>null)}))');assert.equal(await ui('[...document.querySelectorAll("#detail-dialog img")].every(i=>i.naturalWidth>0)'),true);assert.equal(await ui('document.querySelectorAll(".readable-member").length'),6);assert.equal(await ui('document.querySelector(".member-detail-grid").scrollWidth<=document.querySelector(".member-detail-grid").clientWidth+2'),true);assert.deepEqual(await ui("(function(){\n const failures=[],center=r=>({x:r.x+r.width/2,y:r.y+r.height/2}),check=(a,b,axis,label)=>{if(!a||!b)return;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();if(ar.width&&br.width&&Math.abs(center(ar)[axis]-center(br)[axis])>2)failures.push(label);};\n for(const [selector,first,last,axis] of [['.team-member','.avatar,.image-unavailable','span:not(.image-unavailable)','x'],['.readable-member>header','.avatar,.image-unavailable','div','y'],['.skill-item','.game-icon,.image-unavailable','span:not(.image-unavailable)','y'],['.suit-requirements>div','img','span','y'],['.mark-card summary','img','span','y'],['.owned-hero','.portrait','div:last-child','y']])document.querySelectorAll(selector).forEach(el=>check(el.querySelector(first),el.querySelector(last),axis,selector));\n return failures;\n})()"),[]);await capture('lineup-equipment');await ui('document.querySelector(".soul-ring").scrollIntoView({block:"center"})');await capture('six-slots');await fs.writeFile(path.join(profile,'image-layout.json'),JSON.stringify(await ui('[...document.querySelectorAll("#detail-dialog img")].map(i=>({src:i.src,width:i.naturalWidth,box:i.getBoundingClientRect().toJSON(),display:getComputedStyle(i).display,visibility:getComputedStyle(i).visibility}))'),null,2));
 win.setSize(900,850);await sleep(150);assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);await capture('lineup-equipment-small');win.setSize(1440,1000);
 await ui('document.querySelector(".qiling-section").scrollIntoView({block:"center"})');
 assert.equal(await ui('document.querySelectorAll(".mark-card").length'),4);
 assert.ok((await ui('document.querySelector(\'[data-mark-id="36"]\').textContent')).includes('2 枚'));
 await ui('document.querySelector(\'[data-mark-id="36"] summary\').click()');
 assert.equal(await ui('document.querySelector(\'[data-mark-id="36"]\').open'),true);
 assert.equal(await ui('document.querySelectorAll(\'[data-mark-id="36"] dt\').length'),3);
 await capture('qiling-mark-details');
  assert.ok((await ui('qilingMarkup({id:100,marks:[99999]})')).includes('此术印效果尚未收录'));
  assert.equal(await ui('document.querySelectorAll(".readable-member:last-child .inline-gap").length'),0);
  assert.equal(await ui('matchResults["qa-0"].members.find(m=>m.index===5).status'),'display-only');
  assert.equal(await ui('matchResults["qa-0"].checks.some(s=>/契灵|主角|阴阳师|术印/.test(s))'),false);
 await ui('document.getElementById("detail-dialog").close();selectView("manage")');assert.equal(await ui('document.querySelectorAll(".management-table tbody tr").length'),20);await capture('management');
 const before=await ui('JSON.stringify(lineups()[0].raw)');await ui('editLineup("qa-0");document.getElementById("edit-title").value="修改管理名称";document.getElementById("edit-notes").value="保存的备注";saveLineupManagement()');assert.equal(await ui('lineups()[0].title'),'修改管理名称');assert.equal(await ui('JSON.stringify(lineups()[0].raw)'),before);
 await ui('editLineup("qa-0");document.getElementById("edit-code").value='+JSON.stringify(code(500))+';saveLineupManagement()');assert.equal(await ui('lineups()[0].members.length'),0);assert.equal(await ui('lineups()[0].raw===undefined'),true);
 await ui('taLogin.logout()');assert.equal(await ui('document.getElementById("app-shell").hidden'),false);assert.equal(await ui('lineups().length'),155);assert.equal(await ui('!!DATA'),true);
  await ui('clearTimeout(matchTimer);stopMatch();STATE.activeAccount="";selectView("manage")');
  // Cancel and failed persistence must both leave a preset untouched.
  await ui('document.querySelector("[data-delete-lineup=qa-1]").click();document.getElementById("cancel-remove-lineups").click()');
  assert.equal(await ui('lineups().some(l=>l.id==="qa-1")'),true);
  await ui('document.querySelector("[data-delete-lineup=qa-1]").click()');failNextSave=true;
  await ui('removeConfirmedLineups()');
  assert.equal(await ui('lineups().some(l=>l.id==="qa-1")'),true);
  assert.equal(await ui('(STATE.deletedPresetIds||[]).includes("qa-1")'),false);
  assert.ok((await ui('document.getElementById("dialog-feedback").textContent')).includes('保存失败'));
  await capture('delete-confirmation');await ui('removeConfirmedLineups()');
  assert.equal(await ui('lineups().some(l=>l.id==="qa-1")'),false);
  // Keep a temporary failure while removing all nine proven expired codes.
  await ui('(async()=>{Object.assign(STATE.lineups.find(l=>l.id==="qa-2"),{lastParseError:"稍后再试",lastParseFailure:AtlasParseErrors.fromServer(90011)});await persist();renderManage();renderParseFailures()})()');
  assert.equal(await ui('document.querySelectorAll("[data-failure-group=expired] tbody tr").length'),9);
  await ui('document.getElementById("manage-status").value="expired";renderManage()');
  assert.equal(await ui('document.querySelectorAll(".management-table tbody tr").length'),9);
  await capture('expired-management');
  await ui('selectView("library");document.querySelector("#parse-failures [data-delete-expired]").click();removeConfirmedLineups()');
  assert.equal(await ui('lineups().filter(AtlasParseErrors.isExpired).length'),0);
  assert.equal(await ui('lineups().some(l=>l.id==="qa-2"&&l.lastParseFailure.serverCode===90011)'),true);
  assert.equal(stored.deletedPresetIds.length,10);assert.equal(await ui('lineups().length'),145);assert.equal(await ui('document.getElementById("nav-count").textContent'),'145');
  // Restore the actual disk JSON and boot the page again, including changed presets.
  stored=JSON.parse(await fs.readFile(path.join(profile,'library-v1.json'),'utf8'));data.lineups[1].title='更新后的预设';
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await until('!!DATA && document.getElementById("loading").hidden');await ui('TALogin.ready()');
  assert.equal(await ui('lineups().length'),145);
  await ui('document.getElementById("export-backup").click()');await sleep(30);const backup=JSON.stringify(exported.data);
  assert.equal(exported.data.deletedPresetIds.length,10);
  await ui('STATE.deletedPresetIds=[];persist()');assert.equal(await ui('lineups().length'),155);
  await ui('importMode="backup";handleFiles([{name:"synthetic-backup.json",size:'+backup.length+',text:async()=>'+JSON.stringify(backup)+'}])');
  assert.equal(await ui('lineups().length'),145);
  // A deleted preset can be explicitly re-added once, without signing in.
  await ui('clearTimeout(matchTimer);stopMatch();STATE.activeAccount="";selectView("manage");document.querySelector("[data-add-code]").click();document.getElementById("code-input").value='+JSON.stringify(code(1))+';updateCode();document.getElementById("code-title").value="重新添加的原码";saveCode()');
  assert.equal(await ui('document.getElementById("login-screen").hidden'),true);
  assert.equal(await ui('lineups().filter(l=>l.code==='+JSON.stringify(code(1))+').length'),1);
  assert.equal(await ui('lineups().length'),146);
  await ui('selectView("manage");document.querySelector("[data-add-bulk]").click();document.getElementById("bulk-input").value='+JSON.stringify([code(9001),code(9002),code(1)].join('\n'))+';document.getElementById("bulk-auto-parse").checked=false;renderBulkPreview();applyBulkImport()');
  assert.equal(await ui('lineups().length'),148);assert.equal(await ui('document.getElementById("nav-count").textContent'),'148');
  await ui('document.getElementById("bulk-dialog").close();confirmLineupRemoval([lineups().find(l=>l.code==='+JSON.stringify(code(9001))+').id]);removeConfirmedLineups()');
  assert.equal(await ui('lineups().length'),147);assert.equal(stored.deletedPresetIds.length,10);
  // Delete while a real queue job is waiting; its late success cannot resurrect it.
  data.lineups=[{id:'pending-delete',code:code(8000),title:'正在查询的预设',members:[],decodeState:'unattempted'}];
  await ui('clearTimeout(matchTimer);stopMatch();STATE.lineups=[];STATE.deletedPresetIds=[];STATE.activeAccount="";persist()');
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await until('!!DATA && document.getElementById("loading").hidden');await ui('TALogin.ready()');
  publish({authenticated:true,selected_avatar:'qa',stage:'roles_ready'});await until('parseReport.phase==="running"');
  for(let i=0;i<100&&!finishDeferred;i++)await sleep(30);assert.equal(typeof finishDeferred,'function');
  await ui('selectView("manage");document.querySelector("[data-delete-lineup=pending-delete]").click();removeConfirmedLineups()');
  finishDeferred();await sleep(150);
  assert.equal(await ui('lineups().length'),0);assert.equal(stored.lineups.length,0);assert.ok(stored.deletedPresetIds.includes('pending-delete'));
  // A previously unsaved code rejected as expired also appears in the cleanup list.
  await ui('selectView("decode");document.getElementById("code-input").value='+JSON.stringify(code(9000))+';updateCode();document.getElementById("code-title").value="新查询即失效";localDecode(true)');
  assert.equal(await ui('lineups().filter(AtlasParseErrors.isExpired).length'),1);
  assert.equal(stored.lineups[0].code,code(9000));assert.equal(await ui('document.getElementById("nav-count").textContent'),'1');
  await ui('selectView("manage");document.getElementById("manage-clear-expired").click();removeConfirmedLineups()');
  assert.equal(await ui('lineups().length'),0);await ui('taLogin.logout()');
  data.lineups=presetLineups;
  await ui("(async()=>{clearTimeout(matchTimer);stopMatch();DATA=await atlas.loadData();STATE.lineups=[];STATE.deletedPresetIds=[];STATE.activeAccount=STATE.accounts[0].id;matchResults={};selectView(\"library\");document.getElementById(\"clear-filters\").click()})()");
 assert.equal(await ui("document.getElementById(\"lineup-grid\").hidden"),false);

 assert.ok(await ui('document.querySelectorAll(".lineup-card").length>0'));
 assert.equal(await ui('[...document.querySelectorAll(".category-preview")].every(g=>g.querySelectorAll(".lineup-card").length>0&&g.querySelectorAll(".lineup-card").length<=3)'),true);
 assert.equal(await ui('[...document.querySelectorAll(".lineup-card")].every(c=>c.closest(".category-preview")&&c.querySelector("[data-edit-lineup]")&&c.querySelector("[data-delete-lineup]"))'),true);

 assert.equal(await ui("!!document.querySelector('[data-browse-category=\"契灵\"]')"),true);
 assert.equal(await ui("!!document.querySelector('[data-browse-category=\"狭间蛇魔\"]')"),false);
 assert.equal(await ui('document.querySelector("[data-browse-category]").getBoundingClientRect().bottom<innerHeight'),true);
  assert.equal(await ui('document.querySelector("[data-parse-progress]").textContent.includes("undefined")'),false);
  await ui('window.scrollTo(0,0)');await capture('category-home');await ui('document.getElementById("lineup-grid").scrollIntoView({block:"start"})');await capture('category-home-previews');
 await ui("document.querySelector('[data-browse-category=\"契灵\"]').click()");
 assert.equal(await ui("document.getElementById(\"lineup-grid\").hidden"),false);
 await ui("document.querySelector('[data-browse-sub=\"薙魂\"]').click()");
 assert.equal(await ui("document.getElementById(\"lineup-grid\").hidden"),false);
 assert.equal(await ui("filteredLineups().some(l=>l.code===\"|TA|cf7b889739f9167a4db2597df0ca743c\")"),true);
  await capture('category-lineups');

  await ui('document.getElementById("clear-filters").click();document.querySelector("[data-browse-category=日常]").click();document.querySelector("[data-browse-sub=逢魔]").click()');
  assert.deepEqual(await ui('[...document.querySelectorAll(".category-tile strong")].map(e=>e.textContent).sort()'),['彼世逢魔','普通逢魔','极逢魔'].sort());
  await ui('document.querySelector("[data-browse-path=\\"日常 → 逢魔 → 普通逢魔\\"]").click()');
  assert.equal(await ui('filteredLineups().every(l=>l.classificationPaths.some(p=>p.category==="日常"&&p.subcategory==="逢魔"&&p.section==="普通逢魔"))'),true);
  await capture('fengmo-hierarchy');
  const stageSearch=async query=>ui('document.getElementById("clear-filters").click();document.getElementById("dungeon").focus();document.getElementById("dungeon").value='+JSON.stringify(query)+';document.getElementById("dungeon").dispatchEvent(new Event("input"))');
  for(const [query,leaf] of [['魂土','悲鸣'],['魂王','神罚'],['鬼灵歌姬','鬼灵歌伎'],['火麒麟 10层','火麒麟·拾层']]){
   await stageSearch(query);assert.ok(await ui('filteredLineups().length>0'));
   assert.equal(await ui('[...document.querySelectorAll("#dungeon-options [role=option]")].every(e=>e.textContent.includes('+JSON.stringify(leaf)+'))'),true);
  }
  await stageSearch('鬼灵歌姬');await capture('stage-search-options');
  await ui('document.getElementById("dungeon").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));document.getElementById("dungeon").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
  assert.equal(await ui('document.getElementById("dungeon").value'),'日常 → 逢魔 → 普通逢魔 → 鬼灵歌伎');
  assert.equal(await ui('document.getElementById("dungeon-options").hidden'),true);
  assert.equal(await ui('document.querySelectorAll(".category-preview").length'),0);
  assert.equal(await ui('document.querySelector(".category-breadcrumb").textContent.includes("普通逢魔")'),true);
  await capture('stage-search-selected');
  await ui('document.getElementById("dungeon").focus();document.getElementById("dungeon").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert.equal(await ui('document.getElementById("dungeon-options").hidden'),true);
  await stageSearch('真蛇');assert.ok(await ui('filteredLineups().length>0'));
  assert.equal(await ui('new Set(filteredLineups().map(l=>l.id)).size===filteredLineups().length'),true);
  assert.equal(await ui('filteredLineups().every(l=>AtlasCategories.matches(l,"御魂","真·八岐大蛇")&&AtlasCategories.matches(l,"周常","真·八岐大蛇"))'),true);
  await stageSearch('完全不存在的关卡');assert.equal(await ui('filteredLineups().length'),0);assert.ok((await ui('document.getElementById("dungeon-options").textContent')).includes('没有匹配副本'));
  await ui('document.getElementById("clear-filters").click();browseTo("限时活动 → 拾光永恒")');assert.ok(await ui('filteredLineups().filter(l=>/来源用途/.test(l.classificationSource)).length===7'));

  await ui('clearTimeout(matchTimer);stopMatch();matchResults={};document.getElementById("clear-filters").click();document.getElementById("search").value="|TA|";window.testGapIds=lineups().filter(l=>C.hasParsedContent(l)&&l.code.startsWith("|TA|")).slice(0,8).map(l=>l.id);window.testGapIds.forEach((id,i)=>matchResults[id]={gapCategory:i?"both":"ready",gapAssessment:{heroes:i&5?"missing":"ready",souls:i&2?"missing":"ready",heroShortage:i&1?1:0,heroTraining:i&4?1:0},members:[],label:"合成缺口验证",proof:{state:"infeasible",nodes:0,pruned:0,scope:"合成验证"},reasons:[],checks:[]});renderLibrary()');
  for(const [kind,mask] of [['hero',1],['soul',2],['training',4]]){
   await ui('document.getElementById("gap-filter").value='+JSON.stringify(kind)+';renderLibrary()');
   assert.equal(await ui('filteredLineups().length'),4);
   assert.deepEqual(await ui('filteredLineups().map(l=>testGapIds.indexOf(l.id)).sort()'),[0,1,2,3,4,5,6,7].filter(i=>i&mask));
   assert.equal(await ui('document.querySelectorAll(".lineup-card").length'),4);
  }
  await ui('document.getElementById("gap-filter").value="";renderLibrary()');
  assert.equal(await ui('document.querySelectorAll(".lineup-card .gap-badges").length'),7);
  for(let i=0;i<8;i++)assert.equal(await ui('document.querySelector("[data-detail="+testGapIds['+i+']+"]").closest(".lineup-card").querySelectorAll(".gap-tag").length'),[1,2,4].filter(bit=>i&bit).length);
  assert.deepEqual(await ui('gapKinds({gapCategory:"unknown",gapAssessment:{heroes:"unknown",souls:"unknown",heroShortage:null,heroTraining:null}})'),[]);
  const tagColors=await ui('["hero","soul","training"].map(k=>{const s=getComputedStyle(document.querySelector(".gap-"+k));return {kind:k,foreground:s.color,background:s.backgroundColor}})');
  const luminance=s=>(s.match(/\d+/g)||[]).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
  for(const t of tagColors){const a=luminance(t.foreground),b=luminance(t.background);t.contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
  assert.equal(new Set(tagColors.map(x=>x.background)).size,3);assert.ok(tagColors.every(x=>x.contrast>=4.5));
  await ui('window.scrollTo(0,0)');await capture('three-gap-tags');
  await ui('showLineup(lineups().find(l=>l.id===testGapIds[7]))');
  assert.equal(await ui('document.querySelectorAll(".detail-status .gap-tag").length'),3);
  assert.equal(await ui('document.querySelector(".proof-summary").open'),false);
  await ui('document.querySelector(".proof-summary summary").click()');
  assert.equal(await ui('document.querySelector(".proof-summary").open'),true);
  await ui('document.getElementById("detail-dialog").close()');

 await ui("document.getElementById(\"active-account\").value=\"\";document.getElementById(\"active-account\").dispatchEvent(new Event(\"change\"))");
 await until('document.getElementById("gap-filter").disabled');
 assert.equal(await ui("filteredLineups().length"),presetLineups.length);
 await ui("document.getElementById(\"clear-filters\").click()");
 win.setSize(900,850);await sleep(100);
 assert.equal(await ui("document.documentElement.scrollWidth<=innerWidth+2"),true);
 await capture('category-home-small');await ui('document.getElementById("lineup-grid").scrollIntoView({block:"start"})');await capture('category-previews-small');

  const uiLayouts=[];
  for(const width of [900,1280,1920,720]){
   win.setContentSize(width,900);await sleep(80);
   for(const page of ['library','manage','accounts','decode','audit']){
    await ui('selectView('+JSON.stringify(page)+');clearTimeout(matchTimer);stopMatch()');
    if(page==='manage')await ui('document.getElementById("manage-status").value="";renderManage()');
    const dimensions=await ui('({width:innerWidth,scroll:document.documentElement.scrollWidth})'),alignment=await ui("(function(){\n const failures=[],center=r=>({x:r.x+r.width/2,y:r.y+r.height/2}),check=(a,b,axis,label)=>{if(!a||!b)return;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();if(ar.width&&br.width&&Math.abs(center(ar)[axis]-center(br)[axis])>2)failures.push(label);};\n for(const [selector,first,last,axis] of [['.team-member','.avatar,.image-unavailable','span:not(.image-unavailable)','x'],['.readable-member>header','.avatar,.image-unavailable','div','y'],['.skill-item','.game-icon,.image-unavailable','span:not(.image-unavailable)','y'],['.suit-requirements>div','img','span','y'],['.mark-card summary','img','span','y'],['.owned-hero','.portrait','div:last-child','y']])document.querySelectorAll(selector).forEach(el=>check(el.querySelector(first),el.querySelector(last),axis,selector));\n return failures;\n})()");
    assert.ok(dimensions.scroll<=dimensions.width+2,page+' overflow at '+width);
    assert.deepEqual(alignment,[],page+' alignment at '+width);
    uiLayouts.push({page,...dimensions,alignment});
    if(width===1280||width===720)await capture(page+'-'+width);
   }
  }
  win.setContentSize(1280,950);win.webContents.setZoomFactor(1.25);await sleep(100);
  await ui('selectView("library");document.querySelector(".extra-filters").open=true');
  assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);await capture('library-zoom-125');
  await ui('document.querySelector(".extra-filters").open=false;document.getElementById("add-bulk").click()');
  assert.equal(await ui('document.getElementById("bulk-dialog").scrollWidth<=document.getElementById("bulk-dialog").clientWidth+2'),true);
  await capture('bulk-zoom-125');await ui('document.getElementById("bulk-dialog").close()');win.webContents.setZoomFactor(1);
  await ui('STATE.activeAccount=STATE.accounts[0].id;selectView("accounts");clearTimeout(matchTimer);stopMatch()');
  assert.ok(await ui('document.querySelectorAll(".owned-hero").length>0'));assert.deepEqual(await ui("(function(){\n const failures=[],center=r=>({x:r.x+r.width/2,y:r.y+r.height/2}),check=(a,b,axis,label)=>{if(!a||!b)return;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();if(ar.width&&br.width&&Math.abs(center(ar)[axis]-center(br)[axis])>2)failures.push(label);};\n for(const [selector,first,last,axis] of [['.team-member','.avatar,.image-unavailable','span:not(.image-unavailable)','x'],['.readable-member>header','.avatar,.image-unavailable','div','y'],['.skill-item','.game-icon,.image-unavailable','span:not(.image-unavailable)','y'],['.suit-requirements>div','img','span','y'],['.mark-card summary','img','span','y'],['.owned-hero','.portrait','div:last-child','y']])document.querySelectorAll(selector).forEach(el=>check(el.querySelector(first),el.querySelector(last),axis,selector));\n return failures;\n})()"),[]);await capture('inventory-alignment');
  await ui('document.getElementById("open-login").click();document.getElementById("ta-server-settings").open=true');
  assert.equal(await ui('document.documentElement.scrollWidth<=innerWidth+2'),true);
  assert.equal(await ui('[...document.querySelectorAll(".login-card label:not(.ta-check)")].every(l=>{const f=l.querySelector("input,select");return !f||f.getBoundingClientRect().width<=l.getBoundingClientRect().width+1})'),true);
  await capture('login-fields');await ui('document.getElementById("ta-enter").click();selectView("library")');

 const report={fineStageSearch:true,stageKeyboardSelection:true,classificationHierarchy:true,dualCategoryNoDuplicateCount:true,eventStageCorrections:true,actorSpiritMarksDisplayOnly:true,uiLayouts,tagColors,independentGapCombinations:true,imageTextAlignment:true,responsiveViews:true,zoom125:true,method:'Real Electron renderer/preload/worker, production TA queue and codec; synthetic login/server responses and legacy 32 failures in 155 entries; accelerated retry delays; no actual phone login',queries,legacyBatchQueries:legacyQueries,expiredCleanup:true,librarySummaryCleanup:true,summaryRowEditAndDelete:true,inlineRetryFailureAndSuccess:true,bulkRetryCachedFailures:true,managementInlineRetry:true,sidebarManagementIcon:true,categoryHomePreviews:true,deleteConfirmation:true,deleteFailureRollback:true,presetDeletionSurvivesRestartAndUpdate:true,deletionBackupRoundTrip:true,offlineAddAndReadd:true,offlineBulkAdd:true,deleteCustomLineup:true,inflightDeletionNoResurrection:true,newExpiredCodeRecorded:true,success:146,failures:9,skippedExpired:9,objectIdRecovered:13,temporaryRecovered:10,legacyErrorCategories:true,retryProgress:true,structuredFailureExport:true,rememberedAccountControls:true,categoryLanding:true,multipleUses:true,accountGapFilters:true,clearedAccountIgnoresGapFilter:true,offline:true,slots:30,members:6,immutableDecodedConfig:true,codeEditClearsOldPayload:true,images:true,markCards:4,markLevels:3,duplicateMarkCount:true,unknownMarkPreserved:true,errors};await fs.writeFile(path.join(root,'verification','revision-ui-v'+version+'.json'),JSON.stringify(report,null,2));assert.deepEqual(errors,[]);app.exit(0);
}
main().catch(async error=>{console.error(error);if(win)await capture('failure').catch(()=>{});await fs.writeFile(path.join(profile,'error.txt'),String(error.stack)+'\n'+errors.join('\n')).catch(()=>{});app.exit(1);});
