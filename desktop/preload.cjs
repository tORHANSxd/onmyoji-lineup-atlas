const {contextBridge,ipcRenderer} = require('electron');
const copyCode=code=>ipcRenderer.invoke('copy-code',code);
contextBridge.exposeInMainWorld('dungeonCatalog', Object.freeze({
  index: () => ipcRenderer.invoke('dungeon-catalog-index'),
  choose: () => ipcRenderer.invoke('dungeon-catalog-choose'),
  table: name => ipcRenderer.invoke('dungeon-catalog-table', name),
  encounters: () => ipcRenderer.invoke('dungeon-catalog-encounters'),
  records: (name, keys) => ipcRenderer.invoke('dungeon-catalog-records', name, keys),
}));
contextBridge.exposeInMainWorld('runeBattle',Object.freeze({
  status:()=>ipcRenderer.invoke('rune-battle-status'),
  run:(plan,options)=>ipcRenderer.invoke('rune-battle-run',plan,options),
  seedEvidence:plan=>ipcRenderer.invoke('rune-battle-seed-evidence',plan),
  verifySeeds:(plan,requestId)=>ipcRenderer.invoke('rune-battle-verify-seeds',plan,requestId),
  onSeedsProgress:callback=>{
    if(typeof callback!=='function')throw Error('Invalid callback');
    const listener=(_event,requestId,progress)=>callback(requestId,progress);
    ipcRenderer.on('rune-battle-seeds-progress',listener);
    return ()=>ipcRenderer.removeListener('rune-battle-seeds-progress',listener);
  },
  verifyRandom:(plan,seed,requestId)=>ipcRenderer.invoke('rune-battle-verify-random',plan,seed,requestId),
  onRandomProgress:callback=>{
    if(typeof callback!=='function')throw Error('Invalid callback');
    const listener=(_event,requestId,progress)=>callback(requestId,progress);
    ipcRenderer.on('rune-battle-random-progress',listener);
    return ()=>ipcRenderer.removeListener('rune-battle-random-progress',listener);
  },
  stop:()=>ipcRenderer.invoke('rune-battle-stop'),
}));
contextBridge.exposeInMainWorld('taLogin',Object.freeze({status:()=>ipcRenderer.invoke('ta-status'),action:(action,params={})=>ipcRenderer.invoke('ta-action',action,params),query:(code,options={})=>ipcRenderer.invoke('ta-query',code,options),share:code=>ipcRenderer.invoke('ta-share',code),logout:()=>ipcRenderer.invoke('ta-logout'),onQueryProgress:callback=>{if(typeof callback!=='function')throw new Error('Invalid callback');const listener=(_event,progress)=>callback(progress);ipcRenderer.on('ta-query-progress',listener);return ()=>ipcRenderer.removeListener('ta-query-progress',listener);},onStatus:callback=>{if(typeof callback!=='function')throw new Error('Invalid callback');const listener=(_event,state)=>callback(state);ipcRenderer.on('ta-status-changed',listener);return ()=>ipcRenderer.removeListener('ta-status-changed',listener);}}));
contextBridge.exposeInMainWorld('atlas',Object.freeze({copyCode,exportJSONText:p=>ipcRenderer.invoke('export-json-text',p),loadDataText:()=>ipcRenderer.invoke('load-data-json'),loadStateText:()=>ipcRenderer.invoke('load-state-json'),saveStateFieldsText:text=>ipcRenderer.invoke('save-state-fields-json',text),saveStateText:text=>ipcRenderer.invoke('save-state-json',text),saveParsedStateText:text=>ipcRenderer.invoke('save-parsed-state-json',text),parseJSON:text=>ipcRenderer.invoke('parse-json',text),saveParsedDelta:delta=>ipcRenderer.invoke('save-parsed-delta',delta),buildLineup:input=>ipcRenderer.invoke('build-lineup',input),exportQR:input=>ipcRenderer.invoke('export-qr',input),findShortCode:code=>ipcRenderer.invoke('find-short-code',code),loadData:()=>ipcRenderer.invoke('load-data'),loadState:()=>ipcRenderer.invoke('load-state'),saveState:s=>ipcRenderer.invoke('save-state',s),saveParsedState:s=>ipcRenderer.invoke('save-parsed-state',s),importFiles:()=>ipcRenderer.invoke('import-files'),exportJSON:p=>ipcRenderer.invoke('export-json',p),decode:c=>ipcRenderer.invoke('decode',c),officialStatus:()=>ipcRenderer.invoke('official-status'),refreshOfficial:o=>ipcRenderer.invoke('official-refresh',o),cancelOfficial:()=>ipcRenderer.invoke('official-cancel'),setAutoUpdate:v=>ipcRenderer.invoke('official-auto',v),onOfficialProgress:callback=>{if(typeof callback!=='function')throw new Error('Invalid callback');const listener=(_event,status)=>callback(status);ipcRenderer.on('official-progress',listener);return ()=>ipcRenderer.removeListener('official-progress',listener);}}));
