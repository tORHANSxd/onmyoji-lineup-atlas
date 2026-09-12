// Real Electron renderer + production HTML/preload, with synthetic authentication.
// This test runner is excluded from release packages; the app has no login bypass.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const profile=path.join(root,'user-data','login-ui-v041');
app.setPath('userData',profile);
let win,authenticated=false,epoch=0,reads=0,writes=0,autoUpdate=true;
const errors=[],copies=[],actions=[];
const qr='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6gAAAABJRU5ErkJggg==';
const server={id:'10014',name:'测试服务器',category:'网易双平台',available:true,roles:[],roles_known:false};
let state={authenticated:false,stage:'idle',message:'准备扫码',error:'',busy:false,servers:[],selected_server:'10014',selected_avatar:'',qr_image:''};
function publish(patch){state={...state,...patch};if(authenticated!==state.authenticated){authenticated=state.authenticated;epoch++;}win.webContents.send('ta-status-changed',state);}
const readUI=code=>win.webContents.executeJavaScript(code);
async function until(expression){for(let i=0;i<200;i++){if(await readUI(expression))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('UI did not reach expected state: '+expression);}
async function main(){
 await app.whenReady();
 const data=JSON.parse(await fs.readFile(path.join(root,'data/bundle.json'),'utf8'));
 const fixture=JSON.parse(await fs.readFile(path.join(root,'verification/fixtures/mixed-backup-v030.json'),'utf8'));
 const stored={schemaVersion:1,accounts:fixture.accounts,activeAccount:fixture.accounts[0].id,lineups:fixture.lineups.filter(row=>row.code?.trim())};
 const code=await fs.readFile(path.join(root,'verification/fixtures/ta-example.txt'),'utf8');
 const {decodeInput}=require('../desktop/ta-codec.cjs');
 const handle=(name,fn)=>ipcMain.handle(name,async(_event,...args)=>{if(!authenticated)throw new Error('请先扫码登录后使用软件');const start=epoch,result=await fn(...args);if(!authenticated||start!==epoch)throw new Error('请先扫码登录后使用软件');return result;});
 ipcMain.handle('ta-status',()=>state);
 ipcMain.handle('ta-action',(_event,action,params)=>{actions.push(action);if(action==='init')publish({servers:[server],stage:'ready'});if(action==='qr')publish({authenticated:false,stage:'qr_waiting',qr_image:qr});if(action==='select')publish({selected_server:params.server_id,selected_avatar:params.avatar_id});return state;});
 ipcMain.handle('ta-logout',()=>{publish({authenticated:false,busy:false,stage:'idle',qr_image:'',selected_avatar:'',servers:[server]});return state;});
 handle('load-data',()=>{reads++;return data;});handle('load-state',()=>{reads++;return stored;});
 handle('save-state',value=>{writes++;Object.assign(stored,value);return {saved:true};});handle('decode',decodeInput);
 handle('copy-code',value=>{copies.push(value);return {copied:true};});
 handle('official-status',()=>({autoUpdate}));handle('official-auto',value=>({autoUpdate:(autoUpdate=!!value)}));
 for(const name of ['import-files','export-json','official-refresh','official-cancel','ta-query'])handle(name,()=>null);
 win=new BrowserWindow({width:1440,height:940,show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
 await win.loadFile(path.join(root,'app/index.html'));
 await readUI('TALogin.ready()');
 assert.deepEqual(actions.slice(0,2),['init','qr']);assert.equal(reads,0);
 assert.deepEqual(await readUI('({locked:!document.getElementById("login-screen").hidden,hidden:document.getElementById("app-shell").hidden,inert:document.getElementById("app-shell").inert,loaded:!!DATA})'),{locked:true,hidden:true,inert:true,loaded:false});
 publish({stage:'qr_scanned',message:'已扫码，等待手机确认'});await new Promise(resolve=>setTimeout(resolve,60));assert.equal(reads,0);
 publish({stage:'role_loading',authenticated:true,busy:true,qr_image:''});await new Promise(resolve=>setTimeout(resolve,60));assert.equal(reads,0);
 const role={avatar_id:'synthetic-alt-role',name:'测试小号',server_id:'10014',level:1};
 const signedIn=()=>publish({authenticated:true,busy:false,stage:'roles_ready',selected_avatar:role.avatar_id,servers:[{...server,roles:[role],roles_known:true}],qr_image:''});
 signedIn();await until('!!DATA && document.getElementById("loading").hidden');assert.equal(reads,2);
 const result=await readUI('runSmoke('+JSON.stringify({code,login:true})+')');assert.equal(result.error,undefined);assert.equal(result.accounts,1);assert.equal(result.lineups,156);assert.equal(result.detail.members,6);assert.equal(result.detail.oneRow,true);assert.equal(copies[0],code.trim());
 await readUI('document.getElementById("open-login").click()');assert.equal(await readUI('document.getElementById("login-screen").hidden'),false);await readUI('document.getElementById("ta-enter").click()');assert.equal(await readUI('document.getElementById("app-shell").hidden'),false);
 await readUI('showLineup(lineups()[0])');assert.equal(await readUI('document.getElementById("detail-dialog").open'),true);
 await readUI('importMode="payload";window.oldTAImport=importTAFiles([{name:"delayed-ta.txt",size:1,text:()=>new Promise(resolve=>window.finishOldTA=resolve)}]);importMode="backup";window.oldBackupImport=handleFiles([{name:"delayed-backup.json",size:1,text:()=>new Promise(resolve=>window.finishOldBackup=resolve)}]);void 0');
 await readUI('taLogin.logout()');await until('!DATA');
 assert.deepEqual(await readUI('({hidden:document.getElementById("app-shell").hidden,inert:document.getElementById("app-shell").inert,dialog:document.getElementById("detail-dialog").open,accounts:STATE.accounts.length,cards:document.querySelectorAll(".lineup-card").length})'),{hidden:true,inert:true,dialog:false,accounts:0,cards:0});
 signedIn();await until('!!DATA && document.getElementById("loading").hidden');assert.equal(reads,4);
 const backup=JSON.stringify({...stored,format:'onmyoji-atlas-backup'});
 await readUI('window.finishOldTA('+JSON.stringify(code)+');window.finishOldBackup('+JSON.stringify(backup)+');Promise.all([window.oldTAImport,window.oldBackupImport])');assert.equal(writes,0,'Imports from the previous session must not save after relogin');
 publish({authenticated:false,stage:'error',error:'测试认证失效'});await until('!DATA');assert.equal(await readUI('document.getElementById("app-shell").hidden'),true);
 assert.deepEqual(errors,[]);
 const report={method:'Synthetic authentication with real Electron renderer, production HTML and preload; no phone login',startupAutomaticallyRequestsQR:true,noBusinessReadsBeforeConfirmation:true,loginUnlocksSoftware:true,importedAccountMayDifferFromLogin:true,accountManagementReturnsToSoftware:true,logoutClosesDialogsAndClearsView:true,reloginReloadsStoredData:true,oldSessionImportsCannotSaveAfterRelogin:true,authenticationFailureLocksSoftware:true,rendererErrors:errors,authenticatedSmoke:result};
 await fs.writeFile(path.join(root,'verification/login-ui-v041.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks:9,lineups:result.lineups,members:result.detail.members}));
 win.destroy();app.exit(0);
}
main().catch(error=>{console.error(error);win?.destroy();app.exit(1);});
