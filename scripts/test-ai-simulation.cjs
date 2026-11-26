'use strict';
const assert=require('node:assert/strict');
const {aiAssist,aiStatus}=require('../server/ai-device.cjs');
const has=(s,re,label)=>{assert.match(s,re,label+' response did not meet expected behavior');};
(async()=>{
 const status=await aiStatus();
 assert.equal(status.ok,true,'bundled local AI must be running before simulation');
 console.log('AI engine:',status.provider,status.model);
 const call=async(task,context)=>{
  const r=await aiAssist({task,context});
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.ok(r.data.answer&&r.data.answer.trim().length>30,'AI response is empty or too short');
  console.log('\n=== '+task+' simulation ===\n'+r.data.answer+'\n');
  return r.data.answer;
 };
 const exact=await call('accessory',
 'محل HK STORE - محاكاة مخزون البيع. موديل الزبون: Samsung Galaxy A55 5G. نوع المطلوب: واقي شاشة. المنتجات المؤكدة التوافق والمتوفرة: [{"name":"واقي زجاجي شفاف Samsung Galaxy A55 5G","category":"واقي شاشة","compatibleModels":"Samsung Galaxy A55 5G, SM-A556B","qty":3,"price":1800,"matchStatus":"confirmed_exact_model"}]. منتجات موجودة غير مؤكدة: [{"name":"واقي شاشة Samsung Galaxy A35","category":"واقي شاشة","compatibleModels":"Samsung Galaxy A35","qty":7,"price":1200,"matchStatus":"unverified_candidate"}]. المطلوب: اقترح فقط المنتج المؤكد لهذا الموديل، اذكر السعر والكمية، ولا تقترح واقي A35.');
 has(exact,/واقي زجاجي شفاف Samsung Galaxy A55 5G/i,'exact accessory');
 has(exact,/1800/,'exact accessory price');
 assert.doesNotMatch(exact,/اقترح.*Samsung Galaxy A35/i,'must not recommend the unverified A35 protector');
 const noMatch=await call('accessory',
 'محل HK STORE - محاكاة مخزون البيع. موديل الزبون: Samsung Galaxy A55 5G. نوع المطلوب: واقي شاشة. لا توجد منتجات مؤكدة لهذا الموديل. المنتج الوحيد الموجود: [{"name":"واقي شاشة Samsung Galaxy A35","category":"واقي شاشة","compatibleModels":"Samsung Galaxy A35","qty":7,"price":1200,"matchStatus":"unverified_candidate"}]. المطلوب: هل يمكن بيعه كبديل؟ اشرح للبائع أنه لا يجوز اعتباره متوافقاً بسبب تشابه الاسم فقط، واطلب مقارنة دقيقة للأبعاد والحواف وفتحات الكاميرا والسماعة والبصمة قبل اعتماده. لا تخترع بديلاً.');
 has(noMatch,/غير مؤكد|غير مؤكدة|غير متوافق|لا يوجد|لا توجد|لا أنصح|لا يُنصح|لا يمكن|يجب التحقق|يلزم التحقق|لا يُباع|لا تبعه/i,'no-match safety');
 const repair=await call('diagnosis',
 'محل HK STORE - محاكاة مخزون قطع الغيار. نوع الجهاز: هاتف Xiaomi Redmi Note 12 4G. العطل: لا يشحن إطلاقاً، الزبون جرب كابلين وشاحنين مختلفين. قطع الغيار المؤكدة لهذا الموديل والمتوفرة: [{"name":"لوحة شحن Redmi Note 12 4G","code":"SUB-RN12-4G","available":2,"compatibleModels":"Redmi Note 12 4G"}]. قطع موجودة لكن غير متوافقة مؤكداً: [{"name":"بطارية Redmi Note 11","code":"BAT-RN11","available":4,"compatibleModels":"Redmi Note 11"}]. المطلوب: أعط خطوات فحص آمنة ومرتبة قبل تغيير القطع، اذكر القطعة المطابقة المتوفرة فقط كاحتمال بعد القياس، ولا تقترح بطارية Note 11. لا تجزم بالسبب.');
 has(repair,/لوحة شحن Redmi Note 12 4G/i,'repair spare part grounding');
 has(repair,/فحص|قياس|اختبار|تحقق|تنظيف|تيار|جهد|منفذ/i,'repair diagnostic steps');
 assert.doesNotMatch(repair,/استبدل بطارية Redmi Note 11/i,'must not recommend incompatible battery');
 console.log('PASS: real bundled Qwen model answered all three live simulations: exact accessory recommendation, rejection of an unverified near-match, and repair diagnosis grounded in actual spare-parts stock.');
})().catch(e=>{console.error(e);process.exitCode=1;});
