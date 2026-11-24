'use strict';
const {execFile}=require('child_process');
const {promisify}=require('util');
const execFileAsync=promisify(execFile);
const recent=new Map();

function allowRate(key){
 const now=Date.now(),items=(recent.get(key)||[]).filter(t=>now-t<60000);
 if(items.length>=12)return false;
 items.push(now);recent.set(key,items);return true;
}
async function aiAssist(body){
 const apiKey=process.env.HK_AI_API_KEY;
 const model=process.env.HK_AI_MODEL||'gpt-4o-mini';
 const base=(process.env.HK_AI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'');
 if(!apiKey)return {status:503,data:{error:'AI_NOT_CONFIGURED',message:'لم يضبط المدير مفتاح مزود الذكاء الاصطناعي على جهاز Windows بعد.'}};
 const task=body.task==='accessory'?'accessory':'diagnosis';
 const context=String(body.context||'').slice(0,9000);
 if(!context.trim())return {status:400,data:{error:'empty_context'}};
 const system=task==='diagnosis'
 ?'أنت مساعد فني صيانة هواتف محترف. أجب بالعربية الواضحة. حلل الأعراض والاختبارات، افصل الاحتمالات البرمجية عن المادية، وقدم خطوات آمنة مرتبة من الأقل خطورة. لا تخترع رقم Firmware أو رابط تنزيل أو توافقاً غير موثق. لا تقدم تجاوز FRP أو Activation Lock أو إزالة حماية أو تغيير IMEI. اذكر ضرورة موافقة الزبون والنسخ الاحتياطي قبل أي مسح أو تفليش. لا تجزم باستبدال قطعة قبل قياسها واختبارها.'
 :'أنت مساعد مبيعات إكسسوارات هواتف. حدد نوع القطعة والمواصفات المطلوبة بناء على موديل الهاتف الدقيق. لا تدّع أن منتجاً متوفر إلا إذا كان موجوداً في قائمة المخزون المرفقة. إن كانت بيانات الموديل غير كافية فاطلب التحقق من رقم الموديل أو قياس المنفذ والقدرة. لا تخترع توافقاً.';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  const response=await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+apiKey},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:context}],temperature:0.2,max_tokens:1000}),signal:controller.signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {status:502,data:{error:'AI_PROVIDER_ERROR',message:String(data.error?.message||'تعذر الاتصال بمزود الذكاء الاصطناعي').slice(0,400)}};
  const answer=data.choices?.[0]?.message?.content;
  if(typeof answer!=='string'||!answer.trim())return {status:502,data:{error:'AI_EMPTY_RESPONSE'}};
  return {status:200,data:{ok:true,model,answer:answer.slice(0,12000)}};
 }catch(e){return {status:502,data:{error:'AI_CONNECTION_FAILED',message:e.name==='AbortError'?'انتهت مهلة الاتصال بمزود الذكاء الاصطناعي':'تعذر الاتصال بمزود الذكاء الاصطناعي'}}}
 finally{clearTimeout(timer)}
}
async function scanAndroidDevices(){
 try{
  const {stdout}=await execFileAsync('adb',['devices','-l'],{timeout:12000,maxBuffer:20000,windowsHide:true});
  const lines=stdout.split(/\r?\n/).slice(1).filter(x=>x.trim());
  const devices=[];
  for(const line of lines){
   const parts=line.trim().split(/\s+/),serial=parts[0],state=parts[1]||'unknown';
   if(!serial||!/^[-A-Za-z0-9._:]{1,128}$/.test(serial))continue;
   let model='',manufacturer='';
   if(state==='device'){
    try{const a=await execFileAsync('adb',['-s',serial,'shell','getprop','ro.product.model'],{timeout:7000,windowsHide:true});model=a.stdout.trim().slice(0,100)}catch{}
    try{const a=await execFileAsync('adb',['-s',serial,'shell','getprop','ro.product.manufacturer'],{timeout:7000,windowsHide:true});manufacturer=a.stdout.trim().slice(0,100)}catch{}
   }
   devices.push({serial,state,model,manufacturer});
  }
  return {status:200,data:{ok:true,adb:true,devices}};
 }catch(e){
  const missing=e.code==='ENOENT';
  return {status:200,data:{ok:true,adb:false,devices:[],message:missing?'لم يتم العثور على ADB. ثبّت Android SDK Platform-Tools وأضف مجلد platform-tools إلى PATH.':'تعذر تشغيل ADB: '+String(e.message||e).slice(0,200)}};
 }
}
module.exports={aiAssist,scanAndroidDevices,allowRate};
