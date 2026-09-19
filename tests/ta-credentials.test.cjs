const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {TACredentials,accountId}=require('../desktop/ta-credentials.cjs');
// Test cipher exercises opaque bytes and restart logic. Real DPAPI is checked
// separately in Electron, never claimed by this unit test.
function harness(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-credentials-')),file=path.join(root,'accounts.bin'),key=crypto.randomBytes(32);
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(s),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);},decryptString:b=>{const c=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString();}};
 return {file,safeStorage,store:()=>new TACredentials({file,safeStorage}),cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const event=(n,flag=true)=>({full_uid:'synthetic-'+n,credentials:{full_uid:'synthetic-'+n,mpay_device_id:'synthetic-device',mpay_user:{id:String(n),token:'private-token-'+n,login_channel:'netease',pc_ext_info:{is_remember:flag}}},label:'角色'+n,server_id:'10014',avatar_id:'role-'+n});
test('多账号加密持久化、重启与忘记；状态无凭据',()=>{const h=harness();try{
 const s=h.store();s.accept(event(1));s.accept(event(2,'true'));const bytes=fs.readFileSync(h.file);for(const word of ['private-token','synthetic-device','角色'])assert.equal(bytes.includes(Buffer.from(word)),false);
 const fresh=h.store();assert.equal(fresh.status().remembered_accounts.length,2);assert.equal(fresh.status().active_account,accountId('synthetic-2'));assert.equal(fresh.get(accountId('synthetic-1')).credentials.mpay_user.token,'private-token-1');assert.equal(JSON.stringify(fresh.status()).includes('private-token'),false);
 fresh.forget(accountId('synthetic-2'));assert.equal(h.store().status().remembered_accounts.length,1);assert.equal(fresh.status().active_account,'');
}finally{h.cleanup();}});
test('只有手机授权可以保存，同账号取消记住会删除旧凭据',()=>{const h=harness();try{const s=h.store();for(const flag of [false,'false',null,1,'1'])s.accept(event(1,flag));const absent=event(1);delete absent.credentials.mpay_user.pc_ext_info.is_remember;s.accept(absent);assert.equal(fs.existsSync(h.file),false);s.accept(event(1));s.accept(event(1,false));assert.equal(h.store().status().remembered_accounts.length,0);}finally{h.cleanup();}});
test('服务端拒绝令凭据失效，保留可辨认账号；损坏文件不覆盖',()=>{const h=harness();try{const s=h.store();s.accept(event(1));s.accept({...event(1),invalidate:true});assert.equal(s.status().remembered_accounts[0].needs_login,true);assert.throws(()=>s.get(accountId('synthetic-1')),/失效/);fs.writeFileSync(h.file,'corrupt');const broken=h.store();broken.accept(event(2));assert.equal(fs.readFileSync(h.file,'utf8'),'corrupt');assert.ok(broken.status().storage_error);}finally{h.cleanup();}});
test('加密不可用时绝不退回明文',()=>{const h=harness();try{h.safeStorage.isEncryptionAvailable=()=>false;const s=h.store();s.accept(event(1));assert.equal(fs.existsSync(h.file),false);assert.match(s.status().storage_error,/加密不可用/);}finally{h.cleanup();}});
