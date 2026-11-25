'use strict';
const {execFile}=require('child_process');
const {promisify}=require('util');
const execFileAsync=promisify(execFile);
const recent=new Map();

function allowRate(key){
 const now=Date.now(),items=(recent.get(key)||[]).filter(t=>now-t<60000);
 if(items.length>=12)return false;
 items.push(now);recent.set(key,items);
 return true;
}
async function aiStatus(){
 const base=(process.env.HK_OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/+$/,'');
 const model=process.env.HK_AI_MODEL||'qwen2.5:3b';
 try{
  const response=await fetch(base+'/api/tags',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)return {ok:false,provider:'ollama',message:'خدمة Ollama لا تستجيب بشكل صحيح.'};
  const data=await response.json(),models=(data.models||[]).map(x=>x.name);
  return {ok:models.some(x=>x===model||x.startsWith(model+':')||model.startsWith(x+':')),provider:'ollama',model,installedModels:models,message:models.some(x=>x===model||x.startsWith(model+':')||model.startsWith(x+':'))?'الذكاء الاصطناعي المحلي جاهز.':'Ollama يعمل لكن النموذج المطلوب غير مثبت.'};
 }catch{return {ok:false,provider:'ollama',model,message:'لم يتم العثور على Ollama. ثبّته وشغّله ثم نزّل النموذج المحلي.'}}
}
async function aiAssist(body){
 const status=await aiStatus();
 if(!status.ok)return {status:503,data:{error:'LOCAL_AI_NOT_READY',message:status.message,model:status.model}};
 const base=(process.env.HK_OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/+$/,'');
 const model=process.env.HK_AI_MODEL||'qwen2.5:3b';
 const task=['accessory','welcome'].includes(body.task)?body.task:'diagnosis';
 const context=String(body.context||'').slice(0,9000);
 if(!context.trim())return {status:400,data:{error:'empty_context'}};
 const system=task==='welcome'
 ?'أنت مساعد استقبال زبائن لمحل HK STORE في الجزائر. اكتب جملة ترحيب واحدة قصيرة بالدارجة الجزائرية، محترمة وطبيعية، دون تخمين جنس الزبون أو عمره أو هويته أو سبب زيارته. لا تذكر أنك ذكاء اصطناعي. أخرج الجملة فقط، وبحد أقصى 18 كلمة.'
 :task==='diagnosis'
 ?'أنت مساعد فني صيانة هواتف وحواسيب وأجهزة إلكترونية محترف. أجب بالعربية الواضحة وبالدارجة الجزائرية عند ملاءمة ذلك. حلل الأعراض والاختبارات، افصل الاحتمالات البرمجية عن المادية، وقدم خطوات آمنة مرتبة من الأقل خطورة. لا تخترع رقم Firmware أو رابط تنزيل أو توافقاً غير موثق. لا تقدم تجاوز FRP أو Activation Lock أو إزالة حماية أو تغيير IMEI. اذكر ضرورة موافقة الزبون والنسخ الاحتياطي قبل أي مسح أو تفليش. لا تجزم باستبدال قطعة قبل قياسها واختبارها.'
 :'أنت مساعد مبيعات إكسسوارات هواتف. حدد نوع القطعة والمواصفات المطلوبة بناء على موديل الهاتف الدقيق. لا تدّع أن منتجاً متوفر إلا إذا كان موجوداً في قائمة المخزون المرفقة. إن كانت بيانات الموديل غير كافية فاطلب التحقق من رقم الموديل أو قياس المنفذ والقدرة. لا تخترع توافقاً.';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{
  const response=await fetch(base+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:context}],stream:false,options:{temperature:0.2,num_predict:1000}}),signal:controller.signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {status:502,data:{error:'LOCAL_AI_ERROR',message:String(data.error||'تعذر تشغيل النموذج المحلي').slice(0,300)}};
  const answer=data.message?.content;
  if(typeof answer!=='string'||!answer.trim())return {status:502,data:{error:'AI_EMPTY_RESPONSE'}};
  return {status:200,data:{ok:true,provider:'ollama-local',model,answer:answer.slice(0,12000)}};
 }catch(e){return {status:502,data:{error:'LOCAL_AI_CONNECTION_FAILED',message:e.name==='AbortError'?'استغرق النموذج وقتاً أطول من المتوقع.':'تعذر الاتصال بـ Ollama على جهاز المحل.'}}}
 finally{clearTimeout(timer)}
}
async function readDeviceValue(serial,command){
 try{
  const result=await execFileAsync('adb',['-s',serial,...command],{timeout:7000,maxBuffer:12000,windowsHide:true});
  return String(result.stdout||'').trim().slice(0,240);
 }catch{return ''}
}
async function scanAndroidDevices(){
 try{
  const {stdout}=await execFileAsync('adb',['devices','-l'],{timeout:12000,maxBuffer:20000,windowsHide:true});
  const lines=stdout.split(/\r?\n/).slice(1).filter(x=>x.trim());
  const devices=[];
  for(const line of lines){
   const parts=line.trim().split(/\s+/),serial=parts[0],state=parts[1]||'unknown';
   if(!serial||!/^[-A-Za-z0-9._:]{1,128}$/.test(serial))continue;
   let model='',manufacturer='',codename='',androidVersion='',buildFingerprint='',product='',bootloader='',region='';
   if(state==='device'){
    [model,manufacturer,codename,androidVersion,buildFingerprint,product,bootloader,region]=await Promise.all([
     readDeviceValue(serial,['shell','getprop','ro.product.model']),
     readDeviceValue(serial,['shell','getprop','ro.product.manufacturer']),
     readDeviceValue(serial,['shell','getprop','ro.product.device']),
     readDeviceValue(serial,['shell','getprop','ro.build.version.release']),
     readDeviceValue(serial,['shell','getprop','ro.build.fingerprint']),
     readDeviceValue(serial,['shell','getprop','ro.product.name']),
     readDeviceValue(serial,['shell','getprop','ro.boot.bootloader']),
     readDeviceValue(serial,['shell','getprop','ro.boot.sales_code'])
    ]);
   }
   devices.push({serial,state,model,manufacturer,codename,androidVersion,buildFingerprint,product,bootloader,region});
  }
  return {status:200,data:{ok:true,adb:true,readOnly:true,devices}};
 }catch(e){
  const missing=e.code==='ENOENT';
  return {status:200,data:{ok:true,adb:false,devices:[],message:missing?'لم يتم العثور على ADB. ثبّت Android SDK Platform-Tools وأضف مجلد platform-tools إلى PATH.':'تعذر تشغيل ADB: '+String(e.message||e).slice(0,200)}};
 }
}
module.exports={aiAssist,aiStatus,scanAndroidDevices,allowRate};
