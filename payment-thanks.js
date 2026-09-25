const english=localStorage.getItem('naya_store_language')==='en';
const heading=document.getElementById('heading'),status=document.getElementById('paymentStatus'),number=document.getElementById('orderNumber'),retry=document.getElementById('retry');
if(english){document.documentElement.lang='en';document.documentElement.dir='ltr';document.title='Thank you | NAYA';heading.textContent='Thank you for choosing NAYA';document.querySelector('.note').textContent='We are happy to be part of your story.';document.getElementById('back').textContent='Back to the store';retry.textContent='Check payment status again';}
let orderId=sessionStorage.getItem('naya_pending_order_id');
const orderNumber=sessionStorage.getItem('naya_pending_order_number');
let busy=false;
async function check(){
 if(busy)return;busy=true;retry.hidden=true;
 if(!orderId){status.textContent=english?'You can return to the store using the button below.':'אפשר לחזור לחנות באמצעות הכפתור למטה.';busy=false;return;}
 status.textContent=english?'Checking your payment confirmation...':'בודקים את אישור התשלום...';
 try{
  const api=await import('./api-module.js');
  for(let attempt=0;attempt<8;attempt++){
   const result=await api.request('/functions/v1/naya-tranzila',{method:'POST',body:{action:'status',order_id:orderId}});
   if(result.payment_status==='paid'){
    heading.textContent=english?'Thank you for your order!':'תודה על הזמנתך!';status.textContent=english?'Your payment was received successfully.':'התשלום התקבל בהצלחה.';
    if(orderNumber){number.textContent=(english?'Order number: ':'מספר הזמנה: ')+orderNumber;number.hidden=false;}
    localStorage.removeItem('naya_new_store_cart_v2');
    sessionStorage.removeItem('naya_pending_order_id');sessionStorage.removeItem('naya_pending_order_number');
    await window.NayaPurchaseAnalytics?.send?.();return;
   }
   if(result.payment_status==='failed'){status.textContent=english?'Payment has not been confirmed. Please contact the store before trying again.':'התשלום לא אושר במערכת. יש ליצור קשר עם החנות לפני ניסיון תשלום נוסף.';retry.hidden=false;return;}
   if(attempt<7)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  status.textContent=english?'Payment confirmation is still pending. Please do not pay again. You can check the status again shortly.':'אישור התשלום עדיין בבדיקה. אין לבצע תשלום נוסף. אפשר לבדוק שוב בעוד רגע.';retry.hidden=false;
 }catch{status.textContent=english?'Payment status could not be checked right now. Please try checking again.':'לא ניתן לבדוק כרגע את אישור התשלום. אפשר לנסות לבדוק שוב.';retry.hidden=false;}
 finally{busy=false;}
}
retry.addEventListener('click',check);check();
