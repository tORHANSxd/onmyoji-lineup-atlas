importScripts('solver.js','core.js','exact-solver.js');
let tasks=[],paused=false,running=false,results={},generation=0,total=0;
function tick(token){
 if(token!==generation)return;
 if(paused||!tasks.length){running=false;return;}
 const task=tasks.shift();
 try{const step=task.iterator.next();if(step.value){results[task.id]=step.value;postMessage({id:task.id,result:step.value,total});}if(!step.done)tasks.push(task);}
  catch(error){const previous=results[task.id]||{members:[],checks:[],reasons:[]};results[task.id]={...previous,status:'unknown',gapCategory:'unknown',label:'精算异常 · 请重试',proof:{...previous.proof,state:'error'},reasons:[...previous.reasons,error.message]};postMessage({id:task.id,result:results[task.id],error:error.message});}
 if(tasks.length)setTimeout(()=>tick(token),0);else{running=false;postMessage({done:true,results});}
}
onmessage=({data})=>{
 if(data.action==='pause'){paused=true;postMessage({paused:true});return;}
 if(data.action==='resume'){paused=false;if(!running&&tasks.length){running=true;tick(generation);}return;}
 if(data.action==='replace'){
  const ids=new Set(data.lineups.map(l=>l.id));tasks=tasks.filter(t=>!ids.has(t.id));
  for(const lineup of data.lineups){delete results[lineup.id];tasks.push({id:lineup.id,iterator:AtlasExact.search(lineup,data.account,data.roster,data.effects)});}
  paused=false;if(!running&&tasks.length){running=true;tick(generation);}return;
 }
 generation++;paused=false;results={};total=data.lineups.length;tasks=data.lineups.map(lineup=>({id:lineup.id,iterator:AtlasExact.search(lineup,data.account,data.roster,data.effects)}));running=true;tick(generation);
};
