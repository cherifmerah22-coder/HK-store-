const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!match)throw new Error('Inline application script not found');
new vm.Script(match[1],{filename:'index.html:inline-script'});
new vm.Script(fs.readFileSync('server/lan-server.cjs','utf8'),{filename:'server/lan-server.cjs'});
new vm.Script(fs.readFileSync('electron/main.cjs','utf8'),{filename:'electron/main.cjs'});
console.log('HK STORE JavaScript syntax checks passed.');

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const idSet=new Set(ids);
const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
if(duplicates.length)throw new Error('Duplicate HTML IDs: '+[...new Set(duplicates)].join(', '));
const referencedIds=[...html.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);
const missingIds=[...new Set(referencedIds.filter(id=>!idSet.has(id)))];
if(missingIds.length)throw new Error('Missing DOM IDs: '+missingIds.join(', '));

const declaredFunctions=new Set([...match[1].matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
const handlers=[...html.matchAll(/onclick="([^"]+)"/gi)].map(m=>m[1]);
const calledFunctions=new Set(handlers.map(h=>h.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1]).filter(Boolean));
const missingHandlers=[...calledFunctions].filter(name=>!declaredFunctions.has(name)&&!['alert','confirm'].includes(name));
if(missingHandlers.length)throw new Error('Missing inline handlers: '+missingHandlers.join(', '));

const sectionIds=new Set([...html.matchAll(/<section\b[^>]*id="([^"]+)"/g)].map(m=>m[1]));
const navPages=new Set([...html.matchAll(/data-page="([^"]+)"/g)].map(m=>m[1]));
const missingPages=[...navPages].filter(page=>!sectionIds.has(page));
if(missingPages.length)throw new Error('Navigation targets missing sections: '+missingPages.join(', '));
console.log('HK STORE UI consistency checks passed: '+idSet.size+' IDs, '+handlers.length+' inline handlers, '+navPages.size+' navigation targets.');
