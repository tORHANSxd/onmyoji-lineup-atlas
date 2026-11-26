'use strict';

(() => {
 let current=null,uploading=null;
 const outcomes=new WeakMap();
 const canUpload=state=>state?.authenticated===true&&state.risk_accepted===true&&state.query_ready!==false&&
  !!state.selected_avatar&&Number.isSafeInteger(state.share_epoch);
 const asShortCode=code=>typeof code==='string'&&C.classifyCode(code)==='pipe-ta'?code:'';

 function verifiedRows(entries){
  const unique=new Map();
  for(const entry of entries){
   if(!entry.valid()||!C.hasLineupCode(entry.output)||unique.has(entry.output.code))continue;
   const {output}=entry;
   output.shortCode=asShortCode(output.shortCode)||asShortCode(STATE.lineups.find(lineup=>lineup.code===output.code)?.shortCode);
   if(!outcomes.has(output))outcomes.set(output,{error:'',warning:'',pending:false});
   unique.set(output.code,{...entry,result:outcomes.get(output)});
  }
  return [...unique.values()];
 }

 async function uploadCodes(rows,{epoch,active,notice,view=null}){
  const choices=rows.filter(row=>row.valid()&&!row.output.shortCode);
  if(!choices.length||!active())return;
  if(uploading){notice('已有一批正在上传，剩余完整码可在批量列表重试。');return;}
  const task=uploading={view,outputs:new Set(choices.map(row=>row.output)),stopped:false};
  const valid=()=>active()&&!task.stopped;
  const show=text=>{if(active())notice(text);current?.refresh();};
  let done=0,failed=0,interrupted=false;
  show('正在核对登录角色…');
  try{
   for(const [i,row] of choices.entries()){
    if(!valid())break;
    if(!row.valid()){row.result.error='复跑结果已变化';failed++;continue;}
    if(row.output.shortCode){done++;continue;}
    const latest=await window.taLogin.status();
    if(!canUpload(latest)||latest.share_epoch!==epoch){interrupted=true;break;}
    if(!valid()||!row.valid())break;
    row.result.pending=true;row.result.error='';row.result.warning='';
    show(`正在上传第 ${i+1} / ${choices.length} 条…`);
    try{
     const result=await window.taLogin.share(row.output.code,epoch);
     const short=asShortCode(result?.code);
     if(!short)throw Error('官方响应缺少有效短码');
     row.output.shortCode=short;row.result.warning=result.warning||'';done++;
     await saveCandidateCodes([row.output],{create:false});
    }catch(error){row.result.error=runeError(error);failed++;}
    finally{row.result.pending=false;current?.refresh();}
   }
   show((interrupted?'登录角色发生变化，上传已停止。':task.stopped?'已停止后续上传。':'')+
    `本次就绪 ${done} 条${failed?`，${failed} 条失败`:''}。${done<choices.length?'已就绪的短码保留。可重试未取得短码的项。':''}`);
  }catch(error){show(runeError(error));}
  finally{uploading=null;current?.refresh();}
 }

 function configure(control,{available,disabled}){
  const visible=available&&canUpload(TALogin.status());
  control.closest('label').hidden=!visible;
  control.disabled=!visible||disabled;
  if(!visible)control.checked=false;
 }

 function takeIntent(control){
  const state=TALogin.status();
  const epoch=control.checked&&!control.disabled&&canUpload(state)?state.share_epoch:null;
  control.checked=false;
  return epoch;
 }

 function automatic(entries,epoch,active,notice){
  if(epoch===null||epoch===undefined)return;
  return uploadCodes(verifiedRows(entries),{epoch,active,notice});
 }

 function open(entries){
  if(runeBusy())return;
  const rows=verifiedRows(entries);
  if(!rows.length)return;
  currentDialog=null;
  openDialog('备选阵容码',`${rows.length} 条 · 勾选要复制、上传或保存的阵容码`,
   `<section data-candidate-batch>
     <div class="actions">
      <label class="candidate-auto-share"><input type="checkbox" data-batch-pick-all> 全选</label>
      <button type="button" class="primary" data-batch-save>保存所选到阵容库</button>
      <button type="button" class="secondary" data-batch-copy>复制所选完整码</button>
      <button type="button" class="secondary" data-batch-copy-short>复制已生成的所选短码</button>
      <button type="button" class="secondary" data-batch-upload>上传所选官方短码</button>
      <button type="button" class="secondary" data-batch-stop hidden>停止后续上传</button>
     </div>
     <p class="caption" data-batch-auth></p><p class="caption" data-batch-status role="status"></p>
     <ul class="candidate-code-list">${rows.map(({output,title},i)=>`<li>
      <label><input type="checkbox" data-batch-pick="${i}" checked> ${esc(title||output.lineup.title)}</label>
      <p class="caption" data-batch-row-status></p><code class="mono" data-batch-short hidden></code>
      <div class="actions"><button type="button" class="secondary" data-batch-row-copy>复制完整码</button>
       <button type="button" class="secondary" data-batch-row-copy-short hidden>复制短码</button></div>
      <details><summary>查看完整阵容码</summary><textarea rows="2" readonly aria-label="第 ${i+1} 条完整阵容码">${esc(output.code)}</textarea></details>
     </li>`).join('')}</ul>
    </section>`);
  const root=document.querySelector('[data-candidate-batch]'),find=name=>root.querySelector(`[data-batch-${name}]`);
  const status=find('status'),save=find('save'),upload=find('upload'),stop=find('stop'),copy=find('copy'),copyShort=find('copy-short');
  const auth=find('auth'),pickAll=find('pick-all');
  const items=rows.map((row,i)=>{
   const pick=root.querySelector(`[data-batch-pick="${i}"]`),item=pick.closest('li');
   const note=item.querySelector('[data-batch-row-status]'),short=item.querySelector('[data-batch-short]');
   const fullButton=item.querySelector('[data-batch-row-copy]'),shortButton=item.querySelector('[data-batch-row-copy-short]');
   fullButton.onclick=()=>copySelected(fullButton,[row.output.code],'完整码');
   shortButton.onclick=()=>copySelected(shortButton,[row.output.shortCode],'短码');
   pick.onchange=refresh;
   return {row,pick,note,short,shortButton};
  });
  const view={root,refresh};
  current=view;
  const active=()=>current===view&&root.isConnected&&$('detail-dialog').open;
  const selected=()=>items.filter(({pick,row})=>pick.checked&&row.valid()).map(({row})=>row);
  const ownsUpload=()=>!!uploading&&(uploading.view===view||!uploading.view&&rows.some(row=>uploading.outputs.has(row.output)));
  let saving=false;

  function refresh(){
   if(!active())return;
   const pending=ownsUpload(),choices=selected(),online=canUpload(TALogin.status());
   const available=rows.filter(row=>row.valid()).length;
   pickAll.checked=available>0&&choices.length===available;
   pickAll.indeterminate=choices.length>0&&!pickAll.checked;
   pickAll.disabled=saving||pending||!available;
   for(const {row,pick,note,short,shortButton} of items){
    const code=asShortCode(row.output.shortCode),usable=row.valid();
    pick.disabled=!usable||saving||pending;
    short.hidden=!code;shortButton.hidden=!code;short.textContent=code;
    const {pending:sharing,error,warning}=row.result;
    note.textContent=!usable?'复跑结果已变化':sharing?'正在上传并核对…':code?warning||'官方短码已就绪':error||'完整码已就绪';
   }
   save.disabled=saving||pending||!choices.length;
   upload.disabled=saving||!!uploading||!online||!choices.some(row=>!row.output.shortCode);
   stop.hidden=!pending;
   stop.disabled=uploading?.stopped===true;
   if(copy.dataset.copyState!=='copying')copy.disabled=!choices.length;
   if(copyShort.dataset.copyState!=='copying')copyShort.disabled=!choices.some(row=>row.output.shortCode);
   auth.textContent=online?'':'登录并选角后可上传官方短码。';
  }

  async function copySelected(button,codes,label){
   codes=codes.filter(Boolean);
   if(!codes.length)return;
   await copyCode(button,codes.join('\n'),`已复制 ${codes.length} 条${label}`);
   button.textContent=button.dataset.copyLabel;
   refresh();
  }
  pickAll.onchange=()=>{
   for(const {pick,row} of items)if(row.valid())pick.checked=pickAll.checked;
   refresh();
  };
  copy.onclick=()=>copySelected(copy,selected().map(row=>row.output.code),'完整码');
  copyShort.onclick=()=>copySelected(copyShort,selected().map(row=>row.output.shortCode),'短码');
  save.onclick=async()=>{
   const choices=selected();
   if(!active()||saving||!choices.length)return;
   saving=true;refresh();
   try{
    const saved=await saveCandidateCodes(choices.map(row=>row.output),{valid:()=>active()&&choices.every(row=>row.valid())});
    if(active())status.textContent=saved?`已保存 ${choices.length} 条阵容码。`:'保存未完成，请重试。';
   }finally{saving=false;refresh();}
  };

  stop.onclick=()=>{
   if(!ownsUpload())return;
   uploading.stopped=true;
   status.textContent='正在等待当前一条完成，后续阵容会保留待上传。';
   refresh();
  };

  upload.onclick=()=>{
   const initial=TALogin.status();
   if(!active()||saving||uploading||!canUpload(initial))return;
   return uploadCodes(selected(),{epoch:initial.share_epoch,active,view,notice:text=>{status.textContent=text;}});
  };
  refresh();
 }

 window.addEventListener('atlas-login-status',()=>{current?.refresh();if(DATA)renderDungeonSelection();});
 $('detail-dialog').addEventListener('close',()=>{if(!$('detail-dialog').open)current=null;});
 window.AtlasCandidateBatch={open,configure,takeIntent,automatic};
})();
