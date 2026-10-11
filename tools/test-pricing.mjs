import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import * as pricing from '../supabase/functions/shared/pricing.js';
const {usdAmount,linePrice,selectedPrice,priceTotals,assertPaymentQuote}=pricing;
assert.equal(selectedPrice({price:119,variants:[{color:'red',price:99}]},{color:'red'}),99);
assert.equal(selectedPrice({price:119,variants:[{color:'red',price:99}]},{color:'blue'}),119);
for(const price of [0,null,'',undefined,-1])assert.equal(selectedPrice({price:119,variants:[{color:'red',price}]},{color:'red'}),119);
assert.equal(selectedPrice({price:119,variants:[{size:'7',style:'long',price:139}]},{size:'7 - long'}),139);
const manual={price:100,priceUsd:49.95},automatic={price:100,priceUsd:null};
assert.equal(usdAmount(100,manual,4),49.95);
assert.equal(usdAmount(100,automatic,4),25);
assert.equal(usdAmount(100,automatic,3.2),31.25);
assert.equal(usdAmount(120,manual,4),30,'A differently priced variant is converted, not assigned the base manual price.');
assert.equal(usdAmount(0,automatic,4),0);
assert.throws(()=>usdAmount(-1,automatic,4));
for(const item of [{price:100},{}, {price:120}]){
 const line={item,product:manual};
 assert.equal(linePrice(line,'USD',4),usdAmount(item.price??100,manual,4));
 assert.equal(linePrice(line,'ILS',4),item.price??100);
}
assert.deepEqual(priceTotals([49.95,25,30,10.01]),{count:4,rate:.5,subtotal:114.96,discount:5.01,total:109.95});
assert.equal(priceTotals([49.95,25,30,10.01,9.99]).total,114.96);
assert.equal(priceTotals([49.95,25,30,10.01],false).discount,0);
assert.equal(priceTotals([]).total,0);
assertPaymentQuote({currency:'USD',total:'109.95'},109.95,'USD');
assert.throws(()=>assertPaymentQuote({currency:'ILS',total:109.95},109.95,'USD'));
assert.throws(()=>assertPaymentQuote({currency:'USD',total:109.94},109.95,'USD'));

