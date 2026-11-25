importScripts('solver.js','core.js','game-config.js','rune-search.js');

onmessage=({data:{account,gameConfig,roster,effects,alternatives}})=>{
 try{
  postMessage({candidates:AtlasRuneSearch.candidates(account,{gameConfig,roster,effects},alternatives)});
 }catch(error){
  postMessage({error:error.message});
 }
};
