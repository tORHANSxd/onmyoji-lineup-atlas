const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('atlas',Object.freeze({loadData:()=>ipcRenderer.invoke('load-data'),loadState:()=>ipcRenderer.invoke('load-state'),saveState:s=>ipcRenderer.invoke('save-state',s),importFiles:()=>ipcRenderer.invoke('import-files'),exportJSON:p=>ipcRenderer.invoke('export-json',p),decode:c=>ipcRenderer.invoke('decode',c)}));
