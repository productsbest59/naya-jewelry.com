(() => {
  const pendingKey = 'naya_ga_pending_purchase_v1';
  const sentKey = 'naya_ga_sent_purchases_v1';

  const readJson = (storage, key, fallback) => {
    try { return JSON.parse(storage.getItem(key) || '') || fallback; }
    catch { return fallback; }
  };

  async function send() {
    const purchase = readJson(sessionStorage, pendingKey, null);
    if (!purchase?.transaction_id || typeof window.gtag !== 'function') return false;

    const sent = readJson(localStorage, sentKey, []);
    if (sent.includes(purchase.transaction_id)) {
      sessionStorage.removeItem(pendingKey);
      return true;
    }

    await new Promise(resolve => {
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        resolve();
      };
      window.gtag('event', 'purchase', {
        ...purchase,
        event_callback: finish,
        event_timeout: 2000
      });
      setTimeout(finish, 2200);
    });

    localStorage.setItem(sentKey, JSON.stringify([...sent, purchase.transaction_id].slice(-50)));
    sessionStorage.removeItem(pendingKey);
    return true;
  }

  window.NayaPurchaseAnalytics = { send };
})();
