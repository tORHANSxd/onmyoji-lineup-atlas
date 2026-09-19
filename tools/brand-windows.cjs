'use strict';
// Apply the local logo and version resources without requesting signing keys.
const path=require('node:path'),fs=require('node:fs/promises'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
module.exports=async context=>{
 if(context.electronPlatformName!=='win32')return;
 const root=context.packager.projectDir,info=context.packager.appInfo;
 const executable=path.resolve(context.appOutDir,info.productFilename+'.exe');
 if(!executable.startsWith(path.resolve(context.appOutDir)+path.sep))throw new Error('Executable escaped build directory');
 const editor=path.join(root,'node_modules/rcedit/bin/rcedit-x64.exe');
 await fs.access(editor);
 await promisify(execFile)(editor,[executable,'--set-icon',path.join(root,'app/assets/logo.ico'),'--set-version-string','ProductName',info.productName,'--set-version-string','FileDescription',info.productName,'--set-file-version',info.version,'--set-product-version',info.version],{windowsHide:true});
};
