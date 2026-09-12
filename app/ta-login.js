'use strict';
(function(){
 const $=id=>document.getElementById(id),api=window.taLogin;
 let state={servers:[],authenticated:false,busy:false},pending=null;
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
  select.disabled=state.busy||!rows.length;
  $('ta-server-count').textContent=`${rows.length} / ${state.servers.length} 个服务器`;
  const server=state.servers.find(s=>s.id===state.selected_server),roles=$('ta-role');roles.replaceChildren(option('','选择已有角色'));
  for(const r of server?.roles||[])roles.append(option(r.avatar_id,r.name+(r.level!=null?' · Lv.'+r.level:'')));
  roles.value=state.selected_avatar||'';roles.disabled=state.busy||!state.authenticated||!server?.roles.length;
  $('ta-selected').textContent=server?'当前服务器：'+server.name+(state.authenticated&&!server.roles.length?' · 此服尚无可选角色':''):'';
 }
 function render(value){
  state={...value,servers:value.servers||[]};
  $('ta-message').textContent=state.message||'';$('ta-error').textContent=state.error||'';$('ta-error').hidden=!state.error;
  $('ta-summary').textContent=state.authenticated?'已登录 · 联网查询账号':'扫码登录 · 查询文字阵容码';
  const current=$('ta-category').value,categories=[...new Set(state.servers.map(s=>s.category))];$('ta-category').replaceChildren(option('','全部分类'),...categories.map(s=>option(s,s)));$('ta-category').value=categories.includes(current)?current:'';
  renderServers();
  $('ta-load').disabled=state.busy;$('ta-load').textContent=state.servers.some(s=>s.available)?'刷新服务器':'加载服务器';
  $('ta-qr').disabled=state.busy||!state.servers.some(s=>s.id===state.selected_server&&s.available);$('ta-qr').textContent=state.qr_image?'刷新二维码':state.authenticated?'切换登录账号':'获取登录二维码';
  $('ta-refresh-roles').disabled=state.busy||!state.authenticated;$('ta-logout').disabled=!api;
  $('ta-qr-image').hidden=!state.qr_image;
  if(state.qr_image){const fresh=$('ta-qr-image').getAttribute('src')!==state.qr_image;$('ta-qr-image').src=state.qr_image;if(fresh)$('ta-qr-image').scrollIntoView({block:'nearest'});}else $('ta-qr-image').removeAttribute('src');
  $('ta-query-tip').textContent=state.authenticated?'选择已有角色后，点击上方“解析阵容码”。结果可保存为离线资料。':'网易账号登录；请用手游内“扫码登录”，在手机确认。重启软件需要重新扫码。';
 }
 async function action(name,params){
  if(!api)throw new Error('联网查询请使用 Windows 安装版');
  const result=await api.action(name,params);render(result);return result;
 }
 async function ensure(){
  $('ta-login-panel').open=true;
  if(!api)throw new Error('联网查询请使用 Windows 安装版');
  if(!state.servers.some(s=>s.available)&&!state.busy){pending??=action('init').finally(()=>pending=null);await pending;}
 }
 async function query(code){
  if(!/^\|TA\|[a-fA-F0-9]{32}$/.test(code))throw new Error('请输入完整的 |TA| 文字码（后接32位分享键）');
  if(!state.authenticated||!state.selected_avatar){await ensure();$('ta-login-panel').scrollIntoView({block:'nearest',behavior:'smooth'});throw new Error('请先在下方扫码登录并选择已有角色，然后再次点击解析');}
  return api.query(code);
 }
 const handle=fn=>async()=>{try{await fn();}catch(e){$('ta-error').textContent=e.message;$('ta-error').hidden=false;}};
 $('ta-load').onclick=handle(()=>action('init'));
 $('ta-qr').onclick=handle(()=>action('qr'));
 $('ta-refresh-roles').onclick=handle(()=>action('roles'));
 $('ta-logout').onclick=handle(async()=>{render(await api.logout());});
 $('ta-server').onchange=handle(()=>{const sid=$('ta-server').value,server=state.servers.find(s=>s.id===sid);if(server)return action('select',{server_id:sid,avatar_id:server.roles[0]?.avatar_id||''});});
 $('ta-role').onchange=handle(()=>action('select',{server_id:state.selected_server,avatar_id:$('ta-role').value}));
 $('ta-server-search').oninput=renderServers;$('ta-category').onchange=renderServers;$('ta-only-roles').onchange=renderServers;
 if(api){api.onStatus(render);api.status().then(render).catch(()=>{});}else render({...state,message:'联网查询请使用 Windows 安装版'});
 window.addEventListener('atlas-ready',()=>render(state));
 window.TALogin=Object.freeze({query,ensure,status:()=>structuredClone(state)});
})();
