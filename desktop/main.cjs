const { app, BrowserWindow, ipcMain, dialog, shell, session, protocol, net, nativeImage, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { decodeInput } = require('./ta-codec.cjs');
const { OfficialData, validFile } = require('./official-data.cjs');
const { TASession } = require('./ta-session.cjs');
let win, official, taSession, loginEpoch=0, loggedIn=false;
const isSmoke = process.argv.includes('--smoke');
if (isSmoke) app.setPath('userData', process.env.ATLAS_SMOKE_USER_DATA || path.join(app.getPath('temp'), 'onmyoji-atlas-smoke'));
protocol.registerSchemesAsPrivileged([{scheme:'atlas-asset',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const statePath = () => path.join(app.getPath('userData'), 'library-v1.json');
const pageURL = pathToFileURL(path.join(__dirname, '../app/index.html')).href;
function isAppURL(value){try{const url=new URL(value);url.hash='';return url.href===pageURL;}catch{return false;}}
function trusted(event) { if (!isAppURL(event.senderFrame?.url)) throw new Error('不受信任的调用来源'); }
function requireLogin(event, epoch=loginEpoch) { trusted(event); if(epoch!==loginEpoch||taSession?.status().authenticated!==true)throw new Error('请先扫码登录后使用软件'); }
function handleSignedIn(name, handler) {
  ipcMain.handle(name, async(event,...args)=>{const epoch=loginEpoch;const check=()=>requireLogin(event,epoch);check();const result=await handler(check,...args);check();return result;});
}
async function atomicWrite(file, body) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, file);
}
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  win = new BrowserWindow({ width: 1440, height: 940, minWidth: 880, minHeight: 650, show: !isSmoke, backgroundColor: '#101820', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return {action:'deny'}; });
  win.webContents.on('will-navigate', (e,url) => { if (!isAppURL(url)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  official=await new OfficialData({baseData:JSON.parse(await fs.readFile(path.join(__dirname,'../data/bundle.json'),'utf8')),appRoot:path.join(__dirname,'..'),cacheRoot:path.join(app.getPath('userData'),'official-cache'),inspectImage:(bytes,info)=>{const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw new Error('图片不能完整解码');const size=image.getSize();if(size.width!==info.width||size.height!==info.height||image.toBitmap().length!==size.width*size.height*4)throw new Error('图片解码尺寸不匹配');},onProgress:status=>{if(win&&!win.isDestroyed())win.webContents.send('official-progress',status);}}).init();
  protocol.handle('atlas-asset',request=>{const u=new URL(request.url),file=u.pathname.slice(1);if(u.hostname!=='cache'||u.search||!validFile(file))return new Response('Not found',{status:404});if(taSession?.status().authenticated!==true)return new Response('Login required',{status:403});return net.fetch(pathToFileURL(path.join(official.root,'images',file)).href);});
  taSession=new TASession({helperPath:app.isPackaged?path.join(process.resourcesPath,'ta-runtime','atlas-ta-helper.exe'):path.join(__dirname,'../release/ta-runtime/atlas-ta-helper/atlas-ta-helper.exe'),onStatus:state=>{
    const authenticated=state.authenticated===true;
    if(authenticated!==loggedIn){loginEpoch++;loggedIn=authenticated;if(!authenticated)official?.cancel();else if(!isSmoke)setTimeout(()=>{if(loggedIn&&official.due())official.refresh().catch(()=>{});},6000);}
    if(win&&!win.isDestroyed())win.webContents.send('ta-status-changed',state);
  }});
  ipcMain.handle('ta-status',async e=>{trusted(e);return taSession.status();});
  ipcMain.handle('ta-action',async(e,action,params)=>{trusted(e);if(!['init','qr','select','roles'].includes(action))throw new Error('不支持的登录操作');await taSession.request(action,params);return taSession.status();});
  handleSignedIn('ta-query',async(check,code)=>{const response=await taSession.request('query',{code});check();if(response?.code!==code||response?.share_key!==code.slice(4)||response?.err!==0)throw new Error('查询响应与本次文字码不一致');const result=decodeInput(response);if(result.ok)result.origin='official-query';return result;});
  ipcMain.handle('ta-logout',async e=>{trusted(e);return taSession.stop();});
  handleSignedIn('load-data', async () => official.getData());
  handleSignedIn('copy-code', async (_check,code) => { if(typeof code!=='string'||!code.trim()||Buffer.byteLength(code,'utf8')>32*1024*1024)throw new Error('阵容码为空或超过32 MiB'); await clipboard.writeText(code); return {copied:true}; });
  handleSignedIn('load-state', async () => { try { return JSON.parse(await fs.readFile(statePath(),'utf8')); } catch (error) { if(error.code==='ENOENT') return null; throw new Error('本地数据库读取失败，请保留数据文件并从备份恢复。'); } });
  let saveQueue=Promise.resolve();
  handleSignedIn('save-state', async (check,state) => { const body=JSON.stringify(state); if(body.length>100*1024*1024) throw new Error('本地数据超过100 MiB限制'); const current=saveQueue.then(()=>{check();return atomicWrite(statePath(),body);}); saveQueue=current.catch(()=>{}); await current; return {saved:true}; });
  handleSignedIn('import-files', async check => { const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'JSON 文件',extensions:['json']}]}); check();if(r.canceled) return []; const results=[]; for(const p of r.filePaths){check();const st=await fs.stat(p); if(st.size>50*1024*1024) throw new Error('单个导入文件超过50 MiB'); results.push({name:path.basename(p),text:await fs.readFile(p,'utf8')}); } return results; });
  handleSignedIn('export-json', async(check,{name,data}) => { const r=await dialog.showSaveDialog(win,{defaultPath:path.basename(String(name)),filters:[{name:'JSON 文件',extensions:['json']}]}); check();if(r.canceled) return false; await atomicWrite(r.filePath,JSON.stringify(data,null,2)); return true; });
  handleSignedIn('decode', async(_check,input) => {if(JSON.stringify(input??null).length>32*1024*1024)return {ok:false,state:'invalid-input',error:'阵容内容超过32 MiB'};return decodeInput(input);});
  handleSignedIn('official-status',async()=>official.getStatus());
  handleSignedIn('official-refresh',async(_check,options)=>{if(options?.force!=null&&typeof options.force!=='boolean')throw new Error('更新参数无效');return official.refresh({force:options?.force===true});});
  handleSignedIn('official-cancel',async()=>{official.cancel();return official.getStatus();});
  handleSignedIn('official-auto',async(_check,value)=>official.setAutoUpdate(value));
  win.loadURL(pageURL);
  if(isSmoke) win.webContents.once('did-finish-load', async()=>{setTimeout(async()=>{try{const result=await win.webContents.executeJavaScript('window.runLoginSmoke ? window.runLoginSmoke() : ({error:"smoke entry not ready"})');taSession.stop();result.loginModuleLoggedOut=!taSession.status().authenticated&&!taSession.child;const out=process.env.ATLAS_SMOKE_OUTPUT;if(out)await atomicWrite(path.resolve(out),JSON.stringify(result,null,2));app.exit(result.error?1:0);}catch(e){taSession?.stop();console.error(e);app.exit(1);}},1500);});
  else setInterval(()=>{if(loggedIn&&official.due())official.refresh().catch(()=>{});},3600000).unref();
});
app.on('before-quit',()=>{official?.cancel();taSession?.stop();});
app.on('window-all-closed',()=>app.quit());
