const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ENDPOINT = 'https://api.fireschain.org/onmyoji/v1/team-code/decode';
let win, lastRequest = 0;
const isSmoke = process.argv.includes('--smoke');
if (isSmoke) app.setPath('userData', path.join(app.getPath('temp'), 'onmyoji-atlas-smoke'));
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
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  win = new BrowserWindow({ width: 1440, height: 940, minWidth: 880, minHeight: 650, show: !isSmoke, backgroundColor: '#101820', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return {action:'deny'}; });
  win.webContents.on('will-navigate', (e,url) => { if (!isAppURL(url)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  ipcMain.handle('load-data', async e => { trusted(e); return JSON.parse(await fs.readFile(path.join(__dirname,'../data/bundle.json'),'utf8')); });
  ipcMain.handle('load-state', async e => { trusted(e); try { return JSON.parse(await fs.readFile(statePath(),'utf8')); } catch (error) { if(error.code==='ENOENT') return null; throw new Error('本地数据库读取失败，请保留数据文件并从备份恢复。'); } });
  let saveQueue=Promise.resolve();
  ipcMain.handle('save-state', async (e,state) => { trusted(e); const body=JSON.stringify(state); if(body.length>100*1024*1024) throw new Error('本地数据超过100 MiB限制'); const current=saveQueue.then(()=>atomicWrite(statePath(),body)); saveQueue=current.catch(()=>{}); await current; return {saved:true}; });
  ipcMain.handle('import-files', async e => { trusted(e); const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'JSON 文件',extensions:['json']}]}); if(r.canceled) return []; const results=[]; for(const p of r.filePaths){ const st=await fs.stat(p); if(st.size>50*1024*1024) throw new Error('单个导入文件超过50 MiB'); results.push({name:path.basename(p),text:await fs.readFile(p,'utf8')}); } return results; });
  ipcMain.handle('export-json', async(e,{name,data}) => { trusted(e); const r=await dialog.showSaveDialog(win,{defaultPath:path.basename(String(name)),filters:[{name:'JSON 文件',extensions:['json']}]}); if(r.canceled) return false; await atomicWrite(r.filePath,JSON.stringify(data,null,2)); return true; });
  ipcMain.handle('decode', async(e,rawCode) => {
    trusted(e); const code=String(rawCode).replace(/^\uFEFF/,'').trim();
    if(Buffer.byteLength(code)>32768 || !(/^\|TA\|[a-fA-F0-9]{32}$/.test(code)||(/^#TA#\S+$/s.test(code)))) return {ok:false,state:'invalid-input',error:'请单独输入一条完整原始阵容码'};
    if(Date.now()-lastRequest<3000) return {ok:false,state:'rate-limited',error:'请间隔3秒后重试'};
    lastRequest=Date.now();
    try {
      const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({teamCode:code}),redirect:'manual',signal:AbortSignal.timeout(15000)});
      const reader=response.body.getReader(); let bytes=0, chunks=[]; try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1048576) throw new Error('响应超过1 MiB');chunks.push(Buffer.from(value));}} finally {await reader.cancel();}
      const body=Buffer.concat(chunks).toString('utf8');
      if(!response.ok){let message=body;try{message=JSON.parse(body).error||body;}catch{}return {ok:false,state:response.status===429?'rate-limited':[401,403].includes(response.status)?'access-denied':'upstream-rejected',status:response.status,error:String(message).slice(0,1000)};}
      return JSON.parse(body);
    } catch(error) {return {ok:false,state:error.name==='TimeoutError'?'timeout':'network-error',error:String(error.message).slice(0,300)};}
  });
  win.loadURL(pageURL);
  if(isSmoke) win.webContents.once('did-finish-load', async()=>{setTimeout(async()=>{try{const result=await win.webContents.executeJavaScript('window.runSmoke ? window.runSmoke() : ({error:"smoke entry not ready"})'); const out=process.env.ATLAS_SMOKE_OUTPUT; if(out) await atomicWrite(path.resolve(out),JSON.stringify(result,null,2)); app.exit(result.error?1:0);}catch(e){console.error(e);app.exit(1);}},1500);});
});
app.on('window-all-closed',()=>app.quit());
