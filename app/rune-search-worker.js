importScripts('solver.js','core.js','rune-openings.js','game-config.js','rune-search.js');

onmessage=({data:{account,gameConfig,roster,effects,alternatives,dungeonId,pveMemberCount,pveOpeningSpeed}})=>{
 try{
  const catalog={gameConfig,roster,effects};
  const candidates=pveMemberCount?AtlasRuneSearch.pveCandidates(account,catalog,pveMemberCount,alternatives,pveOpeningSpeed):
   dungeonId===103?AtlasRuneSearch.hun13Candidates(account,catalog,alternatives):
   AtlasRuneSearch.candidates(account,catalog,alternatives,dungeonId);
  postMessage({candidates});
 }catch(error){
  postMessage({error:error.message});
 }
};
