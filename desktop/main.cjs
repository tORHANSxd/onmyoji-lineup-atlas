const { app, BrowserWindow, ipcMain, dialog, shell, session, protocol, net, nativeImage, clipboard, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { decodeInput } = require('./ta-codec.cjs');
const { OfficialData, validFile } = require('./official-data.cjs');
const { TASession } = require('./ta-session.cjs');
const { TAQueryQueue } = require('./ta-query-queue.cjs');
const { TACredentials } = require('./ta-credentials.cjs');
const { TAResponseCache } = require('./ta-response-cache.cjs');
let win, official, taSession, queryQueue, loginEpoch=0, loggedIn=false, selectedRole='', loginRiskAccepted=false;
const isSmoke = process.argv.includes('--smoke');
// Branding changes must never create a different personal inventory directory.
if (!isSmoke) app.setPath('userData',path.join(app.getPath('appData'),'onmyoji-lineup-atlas'));
if (isSmoke) app.setPath('userData', process.env.ATLAS_SMOKE_USER_DATA || path.join(app.getPath('temp'), 'onmyoji-atlas-smoke'));
protocol.registerSchemesAsPrivileged([{scheme:'atlas-asset',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const statePath = () => path.join(app.getPath('userData'), 'library-v1.json');
const pageURL = pathToFileURL(path.join(__dirname, '../app/index.html')).href;
function isAppURL(value){try{const url=new URL(value);url.hash='';return url.href===pageURL;}catch{return false;}}
function trusted(event) { if (!isAppURL(event.senderFrame?.url)) throw new Error('不受信任的调用来源'); }
function requireRiskAcceptance(){if(!loginRiskAccepted)throw new Error('请先阅读免责声明，并确认使用可弃用的小号及承担账号风险');}
function loginStatus(){return {...taSession.status(),risk_accepted:loginRiskAccepted};}
function requireLogin(event, epoch=loginEpoch) { trusted(event); if(epoch!==loginEpoch||taSession?.status().authenticated!==true)throw new Error('请先扫码登录后使用软件'); requireRiskAcceptance(); }
function handleSignedIn(name, handler) {
  ipcMain.handle(name, async(event,...args)=>{const epoch=loginEpoch;const check=()=>requireLogin(event,epoch);check();const result=await handler(check,...args);check();return result;});
}
function handleLocal(name,handler){ipcMain.handle(name,async(event,...args)=>{const check=()=>trusted(event);check();const result=await handler(check,...args);check();return result;});}
async function atomicWrite(file, body, check=()=>{}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  try { await fs.writeFile(tmp, body, 'utf8'); check(); await fs.rename(tmp, file); }
  catch(error) { await fs.rm(tmp,{force:true}).catch(()=>{}); throw error; }
}
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  win = new BrowserWindow({ width: 1440, height: 940, minWidth: 880, minHeight: 650, show: !isSmoke, icon: path.join(__dirname,'../app/assets/logo.png'), backgroundColor: '#101820', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return {action:'deny'}; });
  win.webContents.on('will-navigate', (e,url) => { if (!isAppURL(url)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  official=await new OfficialData({baseData:JSON.parse(await fs.readFile(path.join(__dirname,'../data/bundle.json'),'utf8')),appRoot:path.join(__dirname,'..'),cacheRoot:path.join(app.getPath('userData'),'official-cache'),inspectImage:(bytes,info)=>{const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw new Error('图片不能完整解码');const size=image.getSize();if(size.width!==info.width||size.height!==info.height||image.toBitmap().length!==size.width*size.height*4)throw new Error('图片解码尺寸不匹配');},onProgress:status=>{if(win&&!win.isDestroyed())win.webContents.send('official-progress',status);}}).init();
  protocol.handle('atlas-asset',request=>{const u=new URL(request.url),file=u.pathname.slice(1);if(u.hostname!=='cache'||u.search||!validFile(file))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(path.join(official.root,'images',file)).href);});
  const credentials=new TACredentials({file:path.join(app.getPath('userData'),'remembered-accounts.bin'),safeStorage});
  const responseCache=new TAResponseCache(path.join(app.getPath('userData'),'ta-responses'));
  taSession=new TASession({credentials,helperPath:app.isPackaged?path.join(process.resourcesPath,'ta-runtime','atlas-ta-helper.exe'):path.join(__dirname,'../release/ta-runtime/atlas-ta-helper/atlas-ta-helper.exe'),onStatus:state=>{
    const authenticated=state.authenticated===true;
    const role=authenticated?JSON.stringify([state.selected_server,state.selected_avatar]):'';
    if(role!==selectedRole){loginEpoch++;selectedRole=role;queryQueue?.reset();}
    if(authenticated!==loggedIn){loginEpoch++;loggedIn=authenticated;queryQueue?.reset();if(!authenticated)official?.cancel();else if(!isSmoke)setTimeout(()=>{if(loggedIn&&official.due())official.refresh().catch(()=>{});},6000);}
    if(win&&!win.isDestroyed())win.webContents.send('ta-status-changed',{...state,risk_accepted:loginRiskAccepted});
  }});
  queryQueue=new TAQueryQueue({execute:code=>taSession.request('query',{code}),onProgress:progress=>{if(win&&!win.isDestroyed())win.webContents.send('ta-query-progress',progress);}});
  ipcMain.handle('ta-status',async e=>{trusted(e);return loginStatus();});
  ipcMain.handle('ta-action',async(e,action,params)=>{trusted(e);
    if(action==='risk'){
      if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).length!==1||typeof params.accepted!=='boolean')throw new Error('风险确认参数无效');
      loginRiskAccepted=params.accepted;
      if(!loginRiskAccepted)taSession.stop('已取消风险确认，登录连接已停止；本地资料仍可使用');
      return loginStatus();
    }
    if(!['init','qr','select','roles','resume','forget'].includes(action))throw new Error('不支持的登录操作');
    if(action!=='forget')requireRiskAcceptance();
    if(['resume','forget'].includes(action)){
    if(!params||Object.keys(params).length!==1||typeof params.account_id!=='string')throw new Error('已保存账号选择无效');
    if(action==='resume')await taSession.resume(params.account_id);else taSession.forget(params.account_id);
  }else{await taSession.request(action,params);}return loginStatus();});
  handleSignedIn('ta-query',async(check,code,options={})=>{
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='force')||options.force!=null&&typeof options.force!=='boolean')throw new Error('查询参数无效');
    const cached=options.force?null:await responseCache.read(code);check();
    const response=cached||await queryQueue.query(code,check);check();
    if(response?.code!==code||response?.share_key!==code.slice(4))throw new Error('查询响应与本次文字码不一致');
    if(!cached&&response.err===0){try{await responseCache.write(code,response,check);}catch{check();return {ok:false,state:'storage-error',error:'阵容原始返回未能保存，已暂停解析；请检查本机存储后重试'};}}
    const result=decodeInput(response);if(result.ok){result.origin='official-query';result.cacheHit=!!cached;}return result;
  });
  ipcMain.handle('ta-logout',async e=>{trusted(e);loginRiskAccepted=false;taSession.stop();return loginStatus();});
  handleLocal('load-data', async () => official.getData());
  handleLocal('copy-code', async (_check,code) => { if(typeof code!=='string'||!code.trim()||Buffer.byteLength(code,'utf8')>32*1024*1024)throw new Error('阵容码为空或超过32 MiB'); await clipboard.writeText(code); return {copied:true}; });
  let saveQueue=Promise.resolve();
  handleLocal('load-state', async check => { await saveQueue;check();try { return JSON.parse(await fs.readFile(statePath(),'utf8')); } catch (error) { if(error.code==='ENOENT') return null; throw new Error('本地数据库读取失败，请保留数据文件并从备份恢复。'); } });
  const saveState = async (check,state) => { const body=JSON.stringify(state); if(body.length>100*1024*1024) throw new Error('本地数据超过100 MiB限制'); const current=saveQueue.then(()=>{check();return atomicWrite(statePath(),body,check);}); saveQueue=current.catch(()=>{}); await current; return {saved:true}; };
  handleLocal('save-state',saveState);
  handleSignedIn('save-parsed-state',saveState);
  handleLocal('import-files', async check => { const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'JSON 文件',extensions:['json']}]}); check();if(r.canceled) return []; const results=[]; for(const p of r.filePaths){check();const st=await fs.stat(p); if(st.size>50*1024*1024) throw new Error('单个导入文件超过50 MiB'); results.push({name:path.basename(p),text:await fs.readFile(p,'utf8')}); } return results; });
  handleLocal('export-json', async(check,{name,data}) => { const r=await dialog.showSaveDialog(win,{defaultPath:path.basename(String(name)),filters:[{name:'JSON 文件',extensions:['json']}]}); check();if(r.canceled) return false; await atomicWrite(r.filePath,JSON.stringify(data,null,2),check); return true; });
  handleSignedIn('decode', async(_check,input) => {if(JSON.stringify(input??null).length>32*1024*1024)return {ok:false,state:'invalid-input',error:'阵容内容超过32 MiB'};return decodeInput(input);});
  handleLocal('official-status',async()=>official.getStatus());
  handleLocal('official-refresh',async(_check,options)=>{if(options?.force!=null&&typeof options.force!=='boolean')throw new Error('更新参数无效');return official.refresh({force:options?.force===true});});
  handleLocal('official-cancel',async()=>{official.cancel();return official.getStatus();});
  handleLocal('official-auto',async(_check,value)=>official.setAutoUpdate(value));
  win.loadURL(pageURL);
  // Saved accounts must also wait for this launch's explicit risk confirmation.
  if(isSmoke) win.webContents.once('did-finish-load', async()=>{setTimeout(async()=>{try{const result=await win.webContents.executeJavaScript('window.runLoginSmoke ? window.runLoginSmoke() : ({error:"smoke entry not ready"})');taSession.stop();result.loginModuleLoggedOut=!taSession.status().authenticated&&!taSession.child;const out=process.env.ATLAS_SMOKE_OUTPUT;if(out)await atomicWrite(path.resolve(out),JSON.stringify(result,null,2));app.exit(result.error?1:0);}catch(e){taSession?.stop();console.error(e);app.exit(1);}},1500);});
  else setInterval(()=>{if(loggedIn&&official.due())official.refresh().catch(()=>{});},3600000).unref();
});
app.on('before-quit',()=>{official?.cancel();taSession?.stop();});
app.on('window-all-closed',()=>app.quit());
