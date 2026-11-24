'use strict';
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const checks=[
 ['addProduct','db.users[current]?.role!==\'manager\''],
 ['addCustomer',"!['manager','seller'].includes(db.users[current]?.role)"],
 ['payDebt',"!['manager','seller'].includes(db.users[current]?.role)"],
 ['setRepairStatus',"!['manager','tech'].includes(db.users[current]?.role)"],
 ['addPart',"!['manager','tech'].includes(db.users[current]?.role)"],
 ['usePart',"!['manager','tech'].includes(db.users[current]?.role)"],
 ['addWorker',"db.users[current]?.role!=='manager'"],
 ['backup',"db.users[current]?.role!=='manager'"],
 ['restore',"db.users[current]?.role!=='manager'"],
 ['confirmTopup',"!['manager','seller'].includes(db.users[current]?.role)"],
 ['createUser',"db.users[current]?.role!=='manager'"],
 ['addCustomerOrder',"!['manager','seller'].includes(db.users[current]?.role)"]
];
function body(name){
 const re=new RegExp('function\\s+'+name+'\\s*\\(');
 const m=re.exec(html);if(!m)throw Error('Missing function '+name);
 const start=html.indexOf('{',m.index);let depth=0,quote='',escape=false;
 for(let i=start;i<html.length;i++){
  const ch=html[i];
  if(quote){if(escape)escape=false;else if(ch==='\\\\')escape=true;else if(ch===quote)quote='';continue;}
  if(ch==='"'||ch==="'"||ch==='\x60'){quote=ch;continue;}
  if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return html.slice(start,i+1);
 }
 throw Error('Unclosed function '+name);
}
for(const [name,guard] of checks){if(!body(name).includes(guard))throw Error('Missing role guard in '+name);}
const product=body('addProduct');
if(!product.includes('Number.isInteger(qty)')||!product.includes('buy<0')||!product.includes('sell<0'))throw Error('Product stock/price validation missing');
const part=body('addPart');
if(!part.includes('Number.isInteger(qty)')||!part.includes('cost<0'))throw Error('Repair part validation missing');
console.log('Permission and inventory guard tests passed ('+checks.length+' guarded operations).');
