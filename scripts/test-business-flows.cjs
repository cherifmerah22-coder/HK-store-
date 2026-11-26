'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=(html.match(/<script>([\s\S]*?)<\/script>/i)||[])[1];
assert.ok(script,'application script exists');
function extract(name){
 const re=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(');
 const m=re.exec(script);assert.ok(m,'function '+name+' exists');
 const start=script.indexOf('{',m.index);let depth=0,quote='',escape=false,line=false,block=false;
 for(let i=start;i<script.length;i++){
  const ch=script[i],next=script[i+1];
  if(line){if(ch==='\n')line=false;continue}
  if(block){if(ch==='*'&&next==='/'){block=false;i++}continue}
  if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue}
  if(ch==='/'&&next==='/'){line=true;i++;continue}
  if(ch==='/'&&next==='*'){block=true;i++;continue}
  if(ch==='"'||ch==="'"||ch.charCodeAt(0)===96){quote=ch;continue}
  if(ch==='{')depth++;
  else if(ch==='}'&&--depth===0)return script.slice(m.index,i+1);
 }
 throw new Error('unclosed function '+name);
}
const names=['addProduct','addSaleToCart','addSale','payDebt','addRepair','setRepairStatus','addPart','usePart','normalizeAccessoryModel','productSupportsModel','resetCustomerAdIdle','costNextDate','costReminderText','addCost','payCost'];
const fields={},alerts=[];
let saved=0,promptValue='2',timerDelay=null;
const db={
 users:{manager:{name:'مدير تجريبي',role:'manager'},seller:{name:'بائع تجريبي',role:'seller'},tech:{name:'تقني تجريبي',role:'tech'},customer:{name:'زبون تجريبي',role:'customer'}},
 products:[],customers:[{id:'c1',name:'زبون اختبار',phone:'0550000000',debt:0}],
 sales:[],payments:[],repairs:[],parts:[],partMovements:[],costs:[]
};
const defaults={pName:'شاحن USB-C 25W',pQty:'10',pBuy:'900',pSell:'1400',pCode:'CH-25',pCategory:'شواحن',pCompat:'Samsung Galaxy A55',pImage:'',pConnector:'USB-C',pWattage:'25',pProtocol:'PD',pLength:'1',pCompatNotes:'USB-C PD 25W',saleProduct:'',saleQty:'2',salePrice:'1400',saleCustomer:'c1',salePaid:'1000',payCustomer:'c1',payAmount:'500',mCustomer:'زبون الصيانة',mPhone:'0551111111',mModel:'Samsung A55',mFault:'لا يشحن',mCost:'3000',mPaid:'1000',mDevice:'هاتف',mStatus:'قيد الفحص',partName:'بطارية Samsung A55',partQty:'4',partCost:'1800',partCode:'BAT-A55',costCategory:'الكهرباء',costTitle:'فاتورة كهرباء تجريبية',costAmount:'1000',costDate:'2026-11-26',costDueDate:'2026-12-01',costRecurrence:'شهري',costNotes:'اختبار'};
for(const [k,v] of Object.entries(defaults))fields[k]={value:v,textContent:'',innerHTML:'',checked:false,classList:{add(){},remove(){},toggle(){}}};
const context={db,current:'manager',saleCart:[],fields,alerts,hkAdIdleTimer:null,$:id=>fields[id]||(fields[id]={value:'',textContent:'',innerHTML:'',checked:false,classList:{add(){},remove(){},toggle(){}}}),alert:m=>alerts.push(String(m)),confirm:()=>false,prompt:()=>promptValue,save:()=>{saved++},persistSaleCart:()=>{},renderSaleCart:()=>{},clearSale:()=>{context.saleCart.length=0},operationStamp:()=>({date:'2026-11-26'}),localDateParts:()=>({date:'2026-11-26',time:'13:00'}),money:n=>String(n),printReceipt:()=>{},printRepair:()=>{},printPayment:()=>{},URL,Map,Number,String,Date,Math,JSON,Array,Object,RegExp,clearTimeout:()=>{},setTimeout:(fn,ms)=>{timerDelay=ms;return 1},stopCustomerAd:()=>{},idleAdConfig:()=>({enabled:true,minutes:10})};
for(const name of names)vm.runInNewContext(extract(name),context,{filename:'HK STORE '+name});
(async()=>{
 const run=fn=>vm.runInNewContext(fn,context);
 run('addProduct()');
 assert.equal(db.products.length,1);assert.equal(db.products[0].qty,10);assert.equal(db.products[0].buy,900);assert.equal(db.products[0].sell,1400);
 assert.equal(run("productSupportsModel(db.products[0],'Samsung Galaxy A55')"),true);
 assert.equal(run("productSupportsModel(db.products[0],'Samsung Galaxy A35')"),false);
 run("current='seller'");fields.pName.value='Forbidden';run('addProduct()');assert.equal(db.products.length,1);assert.equal(db.products.length,1,'seller cannot create products');
 fields.saleProduct.value=String(db.products[0].id);fields.saleQty.value='2';fields.salePrice.value='1400';run('addSaleToCart()');assert.equal(context.saleCart[0].qty,2);
 run('addSale()');assert.equal(db.products[0].qty,8);assert.equal(db.sales.length,1);assert.equal(db.sales[0].total,2800);assert.equal(db.sales[0].paid,1000);assert.equal(db.sales[0].debt,1800);assert.equal(db.customers[0].debt,1800);assert.equal(context.saleCart.length,0);
 fields.payCustomer.value='c1';fields.payAmount.value='500';run('payDebt()');assert.equal(db.customers[0].debt,1300);assert.equal(db.payments.length,1);assert.equal(db.payments[0].balance,1300);
 const oldParts=db.parts.length;run('addPart()');assert.equal(db.parts.length,oldParts);
 run("current='tech'");run('addRepair()');assert.equal(db.repairs.length,1);assert.equal(db.repairs[0].balance,2000);
 run("setRepairStatus("+db.repairs[0].id+",'قيد الإصلاح')");assert.equal(db.repairs[0].status,'قيد الإصلاح');
 run('addPart()');assert.equal(db.parts.length,1);assert.equal(db.parts[0].qty,4);run('usePart('+db.parts[0].id+')');assert.equal(db.parts[0].qty,2);assert.equal(db.partMovements.length,1);assert.equal(db.partMovements[0].quantity,2);
 run("current='customer'");run('resetCustomerAdIdle()');assert.equal(timerDelay,600000);timerDelay=null;run("current='seller'");run('resetCustomerAdIdle()');assert.equal(timerDelay,null);
 // Operational costs are separate from stock purchases; recurring costs schedule the next due date after full payment.
 run("current='manager'");run('addCost()');assert.equal(db.costs.length,1);assert.equal(db.costs[0].status,'غير مدفوع');assert.equal(run("costReminderText(db.costs[0])"),'يستحق خلال 5 أيام');
 promptValue='1000';run('payCost('+db.costs[0].id+')');assert.equal(db.costs[0].status,'مدفوع');assert.equal(db.costs.length,2);assert.equal(db.costs[1].dueDate,'2027-01-01');
 run("current='tech'");run('addCost()');assert.equal(db.costs.length,2);
 run("current='manager'");fields.pName.value='Invalid qty';fields.pQty.value='-1';run('addProduct()');assert.equal(db.products.length,1);
 run("current='seller'");fields.saleProduct.value=String(db.products[0].id);fields.saleQty.value='999';fields.salePrice.value='1400';run('addSaleToCart()');assert.equal(context.saleCart.length,0);
 console.log('HK STORE business simulation passed: product stock creation, exact accessory-model matching, role denial, multi-item sale, stock decrement, customer debt ledger, partial debt repayment, repair intake/status, independent repair-parts stock and consumption movements, 10-minute customer idle timer, invalid quantity and oversell rejection.');
})().catch(e=>{console.error(e);process.exitCode=1});