// Execute the actual deployed-function source with mocked network responses.
// This never reaches PayPal, creates a database order, or charges a card.
const orderId='11111111-1111-1111-1111-111111111111';
const ids=[1,2,3,4].map(n=>`${String(n).repeat(8)}-1111-1111-1111-111111111111`);
const products=ids.map((id,i)=>({id,price_ils:[100,100,120,40.04][i],price_usd:i===0?49.95:null}));
let order={id:orderId,currency:'ILS',payment_status:'pending',promotion_discount:20.02,order_number:'TEST',country:'Israel',order_items:products.map(p=>({product_id:p.id,unit_price:p.price_ils,quantity:1,sku:'TEST',product_name_he:'Test',selected_options:{}}))};
let handler,payload,captured=false,rateCalls=0,productCalls=0,captureDelta=0;
const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
const fetchMock=async(url,options={})=>{
 url=String(url);
 if(url.includes('boi.org.il')){rateCalls++;return response({exchangeRates:[{key:'USD',currentExchangeRate:4}]})}
 if(url.includes('/rest/v1/products')){productCalls++;return response(products)}
 if(url.includes('/rest/v1/orders')){
  if(options.method==='PATCH'){Object.assign(order,JSON.parse(options.body));return response(null)}
  return response([order]);
 }
 if(url.includes('/oauth2/token'))return response({access_token:'test'});
 if(url.endsWith('/v2/checkout/orders')&&options.method==='POST'){
  payload=JSON.parse(options.body);return response({id:'PP-TEST',links:[{rel:'approve',href:'https://example.test/approve'}]});
 }
 if(url.endsWith('/v2/checkout/orders/PP-TEST'))return response({id:'PP-TEST',purchase_units:payload.purchase_units});
 if(url.endsWith('/PP-TEST/capture')){captured=true;return response({status:'COMPLETED',purchase_units:[{payments:{captures:[{id:'CAPTURE',status:'COMPLETED',amount:{...payload.purchase_units[0].amount,value:(Number(payload.purchase_units[0].amount.value)+captureDelta).toFixed(2)}}]}}]})}
 if(url.includes('/naya-order-email'))return response({ok:true});
 throw Error(`Unexpected test request: ${url}`);
};
let source=await readFile('supabase/functions/naya-paypal/index.ts','utf8');
source=source.replace(/^import .*?;\n/,'');
source=stripTypeScriptTypes(source);
const context={...pricing,fetch:fetchMock,Response,URL,AbortSignal,crypto,btoa,console,Date,Deno:{env:{get:key=>({SUPABASE_URL:'https://test.invalid',PAYPAL_CLIENT_ID:'test',PAYPAL_CLIENT_SECRET:'test',SUPABASE_SECRET_KEY:'test',PAYPAL_CURRENCY:'USD'}[key])},serve:fn=>{handler=fn}}};
vm.runInNewContext(source,context);
const call=async body=>{const r=await handler(new Request('https://test.invalid/naya-paypal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}};
const config=await call({action:'config'});
assert.equal(config.body.usd_ils_rate,4);
const start=await call({action:'start',order_id:orderId});
assert.equal(start.status,200);
assert.equal(start.body.total,'109.95');
assert.equal(payload.purchase_units[0].amount.breakdown.item_total.value,'114.96');
assert.equal(payload.purchase_units[0].amount.breakdown.discount.value,'5.01');
assert.equal(payload.purchase_units[0].items[0].unit_amount.value,'49.95');
assertPaymentQuote(start.body,109.95,'USD');
assert.equal(order.currency,'ILS','Existing ILS order accounting is unchanged.');
// Catalogue edits after approval must not change the captured amount.
products[0].price_usd=999;
const callsBeforeCapture=productCalls;
const capture=await call({action:'capture',order_id:orderId,paypal_order_id:'PP-TEST'});
assert.equal(capture.status,200);
assert(captured);
assert.equal(productCalls,callsBeforeCapture);
assert.equal(order.payment_status,'paid');
assert.equal(rateCalls,1);
assert.equal((await call({action:'capture',order_id:'bad',paypal_order_id:'PP-TEST'})).status,500);
order.payment_status='pending';captured=false;
payload.purchase_units[0].custom_id='wrong-order';
assert.equal((await call({action:'capture',order_id:orderId,paypal_order_id:'PP-TEST'})).status,500);
assert(!captured,'Reject a different order before capture.');
payload.purchase_units[0].custom_id=orderId;
captureDelta=-.01;
assert.equal((await call({action:'capture',order_id:orderId,paypal_order_id:'PP-TEST'})).status,500);
assert.equal(order.payment_status,'failed','A one-cent discrepancy cannot be marked paid.');
captureDelta=0;order.payment_status='pending';products[0].price_usd=49.95;
order.promotion_discount=0;
assert.equal((await call({action:'start',order_id:orderId})).body.total,'114.96');
assert.equal(payload.purchase_units[0].amount.breakdown.discount,undefined);
order.order_items.push({...order.order_items[3],unit_price:39.96});
order.promotion_discount=39.96;
assert.equal((await call({action:'start',order_id:orderId})).body.total,'114.96');
order.currency='USD';
assert.equal((await call({action:'start',order_id:orderId})).status,500,'Do not convert a USD source order as ILS.');

// Product mapping must preserve "no manual USD price" through the API/admin.
globalThis.fetch=async()=>response([{id:'test',price_ils:100,price_usd:null,product_images:[],product_options:[]}]);
const api=await import('../api-module.js');
assert.equal((await api.getProducts())[0].priceUsd,null);
const store=await readFile('store.js','utf8'),checkout=await readFile('checkout.js','utf8');
assert(store.includes('calculateUsd(amount,product,usdRate'));
assert(checkout.includes("calculateLinePrice(line,english?'USD':'ILS',usdRate)"));
assert(!/\/\s*3\.7/.test(store+checkout));
for(const file of ['index.html','judaica.html','checkout.html'])assert((await readFile(file,'utf8')).includes('script type="module" src="'+(file==='checkout.html'?'checkout.js':'store.js')));
const sql=await readFile('supabase-order-variant-pricing.sql','utf8');
assert(sql.includes('v_unit_price,v_quantity'));
assert(!sql.includes("v_item->>'unitPrice'"),'Server prices must not trust a submitted price.');
assert(sql.includes("'ILS',0,0,0"),'Keep ILS order accounting.');
console.log('PASS: manual USD cents, cached ILS cart prices, live rate, variants, ILS, rounding, 4/5-item discounts, no-offer, payment guards, PayPal payload/capture snapshot, null API prices and module wiring. No real orders/payments.');
