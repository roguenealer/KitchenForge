const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = ['index.html','photo-scan.js','photo-ui.js','manifest.json','sw.js','icon-192.png','icon-512.png'];
for (const file of assets.filter(file => !file.endsWith('.png'))) {
  const source = path.join(root,file);
  fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace(/\r\n/g,'\n'));
}
for (const platform of ['android/app/src/main/assets/www','ios/KitchenForge/www']) {
  fs.mkdirSync(path.join(root,platform),{recursive:true});
  for (const file of assets) fs.copyFileSync(path.join(root,file),path.join(root,platform,file));
}
console.log('Synced web assets to Android and iOS.');
