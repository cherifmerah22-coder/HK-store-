'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'hk-store-lan-test-'));
const child=spawn(process.execPath,[path.join(root,'server','lan-server.cjs')],{
 cwd:root,env:{...process.env,HKSTORE_DATA_DIR:dataDir},stdio:'ignore',windowsHide:true
});
const base='http://127.0.0.1:8787';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(route,{method='GET',key,body}={}){
 const headers={};if(key)headers['x-hk-key']=key;if(body!==undefined)headers['content-type']='application/json';
 const response=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 let data={};try{data=await response.json()}catch{}
 return {status:response.status,data};
}
async function waitForServer(){
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw new Error('LAN server exited before becoming ready');
  try{const r=await request('/api/health');if(r.status===200)return}catch{}
  await sleep(250);
 }
 throw new Error('LAN server did not start on port 8787');
}
(async()=>{
 try{
  await waitForServer();
  const health=await request('/api/health');
  assert.equal(health.status,200);assert.equal(health.data.ok,true);

  const local=await request('/api/local-info');
  assert.equal(local.status,200);assert.ok(local.data.tabletKey);assert.ok(local.data.sellerKey);
  const {tabletKey,sellerKey}=local.data;

  const cameraDenied=await request('/api/camera/test',{method:'POST',key:tabletKey,body:{host:'192.168.1.50',port:554}});
  assert.equal(cameraDenied.status,403);
  const cameraRejectPublic=await request('/api/camera/test',{method:'POST',key:sellerKey,body:{host:'127.0.0.1',port:554}});
  assert.equal(cameraRejectPublic.status,400);
  const cameraRejectInvalid=await request('/api/camera/test',{method:'POST',key:sellerKey,body:{host:'192.168.1.999',port:554}});
  assert.equal(cameraRejectInvalid.status,400);

  assert.equal((await request('/api/topup/providers',{key:tabletKey})).status,403);
  const providerCreate=await request('/api/topup/providers',{method:'POST',key:sellerKey,body:{name:'مزود تجريبي',operator:'Mobilis',adapter:'provider_specific',authType:'bearer',baseUrl:'https://api.example.test/v1',merchantId:'HK-DEMO',apiKey:'test-secret',apiSecret:'test-secret-2'}});
  assert.equal(providerCreate.status,201);assert.equal(providerCreate.data.provider.hasApiKey,true);assert.equal(providerCreate.data.provider.hasApiSecret,true);assert.equal(JSON.stringify(providerCreate.data).includes('test-secret'),false);
  const providerList=await request('/api/topup/providers',{key:sellerKey});assert.equal(providerList.status,200);assert.equal(providerList.data.providers.length,1);
  const providerId=providerCreate.data.provider.id;
  const providerTest=await request('/api/topup/providers/'+providerId+'/test',{method:'POST',key:sellerKey});assert.equal(providerTest.status,200);assert.equal(providerTest.data.testable,false);assert.equal(providerTest.data.status,'adapter_required');
  assert.equal((await request('/api/topup/providers/'+providerId+'/toggle',{method:'POST',key:sellerKey,body:{enabled:true}})).status,409);
  assert.equal((await request('/api/topup/providers',{method:'POST',key:sellerKey,body:{name:'bad',operator:'Mobilis',adapter:'generic_rest',baseUrl:'http://insecure.example',apiKey:'x'}})).status,400);
  assert.equal((await request('/api/topup/providers/'+providerId,{method:'DELETE',key:sellerKey})).status,200);
  assert.equal((await request('/api/topup/config')).status,401);
  assert.equal((await request('/api/topup/config',{method:'POST',key:tabletKey,body:{operator:'Mobilis',amount:100}})).status,403);
  assert.equal((await request('/api/topup/config',{method:'POST',key:sellerKey,body:{operator:'Unknown',amount:100}})).status,400);
  assert.equal((await request('/api/topup/config',{method:'POST',key:sellerKey,body:{operator:'Mobilis',amount:100}})).status,200);
  const config=await request('/api/topup/config',{key:tabletKey});
  assert.equal(config.status,200);assert.equal(config.data.config.operator,'Mobilis');

  assert.equal((await request('/api/topup/request',{method:'POST',key:tabletKey,body:{phone:'123'}})).status,400);
  const created=await request('/api/topup/request',{method:'POST',key:tabletKey,body:{phone:'0550123456'}});
  assert.equal(created.status,201);assert.ok(created.data.request.id);

  const requests=await request('/api/topup/requests',{key:sellerKey});
  assert.equal(requests.status,200);assert.equal(requests.data.requests.length,1);
  const id=created.data.request.id;
  assert.equal((await request('/api/topup/confirm/'+id,{method:'POST',key:sellerKey,body:{status:'unknown'}})).status,400);
  assert.equal((await request('/api/topup/confirm/'+id,{method:'POST',key:sellerKey,body:{status:'مؤكد داخلياً'}})).status,200);
  assert.equal((await request('/api/topup/confirm/not-found',{method:'POST',key:sellerKey,body:{status:'مرفوض'}})).status,404);
  assert.equal((await request('/api/topup/requests',{key:'wrong-key'})).status,403);

  const scan=await request('/api/device/scan',{key:sellerKey});
  assert.equal(scan.status,200);assert.equal(scan.data.ok,true);assert.ok(Array.isArray(scan.data.devices));if(scan.data.adb)assert.equal(scan.data.readOnly,true);else assert.match(scan.data.message,/ADB/);
  const ai=await request('/api/ai/assist',{method:'POST',key:sellerKey,body:{task:'diagnosis',context:'اختبار تشخيص تجريبي'}});
  assert.ok([200,502,503].includes(ai.status));

  console.log('HK STORE LAN integration tests passed: health, local credentials, role authorization, top-up config, phone validation, request creation, seller review/confirmation, missing request, invalid key, read-only ADB scan, AI endpoint response, camera endpoint manager-only authorization and private IPv4 validation.');
 }catch(error){
  console.error(error);process.exitCode=1;
 }finally{
  child.kill();
  await sleep(200);
  fs.rmSync(dataDir,{recursive:true,force:true});
 }
})();
