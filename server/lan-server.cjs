'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const DATA_DIR=process.env.HKSTORE_DATA_DIR||path.join(os.homedir(),'HK-STORE-data');
const FILE=path.join(DATA_DIR,'topup-lan.json');
fs.mkdirSync(DATA_DIR,{recursive:true});
let state;
try{state=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch{
 state={tabletKey:crypto.randomBytes(24).toString('hex'),sellerKey:crypto.randomBytes(24).toString('hex'),config:null,requests:[]};
 fs.writeFileSync(FILE,JSON.stringify(state,null,2));
}
function persist(){fs.writeFileSync(FILE+'.tmp',JSON.stringify(state,null,2));fs.renameSync(FILE+'.tmp',FILE)}
function lanAddresses(){const out=[];for(const list of Object.values(os.networkInterfaces()))for(const item of list||[])if(item.family==='IPv4'&&!item.internal)out.push(item.address);return out}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-hk-key','access-control-allow-methods':'GET,POST,OPTIONS','cache-control':'no-store'});res.end(JSON.stringify(obj))}
function read(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>20000)reject(new Error('too large'))});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});req.on('error',reject)})}
function localRequest(req){const a=req.socket.remoteAddress||'';return a==='127.0.0.1'||a==='::1'||a==='::ffff:127.0.0.1'}
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS')return send(res,204,{});
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,service:'HK STORE LAN Top-up'});
 if(url.pathname==='/api/local-info'&&req.method==='GET'){
  if(!localRequest(req))return send(res,403,{error:'local only'});
  return send(res,200,{port:8787,addresses:lanAddresses(),tabletKey:state.tabletKey,sellerKey:state.sellerKey});
 }
 const key=req.headers['x-hk-key'];
 const safeEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
 const seller=safeEqual(key,state.sellerKey);
 const tablet=safeEqual(key,state.tabletKey);
 if(url.pathname==='/api/topup/config'&&req.method==='GET'){
  if(!tablet&&!seller)return send(res,401,{error:'unauthorized'});
  return send(res,200,{config:state.config});
 }
 if(url.pathname==='/api/topup/config'&&req.method==='POST'){
  if(!seller)return send(res,403,{error:'seller key required'});
  const b=await read(req);if(!['Mobilis','Djezzy','Ooredoo'].includes(b.operator)||!Number.isInteger(b.amount)||b.amount<1||b.amount>100000)return send(res,400,{error:'invalid config'});
  state.config={operator:b.operator,amount:b.amount,updatedAt:new Date().toISOString()};persist();return send(res,200,{ok:true,config:state.config});
 }
 if(url.pathname==='/api/topup/request'&&req.method==='POST'){
  if(!tablet)return send(res,403,{error:'tablet key required'});
  const b=await read(req);const phone=String(b.phone||'').replace(/\\s/g,'');
  if(!/^0[567][0-9]{8}$/.test(phone)||!state.config)return send(res,400,{error:'invalid phone or no active topup'});
  const item={id:crypto.randomUUID(),operator:state.config.operator,amount:state.config.amount,phone,status:'بانتظار مراجعة البائع',createdAt:new Date().toISOString()};
  state.requests.unshift(item);state.requests=state.requests.slice(0,500);persist();return send(res,201,{ok:true,request:{id:item.id,status:item.status}});
 }
 if(url.pathname==='/api/topup/requests'&&req.method==='GET'){
  if(!seller)return send(res,403,{error:'seller key required'});
  return send(res,200,{requests:state.requests});
 }
 if(url.pathname.startsWith('/api/topup/confirm/')&&req.method==='POST'){
  if(!seller)return send(res,403,{error:'seller key required'});
  const id=url.pathname.split('/').pop(),item=state.requests.find(x=>x.id===id);if(!item)return send(res,404,{error:'not found'});
  const b=await read(req);if(!['مؤكد داخلياً','مرفوض'].includes(b.status))return send(res,400,{error:'invalid status'});
  item.status=b.status;item.confirmedAt=new Date().toISOString();persist();return send(res,200,{ok:true,item});
 }
 return send(res,404,{error:'not found'});
});
server.listen(8787,'0.0.0.0',()=>{console.log('HK STORE LAN top-up server on port 8787');console.log('LAN addresses:',lanAddresses().join(', '));console.log('Tablet key:',state.tabletKey);console.log('Seller key:',state.sellerKey)});
module.exports={server,lanAddresses};
