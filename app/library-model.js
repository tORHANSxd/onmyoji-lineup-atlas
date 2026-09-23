(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasLibrary=api;})(globalThis,function(){
'use strict';
const sorts=[['original','资料原有顺序'],['title','名称'],['dungeon','副本用途'],['updated','最近修改'],['recent','最近添加'],['parsed','最近解析'],['status','解析状态'],['source','资料来源'],['members','成员数量']];
const parsed=l=>Array.isArray(l.members)&&l.members.length>0;
function sort(rows,key,compare){
 const value=(l,k)=>k==='title'?l.title:k==='dungeon'?[l.category,l.subcategory,l.section,l.dungeon].filter(Boolean).join(' / '):k==='source'?(l.sourceKind||'user'):k==='status'?(l.lastParseFailure?'0':parsed(l)?'2':'1'):'';
 const time=(l,k)=>Date.parse(k==='updated'?(l.updatedAt||l.createdAt||l.date):k==='parsed'?l.parsedAt:(l.createdAt||l.date))||0;
 return rows.map((l,i)=>({l,i})).sort((a,b)=>{
  let n=key==='closest'&&compare?compare(a.l,b.l):['recent','updated','parsed'].includes(key)?time(b.l,key)-time(a.l,key):key==='members'?(b.l.members?.length||0)-(a.l.members?.length||0):key==='original'?0:String(value(a.l,key)||'').localeCompare(String(value(b.l,key)||''),'zh-CN',{numeric:true});return n||a.i-b.i;
 }).map(x=>x.l);
}
function reset(state){return {...state,lineups:[],deletedPresetIds:[],lineupReplacements:{},targetLineups:{},builderDraft:null};}
function paths(value){
 if(!Array.isArray(value)||value.length>100)throw Error('适用副本最多选择 100 项');
 return [...new Map(value.map(p=>{
  if(!p||['category','subcategory','dungeon'].some(k=>typeof p[k]!=='string'||!p[k].trim()||p[k].length>200)||p.section!=null&&(typeof p.section!=='string'||p.section.length>200))throw Error('适用副本路径不完整');
  const row={category:p.category.trim(),subcategory:p.subcategory.trim(),...(p.section?{section:p.section.trim()}:{}),dungeon:p.dungeon.trim(),...(p.extended?{extended:true}:{}),...(Number.isSafeInteger(p.gameSceneId)?{gameSceneId:p.gameSceneId}:{})};return [JSON.stringify(row),row];
 })).values()];
}
return {sorts,sort,reset,paths};
});
