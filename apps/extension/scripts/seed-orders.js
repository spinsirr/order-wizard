// Paste this into the side panel's DevTools Console to seed fake orders.
// To open DevTools on the side panel: right-click inside the panel → "Inspect".
//
// Usage:
//   seed(500)      // seed 500 orders
//   seed(5000)     // stress test
//   clearOrders()  // wipe all orders

(() => {
  const STATUSES = ['uncommented', 'commented', 'comment_revealed', 'reimbursed'];
  const SAMPLE_NAMES = [
    'Anker USB-C Charger 65W GaN III',
    'Logitech MX Master 3S Wireless Mouse',
    'Sony WH-1000XM5 Noise Cancelling Headphones',
    'Apple AirTag 4 Pack',
    'Kindle Paperwhite (11th Generation)',
    'Instant Pot Duo 7-in-1 Electric Pressure Cooker',
    'Dyson V15 Detect Cordless Vacuum',
    'LG 27" UltraGear Gaming Monitor',
    'Nespresso Vertuo Next Coffee Machine',
    'Bose QuietComfort Earbuds II',
  ];

  window.seed = async (n = 500) => {
    const now = Date.now();
    const orders = Array.from({ length: n }, (_, i) => ({
      id: crypto.randomUUID(),
      userId: 'local-dev',
      orderNumber: `111-${String(1000000 + i).padStart(7, '0')}-${String(i % 10000).padStart(4, '0')}`,
      productName: `${SAMPLE_NAMES[i % SAMPLE_NAMES.length]} (#${i + 1})`,
      orderDate: new Date(now - i * 86_400_000).toISOString().slice(0, 10),
      productImage: '',
      price: `$${(Math.random() * 200 + 5).toFixed(2)}`,
      status: STATUSES[i % STATUSES.length],
      createdAt: new Date(now - i * 60_000).toISOString(),
      updatedAt: new Date(now - i * 60_000).toISOString(),
    }));
    await chrome.storage.local.set({ orders });
    console.log(`Seeded ${n} orders. Reload the side panel to see them.`);
  };

  window.clearOrders = async () => {
    await chrome.storage.local.remove('orders');
    console.log('Cleared orders. Reload the side panel.');
  };

  console.log('Seed helpers loaded: seed(n), clearOrders()');
})();
