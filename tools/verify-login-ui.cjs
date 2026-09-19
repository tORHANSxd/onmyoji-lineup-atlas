// Production HTML and preload in an isolated Electron profile. Authentication
// and server responses are synthetic; no real accounts or credentials are read.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version.replaceAll('.','');
const profile=path.join(root,'user-data','login-risk-v'+version),screens=path.join(root,'verification/screenshots','login-risk-v'+version);
app.setPath('userData',profile);
let win,failRisk=false;
const errors=[],actions=[],layouts=[];
const qr='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6gAAAABJRU5ErkJggg==';
const id='a'.repeat(64),server={id:'10014',name:'验证服务器',category:'网易双平台',available:true,roles:[{avatar_id:'synthetic-role',name:'验证小号'}],roles_known:true};
let state={authenticated:false,risk_accepted:false,stage:'idle',message:'',error:'',busy:false,servers:[],selected_server:'',selected_avatar:'',qr_image:'',remembered_accounts:[{id,label:'验证小号'}]};
const publish=patch=>{state={...state,...patch};win.webContents.send('ta-status-changed',state);};
const ui=code=>win.webContents.executeJavaScript(code);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(code){for(let i=0;i<400;i++){if(await ui(code))return;await sleep(25);}throw Error('UI timeout: '+code);}
async function capture(name){win.webContents.invalidate();await sleep(150);await win.webContents.capturePage();await sleep(80);await fs.writeFile(path.join(screens,name+'.png'),(await win.webContents.capturePage()).toPNG());}
async function main(){
 await app.whenReady();await fs.mkdir(screens,{recursive:true});await fs.mkdir(profile,{recursive:true});
 const data=JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8'));data.officialUpdate={autoUpdate:false};
 let stored={schemaVersion:1,accounts:[],lineups:[],deletedPresetIds:[],activeAccount:''};
 const local=(name,fn)=>ipcMain.handle(name,(_e,...args)=>fn(...args));
 local('load-data',()=>data);local('load-state',()=>stored);local('save-state',s=>{stored=s;return {saved:true}});
 local('save-parsed-state',()=>{throw Error('无网络解析')});local('ta-query',()=>{throw Error('无网络查询')});
 local('copy-code',()=>({copied:true}));local('import-files',()=>[]);local('export-json',()=>true);
 for(const name of ['official-status','official-auto','official-refresh','official-cancel'])local(name,()=>({autoUpdate:false}));
 local('ta-status',()=>state);
 local('ta-action',(action,params)=>{
  if(action==='risk'){
   if(failRisk)throw Error('simulated risk acknowledgement failure');
   actions.push(action);publish({risk_accepted:params.accepted,...(!params.accepted?{authenticated:false,qr_image:'',selected_avatar:''}:{})});return state;
  }
  if(action!=='forget'&&!state.risk_accepted)throw Error('请先阅读免责声明');
  actions.push(action);
  if(action==='init')publish({servers:[server],selected_server:'10014',stage:'ready'});
  if(action==='qr')publish({authenticated:false,stage:'qr_waiting',qr_image:qr});
  if(action==='resume')publish({authenticated:true,stage:'roles_ready',qr_image:'',servers:[server],selected_server:'10014',selected_avatar:'synthetic-role'});
  if(action==='forget')publish({remembered_accounts:[]});
  return state;
 });
 local('ta-logout',()=>{publish({risk_accepted:false,authenticated:false,stage:'idle',qr_image:'',selected_avatar:''});return state;});
 win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 win.setContentSize(1440,1000);win.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message)});
 await win.loadFile(path.join(root,'app/index.html'));await until('!!DATA&&document.getElementById("loading").hidden');await ui('TALogin.ready();startLibraryParse=()=>{};void 0');
 assert.equal(actions.length,0);assert.equal(await ui('document.getElementById("login-screen").hidden'),true);
 await ui('document.getElementById("open-login").click();document.getElementById("ta-saved-account").value="'+id+'";document.getElementById("ta-saved-account").dispatchEvent(new Event("change"));');
 assert.equal(await ui('document.getElementById("ta-risk-accept").checked'),false);
 assert.equal(await ui('document.getElementById("ta-qr").disabled&&document.getElementById("ta-resume").disabled&&document.getElementById("ta-load").disabled'),true);
 await ui('document.getElementById("ta-qr").click();document.getElementById("ta-resume").click();TALogin.ensure()');
 assert.equal(actions.length,0);assert.equal(await ui('document.getElementById("ta-qr-image").hasAttribute("src")'),false);
 await capture('before-confirmation');
 const text=await ui('document.querySelector(".login-risk").textContent');
 for(const required of ['禁止使用主号','仅用于查询、解析阵容码','本机加密存储','网易官方服务','封号','法律允许'])assert.ok(text.includes(required),required);
 // A failed acknowledgement must never leave an apparently accepted checkbox.
 failRisk=true;await ui('document.getElementById("ta-risk-accept").click()');await until('document.getElementById("ta-error").textContent.includes("simulated")');
 assert.equal(await ui('document.getElementById("ta-risk-accept").checked'),false);assert.equal(await ui('document.getElementById("ta-qr").disabled'),true);failRisk=false;
 await ui('document.getElementById("ta-risk-accept").click()');await until('!document.getElementById("ta-qr").disabled');
 assert.equal(await ui('document.getElementById("ta-resume").disabled'),false);
 await ui('document.getElementById("ta-qr").click()');await until('!document.getElementById("ta-qr-image").hidden');
 assert.deepEqual(actions.slice(-3),['risk','init','qr']);
 await ui('document.getElementById("ta-risk-accept").click()');await until('document.getElementById("ta-qr").disabled');
 assert.equal(state.qr_image,'');assert.equal(await ui('document.getElementById("ta-qr-image").hasAttribute("src")'),false);
 await ui('document.getElementById("ta-risk-accept").click()');await until('!document.getElementById("ta-resume").disabled');
 await ui('document.getElementById("ta-resume").click()');await until('TALogin.status().authenticated');
 assert.equal(actions.at(-1),'resume');await capture('remembered-account-confirmed');
 await ui('document.getElementById("ta-logout").click()');await until('!TALogin.status().risk_accepted');
 assert.equal(await ui('document.getElementById("ta-risk-accept").checked'),false);
 assert.equal(await ui('document.getElementById("ta-qr").disabled&&document.getElementById("ta-resume").disabled'),true);
 for(const [width,height,zoom] of [[1440,1000,1],[900,750,1],[720,960,1],[1280,900,1.25]]){
  win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);await sleep(100);await ui('window.scrollTo(0,0)');
  const layout=await ui('(function(){const risk=document.querySelector(".login-risk"),title=document.getElementById("login-risk-title"),qr=document.querySelector(".ta-qr-frame");return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,riskWidth:risk.clientWidth,riskScroll:risk.scrollWidth,titleTop:title.getBoundingClientRect().top,titleBottom:title.getBoundingClientRect().bottom,warningBottom:risk.getBoundingClientRect().bottom,qrTop:qr.getBoundingClientRect().top,titleSize:parseFloat(getComputedStyle(title).fontSize)}})()');
  assert.ok(layout.scroll<=layout.width+2);assert.ok(layout.riskScroll<=layout.riskWidth+2);
  assert.ok(layout.titleTop>=0&&layout.titleBottom<layout.height);assert.ok(layout.warningBottom<layout.qrTop);assert.ok(layout.titleSize>=23);
  layouts.push({window:[width,height],zoom,...layout});await capture('warning-'+width+'-'+zoom);
 }
 await ui('document.getElementById("ta-risk-back").click()');assert.equal(await ui('document.getElementById("login-screen").hidden'),true);assert.equal(await ui('document.getElementById("app-shell").inert'),false);
 await ui('document.getElementById("open-login").click();document.getElementById("ta-forget").click()');await until('TALogin.status().remembered_accounts.length===0');
 assert.equal(await ui('document.getElementById("ta-qr").disabled'),true);assert.ok(await ui('lineups().length>0'));
 assert.deepEqual(errors,[]);
 const report={method:'Real Electron renderer and preload; isolated synthetic account and QR response; production IPC gate tested separately in tests/desktop.test.cjs',startupOffline:true,noLoginRequestBeforeAcknowledgement:true,visibleRiskAndAccountWarning:true,explicitUncheckedAcknowledgement:true,qrAndSavedAccountBlocked:true,acknowledgementFailureKeepsGateClosed:true,confirmedQrAndSavedAccountLogin:true,revocationHidesQr:true,logoutRequiresNewAcknowledgement:true,forgetWithoutAcknowledgement:true,canReturnOffline:true,layouts,errors};
 await fs.writeFile(path.join(root,'verification','login-ui-v'+version+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,layouts:layouts.length}));app.exit(0);
}
main().catch(async e=>{console.error(e);await fs.writeFile(path.join(profile,'error.txt'),String(e.stack)).catch(()=>{});if(win)await capture('failure').catch(()=>{});app.exit(1)});
