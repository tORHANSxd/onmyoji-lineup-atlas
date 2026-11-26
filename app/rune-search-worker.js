importScripts('solver.js','core.js','rune-openings.js','game-config.js','rune-search.js');

onmessage=({data:{account,gameConfig,roster,effects,alternatives,dungeonId,pveMemberCount,pveOpeningSpeed,pveBattleMode}})=>{
 try{
  const catalog={gameConfig,roster,effects};
  const candidates=pveBattleMode===2001?AtlasRuneSearch.underworldCandidates(account,catalog,alternatives):
   pveMemberCount?AtlasRuneSearch.pveCandidates(account,catalog,pveMemberCount,alternatives,pveOpeningSpeed,pveBattleMode):
   dungeonId===103?AtlasRuneSearch.hun13Candidates(account,catalog,alternatives):
   AtlasRuneSearch.candidates(account,catalog,alternatives,dungeonId);
  postMessage({candidates});
 }catch(error){
  postMessage({error:error.message});
 }
};
