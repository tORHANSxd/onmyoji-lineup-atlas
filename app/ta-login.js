'use strict';
(function(){
 const $=id=>document.getElementById(id),api=window.taLogin;
 let state={servers:[],authenticated:false,busy:false},statusSnapshot=null,serverRenderKey='',accountsRenderKey='',pending=null,unlocked=false,managing=false,returnFocus=null,returnScroll=0;
 const queryReady=()=>state.authenticated&&!!state.selected_avatar&&state.query_ready!==false&&state.servers.some(s=>s.id===state.selected_server&&s.available);
 const option=(value,label)=>{const el=document.createElement('option');el.value=value;el.textContent=label;return el;};
 function renderServers(){
  const search=$('ta-server-search').value.trim().toLowerCase(),category=$('ta-category').value,onlyRoles=$('ta-only-roles').checked;
  const rows=state.servers.filter(s=>(!category||s.category===category)&&(!onlyRoles||s.roles.length)&&(!search||[s.id,s.name,...s.roles.map(r=>r.name)].join(' ').toLowerCase().includes(search)));
  const select=$('ta-server');select.replaceChildren(option('','选择服务器'));
  const groups=new Map();
  for(const server of rows){
   if(!groups.has(server.category)){const group=document.createElement('optgroup');group.label=server.category;groups.set(server.category,group);select.append(group);}
   const roles=server.roles.map(r=>r.name).join('、'),suffix=roles?' · '+roles:server.roles_known?' · 无已有角色':' · 角色待查询';
   const item=option(server.id,server.name+suffix+(server.available?'':' · '+(server.unavailable_reason||'无连接地址')));item.disabled=!server.available;groups.get(server.category).append(item);
  }
  select.value=rows.some(s=>s.id===state.selected_server)?state.selected_server:'';
  select.disabled=!api||!state.risk_accepted||state.busy||['qr_waiting','qr_scanned'].includes(state.stage)||!rows.length;
  $('ta-server-count').textContent=`${rows.length} / ${state.servers.length} 个服务器`;
  const server=state.servers.find(s=>s.id===state.selected_server),roles=$('ta-role');roles.replaceChildren(option('','选择已有角色'));
  for(const r of [...(server?.roles||[])].sort((a,b)=>(Number(a.level)>0?Number(a.level):Infinity)-(Number(b.level)>0?Number(b.level):Infinity)))roles.append(option(r.avatar_id,r.name+(Number(r.level)>0?' · Lv.'+r.level:' · 等级未知')));
  roles.value=state.selected_avatar||'';roles.disabled=!state.risk_accepted||state.busy||!state.authenticated||!server?.available||!server?.roles.length;
  $('ta-selected').textContent=server?'当前服务器：'+server.name+(state.authenticated&&!server.roles.length?' · 此服尚无可选角色':''):'';
 }
 function showScreen(){
  const visible=managing;
  $('login-screen').hidden=!visible;$('app-shell').hidden=visible;$('app-shell').inert=visible;$('app-shell').setAttribute('aria-hidden',String(visible));
  document.body.classList.toggle('session-locked',visible);
  if(visible&&$('detail-dialog').open)$('detail-dialog').close();
 }
 function render(value){
  const roleChanged=value.authenticated===true&&(value.selected_server!==state.selected_server||value.selected_avatar!==state.selected_avatar);
  state={...value,servers:value.servers||[]};statusSnapshot=null;
  const accepted=state.risk_accepted===true;
  $('ta-risk-accept').checked=accepted;$('ta-risk-accept').disabled=!api;
  $('ta-risk-status').textContent=accepted?'已确认本次登录风险；取消勾选会停止登录连接。':'确认后才能获取二维码或登录已保存账号。本次确认不会跨软件启动保存。';
  $('ta-message').textContent=state.message||'';$('ta-error').textContent=state.error||'';$('ta-error').hidden=!state.error;
  $('ta-summary').textContent=queryReady()?'查询角色已就绪':state.authenticated?'需要可用角色':'扫码登录';
  const accounts=state.remembered_accounts||[],saved=$('ta-saved-account'),previous=saved.value;
  const accountKey=JSON.stringify(accounts);if(accountKey!==accountsRenderKey){accountsRenderKey=accountKey;saved.replaceChildren(option('','选择已记住账号'),...accounts.map(a=>option(a.id,a.label+(a.needs_login?' · 需重新扫码':''))));}
  saved.value=accounts.some(a=>a.id===previous)?previous:state.current_account||state.active_account||'';
  saved.disabled=state.busy||!accounts.length;
  $('ta-resume').disabled=!accepted||state.busy||!accounts.some(a=>a.id===saved.value&&!a.needs_login);
  $('ta-forget').disabled=state.busy||!saved.value;
  $('ta-storage-status').textContent=state.storage_error||(state.authenticated?(accounts.some(a=>a.id===state.current_account&&!a.needs_login)?'已按手机授权加密记住此账号。':'服务端未返回可保存授权，本次仅使用临时会话。'):'已记住账号会在使用前向官方服务器重新验证。');
  const serverKey=JSON.stringify([state.servers,state.selected_server,state.selected_avatar,state.risk_accepted,state.busy,state.authenticated,['qr_waiting','qr_scanned'].includes(state.stage)]);
  if((managing||!serverRenderKey)&&serverRenderKey!==serverKey){serverRenderKey=serverKey;const current=$('ta-category').value,categories=[...new Set(state.servers.map(s=>s.category))];$('ta-category').replaceChildren(option('','全部分类'),...categories.map(s=>option(s,s)));$('ta-category').value=categories.includes(current)?current:'';renderServers();}
  $('ta-load').disabled=!api||!accepted||state.busy||['qr_waiting','qr_scanned'].includes(state.stage);$('ta-load').textContent=state.servers.some(s=>s.available)?'刷新服务器':'加载服务器';
  $('ta-qr').disabled=!api||!accepted||state.busy;$('ta-qr').textContent=state.qr_image?'刷新二维码':state.authenticated?'切换登录账号':'获取登录二维码';
  $('ta-refresh-roles').disabled=!accepted||state.busy||!state.authenticated;$('ta-logout').disabled=!api;
  $('ta-logout').textContent=state.authenticated?'退出登录':'取消登录';
  $('ta-enter').hidden=false;$('ta-enter').disabled=false;
  $('ta-qr-image').hidden=!accepted||!state.qr_image;
  if(accepted&&state.qr_image)$('ta-qr-image').src=state.qr_image;else $('ta-qr-image').removeAttribute('src');
  $('ta-qr-placeholder').hidden=accepted&&!!state.qr_image;
  $('ta-qr-placeholder').textContent=!api?'扫码登录请使用 Windows 安装版':!accepted?'请先阅读上方免责声明，并确认使用可弃用的小号':state.authenticated?(queryReady()?'查询角色已就绪':state.message||'账号已认证，等待可用角色'):state.busy?'正在准备，请稍候…':state.stage==='qr_expired'?'二维码已过期，请重新获取':'获取二维码后，用阴阳师手游扫码';
  $('ta-query-tip').textContent=state.stage==='roles_empty'?'请先在阴阳师手游中创建角色，再点击「刷新角色」。需要已有角色才能查询阵容码。':state.authenticated&&!queryReady()?(state.message||'暂无可用查询角色，请刷新角色列表重试。'):'扫码后默认选择等级最低的可用角色，也可手动切换。查询账号与库存账号可以不同。';
  if(state.authenticated&&!state.selected_avatar)$('ta-server-settings').open=true;
  const next=!!queryReady()&&(unlocked||!state.busy),changed=next!==unlocked;
  unlocked=next;showScreen();
  if(changed||roleChanged)window.dispatchEvent(new CustomEvent('atlas-session',{detail:{authenticated:unlocked}}));
  window.dispatchEvent(new CustomEvent('atlas-login-status',{detail:{authenticated:unlocked,busy:state.busy,hasRole:!!state.selected_avatar}}));
 }
 async function action(name,params){
  if(!api)throw new Error('扫码登录请使用 Windows 安装版');
  if(!state.risk_accepted&&!['risk','forget'].includes(name))throw new Error('请先阅读免责声明，并确认使用可弃用的小号及承担账号风险');
  const result=await api.action(name,params);render(result);return result;
 }
 async function loadCatalog(){
  if(!api)throw new Error('扫码登录请使用 Windows 安装版');
  if(!state.servers.some(s=>s.available)&&!state.busy){pending??=action('init').finally(()=>pending=null);await pending;}
 }
 function manage(){if(!managing){returnFocus=document.activeElement;returnScroll=window.scrollY;}managing=true;serverRenderKey='';render(state);$('ta-server-settings').open=state.authenticated===true;showScreen();window.scrollTo(0,0);if(!state.risk_accepted)$('ta-risk-accept').focus({preventScroll:true});else if(unlocked)$('ta-enter').focus();}
 async function ensure(){manage();}
 async function beginQR(){await loadCatalog();await action('qr');}
 async function query(code,options={}){
  if(AtlasCore.classifyCode(code)!=='pipe-ta')throw new Error('请输入一条完整的 |TA| 文字码');
  if(!unlocked){await ensure();throw new Error(state.stage==='roles_empty'?'请先在阴阳师手游中创建角色，再刷新角色列表':state.authenticated?(state.message||'暂无可用角色，请刷新后重试'):'请先扫码登录，然后返回当前页面重试');}
  return api.query(code,options);
 }
 const handle=fn=>async()=>{try{await fn();}catch(e){$('ta-error').textContent=e.message;$('ta-error').hidden=false;}};
 $('ta-load').onclick=handle(()=>action('init'));
 $('ta-qr').onclick=handle(beginQR);
 $('ta-refresh-roles').onclick=handle(()=>action('roles'));
 $('ta-logout').onclick=handle(async()=>{render(await api.logout());});
 $('ta-saved-account').onchange=()=>render(state);
 $('ta-resume').onclick=handle(()=>action('resume',{account_id:$('ta-saved-account').value}));
 $('ta-forget').onclick=handle(()=>action('forget',{account_id:$('ta-saved-account').value}));
 $('ta-risk-accept').onchange=handle(async()=>{try{await action('risk',{accepted:$('ta-risk-accept').checked});}finally{$('ta-risk-accept').checked=state.risk_accepted===true;}});
 $('open-login').onclick=manage;
 $('ta-enter').onclick=()=>{managing=false;showScreen();window.scrollTo(0,returnScroll);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
 $('ta-risk-back').onclick=$('ta-enter').onclick;
 $('ta-server').onchange=handle(()=>{const sid=$('ta-server').value;if(sid)return action('select',{server_id:sid,avatar_id:''});});
 $('ta-role').onchange=handle(()=>action('select',{server_id:state.selected_server,avatar_id:$('ta-role').value}));
 $('ta-server-search').oninput=renderServers;$('ta-category').onchange=renderServers;$('ta-only-roles').onchange=renderServers;
 async function start(){
  if(!api){render({...state,message:'扫码登录请使用 Windows 安装版'});return;}
  api.onStatus(render);render(await api.status());

 }
 window.addEventListener('atlas-ready',()=>render(state));
 const started=start().catch(error=>{render({...state,error:error.message});});
 window.TALogin=Object.freeze({query,ensure,status:()=>statusSnapshot??=(function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;})(structuredClone(state)),ready:()=>started});
})();
