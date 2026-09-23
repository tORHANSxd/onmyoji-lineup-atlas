'use strict';
importScripts('vendor/jsQR.js','qr-reader.js');
self.onmessage=async({data:{bitmap}})=>{
 try{
  if(bitmap.width*bitmap.height>24000000)throw Error('二维码图片像素过大');
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0);bitmap.close();
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  self.postMessage({result:await AtlasQR.scan(pixels.data,canvas.width,canvas.height,jsQR)});
 }catch(error){self.postMessage({error:error.message});}
};
