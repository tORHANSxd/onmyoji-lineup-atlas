(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasQR=api;})(globalThis,function(){
'use strict';
// Scan the whole image plus overlapping square regions for long guide images.
// Mask each located QR so several codes in one region remain discoverable.
async function scan(data,width,height,decode,{active=()=>true,yieldTask=()=>new Promise(r=>setTimeout(r,0))}={}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>24000000||data.length!==width*height*4)throw Error('二维码图片尺寸无效或超过 2400 万像素');
 const regions=[[0,0,width,height]],side=Math.min(Math.max(width,height),Math.max(Math.min(width,height),512)),step=Math.max(1,Math.floor(side*.7));
 let regionsLimited=false;
 if(width>side||height>side){tiles:for(let y=0;;y=Math.min(y+step,height-side)){for(let x=0;;x=Math.min(x+step,width-side)){if(regions.length>=84){regionsLimited=true;break tiles;}regions.push([Math.max(0,x),Math.max(0,y),Math.min(side,width),Math.min(side,height)]);if(x+side>=width)break;}if(y+side>=height)break;}}
 if(height>width*1.5)for(const n of [2,3,4])for(let i=0;i<n;i++){const top=Math.floor(height*i/n);regions.push([0,top,width,Math.floor(height*(i+1)/n)-top]);}
 if(width>height*1.5)for(const n of [2,3,4])for(let i=0;i<n;i++){const left=Math.floor(width*i/n);regions.push([left,0,Math.floor(width*(i+1)/n)-left,height]);}
 const found=new Set();let attempts=0,truncated=false;
 for(const [left,top,w,h]of regions){
  if(!active())return {codes:[],cancelled:true};
  const scale=Math.min(1,1800/Math.max(w,h)),rw=Math.max(1,Math.round(w*scale)),rh=Math.max(1,Math.round(h*scale)),pixels=new Uint8ClampedArray(rw*rh*4);
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){const source=((top+Math.min(h-1,Math.floor(y/scale)))*width+left+Math.min(w-1,Math.floor(x/scale)))*4,target=(y*rw+x)*4;pixels[target]=data[source];pixels[target+1]=data[source+1];pixels[target+2]=data[source+2];pixels[target+3]=255;}
  for(let n=0;n<12;n++){
   if(++attempts>96||found.size>=30){truncated=true;break;}
   const result=decode(pixels,rw,rh,{inversionAttempts:'attemptBoth'});if(!result)break;
   found.add(result.data);
   const corners=['topLeftCorner','topRightCorner','bottomLeftCorner','bottomRightCorner'].map(k=>result.location[k]);
   const x0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x)))-3),x1=Math.min(rw,Math.ceil(Math.max(...corners.map(p=>p.x)))+4),y0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y)))-3),y1=Math.min(rh,Math.ceil(Math.max(...corners.map(p=>p.y)))+4);
   for(let y=y0;y<y1;y++)pixels.fill(255,(y*rw+x0)*4,(y*rw+x1)*4);
   await yieldTask();if(!active())return {codes:[],cancelled:true};
  }
  if(truncated)break;await yieldTask();
 }
 return {codes:[...found],truncated:truncated||regionsLimited};
}
return {scan};
});
