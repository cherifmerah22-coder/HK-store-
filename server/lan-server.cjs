'use strict';
const http=require('http');
const https=require('https');
const net=require('net');
const fs=require('fs');
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const {aiAssist,aiStatus,scanAndroidDevices,allowRate}=require('./ai-device.cjs');
const DATA_DIR=process.env.HKSTORE_DATA_DIR||path.join(os.homedir(),'HK-STORE-data');
const FILE=path.join(DATA_DIR,'topup-lan.json');
fs.mkdirSync(DATA_DIR,{recursive:true});
let state;
try{state=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch{
 state={tabletKey:crypto.randomBytes(24).toString('hex'),sellerKey:crypto.randomBytes(24).toString('hex'),cameraEventToken:crypto.randomBytes(32).toString('hex'),cameraEvents:[],cameraEventSeq:0,config:null,requests:[],providers:[]};
 fs.writeFileSync(FILE,JSON.stringify(state,null,2));
}
try{fs.chmodSync(FILE,0o600)}catch{}
if(!Array.isArray(state.providers))state.providers=[];
if(!state.cameraEventToken)state.cameraEventToken=crypto.randomBytes(32).toString('hex');
if(!Array.isArray(state.cameraEvents))state.cameraEvents=[];
if(!Array.isArray(state.cameraConfigs))state.cameraConfigs=[];
if(!Number.isInteger(state.cameraEventSeq))state.cameraEventSeq=state.cameraEvents.reduce((n,e)=>Math.max(n,Number(e.id)||0),0);
function persist(){fs.writeFileSync(FILE+'.tmp',JSON.stringify(state,null,2),{mode:0o600});try{fs.chmodSync(FILE+'.tmp',0o600)}catch{}fs.renameSync(FILE+'.tmp',FILE);try{fs.chmodSync(FILE,0o600)}catch{}}
const PROVIDER_KEY_FILE=path.join(DATA_DIR,'provider-secrets.key');
let providerMasterKey;
try{providerMasterKey=fs.readFileSync(PROVIDER_KEY_FILE)}catch{providerMasterKey=crypto.randomBytes(32);fs.writeFileSync(PROVIDER_KEY_FILE,providerMasterKey,{mode:0o600});try{fs.chmodSync(PROVIDER_KEY_FILE,0o600)}catch{}}
function sealSecret(value){if(!value)return null;const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',providerMasterKey,iv);const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}}
function publicProvider(p){return {id:p.id,name:p.name,operator:p.operator,adapter:p.adapter,baseUrl:p.baseUrl,merchantId:p.merchantId||'',authType:p.authType||'bearer',hasApiKey:!!p.apiKeyEnc,hasApiSecret:!!p.apiSecretEnc,enabled:!!p.enabled,status:p.status||'not-tested',createdAt:p.createdAt,updatedAt:p.updatedAt}}
function lanAddresses(){const out=[];for(const list of Object.values(os.networkInterfaces()))for(const item of list||[])if(item.family==='IPv4'&&!item.internal)out.push(item.address);return out}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-hk-key,x-hk-camera-token','access-control-allow-methods':'GET,POST,OPTIONS','cache-control':'no-store'});res.end(JSON.stringify(obj))}
function read(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>20000)reject(new Error('too large'))});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});req.on('error',reject)})}
function localRequest(req){const a=req.socket.remoteAddress||'';return a==='127.0.0.1'||a==='::1'||a==='::ffff:127.0.0.1'}
const handleRequest=async(req,res)=>{
 if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-hk-key,x-hk-camera-token','access-control-allow-methods':'GET,POST,OPTIONS'});return res.end();}
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,service:'HK STORE LAN Top-up'});
 if(url.pathname==='/api/local-info'&&req.method==='GET'){
  if(!localRequest(req))return send(res,403,{error:'local only'});
  return send(res,200,{port:8787,addresses:lanAddresses(),secure,baseUrl:secure?'https://127.0.0.1:8787':'http://127.0.0.1:8787',tabletKey:state.tabletKey,sellerKey:state.sellerKey,cameraEventToken:state.cameraEventToken});
 }
 const key=req.headers['x-hk-key'];
 const safeEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
 const seller=safeEqual(key,state.sellerKey);
 const tablet=safeEqual(key,state.tabletKey);
 if(url.pathname==='/api/camera/config'&&req.method==='GET'){
  if(!seller||!localRequest(req))return send(res,403,{error:'manager_local_access_required'});
  return send(res,200,{cameras:state.cameraConfigs.map(c=>({id:c.id,name:c.name,model:c.model,place:c.place,host:c.host,port:c.port,protocol:c.protocol,path:c.path,hasCredentials:!!(c.usernameEnc||c.passwordEnc),createdAt:c.createdAt}))});
 }
 if(url.pathname==='/api/camera/config'&&req.method==='POST'){
  if(!seller||!localRequest(req))return send(res,403,{error:'manager_local_access_required'});
  let b;try{b=await read(req)}catch{return send(res,400,{error:'invalid_json'})}
  const name=String(b.name||'').trim(),host=String(b.host||'').trim(),model=String(b.model||'').slice(0,120),place=String(b.place||'').slice(0,120),protocol=String(b.protocol||'unknown'),port=Number(b.port||0),pathValue=String(b.path||'').slice(0,300);
  const oct=host.split('.').map(Number),validIpv4=oct.length===4&&oct.every(n=>Number.isInteger(n)&&n>=0&&n<=255),privateIp=validIpv4&&(oct[0]===10||(oct[0]===192&&oct[1]===168)||(oct[0]===172&&oct[1]>=16&&oct[1]<=31));
  if(!name||!privateIp||!['unknown','rtsp','onvif','http','vendor'].includes(protocol)||(port&&(!Number.isInteger(port)||port<1||port>65535)))return send(res,400,{error:'invalid_camera_fields',message:'أدخل اسماً وعنوان IPv4 خاصاً وبروتوكولاً ومنفذاً صحيحاً.'});
  const id=crypto.randomUUID(),camera={id,name,model,place,host,port:port||null,protocol,path:pathValue,usernameEnc:sealSecret(b.username),passwordEnc:sealSecret(b.password),createdAt:new Date().toISOString()};
  state.cameraConfigs.push(camera);state.cameraConfigs=state.cameraConfigs.slice(-100);persist();
  return send(res,201,{ok:true,camera:{id,name,model,place,host,port:port||null,protocol,path:pathValue,hasCredentials:!!(b.username||b.password)},message:'saved_encrypted'});
 }
 if(url.pathname.startsWith('/api/camera/config/')&&req.method==='DELETE'){
  if(!seller||!localRequest(req))return send(res,403,{error:'manager_local_access_required'});
  const id=url.pathname.split('/').pop(),before=state.cameraConfigs.length;state.cameraConfigs=state.cameraConfigs.filter(c=>c.id!==id);if(before===state.cameraConfigs.length)return send(res,404,{error:'camera_not_found'});persist();return send(res,200,{ok:true});
 }
 if(url.pathname==='/api/camera/event'&&req.method==='POST'){
  if(!safeEqual(req.headers['x-hk-camera-token'],state.cameraEventToken))return send(res,403,{error:'camera_event_token_required'});
  if(!allowRate('camera-event'))return send(res,429,{error:'camera_event_rate_limited'});
  let b;try{b=await read(req)}catch{return send(res,400,{error:'invalid_json'})}
  if(b.event!=='motion')return send(res,400,{error:'unsupported_camera_event'});
  const event={id:++state.cameraEventSeq,type:'motion',camera:String(b.camera||'Somfy VISIDOM ICM100').slice(0,100),at:new Date().toISOString(),test:b.test===true};
  state.cameraEvents.push(event);state.cameraEvents=state.cameraEvents.slice(-100);persist();
  return send(res,201,{ok:true,eventId:event.id});
 }
 if(url.pathname==='/api/camera/events'&&req.method==='GET'){
  if(!seller||!localRequest(req)||!safeEqual(req.headers['x-hk-camera-token'],state.cameraEventToken))return send(res,403,{error:'manager_local_access_required'});
  const after=Number(url.searchParams.get('after')||0);
  if(!Number.isSafeInteger(after)||after<0)return send(res,400,{error:'invalid_event_cursor'});
  return send(res,200,{events:state.cameraEvents.filter(e=>e.id>after),latestId:state.cameraEventSeq});
 }
 if(url.pathname==='/api/camera/test'&&req.method==='POST'){
  if(!seller||!localRequest(req)||!safeEqual(req.headers['x-hk-camera-token'],state.cameraEventToken))return send(res,403,{error:'manager_local_access_required'});
  let b;try{b=await read(req)}catch{return send(res,400,{error:'invalid_json'})}
  const host=String(b.host||'').trim(),port=Number(b.port||554);
  const oct=host.split('.').map(Number);
  const validIpv4=oct.length===4&&oct.every(n=>Number.isInteger(n)&&n>=0&&n<=255);
  const privateIp=validIpv4&&(oct[0]===10||(oct[0]===192&&oct[1]===168)||(oct[0]===172&&oct[1]>=16&&oct[1]<=31));
  if(!privateIp||!Number.isInteger(port)||port<1||port>65535)return send(res,400,{error:'private_ipv4_and_valid_port_required',message:'يسمح فقط بعنوان IPv4 خاص داخل شبكة المحل ومنفذ صحيح.'});
  const socket=new net.Socket();let done=false;
  const finish=(reachable,message)=>{if(done)return;done=true;socket.destroy();return send(res,200,{ok:true,reachable,message})};
  socket.setTimeout(2500);
  socket.once('connect',()=>finish(true,'المنفذ مفتوح ويمكن الوصول إليه من جهاز Windows. هذا لا يثبت توافق بروتوكول الكاميرا أو عمل البث.'));
  socket.once('timeout',()=>finish(false,'انتهت مهلة الاتصال؛ تحقق من IP والمنفذ والشبكة.'));
  socket.once('error',()=>finish(false,'تعذر الوصول إلى المنفذ؛ قد يكون مغلقاً أو محجوباً.'));
  socket.connect(port,host);return;
 }
 if(url.pathname==='/api/ai/status'&&req.method==='GET'){
  if(!seller)return send(res,403,{error:'seller key required'});
  return send(res,200,await aiStatus());
 }
 if(url.pathname==='/api/ai/assist'&&req.method==='POST'){
  if(!seller)return send(res,403,{error:'seller key required'});
  if(!allowRate('ai:'+String(key)))return send(res,429,{error:'rate_limited',message:'تجاوزت الحد المؤقت للطلبات. حاول بعد دقيقة.'});
  let b;try{b=await read(req)}catch{return send(res,400,{error:'invalid_json_or_too_large'})}
  const result=await aiAssist(b);return send(res,result.status,result.data);
 }
 if(url.pathname==='/api/device/scan'&&req.method==='GET'){
  if(!seller)return send(res,403,{error:'seller key required'});
  const result=await scanAndroidDevices();return send(res,result.status,result.data);
 }

 if(url.pathname.startsWith('/api/topup/providers')){
  if(!seller)return send(res,403,{error:'seller key required'});
  if(!localRequest(req))return send(res,403,{error:'manager console must run on Windows host'});
  if(url.pathname==='/api/topup/providers'&&req.method==='GET')return send(res,200,{providers:state.providers.map(publicProvider)});
  if(url.pathname==='/api/topup/providers'&&req.method==='POST'){
   let b;try{b=await read(req)}catch{return send(res,400,{error:'invalid_json'})}
   const name=String(b.name||'').trim(),operator=String(b.operator||''),adapter=String(b.adapter||''),baseUrl=String(b.baseUrl||'').trim();
   if(!name||name.length>100||!['Mobilis','Djezzy','Ooredoo','مشترك / عام'].includes(operator)||!['generic_rest','provider_specific'].includes(adapter))return send(res,400,{error:'invalid_provider_fields'});
   let parsed;try{parsed=new URL(baseUrl)}catch{return send(res,400,{error:'invalid_base_url'})}
   if(parsed.protocol!=='https:'||parsed.username||parsed.password)return send(res,400,{error:'https_url_required'});
   const id=crypto.randomUUID(),now=new Date().toISOString();
   const p={id,name,operator,adapter,baseUrl:parsed.origin+parsed.pathname.replace(/\/$/,''),merchantId:String(b.merchantId||'').slice(0,120),authType:['bearer','api_key_header','basic','custom'].includes(b.authType)?b.authType:'bearer',apiKeyEnc:sealSecret(b.apiKey),apiSecretEnc:sealSecret(b.apiSecret),enabled:false,status:'not-tested',createdAt:now,updatedAt:now};
   state.providers.push(p);persist();return send(res,201,{ok:true,provider:publicProvider(p),message:'saved_not_connected'});
  }
  const parts=url.pathname.split('/').filter(Boolean),id=parts[3],action=parts[4],p=state.providers.find(x=>x.id===id);
  if(!p)return send(res,404,{error:'provider_not_found'});
  if(action==='test'&&req.method==='POST'){p.status='adapter_required';p.enabled=false;p.updatedAt=new Date().toISOString();persist();return send(res,200,{ok:false,testable:false,status:p.status,message:'يلزم موصل مطابق لوثائق المزود قبل اختبار الاتصال أو تنفيذ التعبئة.'})}
  if(action==='toggle'&&req.method==='POST'){let b;try{b=await read(req)}catch{return send(res,400,{error:'invalid_json'})}if(typeof b.enabled!=='boolean')return send(res,400,{error:'invalid_enabled'});if(b.enabled&&p.status!=='connected')return send(res,409,{error:'provider_not_connected'});p.enabled=b.enabled;p.updatedAt=new Date().toISOString();persist();return send(res,200,{ok:true,provider:publicProvider(p)})}
  if(req.method==='DELETE'){state.providers=state.providers.filter(x=>x.id!==id);persist();return send(res,200,{ok:true})}
 }
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
  const b=await read(req);const phone=String(b.phone||'').replace(/\s/g,'');
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
};
const tlsCertPath=process.env.HKSTORE_TLS_CERT||'';
const tlsKeyPath=process.env.HKSTORE_TLS_KEY||'';
if(Boolean(tlsCertPath)!==Boolean(tlsKeyPath))throw new Error('Set both HKSTORE_TLS_CERT and HKSTORE_TLS_KEY, or neither.');
const secure=Boolean(tlsCertPath&&tlsKeyPath);
const server=secure?https.createServer({cert:fs.readFileSync(path.resolve(tlsCertPath)),key:fs.readFileSync(path.resolve(tlsKeyPath)),minVersion:'TLSv1.2'},handleRequest):http.createServer(handleRequest);
const bindHost=secure?'0.0.0.0':'127.0.0.1';
server.listen(8787,bindHost,()=>{console.log('HK STORE LAN API '+(secure?'HTTPS (TLS 1.3 when supported)':'HTTP loopback only')+' on port 8787');console.log('LAN addresses:',secure?lanAddresses().join(', '):'disabled until TLS certificate is configured');});
module.exports={server,lanAddresses};
