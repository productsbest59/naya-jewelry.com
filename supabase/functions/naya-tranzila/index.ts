import {verifyReport} from './verification.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const TERMINAL = Deno.env.get('TRANZILA_TERMINAL') || '';
const APP_KEY = Deno.env.get('TRANZILA_APP_KEY') || '';
const APP_SECRET = Deno.env.get('TRANZILA_APP_SECRET') || '';
const ENABLED = Deno.env.get('TRANZILA_PAYMENTS_ENABLED') === 'true';
const STORE_PUBLIC_URL = (Deno.env.get('STORE_PUBLIC_URL') || 'https://naya-jewelry.com').replace(/\/$/, '');

function serviceKey() {
  return Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
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

async function input(request: Request) {
  if ((request.headers.get('content-type') || '').includes('application/json')) return await request.json();
  return Object.fromEntries((await request.formData()).entries());
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');

function nonce() {
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function authHeaders() {
  const requestTime = String(Math.floor(Date.now() / 1000));
  const requestNonce = nonce();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${APP_SECRET}${requestTime}${requestNonce}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(APP_KEY));
  return {
    'X-tranzila-api-app-key': APP_KEY,
    'X-tranzila-api-request-time': requestTime,
    'X-tranzila-api-nonce': requestNonce,
    'X-tranzila-api-access-token': hex(signature)
  };
}

function phoneParts(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^972/, '0');
  const area = digits.slice(0, 3) || '050';
  return { phone_country_code: '972', phone_area_code: area, phone_number: digits.slice(area.length) };
}

function countryCode(value: unknown) {
  const country = String(value || '').trim();
  if (/^[a-z]{2}$/i.test(country)) return country.toUpperCase();
  const codes: Record<string, string> = {
    'ישראל': 'IL', 'israel': 'IL', 'united states': 'US', 'usa': 'US', 'united kingdom': 'GB', 'uk': 'GB',
    'canada': 'CA', 'australia': 'AU', 'new zealand': 'NZ', 'germany': 'DE', 'france': 'FR', 'italy': 'IT',
    'spain': 'ES', 'portugal': 'PT', 'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH', 'austria': 'AT',
    'ireland': 'IE', 'greece': 'GR', 'cyprus': 'CY', 'poland': 'PL', 'czech republic': 'CZ', 'romania': 'RO',
    'hungary': 'HU', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI', 'thailand': 'TH',
    'japan': 'JP', 'singapore': 'SG', 'united arab emirates': 'AE', 'uae': 'AE', 'south africa': 'ZA',
    'brazil': 'BR', 'mexico': 'MX', 'argentina': 'AR'
  };
  return codes[country.toLowerCase()] || '';
}

async function createPayment(orderId: string) {
  if (!ENABLED) throw new Error('Tranzila payments are safely disabled until setup is complete');
  if (!TERMINAL || !APP_KEY || !APP_SECRET) throw new Error('Tranzila API credentials are missing');
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error('Invalid order ID');

  const rows = await db(`orders?id=eq.${encodeURIComponent(orderId)}&select=*,order_items(*)&limit=1`);
  const order = rows?.[0];
  if (!order) throw new Error('Order not found');
  if (order.payment_status === 'paid') throw new Error('Order is already paid');
  if (order.payment_link && order.payment_request_id) {
    return { ok: true, pr_id: order.payment_request_id, pr_link: order.payment_link, reused: true };
  }

  const items = (order.order_items || []).map((item: any, index: number) => ({
    id: index + 1, code: item.sku, name: item.product_name_he, type: 'I',
    unit_price: Number(item.unit_price), unit_type: 1, units_number: Number(item.quantity),
    price_type: 'G', currency_code: 'ILS', vat_percent: 18
  }));

  const clientCountryCode = countryCode(order.country);
  const body = {
    terminal_name: TERMINAL, created_by_user: 'naya-store', created_by_system: 'naya-supabase',
    created_via: 'TRAPI', action_type: 1, request_date: new Date().toISOString().slice(0, 10),
    request_language: 'hebrew', response_language: 'hebrew', request_currency: 'ILS',
    currency_code: 'ILS', request_vat: 18, payments_number: 1, payment_plans: [1],
    payment_methods: [1],
    send_email: { sender_name: 'Naya Fine Jewelry', sender_email: 'orders@naya-jewelry.com' },
    client: {
      external_id: order.id, name: order.customer_name, contact_person: order.customer_name,
      email: order.customer_email, address_line_1: order.address, city: order.city,
      ...(clientCountryCode ? { country_code: clientCountryCode } : {}),
      zip: order.postal_code || '', ...phoneParts(order.customer_phone)
    },
    items
  };

  const response = await fetch('https://api.tranzila.com/v1/pr/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || Number(data?.error_code) !== 0 || !data?.pr_link) {
    throw new Error(`Tranzila ${response.status}: ${data?.message || 'payment request failed'}`);
  }

  await db(`orders?id=eq.${encodeURIComponent(order.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ payment_provider: 'tranzila', payment_request_id: String(data.pr_id), payment_link: data.pr_link, payment_response_code: 'pending' })
  });
  return { ok: true, pr_id: String(data.pr_id), pr_link: data.pr_link };
}

function firstValue(body: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = body[name];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

async function transactionReport(transactionIndex: string) {
  const response = await fetch('https://report.tranzila.com/v1/transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ terminal_name: TERMINAL, transaction_index: Number(transactionIndex), detailed: 'N' })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Tranzila report ${response.status}: ${data?.message || 'request failed'}`);
  const transaction = data?.transactions?.[0];
  if (!transaction) throw new Error('Transaction was not found in Tranzila reports');
  return transaction;
}

async function sendOrderEmails(orderId: string) {
  const key = serviceKey();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/naya-order-email`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId })
  });
  if (!response.ok) console.error('Order email failed after successful payment:', await response.text());
}

async function handleNotify(body: Record<string, unknown>) {
  if (!TERMINAL || !APP_KEY || !APP_SECRET) throw new Error('Tranzila API credentials are missing');
  const paymentRequestId = firstValue(body, ['pr_id', 'payment_request_id']);
  const transactionIndex = firstValue(body, ['transaction_index', 'index', 'transaction_id']);
  if (!paymentRequestId) throw new Error('Missing Tranzila payment request ID');
  if (!/^\d+$/.test(transactionIndex)) throw new Error('Missing or invalid Tranzila transaction index');

  const rows = await db(`orders?payment_request_id=eq.${encodeURIComponent(paymentRequestId)}&select=*&limit=1`);
  const order = rows?.[0];
  if (!order) throw new Error('Order for this payment request was not found');
  if (order.payment_status === 'paid') return { ok: true, already_processed: true };

  const transaction = await transactionReport(transactionIndex);
  const verification=verifyReport(transaction,order.total,transactionIndex);
  const {approved,responseCode,reportedIndex}=verification;
  await db(`orders?id=eq.${encodeURIComponent(order.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      payment_status: approved ? 'paid' : 'failed',
      payment_provider: 'tranzila',
      payment_transaction_id: reportedIndex,
      payment_response_code: responseCode || 'verification_failed',
      payment_paid_at: approved ? new Date().toISOString() : null,
      payment_callback_received_at: new Date().toISOString()
    })
  });

  if (!approved) {
    console.error('Payment verification failed', verification);
    return { ok: false, verified: false };
  }
  await sendOrderEmails(order.id);
  return { ok: true, verified: true };
}

function paymentRedirect(action: string) {
  const page = action === 'success' ? 'payment-success.html' : 'payment-failed.html';
  return Response.redirect(`${STORE_PUBLIC_URL}/${page}`, 303);
}

async function paymentStatus(orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error('Invalid order ID');
  const rows = await db(`orders?id=eq.${encodeURIComponent(orderId)}&select=payment_status&limit=1`);
  return { payment_status: rows?.[0]?.payment_status || 'unknown' };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' } });
  try {
    const body = await input(request);
    const action = String(body.action || new URL(request.url).searchParams.get('action') || 'start');
    if (action === 'start') return json(await createPayment(String(body.order_id || '')));
    if (action === 'status') return json(await paymentStatus(String(body.order_id || '')));
    if (action === 'notify') { console.info('Tranzila Notify received', {format:request.headers.get('content-type'),fields:Object.keys(body)}); return json(await handleNotify(body)); }
    if (action === 'success' || action === 'fail') return paymentRedirect(action);
    return json({ ok: false, error: 'Unknown payment action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('naya-tranzila failed:', message);
    return json({ ok: false, error: message }, 500);
  }
});
