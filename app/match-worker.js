importScripts('solver.js','core.js');
self.onmessage=({data})=>{
  try{
    const {lineups,account,roster,effects,options={}}=data,results={},cache=new Map(),inventory=Object.values(account.souls);
    for(let n=0;n<lineups.length;n++){
      const result=AtlasCore.matchLineup(lineups[n],account,roster,effects,{...options,cache,inventory});
      for(const member of result.members){member.candidateCount=member.builds?.length||0;member.builds=member.builds?.slice(0,3)||[];}
      results[lineups[n].id]=result;
      self.postMessage({progress:n+1,total:lineups.length,id:lineups[n].id,result});
    }
    self.postMessage({done:true,results});
  }catch(error){self.postMessage({error:error.message});}
};
