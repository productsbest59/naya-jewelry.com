(() => {
  const send = (name, params = {}) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };
  const readCart = () => {
    try {
      const cart = JSON.parse(localStorage.getItem('naya_new_store_cart_v2') || '{}');
      const products = window.NayaCatalog?.get?.() || [];
      const items = Object.values(cart).map(line => {
        const product = products.find(item => item.id === line.productId);
        if (!product) return null;
        return { item_id: product.id, item_name: product.nameHe || product.nameEn || product.id, price: Number(product.price) || 0, quantity: Number(line.qty) || 1 };
      }).filter(Boolean);
      return { items, value: items.reduce((sum, item) => sum + item.price * item.quantity, 0) };
    } catch { return { items: [], value: 0 }; }
  };
  window.addEventListener('load', () => {
    if (sessionStorage.getItem('naya_ga_begin_checkout')) return;
    const ecommerce = readCart();
    if (!ecommerce.items.length) return;
    sessionStorage.setItem('naya_ga_begin_checkout', '1');
    send('begin_checkout', { currency: 'ILS', ...ecommerce });
  });
  document.querySelector('#checkoutForm')?.addEventListener('submit', () => {
    const ecommerce = readCart();
    if (ecommerce.items.length) send('add_payment_info', { currency: 'ILS', payment_type: 'Tranzila', ...ecommerce });
  }, true);
})();
