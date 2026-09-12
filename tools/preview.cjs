const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {decodeInput}=require('../desktop/ta-codec.cjs');
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:4173';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
http.createServer(async(req,res)=>{
 if(req.headers.host!=='127.0.0.1:4173'){res.writeHead(403).end();return;}
 let p;try{p=decodeURIComponent(new URL(req.url,origin).pathname);}catch{res.writeHead(400).end();return;}
 if(p==='/api/decode'&&req.method==='POST'){
  if(req.headers.origin!==origin||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return;}
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32*1024*1024){res.writeHead(413).end();return;}chunks.push(chunk);}const result=decodeInput(JSON.parse(Buffer.concat(chunks).toString('utf8')));res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store'}).end(JSON.stringify(result));}catch{res.writeHead(400).end();}return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 if(p==='/')p='/app/index.html';
 if(!(/^\/app\/[a-zA-Z0-9.-]+$/.test(p)||p==='/app/vendor/jsQR.js'||p==='/data/bundle.json'||/^\/data\/images\/(?:\d+|actors\/[a-z]+)\/[a-z-]+\.(jpg|png)$/.test(p))){res.writeHead(404).end();return;}
 const file=path.join(root,p);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:data);});
}).listen(4173,'127.0.0.1',()=>console.log('Local: '+origin+'/app/index.html'));
