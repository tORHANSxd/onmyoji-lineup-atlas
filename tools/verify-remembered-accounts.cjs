// Real Windows safeStorage round trip using synthetic credentials only.
const {app,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {TACredentials,accountId}=require('../desktop/ta-credentials.cjs');
const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6);if(!/^\d{14}$/.test(run||''))throw new Error('Pass --seed/--check with a fresh --run=YYYYMMDDHHmmss');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'user-data','remembered-accounts-qa',run);
app.setPath('userData',profile);
app.whenReady().then(()=>{
 assert.equal(safeStorage.isEncryptionAvailable(),true);
 const file=path.join(profile,'synthetic-accounts.bin');
 const info=n=>({full_uid:'synthetic-'+n,mpay_device_id:'test-device',mpay_user:{id:'test-'+n,token:'SYNTHETIC-SECRET-'+n,pc_ext_info:{is_remember:true}}});
 if(process.argv.includes('--seed')){
  assert.equal(fs.existsSync(file),false);const store=new TACredentials({file,safeStorage});
  for(const n of [1,2])store.accept({full_uid:'synthetic-'+n,credentials:info(n),label:'合成验证账号 '+n,server_id:'10014',avatar_id:'qa'});
  assert.equal(store.status().storage_error,'');assert.equal(fs.readFileSync(file).includes(Buffer.from('SYNTHETIC-SECRET')),false);
  // Quit normally so Chromium flushes the profile key used by safeStorage.
  app.quit();return;
 }
 assert.ok(process.argv.includes('--check'));
 const restarted=new TACredentials({file,safeStorage});assert.equal(restarted.status().remembered_accounts.length,2);assert.equal(restarted.get(accountId('synthetic-1')).credentials.mpay_user.token,'SYNTHETIC-SECRET-1');
 restarted.forget(accountId('synthetic-1'));restarted.forget(accountId('synthetic-2'));assert.equal(new TACredentials({file,safeStorage}).status().remembered_accounts.length,0);
 const report={method:'Two separate Electron processes using the same Windows profile; synthetic accounts only',encryptedRoundTrip:true,multipleAccounts:true,processRestart:true,forget:true,noPlaintext:true};
 fs.writeFileSync(path.join(root,'verification','remembered-accounts-v073.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
