importScripts('solver.js','core.js','rune-openings.js','game-config.js','rune-search.js');

onmessage=({data:{account,gameConfig,roster,effects,alternatives,dungeonId}})=>{
 try{
  postMessage({candidates:AtlasRuneSearch.candidates(account,{gameConfig,roster,effects},alternatives,dungeonId)});
 }catch(error){
  postMessage({error:error.message});
 }
};
