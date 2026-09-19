importScripts('solver.js','core.js','exact-solver.js');
let tasks=[],paused=false,running=false,results={},generation=0,batch=0,ids=new Set(),completed=new Set();
function tick(token){
 if(token!==generation)return;
 if(paused){running=false;return;}
 if(!tasks.length){running=false;postMessage({done:true,batch,total:ids.size,completed:completed.size});return;}
 const task=tasks.shift();
 try{
  const step=task.iterator.next();
  if(step.value){
   results[task.id]={...step.value,completed:step.done};
   const now=Date.now(),improved=task.assignment!==step.value.assignment;
   if(step.done)completed.add(task.id);
   if(step.done||!task.postedAt||improved||now-task.postedAt>=150){
    postMessage({id:task.id,version:task.version,result:results[task.id],total:ids.size,completed:completed.size});task.postedAt=now;task.assignment=step.value.assignment;
   }
  }
  if(!step.done)tasks.push(task);
 }catch(error){
  const previous=results[task.id]||{members:[],checks:[],reasons:[]};
  results[task.id]={...previous,completed:true,status:'unknown',gapCategory:'unknown',label:'精算异常 · 请重试',proof:{...previous.proof,state:'error'},reasons:[...previous.reasons,error.message]};
  completed.add(task.id);postMessage({id:task.id,version:task.version,result:results[task.id],error:error.message,total:ids.size,completed:completed.size});
 }
 setTimeout(()=>tick(token),0);
}
onmessage=({data})=>{
 if(data.action==='pause'){paused=true;postMessage({paused:true});return;}
 if(data.action==='resume'){paused=false;if(!running){running=true;tick(generation);}return;}
 batch=data.batch;
 if(data.action!=='replace'){generation++;tasks=[];results={};ids=new Set();completed=new Set();running=false;}
 const incoming=new Set(data.lineups.map(l=>l.id));tasks=tasks.filter(t=>!incoming.has(t.id));
 for(const lineup of data.lineups){
  ids.add(lineup.id);completed.delete(lineup.id);delete results[lineup.id];
  tasks.push({id:lineup.id,version:data.versions?.[lineup.id],iterator:AtlasExact.search(lineup,data.account,data.roster,data.effects)});
 }
 paused=false;if(!running){running=true;tick(generation);}
};
