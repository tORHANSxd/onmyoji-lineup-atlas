const { app, BrowserWindow, ipcMain, dialog, shell, session, protocol, net, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { decodeInput } = require('./ta-codec.cjs');
const { OfficialData, validFile } = require('./official-data.cjs');
let win, official;
const isSmoke = process.argv.includes('--smoke');
if (isSmoke) app.setPath('userData', process.env.ATLAS_SMOKE_USER_DATA || path.join(app.getPath('temp'), 'onmyoji-atlas-smoke'));
protocol.registerSchemesAsPrivileged([{scheme:'atlas-asset',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const statePath = () => path.join(app.getPath('userData'), 'library-v1.json');
const pageURL = pathToFileURL(path.join(__dirname, '../app/index.html')).href;
function isAppURL(value){try{const url=new URL(value);url.hash='';return url.href===pageURL;}catch{return false;}}
function trusted(event) { if (!isAppURL(event.senderFrame?.url)) throw new Error('不受信任的调用来源'); }
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
  protocol.handle('atlas-asset',request=>{const u=new URL(request.url),file=u.pathname.slice(1);if(u.hostname!=='cache'||u.search||!validFile(file))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(path.join(official.root,'images',file)).href);});
  ipcMain.handle('load-data', async e => { trusted(e); return official.getData(); });
  ipcMain.handle('load-state', async e => { trusted(e); try { return JSON.parse(await fs.readFile(statePath(),'utf8')); } catch (error) { if(error.code==='ENOENT') return null; throw new Error('本地数据库读取失败，请保留数据文件并从备份恢复。'); } });
  let saveQueue=Promise.resolve();
  ipcMain.handle('save-state', async (e,state) => { trusted(e); const body=JSON.stringify(state); if(body.length>100*1024*1024) throw new Error('本地数据超过100 MiB限制'); const current=saveQueue.then(()=>atomicWrite(statePath(),body)); saveQueue=current.catch(()=>{}); await current; return {saved:true}; });
  ipcMain.handle('import-files', async e => { trusted(e); const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'JSON 文件',extensions:['json']}]}); if(r.canceled) return []; const results=[]; for(const p of r.filePaths){ const st=await fs.stat(p); if(st.size>50*1024*1024) throw new Error('单个导入文件超过50 MiB'); results.push({name:path.basename(p),text:await fs.readFile(p,'utf8')}); } return results; });
  ipcMain.handle('export-json', async(e,{name,data}) => { trusted(e); const r=await dialog.showSaveDialog(win,{defaultPath:path.basename(String(name)),filters:[{name:'JSON 文件',extensions:['json']}]}); if(r.canceled) return false; await atomicWrite(r.filePath,JSON.stringify(data,null,2)); return true; });
  ipcMain.handle('decode', async(e,input) => {trusted(e);if(JSON.stringify(input??null).length>32*1024*1024)return {ok:false,state:'invalid-input',error:'阵容内容超过32 MiB'};return decodeInput(input);});
  ipcMain.handle('official-status',async e=>{trusted(e);return official.getStatus();});
  ipcMain.handle('official-refresh',async(e,options)=>{trusted(e);if(options?.force!=null&&typeof options.force!=='boolean')throw new Error('更新参数无效');return official.refresh({force:options?.force===true});});
  ipcMain.handle('official-cancel',async e=>{trusted(e);official.cancel();return official.getStatus();});
  ipcMain.handle('official-auto',async(e,value)=>{trusted(e);return official.setAutoUpdate(value);});
  win.loadURL(pageURL);
  if(isSmoke) win.webContents.once('did-finish-load', async()=>{setTimeout(async()=>{try{let update=null;if(process.argv.includes('--refresh-official'))update=await official.refresh();const options=process.env.ATLAS_SMOKE_FIXTURE?{code:await fs.readFile(path.resolve(process.env.ATLAS_SMOKE_FIXTURE),'utf8')}:{};const result=await win.webContents.executeJavaScript('window.runSmoke ? window.runSmoke('+JSON.stringify(options)+') : ({error:"smoke entry not ready"})');if(update)result.officialUpdate=update;const out=process.env.ATLAS_SMOKE_OUTPUT;if(out)await atomicWrite(path.resolve(out),JSON.stringify(result,null,2));app.exit(result.error?1:0);}catch(e){console.error(e);app.exit(1);}},1500);});
  else {setTimeout(()=>{if(official.due())official.refresh().catch(()=>{});},6000);setInterval(()=>{if(official.due())official.refresh().catch(()=>{});},3600000).unref();}
});
app.on('before-quit',()=>official?.cancel());
app.on('window-all-closed',()=>app.quit());
