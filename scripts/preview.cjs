const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const allowed = new Set(['index.html','photo-scan.js','photo-ui.js','manifest.json','sw.js','icon-192.png','icon-512.png','privacy-policy.html']);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png'};
http.createServer((req,res) => {
  const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(name)) {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store'});
  fs.createReadStream(path.join(root,name)).pipe(res);
}).listen(4188,'127.0.0.1',() => console.log('KitchenForge preview: http://127.0.0.1:4188'));
