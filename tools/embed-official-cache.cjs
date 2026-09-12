// Build-time only: embed verified public resources from an explicit QA cache.
const fs=require('node:fs');
const path=require('node:path');
const {validFile}=require('../desktop/official-data.cjs');
const root=path.resolve(process.argv[2]||'release/qa-userdata-v020/official-cache');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
if(manifest.schemaVersion!==1||!Array.isArray(manifest.actors)||manifest.actors.length!==4)throw new Error('Expected four verified protagonists');
const actors=structuredClone(manifest.actors);
for(const actor of actors){
 if(!/^[a-z]+$/.test(actor.id))throw new Error('Invalid actor path');
 for(const image of actor.assets.variants){
  if(image.status!=='downloaded_valid_image'||!validFile(image.cacheFile)||!['art-before','portrait-before'].includes(image.family))throw new Error('Unverified actor image');
  const target=`data/images/actors/${actor.id}/${image.family}.${image.format==='jpg'?'jpg':'png'}`;
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,'images',image.cacheFile),target);image.localPath=target;delete image.cacheFile;
 }
}
fs.writeFileSync('data/actors.json',JSON.stringify(actors,null,2));
fs.writeFileSync('data/official-news.json',JSON.stringify(manifest.news,null,2));
fs.writeFileSync('verification/official-update-report.json',JSON.stringify({checkedAt:manifest.checkedAt,completedAt:manifest.completedAt,report:manifest.report,coverage:manifest.coverage,actors:actors.map(a=>({name:a.name,source:a.sourceLabel,images:a.assets.variants.map(i=>({family:i.family,width:i.width,height:i.height,sha256:i.sha256}))}))},null,2));
console.log(JSON.stringify({actors:actors.length,images:actors.flatMap(a=>a.assets.variants).length,announcements:manifest.news.length}));
