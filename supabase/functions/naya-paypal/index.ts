import {usdAmount,priceTotals,FALLBACK_USD_ILS_RATE,validRate} from '../shared/pricing.js';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET') || '';
const ENVIRONMENT = (Deno.env.get('PAYPAL_ENV') || 'sandbox').toLowerCase();
const CURRENCY = (Deno.env.get('PAYPAL_CURRENCY') || 'USD').toUpperCase();
const STORE_PUBLIC_URL = (Deno.env.get('STORE_PUBLIC_URL') || 'https://naya-jewelry.com').replace(/\/$/, '');
const PAYPAL_BASE = ENVIRONMENT === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
let cachedRate=FALLBACK_USD_ILS_RATE,rateLoadedAt=0;
async function exchangeRate(){
  if(Date.now()-rateLoadedAt<60*60*1000)return cachedRate;
  try{
    const response=await fetch('https://www.boi.org.il/PublicApi/GetExchangeRates?',{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('Exchange rate unavailable');
    const data=await response.json();
    const rate=data.exchangeRates?.find((entry:any)=>entry.key==='USD')?.currentExchangeRate;
    if(!validRate(rate))throw new Error('Invalid USD exchange rate');
    cachedRate=Number(rate);rateLoadedAt=Date.now();
  }catch(error){console.warn('Using last available USD rate:',String(error))}
  return cachedRate;
}

function serviceKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
}

async function db(path: string, options: RequestInit = {}) {
  const key = serviceKey();
  if (!key) throw new Error('Supabase secret key is unavailable');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${data?.message || data?.error || 'request failed'}`);
  return data;
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

async function accessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('PayPal credentials are missing');
  const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) throw new Error(`PayPal authentication failed: ${data?.error_description || response.status}`);
  return data.access_token as string;
}

async function paypal(path: string, options: RequestInit = {}) {
  const response = await fetch(`${PAYPAL_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`PayPal ${response.status}: ${data?.details?.[0]?.description || data?.message || 'request failed'}`);
  return data;
}

function countryCode(value: unknown) {
  const country = String(value || '').trim();
  if (/^[a-z]{2}$/i.test(country)) return country.toUpperCase();
  const codes: Record<string, string> = {
    'ישראל':'IL','israel':'IL','united states':'US','usa':'US','united kingdom':'GB','uk':'GB','canada':'CA',
    'australia':'AU','new zealand':'NZ','germany':'DE','france':'FR','italy':'IT','spain':'ES','portugal':'PT',
    'netherlands':'NL','belgium':'BE','switzerland':'CH','austria':'AT','ireland':'IE','greece':'GR','cyprus':'CY',
    'poland':'PL','czech republic':'CZ','romania':'RO','hungary':'HU','sweden':'SE','norway':'NO','denmark':'DK',
    'finland':'FI','thailand':'TH','japan':'JP','singapore':'SG','united arab emirates':'AE','uae':'AE',
    'south africa':'ZA','brazil':'BR','mexico':'MX','argentina':'AR'
  };
  return codes[country.toLowerCase()] || '';
}

async function orderData(orderId: string) {
  if(CURRENCY!=='USD')throw new Error('NAYA PayPal checkout requires USD');
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error('Invalid order ID');
  const rows = await db(`orders?id=eq.${encodeURIComponent(orderId)}&select=*,order_items(*)&limit=1`);
  const order = rows?.[0];
  if (!order) throw new Error('Order not found');
  if(order.currency!=='ILS')throw new Error('Unsupported source order currency');
  const rate=await exchangeRate();
  const ids=[...new Set((order.order_items||[]).map((item:any)=>String(item.product_id)))];
  if(!ids.length||ids.some(id=>! /^[0-9a-f-]{36}$/i.test(String(id))))throw new Error('Invalid order products');
  const products=await db(`products?id=in.(${ids.join(',')})&select=id,price_ils,price_usd`);
  const items = (order.order_items || []).map((item: any) => {
    const product=products.find((product:any)=>product.id===item.product_id);
    if(!product)throw new Error('Order product unavailable');
    const usd = usdAmount(item.unit_price,{price:product.price_ils,priceUsd:product.price_usd},rate);
    const selected = item.selected_options || {};
    const choices = [selected.color, selected.size, selected.style].filter(Boolean).join(' | ');
    return {
      name: String(item.product_name_he || item.product_name || 'NAYA Jewelry').slice(0, 127),
      description: choices.slice(0, 127), sku: String(item.sku || '').slice(0, 127),
      quantity: String(item.quantity), unit_amount: { currency_code: CURRENCY, value: usd.toFixed(2) }
    };
  });
  const prices=items.flatMap((item:any)=>Array.from({length:Number(item.quantity)},()=>Number(item.unit_amount.value)));
  // The order records whether the promotion was applied; do not re-read a later setting.
  const totals=priceTotals(prices,Number(order.promotion_discount)>0);
  return { order, items, total: totals.total.toFixed(2),subtotal:totals.subtotal.toFixed(2),discount:totals.discount.toFixed(2) };
}

async function start(orderId: string, functionUrl: string) {
  const { order, items, total,subtotal,discount } = await orderData(orderId);
  if (order.payment_status === 'paid') throw new Error('Order is already paid');
  const code = countryCode(order.country);
  const shipping = code ? { name: { full_name: order.customer_name }, address: { address_line_1: order.address, admin_area_2: order.city, postal_code: order.postal_code || '', country_code: code } } : undefined;
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: order.id, custom_id: order.id, invoice_id: String(order.order_number || order.id),
      amount: { currency_code: CURRENCY, value: total, breakdown: { item_total: { currency_code: CURRENCY, value: subtotal },...(Number(discount)>0?{discount:{currency_code:CURRENCY,value:discount}}:{}) } }, items,
      ...(shipping ? { shipping } : {}) }],
    application_context: {
      brand_name: 'NAYA Fine Jewelry', user_action: 'PAY_NOW', landing_page: 'BILLING',
      shipping_preference: shipping ? 'SET_PROVIDED_ADDRESS' : 'GET_FROM_FILE',
      return_url: `${functionUrl}?action=return&order_id=${encodeURIComponent(order.id)}`,
      cancel_url: `${functionUrl}?action=cancel&order_id=${encodeURIComponent(order.id)}`
    }
  };
  const result = await paypal('/v2/checkout/orders', { method: 'POST', body: JSON.stringify(payload) });
  const approvalUrl = result.links?.find((link: any) => link.rel === 'approve' || link.rel === 'payer-action')?.href;
  if (!result.id || !approvalUrl) throw new Error('PayPal approval link was not returned');
  await db(`orders?id=eq.${encodeURIComponent(order.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payment_provider: 'paypal', payment_request_id: result.id, payment_link: approvalUrl, payment_response_code: 'pending' }) });
  return { ok: true, paypal_order_id: result.id, approval_url: approvalUrl, currency: CURRENCY, total };
}

async function sendOrderEmails(orderId: string) {
  const key = serviceKey();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/naya-order-email`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId }) });
  if (!response.ok) console.error('Order email failed after PayPal payment:', await response.text());
}

