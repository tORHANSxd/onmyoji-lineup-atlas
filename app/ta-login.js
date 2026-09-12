'use strict';
(function(){
 const $=id=>document.getElementById(id),api=window.taLogin;
 let state={servers:[],authenticated:false,busy:false},pending=null,unlocked=false,managing=false;
 const option=(value,label)=>{const el=document.createElement('option');el.value=value;el.textContent=label;return el;};
 function renderServers(){
  const search=$('ta-server-search').value.trim().toLowerCase(),category=$('ta-category').value,onlyRoles=$('ta-only-roles').checked;
  const rows=state.servers.filter(s=>(!category||s.category===category)&&(!onlyRoles||s.roles.length)&&(!search||[s.id,s.name,...s.roles.map(r=>r.name)].join(' ').toLowerCase().includes(search)));
  const select=$('ta-server');select.replaceChildren(option('','选择服务器'));
  const groups=new Map();
  for(const server of rows){
   if(!groups.has(server.category)){const group=document.createElement('optgroup');group.label=server.category;groups.set(server.category,group);select.append(group);}
   const roles=server.roles.map(r=>r.name).join('、'),suffix=roles?' · '+roles:server.roles_known?' · 无已有角色':' · 角色待查询';
   const item=option(server.id,server.name+suffix+(server.available?'':' · 无连接地址'));item.disabled=!server.available;groups.get(server.category).append(item);
  }
  select.value=rows.some(s=>s.id===state.selected_server)?state.selected_server:'';
  select.disabled=!api||state.busy||!rows.length;
  $('ta-server-count').textContent=`${rows.length} / ${state.servers.length} 个服务器`;
  const server=state.servers.find(s=>s.id===state.selected_server),roles=$('ta-role');roles.replaceChildren(option('','选择已有角色'));
  for(const r of server?.roles||[])roles.append(option(r.avatar_id,r.name+(r.level!=null?' · Lv.'+r.level:'')));
  roles.value=state.selected_avatar||'';roles.disabled=state.busy||!state.authenticated||!server?.roles.length;
  $('ta-selected').textContent=server?'当前服务器：'+server.name+(state.authenticated&&!server.roles.length?' · 此服尚无可选角色':''):'';
 }
 function showScreen(){
  const visible=!unlocked||managing;
  $('login-screen').hidden=!visible;$('app-shell').hidden=visible;$('app-shell').inert=visible;$('app-shell').setAttribute('aria-hidden',String(visible));
  document.body.classList.toggle('session-locked',visible);
  if(visible&&$('detail-dialog').open)$('detail-dialog').close();
 }
 function render(value){
  state={...value,servers:value.servers||[]};
  $('ta-message').textContent=state.message||'';$('ta-error').textContent=state.error||'';$('ta-error').hidden=!state.error;
  $('ta-summary').textContent=state.authenticated?'查询账号已登录':'扫码登录';
  const current=$('ta-category').value,categories=[...new Set(state.servers.map(s=>s.category))];$('ta-category').replaceChildren(option('','全部分类'),...categories.map(s=>option(s,s)));$('ta-category').value=categories.includes(current)?current:'';
  renderServers();
  $('ta-load').disabled=!api||state.busy;$('ta-load').textContent=state.servers.some(s=>s.available)?'刷新服务器':'加载服务器';
  $('ta-qr').disabled=!api||state.busy;$('ta-qr').textContent=state.qr_image?'刷新二维码':state.authenticated?'切换登录账号':'获取登录二维码';
  $('ta-refresh-roles').disabled=state.busy||!state.authenticated;$('ta-logout').disabled=!api;
  $('ta-logout').textContent=state.authenticated?'退出登录':'取消登录';
  $('ta-enter').hidden=!state.authenticated;$('ta-enter').disabled=state.busy&&!unlocked;
  $('ta-qr-image').hidden=!state.qr_image;
  if(state.qr_image)$('ta-qr-image').src=state.qr_image;else $('ta-qr-image').removeAttribute('src');
  $('ta-qr-placeholder').hidden=!!state.qr_image;
  $('ta-qr-placeholder').textContent=!api?'扫码登录请使用 Windows 安装版':state.authenticated?'已通过网易账号认证':state.busy?'正在准备，请稍候…':state.stage==='qr_expired'?'二维码已过期，请重新获取':'获取二维码后，用阴阳师手游扫码';
  $('ta-query-tip').textContent=state.authenticated?'可在下方选择查询角色。登录账号与导入的库存账号无需一致。':'请用阴阳师手游内「扫码登录」，在手机确认后自动进入。';
  const next=state.authenticated===true&&(unlocked||!state.busy),changed=next!==unlocked;
  unlocked=next;if(!unlocked)managing=false;showScreen();
  if(changed)window.dispatchEvent(new CustomEvent('atlas-session',{detail:{authenticated:unlocked}}));
 }
 async function action(name,params){
  if(!api)throw new Error('扫码登录请使用 Windows 安装版');
  const result=await api.action(name,params);render(result);return result;
 }
 async function loadCatalog(){
  if(!api)throw new Error('扫码登录请使用 Windows 安装版');
  if(!state.servers.some(s=>s.available)&&!state.busy){pending??=action('init').finally(()=>pending=null);await pending;}
 }
 function manage(){managing=unlocked;$('ta-server-settings').open=true;showScreen();if(unlocked)$('ta-enter').focus();}
 async function ensure(){manage();await loadCatalog();}
 async function beginQR(){await loadCatalog();await action('qr');}
 async function query(code){
  if(!/^\|TA\|[a-fA-F0-9]{32}$/.test(code))throw new Error('请输入完整的 |TA| 文字码（后接32位分享键）');
  if(!unlocked||!state.selected_avatar){await ensure();throw new Error('请先扫码登录并选择已有角色，然后返回阵容码查看重试');}
  return api.query(code);
 }
 const handle=fn=>async()=>{try{await fn();}catch(e){$('ta-error').textContent=e.message;$('ta-error').hidden=false;}};
 $('ta-load').onclick=handle(()=>action('init'));
 $('ta-qr').onclick=handle(beginQR);
 $('ta-refresh-roles').onclick=handle(()=>action('roles'));
 $('ta-logout').onclick=handle(async()=>{render(await api.logout());});
 $('open-login').onclick=manage;
 $('ta-enter').onclick=()=>{if(unlocked){managing=false;showScreen();}};
 $('ta-server').onchange=handle(()=>{const sid=$('ta-server').value,server=state.servers.find(s=>s.id===sid);if(server)return action('select',{server_id:sid,avatar_id:server.roles[0]?.avatar_id||''});});
 $('ta-role').onchange=handle(()=>action('select',{server_id:state.selected_server,avatar_id:$('ta-role').value}));
 $('ta-server-search').oninput=renderServers;$('ta-category').onchange=renderServers;$('ta-only-roles').onchange=renderServers;
 async function start(){
  if(!api){render({...state,message:'扫码登录请使用 Windows 安装版'});return;}
  api.onStatus(render);render(await api.status());
  if(!state.authenticated)await beginQR();
 }
 window.addEventListener('atlas-ready',()=>render(state));
 const started=start().catch(error=>{render({...state,error:error.message});});
 window.TALogin=Object.freeze({query,ensure,status:()=>structuredClone(state),ready:()=>started});
})();
