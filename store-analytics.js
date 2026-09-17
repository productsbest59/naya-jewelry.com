(() => {
  const send = (name, params = {}) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };
  const productFromCard = card => {
    if (!card) return null;
    const itemId = card.dataset.product || '';
    const itemName = card.querySelector('h2')?.textContent?.trim() || itemId;
    const rawPrice = card.querySelector('.price')?.textContent || '';
    const price = Number(rawPrice.replace(/[^0-9.]/g, '')) || 0;
    return { item_id: itemId, item_name: itemName, price, quantity: 1 };
  };
  document.addEventListener('click', event => {
    const card = event.target.closest('[data-product]');
    if (event.target.closest('.add')) {
      const item = productFromCard(card);
      if (item) send('add_to_cart', { currency: 'ILS', value: item.price, items: [item] });
      return;
    }
    const detailAdd = event.target.closest('.product-detail-add');
    if (detailAdd) {
      const modal = detailAdd.closest('.product-detail-modal');
      const itemId = modal?.dataset.product || '';
      const itemName = modal?.querySelector('h2')?.textContent?.trim() || itemId;
      const rawPrice = modal?.querySelector('.product-detail-price')?.textContent || '';
      const price = Number(rawPrice.replace(/[^0-9.]/g, '')) || 0;
      send('add_to_cart', { currency: 'ILS', value: price, items: [{ item_id: itemId, item_name: itemName, price, quantity: 1 }] });
      return;
    }
    if (event.target.closest('#cartButton')) {
      send('view_cart', { currency: 'ILS' });
      return;
    }
    if (card && !event.target.closest('select,button,a')) {
      const item = productFromCard(card);
      if (item) send('view_item', { currency: 'ILS', value: item.price, items: [item] });
    }
  }, true);
})();
