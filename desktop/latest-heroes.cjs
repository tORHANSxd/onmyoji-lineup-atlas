'use strict';

const entries=require('../data/latest-heroes.json');

function applyLatestHeroes(data){
 const updated=new Map(data.roster.map(row=>[row.id,row]));
 for(const row of entries.roster)updated.set(row.id,{...updated.get(row.id),...row});
 const gameConfig={...data.gameConfig};
 for(const key of ['heroes','skills','terms','icons'])gameConfig[key]={...gameConfig[key],...entries[key]};
 return {...data,roster:[...updated.values()],gameConfig};
}

module.exports={applyLatestHeroes};
