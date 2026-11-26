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
function aiBase(){return (process.env.HK_LLAMA_URL||'http://127.0.0.1:11435').replace(/\/+$/,'');}
async function aiStatus(){
 const base=aiBase();
 try{
  const response=await fetch(base+'/health',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)return {ok:false,provider:'llama.cpp',message:'محرك الذكاء الاصطناعي المدمج لا يستجيب.'};
  const models=await fetch(base+'/v1/models',{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():({}));
  const model=models.data?.[0]?.id||'Qwen2.5-1.5B-Instruct';
  return {ok:true,provider:'llama.cpp-local',model,message:'محرك الذكاء الاصطناعي المحلي جاهز.'};
 }catch{return {ok:false,provider:'llama.cpp',model:'Qwen2.5-1.5B-Instruct',message:'لم يبدأ محرك الذكاء الاصطناعي المدمج بعد.'};}
}
function readJsonArrayAfterLabel(context,labels){
 for(const label of labels){
  const at=context.indexOf(label);if(at<0)continue;
  const start=context.indexOf('[',at+label.length);if(start<0)continue;
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<context.length;i++){
   const ch=context[i];
   if(quoted){if(escaped)escaped=false;else if(ch.charCodeAt(0)===92)escaped=true;else if(ch==='"')quoted=false;continue;}
   if(ch==='"'){quoted=true;continue;}
   if(ch==='[')depth++;
   else if(ch===']'&&--depth===0){try{const value=JSON.parse(context.slice(start,i+1));if(Array.isArray(value))return value;}catch{}break;}
  }
 }
 return [];
}
async function aiAssist(body){
 const status=await aiStatus();
 if(!status.ok)return {status:503,data:{error:'LOCAL_AI_NOT_READY',message:status.message,model:status.model}};
 const task=['accessory','welcome'].includes(body.task)?body.task:'diagnosis';
 const context=String(body.context||'').slice(0,9000);
 if(!context.trim())return {status:400,data:{error:'empty_context'}};
 const system=task==='welcome'
 ?'أنت مساعد استقبال زبائن لمحل HK STORE في الجزائر. اكتب جملة ترحيب واحدة قصيرة بالدارجة الجزائرية، محترمة وطبيعية، دون تخمين جنس الزبون أو عمره أو هويته أو سبب زيارته. لا تذكر أنك ذكاء اصطناعي. أخرج الجملة فقط، وبحد أقصى 18 كلمة.'
 :task==='diagnosis'
 ?'أنت مساعد إصلاح سوفتوير وهاردوير محترف في HK STORE. أجب بالعربية الواضحة وبالدارجة الجزائرية عند ملاءمة ذلك. ابدأ بتصنيف العطل ثم أسئلة توضيحية قصيرة وخطة فحص مرقمة من الأقل خطورة إلى الأكثر، بحد أقصى 8 خطوات. لا تكرر أي خطوة أو جملة، ولا تملأ الإجابة بتكرار نفس النص. إذا كانت معلومات المخزون موجودة في السياق، اذكر القطع المؤكدة لهذا الموديل كما سُجلت فقط، ولا تخترع قطعة أو سعراً أو كمية. لأعطال Bootloop والتوقف عند الشعار وRecovery وFastboot: تحقق من الشحن والأزرار وسجل التحديث والاتصال والتعرف على الجهاز قبل اقتراح Firmware؛ لا تقترح ملفاً إلا بعد تطابق رقم الطراز الكامل والمنطقة/CSC وإصدار Bootloader ومصدر الشركة الرسمي والتوقيع. لمشاكل نسيان رمز الشاشة أو Google FRP أو Apple Activation Lock أو أقفال الحسابات: لا تقدم تجاوزاً أو exploit أو أدوات إزالة حماية أو طرقاً للوصول إلى بيانات دون إذن؛ اشرح فقط استرداد الحساب الرسمي ودعم الشركة وإثبات الملكية، ونبه أن إعادة ضبط المصنع لا تزيل FRP وقد تمحو البيانات. لا توصي بمسح أو تفليش قبل موافقة الزبون والنسخ الاحتياطي. لأعطال الهاردوير اقترح قياسات وفحوصاً عملية آمنة، وافصل الاحتمالات عن التشخيص المؤكد. عندما يرفق السياق مخزون قطع الغيار: لا تصف أي قطعة بأنها متوافقة إلا إذا كانت مدرجة صراحة ضمن القطع المؤكدة لهذا الموديل الدقيق؛ لا تستنتج التوافق من تشابه أسماء الأجهزة. افصل بوضوح بين قطعة متوفرة ومؤكدة، وقطعة موجودة لكن توافقها غير مثبت، وقطعة غير متوفرة. لا تخترع أسماء قطع أو أكواداً أو كميات أو أسعاراً، ولا توحِ أن القطعة غير المؤكدة بديل صالح. اقترح القياسات والفحوص قبل التبديل، ولا تجزم باستبدال قطعة قبل قياسها واختبارها. لا تخترع رقم Firmware أو رابط تنزيل أو توافقاً غير موثق، واذكر بوضوح ما لا يمكن التحقق منه عن بعد.'
 :'أنت مستشار مبيعات HK STORE لجميع إكسسوارات الهواتف. اقرأ السياق بعناية: قد يحتوي على قائمة منتجات مؤكدة التوافق ومتوفرة، وقائمة منفصلة لبدائل محتملة غير مؤكدة. اعرض المنتجات المؤكدة فقط على أنها صالحة للبيع لهذا الهاتف، مع الاسم والفئة والسعر والكمية كما وردت حرفياً. لا تخلط البدائل المحتملة بالمنتجات المؤكدة؛ استخدمها فقط لشرح فحص عملي يلزم قبل اعتمادها، واذكر أنها لا تباع على أنها متوافقة قبل التجربة وتسجيل الموديل بعد موافقة المدير. لواقي الشاشة والصدمات والعدسات والأغطية تحقق من الشكل والأبعاد والحواف وفتحات الكاميرا والأزرار والسماعة والبصمة؛ للشواحن والكابلات تحقق من المنفذ والجهد والقدرة وبروتوكول الشحن؛ للسماعات تحقق من الاتصال والمنفذ؛ ولغيرها اطلب اختباراً خاصاً بنوع المنتج. اقترح الإضافات المكملة فقط من المنتجات المؤكدة الموجودة في البيانات. لا تستنتج التوافق من تشابه الأسماء أو المقاسات أو موديل قريب، ولا تخترع منتجاً أو سعراً أو كمية أو مواصفة. إذا لم توجد منتجات مؤكدة، قل ذلك واقترح ما يجب على البائع قياسه أو التحقق منه قبل اعتماد بديل. أجب بالعربية الواضحة وباختصار عملي.';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
 try{
  const response=await fetch(aiBase()+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:status.model,messages:[{role:'system',content:system},{role:'user',content:context}],stream:false,temperature:0.2,max_tokens:1000}),signal:controller.signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return {status:502,data:{error:'LOCAL_AI_ERROR',message:String(data.error?.message||data.error||'تعذر تشغيل النموذج المحلي').slice(0,300)}};
  const generated=data.choices?.[0]?.message?.content;
  if(typeof generated!=='string'||!generated.trim())return {status:502,data:{error:'AI_EMPTY_RESPONSE'}};
  let answer=generated.trim();
  if(task==='diagnosis'){
   const exactParts=readJsonArrayAfterLabel(context,['قطع الغيار المؤكدة لهذا الموديل والمتوفرة:','قطع الغيار المؤكدة والمتوفرة لهذا الموديل:','قطع غيار مؤكدة التوافق ومتوفرة:']);
   if(exactParts.length){
    const facts=exactParts.map(p=>String(p.name||'قطعة غير مسماة')+' — الكمية: '+(p.available??p.qty??'غير مسجلة')+' — الرمز: '+(p.code??'غير مسجل')).join('؛ ');
    answer+='\n\nقطع الغيار المؤكدة المسجلة في مخزون HK STORE لهذا الموديل (لا يعني ذلك ضرورة الاستبدال قبل الفحص): '+facts;
   }
   const seen=new Set();let numbered=0;
   answer=answer.split(/\r?\n/).filter(line=>{
    const trimmed=line.trim();
    const match=trimmed.match(/^\d+[.)]\s*(.+)$/);
    if(!match)return true;
    const key=match[1].replace(/^\*\*|\*\*$/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
    if(seen.has(key))return false;
    seen.add(key);numbered++;return numbered<=8;
   }).join('\n');
   if(/Bootloop|توقف عند الشعار|يعلق عند الشعار|فشل التحديث|interrupted update|Recovery|Fastboot/i.test(context)){
    const triage='خطة فحص أولية لعطل التوقف عند الشعار:\n1. افحص الشاحن والكابل ومنفذ الشحن، وتأكد من استقرار جهد البطارية قبل أي إجراء.\n2. افحص أزرار التشغيل ورفع/خفض الصوت؛ فقد يؤدي زر عالق إلى إعادة التشغيل أو الدخول المتكرر إلى وضع خاص.\n3. حاول الدخول إلى Recovery Mode وسجّل الرسالة أو رمز الخطأ الظاهر، دون اختيار Wipe data أو Factory reset.\n4. افحص إمكانية الدخول إلى Download Mode، وسجّل رقم الطراز الكامل وإصدار Bootloader وCSC/المنطقة كما تظهر على الجهاز.\n5. إذا كان الجهاز يتعرف عليه الحاسوب، اجمع معلومات ADB/Fastboot المتاحة دون تنفيذ أوامر مسح أو كتابة.\n6. لا تنتقل إلى Firmware إلا بعد مطابقة الطراز والمنطقة/CSC وإصدار Bootloader والتحقق من مصدر الشركة الرسمي والتوقيع.\n7. خذ موافقة الزبون ونسخة احتياطية إن أمكن، واشرح احتمال فقدان البيانات قبل أي تفليش أو إعادة ضبط.\n\n';
    answer=triage+answer;
   }
   if(/نسيت.{0,12}(?:رمز|كلمة المرور|PIN)|رمز الشاشة|screen PIN|activation lock|FRP|قفل الحساب|نسيان رمز/i.test(context)){
    answer+='\n\nتنبيه حماية البيانات: لا يمكن ضمان الاحتفاظ بالصور والبيانات عند نسيان رمز الشاشة. لا تنفذ إعادة ضبط المصنع أو التفليش قبل موافقة المالك والتحقق من إثبات الملكية؛ إعادة الضبط قد تمحو البيانات وقد يطلب الهاتف حساب Google السابق بعد التشغيل.';
   }else if(/Bootloop|توقف عند الشعار|يعلق عند الشعار|فشل التحديث|interrupted update|Recovery|Fastboot/i.test(context)){
    answer+='\n\nتنبيه قبل التفليش: لا تبدأ مسح البيانات أو تثبيت Firmware قبل التحقق من رقم الطراز الكامل والمنطقة/CSC ومراجعة إصدار Bootloader ومصدر ملف الشركة الرسمي. اطلب موافقة الزبون ونسخاً احتياطياً إن أمكن؛ قد يؤدي التفليش أو إعادة الضبط إلى فقدان البيانات.';
   }
  }
  if(task==='accessory'){
   const exact=readJsonArrayAfterLabel(context,['منتجات مؤكدة التوافق ومسجلة لهذا الموديل ومتوفرة:','المنتجات المؤكدة التوافق والمتوفرة:','منتجات مؤكدة التوافق والمتوفرة:']);
   const unverified=readJsonArrayAfterLabel(context,['منتجات موجودة لكنها غير مؤكدة التوافق:','منتجات موجودة غير مؤكدة:','منتجات غير مؤكدة:']);
   if(exact.length){
    const facts=exact.map(p=>String(p.name||'منتج غير مسمى')+' — السعر: '+(p.price??'غير مسجل')+' — الكمية: '+(p.qty??'غير مسجلة')).join('؛ ');
    answer='المخزون المؤكد حسب سجل HK STORE (بيانات المنتج كما سُجلت): '+facts+'\n\n'+answer;
   }else{
    answer='لا توجد في البيانات المقدمة منتجات مؤكدة التوافق ومتوفرة لهذا الموديل. لا تعتمد أي بديل قبل الفحص العملي وتسجيل التوافق.\n\n'+answer;
   }

  }
  return {status:200,data:{ok:true,provider:'llama.cpp-local',model:status.model,answer:answer.slice(0,12000)}};
 }catch(e){return {status:502,data:{error:'LOCAL_AI_CONNECTION_FAILED',message:e.name==='AbortError'?'استغرق النموذج وقتاً أطول من المتوقع.':'تعذر الاتصال بمحرك الذكاء الاصطناعي المدمج.'}}}
 finally{clearTimeout(timer)}
}
async function readDeviceValue(serial,command){
 try{const result=await execFileAsync('adb',['-s',serial,...command],{timeout:7000,maxBuffer:12000,windowsHide:true});return String(result.stdout||'').trim().slice(0,240);}catch{return ''}
}
async function scanAndroidDevices(){
 try{
  const {stdout}=await execFileAsync('adb',['devices','-l'],{timeout:12000,maxBuffer:20000,windowsHide:true});
  const lines=stdout.split(/\r?\n/).slice(1).filter(x=>x.trim()),devices=[];
  for(const line of lines){
   const parts=line.trim().split(/\s+/),serial=parts[0],state=parts[1]||'unknown';
   if(!serial||!/^[-A-Za-z0-9._:]{1,128}$/.test(serial))continue;
   let model='',manufacturer='',codename='',androidVersion='',buildFingerprint='',product='',bootloader='',region='';
   if(state==='device'){
    [model,manufacturer,codename,androidVersion,buildFingerprint,product,bootloader,region]=await Promise.all([
     readDeviceValue(serial,['shell','getprop','ro.product.model']),readDeviceValue(serial,['shell','getprop','ro.product.manufacturer']),readDeviceValue(serial,['shell','getprop','ro.product.device']),readDeviceValue(serial,['shell','getprop','ro.build.version.release']),readDeviceValue(serial,['shell','getprop','ro.build.fingerprint']),readDeviceValue(serial,['shell','getprop','ro.product.name']),readDeviceValue(serial,['shell','getprop','ro.boot.bootloader']),readDeviceValue(serial,['shell','getprop','ro.boot.sales_code'])
    ]);
   }
   devices.push({serial,state,model,manufacturer,codename,androidVersion,buildFingerprint,product,bootloader,region});
  }
  return {status:200,data:{ok:true,adb:true,readOnly:true,devices}};
 }catch(e){const missing=e.code==='ENOENT';return {status:200,data:{ok:true,adb:false,devices:[],message:missing?'لم يتم العثور على ADB. ثبّت Android SDK Platform-Tools وأضف مجلد platform-tools إلى PATH.':'تعذر تشغيل ADB: '+String(e.message||e).slice(0,200)}};}
}
module.exports={aiAssist,aiStatus,scanAndroidDevices,allowRate};
