// MongoDB init script - runs on first container startup
// Creates indexes for the orders collection

db = db.getSiblingDB('order_wizard');

// Create indexes
db.orders.createIndex({ user_id: 1 }, { name: 'idx_user_id' });

db.orders.createIndex(
  { user_id: 1, order_number: 1 },
  { unique: true, name: 'idx_user_order_unique' }
);

db.orders.createIndex(
  { id: 1, user_id: 1 },
  { name: 'idx_id_user' }
);

print('Indexes created for orders collection');
