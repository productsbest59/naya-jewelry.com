const orderId = sessionStorage.getItem('naya_pending_order_id');
if (orderId) {
  import('./api-module.js').then(async api => {
    try {
      const result = await api.request('/functions/v1/naya-tranzila', { method: 'POST', body: { action: 'status', order_id: orderId } });
      if (result?.payment_status === 'paid') {
        localStorage.removeItem('naya_new_store_cart_v2');
        sessionStorage.removeItem('naya_pending_order_id');
        sessionStorage.removeItem('naya_pending_order_number');
        location.reload();
      }
    } catch {}
  });
}
