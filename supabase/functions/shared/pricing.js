// One pricing contract for storefront, cart, checkout and PayPal.
export const FALLBACK_USD_ILS_RATE=3.7;
export const validRate=value=>Number.isFinite(Number(value))&&Number(value)>0;
export const roundMoney=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
export function selectedPrice(product,choice={}){
 const variant=(product.variants||[]).find(v=>{
  const size=[v.size,v.style].filter(Boolean).join(' - ');
  return (!v.color||v.color===choice.color)&&(!size||size===choice.size);
 });
 const price=Number(variant?.price);
 return Number.isFinite(price)&&price>0?price:Number(product.price);
}
export function usdAmount(amount,product,rate=FALLBACK_USD_ILS_RATE){
 const ils=Number(amount),manual=Number(product?.priceUsd);
 if(!Number.isFinite(ils)||ils<0)throw new Error('Invalid product price');
 if(ils===Number(product?.price)&&Number.isFinite(manual)&&manual>0)return roundMoney(manual);
 return roundMoney(ils/(validRate(rate)?Number(rate):FALLBACK_USD_ILS_RATE));
}
export function linePrice({item,product},currency,rate){
 const ils=Number(item.price??product.price);
 return currency==='USD'?usdAmount(ils,product,rate):roundMoney(ils);
}
export function priceTotals(prices,promotionEnabled=true){
 const cents=prices.map(price=>Math.round(Number(price)*100));
 if(cents.some(price=>!Number.isFinite(price)||price<0))throw new Error('Invalid product price');
 const count=cents.length,rate=count>=5?1:count>=4?.5:0;
 const subtotal=cents.reduce((sum,price)=>sum+price,0);
 const discount=promotionEnabled&&count?Math.round(Math.min(...cents)*rate):0;
 return {count,rate,subtotal:subtotal/100,discount:discount/100,total:(subtotal-discount)/100};
}
export function assertPaymentQuote(payment,total,currency){
 if(payment?.currency!==currency||!Number.isFinite(Number(payment?.total))||Math.round(Number(payment.total)*100)!==Math.round(total*100)){
  throw new Error('Payment amount or currency does not match checkout. Refresh your cart before paying.');
 }
}