async function capture(orderId: string, paypalOrderId: string, fundingSource = '') {
  if(!/^[0-9a-f-]{36}$/i.test(orderId))throw new Error('Invalid order ID');
  const rows=await db(`orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
  const order=rows?.[0];
  if(!order)throw new Error('Order not found');
  if (order.payment_status === 'paid') return `${STORE_PUBLIC_URL}/payment-success.html`;
  if (String(order.payment_request_id || '') !== paypalOrderId) throw new Error('PayPal order does not match the store order');
  // PayPal stores the server-created quote. Never reprice an approved order using
  // a new exchange rate, catalogue price or promotion setting during capture.
  const quoted=await paypal(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
  const unit=quoted.purchase_units?.[0],total=unit?.amount?.value;
  if(quoted.id!==paypalOrderId||quoted.purchase_units?.length!==1||unit?.custom_id!==order.id||unit?.reference_id!==order.id||unit?.amount?.currency_code!=='USD'||!(Number(total)>0))throw new Error('Invalid PayPal payment quote');
  const result = await paypal(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: 'POST', body: '{}' });
  const captureData = result.purchase_units?.[0]?.payments?.captures?.[0];
  const paymentSource = result.payment_source || {};
  const card = paymentSource.card || null;
  const paymentMethod = card
    ? `${String(card.brand || card.type || 'Card').toUpperCase()}${card.last_digits ? ` •••• ${card.last_digits}` : ''}`
    : paymentSource.apple_pay ? 'Apple Pay'
    : paymentSource.google_pay ? 'Google Pay'
    : fundingSource.toLowerCase() === 'card' ? 'כרטיס אשראי דרך PayPal'
    : 'PayPal';
  const paid = result.status === 'COMPLETED' && captureData?.status === 'COMPLETED' && captureData?.amount?.currency_code === CURRENCY && Math.round(Number(captureData?.amount?.value)*100) === Math.round(Number(total)*100);
  await db(`orders?id=eq.${encodeURIComponent(order.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payment_status: paid ? 'paid' : 'failed', payment_provider: 'paypal', payment_method_details: paymentMethod, payment_card_last4: card?.last_digits || null, payment_transaction_id: captureData?.id || paypalOrderId, payment_response_code: captureData?.status || result.status || 'capture_failed', payment_paid_at: paid ? new Date().toISOString() : null, payment_callback_received_at: new Date().toISOString() }) });
  if (!paid) throw new Error('PayPal payment could not be verified');
  await sendOrderEmails(order.id);
  return `${STORE_PUBLIC_URL}/payment-success.html`;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const action = String(body.action || url.searchParams.get('action') || 'start');
    const orderId = String(body.order_id || url.searchParams.get('order_id') || '');
    if (action === 'config') return json({ client_id: CLIENT_ID, currency: CURRENCY,usd_ils_rate:await exchangeRate() });
    if (action === 'start') return json(await start(orderId, `${SUPABASE_URL}/functions/v1/naya-paypal`));
    if (action === 'capture') {
      const redirectUrl = await capture(orderId, String(body.paypal_order_id || ''), String(body.funding_source || ''));
      return json({ ok: true, redirect_url: redirectUrl });
    }
    if (action === 'return') return Response.redirect(await capture(orderId, String(url.searchParams.get('token') || '')), 303);
    if (action === 'cancel') return Response.redirect(`${STORE_PUBLIC_URL}/payment-failed.html`, 303);
    return json({ ok: false, error: 'Unknown action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('naya-paypal failed:', message);
    if (request.method === 'GET') return Response.redirect(`${STORE_PUBLIC_URL}/payment-failed.html`, 303);
    return json({ ok: false, error: message }, 500);
  }
});

