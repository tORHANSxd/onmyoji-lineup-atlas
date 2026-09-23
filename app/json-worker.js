'use strict';
self.onmessage=({data:{action,value}})=>{
 try{self.postMessage({value:action==='parse'?JSON.parse(value):JSON.stringify(value,null,action==='pretty'?2:0)});}
 catch(error){self.postMessage({error:error.message});}
};
