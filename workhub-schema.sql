CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('focus', 'discussion', 'room'))
);

CREATE TABLE IF NOT EXISTS bookings (
  ref TEXT PRIMARY KEY,
  seat_id TEXT NOT NULL REFERENCES seats(id),
  date TEXT NOT NULL,
  start_hour INTEGER NOT NULL,
  start_at TEXT,
  duration INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  paid_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'active', 'expired', 'completed', 'cancelled')),
  check_in_at TEXT,
  subtotal_cents INTEGER NOT NULL,
  service_fee_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_availability
ON bookings (date, seat_id, start_hour, duration, status);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  admin_username TEXT NOT NULL,
  admin_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created
ON activity_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vendor_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'vendor')),
  vendor_id TEXT REFERENCES vendors(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  vendor TEXT NOT NULL REFERENCES vendors(id),
  category TEXT NOT NULL,
  description TEXT,
  available INTEGER NOT NULL DEFAULT 1,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS food_orders (
  id TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL REFERENCES bookings(ref),
  seat_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  delivery TEXT NOT NULL CHECK (delivery IN ('table', 'pickup')),
  subtotal_cents INTEGER NOT NULL,
  service_fee_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
  placed_at TEXT NOT NULL,
  vendor TEXT NOT NULL REFERENCES vendors(id)
);

CREATE INDEX IF NOT EXISTS idx_food_orders_vendor
ON food_orders (vendor, status, placed_at);

CREATE TABLE IF NOT EXISTS food_payment_requests (
  id TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL REFERENCES bookings(ref),
  seat_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  delivery TEXT NOT NULL CHECK (delivery IN ('table', 'pickup')),
  description TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  payload_json TEXT NOT NULL,
  order_ids_json TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_food_payment_requests_status
ON food_payment_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS food_order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
