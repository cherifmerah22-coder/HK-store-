const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!match)throw new Error('Inline application script not found');
new vm.Script(match[1],{filename:'index.html:inline-script'});
new vm.Script(fs.readFileSync('server/lan-server.cjs','utf8'),{filename:'server/lan-server.cjs'});
new vm.Script(fs.readFileSync('electron/main.cjs','utf8'),{filename:'electron/main.cjs'});
console.log('HK STORE JavaScript syntax checks passed.');
