const {test}=require('node:test'),assert=require('node:assert/strict');
const QRCode=require('qrcode'),jsQR=require('jsqr'),{scan}=require('../app/qr-reader.js'),codec=require('../desktop/ta-codec.cjs');
const {PNG}=require('pngjs'),samples=require('./fixtures/public-qr-samples.json');
test('public creator QR payloads decode and re-encode without losing requirements',()=>{
 assert.equal(samples.samples.length,3);
 for(const sample of samples.samples){
  const decoded=codec.decodeLineupData(sample.code);
  assert.equal(decoded.title,sample.title);assert.equal(decoded.hconf.length,sample.members);
  const roundtrip=codec.decodeLineupData(codec.encodeLineupData(decoded));
  const requirements=decoded.hconf.map(({uid,...h})=>h);
  assert.deepEqual(roundtrip.hconf,requirements);
  assert.ok(!Object.hasOwn(decoded,'share_key'));
 }
});
test('multiple stacked QR images are discovered once and cancelled scans stop',async()=>{
 const codes=samples.samples.map(s=>s.code),images=await Promise.all(codes.map(async code=>PNG.sync.read(await QRCode.toBuffer(code,{scale:4,margin:5}))));
 const width=Math.max(...images.map(i=>i.width))+160,height=images.reduce((s,i)=>s+i.height+160,0),data=new Uint8ClampedArray(width*height*4).fill(255);
 let y=80;for(const im of images){for(let row=0;row<im.height;row++)data.set(im.data.subarray(row*im.width*4,(row+1)*im.width*4),((y+row)*width+80)*4);y+=im.height+160;}
 const result=await scan(data,width,height,jsQR);assert.deepEqual(new Set(result.codes),new Set(codes));assert.equal(result.truncated,false);
 assert.equal((await scan(data,width,height,jsQR,{active:()=>false})).cancelled,true);
});

test('extreme image aspect ratios have bounded scanning work and expose truncation',async()=>{
 const width=1,height=50000,data=new Uint8ClampedArray(height*4);let attempts=0;
 const result=await scan(data,width,height,()=>{attempts++;return null;},{yieldTask:async()=>{}});
 assert.equal(result.truncated,true);assert.ok(attempts<=96);assert.deepEqual(result.codes,[]);
});

test('cancelled QR replies cannot replace a newer input before the polling tick',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync(require('node:path').join(__dirname,'../app/app.js'),'utf8');
 const start=source.indexOf('function scanQRImage('),end=source.indexOf('async function importTAFiles',start);let task,active=true;
 class FakeWorker{constructor(){task=this;}postMessage(){}terminate(){this.closed=true;}}
 const context={Worker:FakeWorker,setInterval,clearInterval,setTimeout,clearTimeout,Error};vm.runInNewContext(source.slice(start,end),context);
 const result=context.scanQRImage({},()=>active);active=false;task.onmessage({data:{result:{codes:['old-code']}}});const value=await result;assert.equal(value.cancelled,true);assert.equal(value.codes.length,0);assert.equal(task.closed,true);
});
