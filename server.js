'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const isVercel = !!process.env.VERCEL;
const DATA = isVercel ? '/tmp/data' : path.join(__dirname, 'data');
const DB = isVercel ? '/tmp/data/db.json' : path.join(DATA, 'db.json');
const BK = path.join(DATA, 'backups');
const SF = path.join(DATA, '.secret');
const UPLOADS_DIR = isVercel ? '/tmp/uploads' : path.join(__dirname, 'public', 'uploads');

try { fs.mkdirSync(BK, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}

if (isVercel && !fs.existsSync(DB)) {
  const seedDb = path.join(__dirname, 'data', 'db.json');
  if (fs.existsSync(seedDb)) {
    try { fs.copyFileSync(seedDb, DB); } catch (e) {}
  }
}

const SECRET = process.env.JWT_SECRET || (fs.existsSync(SF) ? fs.readFileSync(SF, 'utf8') :
  (() => {
    const s = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(SF, s, { mode: 0o600 }); } catch (e) {}
    return s;
  })());

const CUSTOMER_SECRET = process.env.CUSTOMER_JWT_SECRET || (SECRET + '_cust_sec');

const ROLES = ['superadmin', 'manager', 'support'];
const STATUSES = ['New', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];

/* ---------- database persistence ---------- */
let db;
const save = () => {
  try {
    fs.writeFileSync(DB + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(DB + '.tmp', DB);
  } catch (e) {
    console.error('Failed to save db:', e.message);
  }
};
const nid = a => (Array.isArray(a) && a.length ? a.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1 : 1);

// Load database
if (fs.existsSync(DB)) {
  try {
    db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  } catch (e) {
    console.error('Error parsing DB, initializing empty structure');
    db = { users: [], products: [], orders: [], inquiries: [], logs: [], categories: [], customers: [], coupons: [], inventoryLogs: [], reviews: [] };
  }
} else {
  db = { users: [], products: [], orders: [], inquiries: [], logs: [], categories: [], customers: [], coupons: [], inventoryLogs: [], reviews: [] };
}

// Ensure all root collections exist
if (!db.users) db.users = [];
if (!db.products) db.products = [];
if (!db.orders) db.orders = [];
if (!db.inquiries) db.inquiries = [];
if (!db.logs) db.logs = [];
if (!db.categories) db.categories = [];
if (!db.customers) db.customers = [];
if (!db.coupons) db.coupons = [];
if (!db.inventoryLogs) db.inventoryLogs = [];
if (!db.reviews) db.reviews = [];
if (!db.newsletter) db.newsletter = [];

const log = (user, action, ip, details) => {
  db.logs.unshift({ t: Date.now(), user, action, ip, details });
  if (db.logs.length > 500) db.logs.length = 500;
  save();
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pubUser = u => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active });
const pubCust = c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address, wishlist: c.wishlist || [] });

/* ---------- Multer Storage for File Uploads ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    cb(null, `${cleanName}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) return cb(null, true);
  cb(new Error('Only JPEG, PNG, WebP and GIF images are allowed.'));
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter
});

/* ---------- Express App Setup & Security Headers ---------- */
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://res.cloudinary.com https://images.unsplash.com;"
  });
  next();
});

app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
if (isVercel) {
  app.use('/uploads', express.static(UPLOADS_DIR));
}

/* ---------- Authentication Middleware ---------- */
// Staff RBAC Middleware
const auth = (...roles) => (req, res, next) => {
  try {
    const t = jwt.verify(req.cookies.token, SECRET);
    const u = db.users.find(x => x.id === t.id && x.active);
    if (!u) throw new Error('no user');
    if (roles.length && u.role !== 'superadmin' && !roles.includes(u.role)) {
      return res.status(403).json({ error: 'Your staff role does not have permission for this action.' });
    }
    req.user = u;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Please sign in to access staff tools.' });
  }
};

// Customer Auth Middleware
const custAuth = (req, res, next) => {
  try {
    const token = req.cookies.cust_token;
    if (!token) throw new Error('No customer token');
    const decoded = jwt.verify(token, CUSTOMER_SECRET);
    const c = db.customers.find(x => x.id === decoded.id && x.active);
    if (!c) throw new Error('Customer account not found or disabled');
    req.customer = c;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Please sign in to your customer account.' });
  }
};

/* ---------- Rate Limiting Maps ---------- */
const loginFails = {};
const checkRateLimit = (ip, max = 5, windowMs = 9e5) => {
  const f = loginFails[ip];
  if (f && f.until > Date.now()) return false;
  return true;
};
const recordFail = ip => {
  const c = loginFails[ip] = loginFails[ip] || { n: 0 };
  if (++c.n >= 5) {
    c.until = Date.now() + 9e5; // 15 mins
    c.n = 0;
  }
};

/* ==============================================================================
   1. STAFF AUTHENTICATION ENDPOINTS
   ============================================================================== */
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in 15 minutes.' });
  }
  const uname = str(req.body.username, 40).toLowerCase();
  const u = db.users.find(x => x.username === uname);
  if (!u || !u.active || !bcrypt.compareSync(String(req.body.password || ''), u.hash)) {
    recordFail(ip);
    log(uname || 'unknown', 'failed staff login', ip);
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  delete loginFails[ip];
  res.cookie('token', jwt.sign({ id: u.id }, SECRET, { expiresIn: '8h' }), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 3600e3
  });
  log(u.username, 'staff login', ip);
  res.json(pubUser(u));
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', auth(), (req, res) => res.json(pubUser(req.user)));

/* ==============================================================================
   2. CUSTOMER AUTHENTICATION & PROFILE ENDPOINTS
   ============================================================================== */
app.post('/api/customer/register', (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const phone = str(req.body.phone, 30);
  const password = String(req.body.password || '');
  const address = str(req.body.address, 300);

  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
    return res.status(400).json({ error: 'Provide valid name, email and password (minimum 6 characters).' });
  }
  if (db.customers.some(c => c.email.toLowerCase() === email)) {
    return res.status(409).json({ error: 'An account with this email address already exists.' });
  }

  const newCust = {
    id: nid(db.customers),
    name,
    email,
    phone,
    address,
    passwordHash: bcrypt.hashSync(password, 10),
    active: true,
    wishlist: [],
    createdAt: Date.now()
  };

  db.customers.push(newCust);
  save();

  res.cookie('cust_token', jwt.sign({ id: newCust.id }, CUSTOMER_SECRET, { expiresIn: '30d' }), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600e3
  });

  res.status(201).json(pubCust(newCust));
});

app.post('/api/customer/login', (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const c = db.customers.find(x => x.email.toLowerCase() === email && x.active);

  if (!c || !bcrypt.compareSync(password, c.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.cookie('cust_token', jwt.sign({ id: c.id }, CUSTOMER_SECRET, { expiresIn: '30d' }), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600e3
  });

  res.json(pubCust(c));
});

app.post('/api/customer/logout', (req, res) => {
  res.clearCookie('cust_token');
  res.json({ ok: true });
});

app.get('/api/customer/me', (req, res) => {
  try {
    const token = req.cookies.cust_token;
    if (!token) return res.json(null);
    const decoded = jwt.verify(token, CUSTOMER_SECRET);
    const c = db.customers.find(x => x.id === decoded.id && x.active);
    if (!c) return res.json(null);
    const custOrders = db.orders.filter(o => o.phone === c.phone || (o.address && o.address.includes(c.name)));
    res.json({ ...pubCust(c), orders: custOrders });
  } catch (e) {
    res.json(null);
  }
});

app.post('/api/customer/wishlist', custAuth, (req, res) => {
  const pid = +req.body.productId;
  if (!pid) return res.status(400).json({ error: 'Product ID required.' });
  if (!req.customer.wishlist) req.customer.wishlist = [];
  const idx = req.customer.wishlist.indexOf(pid);
  if (idx >= 0) {
    req.customer.wishlist.splice(idx, 1);
  } else {
    req.customer.wishlist.push(pid);
  }
  save();
  res.json({ wishlist: req.customer.wishlist });
});

/* ==============================================================================
   3. MULTI-IMAGE MEDIA UPLOAD ENDPOINT
   ============================================================================== */
app.post('/api/upload', auth('superadmin', 'manager'), upload.array('images', 8), (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'Please select at least one image file.' });
    }
    const urls = req.files.map(f => `/uploads/${f.filename}`);
    log(req.user.username, `uploaded ${urls.length} media file(s)`, req.ip);
    res.json({ urls, url: urls[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Image upload failed.' });
  }
});

app.get('/api/media', auth('superadmin'), (req, res) => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) return res.json([]);
    const files = fs.readdirSync(UPLOADS_DIR)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const stats = fs.statSync(path.join(UPLOADS_DIR, f));
        return {
          filename: f,
          url: `/uploads/${f}`,
          size: stats.size,
          createdAt: stats.mtimeMs
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read media library.' });
  }
});

/* ==============================================================================
   4. ADVANCED PRODUCT MANAGEMENT ENDPOINTS
   ============================================================================== */
app.get('/api/products', (req, res) => {
  const includeHidden = req.query.admin === '1';
  let list = db.products;
  if (!includeHidden) {
    list = list.filter(p => p.isVisible !== false);
  }
  res.json(list);
});

app.get('/api/products/:id', (req, res) => {
  const p = db.products.find(x => x.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  const reviews = db.reviews.filter(r => r.productId === p.id && r.status === 'approved');
  const related = db.products
    .filter(x => x.category === p.category && x.id !== p.id && x.isVisible !== false)
    .slice(0, 4);
  res.json({ ...p, reviews, related });
});

app.post('/api/products', auth('superadmin'), (req, res) => {
  const b = req.body;
  const name = str(b.name, 100);
  const category = str(b.category, 80);
  const price = +b.price;
  const stock = +b.stock;

  if (!name || !category || !(price >= 0) || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Enter valid product name, category, price and stock.' });
  }

  const p = {
    id: nid(db.products),
    name,
    category,
    subcategory: str(b.subcategory, 80) || '',
    price,
    salePrice: b.salePrice ? +b.salePrice : null,
    stock,
    lowStockThreshold: b.lowStockThreshold ? +b.lowStockThreshold : 5,
    sku: str(b.sku, 50) || `PP-${category.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
    description: str(b.description, 1000) || '',
    image: str(b.image, 255) || (Array.isArray(b.images) && b.images[0]) || '/images/hero-aquarium.jpg',
    images: Array.isArray(b.images) && b.images.length ? b.images : [str(b.image, 255) || '/images/hero-aquarium.jpg'],
    specifications: typeof b.specifications === 'object' && b.specifications !== null ? b.specifications : {},
    labels: Array.isArray(b.labels) ? b.labels : ['New Arrival'],
    isFeatured: !!b.isFeatured,
    isVisible: b.isVisible !== false,
    rating: 5.0,
    reviewCount: 0
  };

  db.products.push(p);

  // Log inventory creation
  db.inventoryLogs.unshift({
    id: nid(db.inventoryLogs),
    productId: p.id,
    productName: p.name,
    change: stock,
    previousStock: 0,
    newStock: stock,
    reason: 'Initial stock on product creation',
    performedBy: req.user.username,
    timestamp: Date.now()
  });

  save();
  log(req.user.username, `added product ${name} (Stock: ${stock})`, req.ip);
  res.status(201).json(p);
});

app.put('/api/products/:id', auth('superadmin'), (req, res) => {
  const p = db.products.find(x => x.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  const b = req.body;

  if (b.name) p.name = str(b.name, 100);
  if (b.category) p.category = str(b.category, 80);
  if (b.subcategory !== undefined) p.subcategory = str(b.subcategory, 80);
  if (b.price !== undefined && +b.price >= 0) p.price = +b.price;
  if (b.salePrice !== undefined) p.salePrice = b.salePrice ? +b.salePrice : null;
  if (b.description !== undefined) p.description = str(b.description, 1000);
  if (b.sku !== undefined) p.sku = str(b.sku, 50);
  if (b.lowStockThreshold !== undefined) p.lowStockThreshold = Math.max(0, +b.lowStockThreshold);
  if (b.isFeatured !== undefined) p.isFeatured = !!b.isFeatured;
  if (b.isVisible !== undefined) p.isVisible = !!b.isVisible;
  if (Array.isArray(b.labels)) p.labels = b.labels;
  if (typeof b.specifications === 'object' && b.specifications !== null) p.specifications = b.specifications;
  if (Array.isArray(b.images)) {
    p.images = b.images;
    if (b.images.length && !b.image) p.image = b.images[0];
  }
  if (b.image) p.image = str(b.image, 255);

  save();
  log(req.user.username, `updated product details #${p.id} (${p.name})`, req.ip);
  res.json(p);
});

app.delete('/api/products/:id', auth('superadmin'), (req, res) => {
  const i = db.products.findIndex(x => x.id === +req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Product not found.' });
  const prod = db.products[i];
  log(req.user.username, `deleted product #${prod.id} (${prod.name})`, req.ip);
  db.products.splice(i, 1);
  save();
  res.json({ ok: true, message: `Product ${prod.name} deleted.` });
});

/* ==============================================================================
   5. ADVANCED INVENTORY MANAGEMENT ENDPOINTS
   ============================================================================== */
app.get('/api/inventory', auth('superadmin', 'manager'), (req, res) => {
  const items = db.products.map(p => {
    const threshold = p.lowStockThreshold || 5;
    let status = 'in_stock';
    if (p.stock <= 0) status = 'out_of_stock';
    else if (p.stock <= threshold) status = 'low_stock';
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      sku: p.sku || `PP-${p.id}`,
      stock: p.stock,
      lowStockThreshold: threshold,
      status,
      price: p.price
    };
  });
  res.json(items);
});

app.patch('/api/products/:id/stock', auth('superadmin', 'manager', 'support'), (req, res) => {
  const p = db.products.find(x => x.id === +req.params.id);
  const s = req.body.stock;
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  if (!Number.isInteger(s) || s < 0 || s > 100000) {
    return res.status(400).json({ error: 'Stock must be a whole number, 0 or greater.' });
  }

  const prev = p.stock;
  p.stock = s;

  db.inventoryLogs.unshift({
    id: nid(db.inventoryLogs),
    productId: p.id,
    productName: p.name,
    change: s - prev,
    previousStock: prev,
    newStock: s,
    reason: str(req.body.reason, 200) || 'Manual stock override',
    performedBy: req.user.username,
    timestamp: Date.now()
  });

  save();
  log(req.user.username, `stock ${p.name} updated: ${prev} -> ${s}`, req.ip);
  res.json(p);
});

app.post('/api/inventory/adjust', auth('superadmin', 'manager'), (req, res) => {
  const pid = +req.body.productId;
  const delta = +req.body.change;
  const reason = str(req.body.reason, 200) || 'Manual adjustment';
  const p = db.products.find(x => x.id === pid);

  if (!p) return res.status(404).json({ error: 'Product not found.' });
  if (!Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: 'Provide a non-zero adjustment amount.' });
  if (p.stock + delta < 0) return res.status(400).json({ error: `Cannot reduce stock below zero (current: ${p.stock}).` });

  const prev = p.stock;
  p.stock += delta;

  db.inventoryLogs.unshift({
    id: nid(db.inventoryLogs),
    productId: p.id,
    productName: p.name,
    change: delta,
    previousStock: prev,
    newStock: p.stock,
    reason,
    performedBy: req.user.username,
    timestamp: Date.now()
  });

  save();
  log(req.user.username, `inventory adjust ${p.name}: ${delta > 0 ? '+' : ''}${delta}`, req.ip);
  res.json({ product: p, log: db.inventoryLogs[0] });
});

app.get('/api/inventory/logs', auth('superadmin', 'manager'), (req, res) => {
  res.json(db.inventoryLogs.slice(0, 200));
});

/* ==============================================================================
   6. ORDER MANAGEMENT & FULFILLMENT ENDPOINTS
   ============================================================================== */
app.post('/api/orders', (req, res) => {
  const b = req.body;
  const name = str(b.name, 80);
  const phone = str(b.phone, 30);
  const address = str(b.address, 300);
  const couponCode = str(b.coupon, 30).toUpperCase();

  if (!name || !phone || !address || !Array.isArray(b.items) || !b.items.length || b.items.length > 50) {
    return res.status(400).json({ error: 'Enter your name, phone, address and at least one item.' });
  }

  const lines = [];
  for (const it of b.items) {
    const p = db.products.find(x => x.id === it.id);
    if (!p || !Number.isInteger(it.qty) || it.qty < 1 || lines.some(l => l.id === p.id)) {
      return res.status(400).json({ error: 'Invalid product item in cart.' });
    }
    if (it.qty > p.stock) {
      return res.status(409).json({ error: `Only ${p.stock} units of ${p.name} available.` });
    }
    lines.push({ id: p.id, name: p.name, qty: it.qty, price: p.salePrice || p.price });
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let discount = 0;

  // Validate coupon if applied
  if (couponCode) {
    const c = db.coupons.find(x => x.code === couponCode && x.active);
    if (c) {
      if (!c.minOrder || subtotal >= c.minOrder) {
        if (c.discountType === 'percent') {
          discount = Math.round((subtotal * c.discountValue) / 100);
          if (c.maxDiscount && discount > c.maxDiscount) discount = c.maxDiscount;
        } else if (c.discountType === 'fixed') {
          discount = Math.min(c.discountValue, subtotal);
        }
        c.usageCount = (c.usageCount || 0) + 1;
      }
    }
  }

  // Deduct stock and log inventory change
  lines.forEach(l => {
    const prod = db.products.find(x => x.id === l.id);
    const prev = prod.stock;
    prod.stock -= l.qty;

    db.inventoryLogs.unshift({
      id: nid(db.inventoryLogs),
      productId: prod.id,
      productName: prod.name,
      change: -l.qty,
      previousStock: prev,
      newStock: prod.stock,
      reason: `Order #${b.orderId || 'checkout'} purchase`,
      performedBy: 'system',
      timestamp: Date.now()
    });
  });

  const total = Math.max(0, subtotal - discount);
  const o = {
    id: nid(db.orders.length ? db.orders : [{ id: 1000 }]),
    name,
    phone,
    address,
    items: lines,
    subtotal,
    discount,
    couponCode: couponCode || null,
    total,
    paymentMethod: 'Cash / UPI on Delivery',
    status: 'New',
    statusHistory: [
      { status: 'New', time: Date.now(), note: 'Order placed by customer via Cash/UPI on Delivery' }
    ],
    date: Date.now()
  };

  db.orders.unshift(o);
  save();
  res.status(201).json(o);
});

app.get('/api/orders', auth('superadmin', 'manager', 'support'), (req, res) => {
  if (req.user.role === 'support') {
    // Support receives customer order lookups
    return res.json(db.orders.map(o => ({
      id: o.id,
      name: o.name,
      phone: o.phone,
      total: o.total,
      status: o.status,
      date: o.date
    })));
  }
  res.json(db.orders);
});

app.patch('/api/orders/:id', auth('superadmin', 'manager'), (req, res) => {
  const o = db.orders.find(x => x.id === +req.params.id);
  const status = req.body.status;
  const note = str(req.body.note, 200);

  if (!o || !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid order or status.' });
  }

  o.status = status;
  if (!o.statusHistory) o.statusHistory = [];
  o.statusHistory.push({
    status,
    time: Date.now(),
    note: note || `Status updated to ${status} by ${req.user.username}`
  });

  save();
  log(req.user.username, `order #${o.id} status changed to ${status}`, req.ip);
  res.json(o);
});

app.post('/api/orders/:id/cancel', auth('superadmin', 'manager'), (req, res) => {
  const o = db.orders.find(x => x.id === +req.params.id);
  const reason = str(req.body.reason, 300);

  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (o.status === 'Cancelled') return res.status(400).json({ error: 'Order is already cancelled.' });
  if (!reason) return res.status(400).json({ error: 'A cancellation reason is required.' });

  o.status = 'Cancelled';
  o.cancelReason = reason;
  if (!o.statusHistory) o.statusHistory = [];
  o.statusHistory.push({
    status: 'Cancelled',
    time: Date.now(),
    note: `Order cancelled by ${req.user.username}. Reason: ${reason}`
  });

  // Restore inventory items
  if (Array.isArray(o.items)) {
    o.items.forEach(it => {
      const prod = db.products.find(x => x.id === it.id);
      if (prod) {
        const prev = prod.stock;
        prod.stock += it.qty;
        db.inventoryLogs.unshift({
          id: nid(db.inventoryLogs),
          productId: prod.id,
          productName: prod.name,
          change: it.qty,
          previousStock: prev,
          newStock: prod.stock,
          reason: `Restoration from cancelled Order #${o.id}: ${reason}`,
          performedBy: req.user.username,
          timestamp: Date.now()
        });
      }
    });
  }

  save();
  log(req.user.username, `cancelled order #${o.id} (stock restored)`, req.ip);
  res.json({ ok: true, order: o });
});

// Printable HTML Invoice
app.get('/api/orders/:id/invoice', (req, res) => {
  const o = db.orders.find(x => x.id === +req.params.id);
  if (!o) return res.status(404).send('<h2>Order not found</h2>');

  const settings = db.settings || { storeName: 'Pairaplants' };
  const itemsHtml = o.items.map(it => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;"><strong>${it.name}</strong></td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">₹${it.price.toLocaleString('en-IN')}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${it.qty}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">₹${(it.price * it.qty).toLocaleString('en-IN')}</td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tax Invoice - Order #${o.id} - ${settings.storeName}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111a15; margin: 40px; }
        .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; border-radius: 8px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #15271f; padding-bottom: 20px; }
        .logo { font-size: 28px; font-weight: bold; color: #15271f; }
        table { width: 100%; border-collapse: collapse; margin-top: 25px; }
        th { background: #f4f7f5; padding: 10px; text-align: left; }
        .total-box { margin-top: 20px; text-align: right; }
        @media print { .no-print { display: none; } body { margin: 0; } }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="no-print" style="margin-bottom:20px;">
          <button onclick="window.print()" style="padding:8px 18px;background:#15271f;color:#fff;border:none;border-radius:4px;cursor:pointer;">🖨️ Print Invoice</button>
        </div>
        <div class="header">
          <div>
            <div class="logo">🌿 ${settings.brandTitle || 'Paira Plants'}</div>
            <div style="font-size:12px;color:#666;">${settings.tagline || 'Aquatic Plants, Fishes & Gravels'}</div>
          </div>
          <div style="text-align:right;">
            <h2 style="margin:0;color:#15271f;">TAX INVOICE</h2>
            <div style="font-size:13px;color:#666;">Invoice #: PP-INV-${o.id}</div>
            <div style="font-size:13px;color:#666;">Date: ${new Date(o.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;margin-top:25px;">
          <div>
            <strong>Billed &amp; Shipped To:</strong>
            <div style="margin-top:6px;line-height:1.5;">
              ${o.name}<br>
              Phone: ${o.phone}<br>
              ${o.address.replace(/\n/g, '<br>')}
            </div>
          </div>
          <div style="text-align:right;">
            <strong>Payment Mode:</strong>
            <div style="margin-top:6px;color:#3d664c;font-weight:600;">${o.paymentMethod || 'Cash / UPI on Delivery'}</div>
            <div style="font-size:12px;color:#666;margin-top:4px;">Status: <strong>${o.status}</strong></div>
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Description</th><th style="text-align:center;">Unit Price</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Amount</th></tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="total-box">
          <div style="font-size:14px;margin-bottom:4px;">Subtotal: ₹${(o.subtotal || o.total).toLocaleString('en-IN')}</div>
          ${o.discount ? `<div style="font-size:14px;color:#bd5233;margin-bottom:4px;">Discount (${o.couponCode || 'Coupon'}): -₹${o.discount.toLocaleString('en-IN')}</div>` : ''}
          <div style="font-size:14px;margin-bottom:6px;">Thermal Live Arrival Packaging: <strong style="color:#3d664c;">FREE</strong></div>
          <div style="font-size:20px;font-weight:bold;color:#15271f;border-top:1px solid #ccc;padding-top:8px;">Total Payable: ₹${o.total.toLocaleString('en-IN')}</div>
        </div>

        <div style="margin-top:40px;padding-top:20px;border-top:1px dashed #ccc;font-size:12px;color:#666;text-align:center;">
          Thank you for choosing Pairaplants. Live plants and animals are dispatched with oxygenated insulation packaging. For plant care questions, email care@pairaplants.com.
        </div>
      </div>
    </body>
    </html>
  `);
});

// CSV Export for Orders
app.get('/api/reports/orders/export', auth('superadmin', 'manager'), (req, res) => {
  const headers = ['Order ID', 'Date', 'Customer Name', 'Phone', 'Address', 'Total Amount', 'Status', 'Payment Method', 'Items Count'];
  const rows = db.orders.map(o => [
    o.id,
    new Date(o.date).toISOString(),
    `"${(o.name || '').replace(/"/g, '""')}"`,
    `"${(o.phone || '').replace(/"/g, '""')}"`,
    `"${(o.address || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    o.total,
    o.status,
    `"${o.paymentMethod || 'Cash / UPI on Delivery'}"`,
    Array.isArray(o.items) ? o.items.length : 0
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=pairaplants-orders-${Date.now()}.csv`);
  res.send(csv);
});

/* ==============================================================================
   7. HOMEPAGE MANAGEMENT CMS ENDPOINTS
   ============================================================================== */
app.get('/api/homepage', (req, res) => {
  res.json(db.homepage || {});
});

app.put('/api/homepage', auth('superadmin'), (req, res) => {
  const b = req.body;
  if (!db.homepage) db.homepage = {};

  if (b.hero) db.homepage.hero = { ...db.homepage.hero, ...b.hero };
  if (Array.isArray(b.promoBanners)) db.homepage.promoBanners = b.promoBanners;
  if (b.whyChooseUs) db.homepage.whyChooseUs = b.whyChooseUs;
  if (Array.isArray(b.sections)) db.homepage.sections = b.sections;

  save();
  log(req.user.username, 'updated homepage CMS configurations', req.ip);
  res.json(db.homepage);
});

/* ==============================================================================
   8. CATEGORIES & TAXONOMY ENDPOINTS
   ============================================================================== */
app.get('/api/categories', (req, res) => {
  res.json(db.categories || []);
});

app.post('/api/categories', auth('superadmin'), (req, res) => {
  const name = str(req.body.name, 100);
  const icon = str(req.body.icon, 10) || '🌿';
  const subcategories = Array.isArray(req.body.subcategories) ? req.body.subcategories : [];

  if (!name) return res.status(400).json({ error: 'Category name is required.' });

  const cat = {
    id: nid(db.categories),
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    icon,
    subcategories
  };

  db.categories.push(cat);
  save();
  log(req.user.username, `added category ${name}`, req.ip);
  res.status(201).json(cat);
});

/* ==============================================================================
   9. COUPONS & DISCOUNTS ENDPOINTS
   ============================================================================== */
app.get('/api/coupons', auth('superadmin'), (req, res) => {
  res.json(db.coupons || []);
});

app.post('/api/coupons', auth('superadmin'), (req, res) => {
  const code = str(req.body.code, 30).toUpperCase();
  const type = req.body.discountType === 'fixed' ? 'fixed' : 'percent';
  const val = +req.body.discountValue;

  if (!code || !(val > 0)) {
    return res.status(400).json({ error: 'Coupon code and positive discount value required.' });
  }

  const cp = {
    id: nid(db.coupons),
    code,
    discountType: type,
    discountValue: val,
    minOrder: +req.body.minOrder || 0,
    maxDiscount: req.body.maxDiscount ? +req.body.maxDiscount : null,
    active: true,
    usageCount: 0,
    expiresAt: req.body.expiresAt || '2027-12-31'
  };

  db.coupons.push(cp);
  save();
  log(req.user.username, `created coupon ${code}`, req.ip);
  res.status(201).json(cp);
});

app.delete('/api/coupons/:id', auth('superadmin'), (req, res) => {
  const i = db.coupons.findIndex(x => x.id === +req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Coupon not found.' });
  const c = db.coupons.splice(i, 1)[0];
  save();
  log(req.user.username, `deleted coupon ${c.code}`, req.ip);
  res.json({ ok: true });
});

app.post('/api/coupons/validate', (req, res) => {
  const code = str(req.body.code, 30).toUpperCase();
  const subtotal = +req.body.subtotal || 0;
  const c = db.coupons.find(x => x.code === code && x.active);

  if (!c) return res.status(404).json({ error: 'Invalid or expired coupon code.' });
  if (c.minOrder && subtotal < c.minOrder) {
    return res.status(400).json({ error: `This coupon requires a minimum cart value of ₹${c.minOrder}.` });
  }

  let discount = 0;
  if (c.discountType === 'percent') {
    discount = Math.round((subtotal * c.discountValue) / 100);
    if (c.maxDiscount && discount > c.maxDiscount) discount = c.maxDiscount;
  } else {
    discount = Math.min(c.discountValue, subtotal);
  }

  res.json({ valid: true, code: c.code, discount, discountType: c.discountType, discountValue: c.discountValue });
});

/* ==============================================================================
   10. REVIEWS & RATINGS ENDPOINTS
   ============================================================================== */
app.post('/api/products/:id/reviews', (req, res) => {
  const pid = +req.params.id;
  const prod = db.products.find(x => x.id === pid);
  if (!prod) return res.status(404).json({ error: 'Product not found.' });

  const name = str(req.body.name, 60);
  const rating = Math.min(5, Math.max(1, Math.round(+req.body.rating || 5)));
  const title = str(req.body.title, 100);
  const comment = str(req.body.comment, 500);

  if (!name || !comment) return res.status(400).json({ error: 'Please enter your name and review feedback.' });

  const rev = {
    id: nid(db.reviews),
    productId: pid,
    customerName: name,
    rating,
    title,
    comment,
    verifiedPurchase: true,
    status: 'approved',
    createdAt: Date.now()
  };

  db.reviews.unshift(rev);

  // Recalculate average rating
  const pRevs = db.reviews.filter(r => r.productId === pid && r.status === 'approved');
  const avg = pRevs.reduce((s, r) => s + r.rating, 0) / pRevs.length;
  prod.rating = +avg.toFixed(1);
  prod.reviewCount = pRevs.length;

  save();
  res.status(201).json(rev);
});

/* ==============================================================================
   11. CUSTOMER CARE INQUIRIES ENDPOINTS
   ============================================================================== */
app.post('/api/inquiries', (req, res) => {
  const b = req.body;
  const name = str(b.name, 80);
  const email = str(b.email, 120);
  const phone = str(b.phone, 30);
  const msg = str(b.message, 1000);

  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !msg) {
    return res.status(400).json({ error: 'Enter your name, a valid email address and your message.' });
  }

  const q = {
    id: nid(db.inquiries),
    name,
    email,
    phone,
    message: msg,
    status: 'open',
    done: false,
    replyNotes: '',
    date: Date.now()
  };

  db.inquiries.unshift(q);
  save();
  res.status(201).json({ ok: true });
});

app.get('/api/inquiries', auth('superadmin', 'support'), (req, res) => {
  res.json(db.inquiries);
});

app.patch('/api/inquiries/:id', auth('superadmin', 'support'), (req, res) => {
  const q = db.inquiries.find(x => x.id === +req.params.id);
  if (!q) return res.status(404).json({ error: 'Inquiry not found.' });

  if (req.body.status) q.status = req.body.status;
  if (req.body.done !== undefined) q.done = !!req.body.done;
  if (req.body.replyNotes !== undefined) q.replyNotes = str(req.body.replyNotes, 1000);

  save();
  res.json(q);
});

/* ==============================================================================
   12. NEWSLETTER SUBSCRIPTION
   ============================================================================== */
app.post('/api/newsletter', (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Provide a valid email address.' });
  if (!db.newsletter.some(n => n.email === email)) {
    db.newsletter.push({ email, date: Date.now() });
    save();
  }
  res.json({ ok: true, message: 'Thank you for subscribing to Pairaplants Botanical updates!' });
});

/* ==============================================================================
   13. CUSTOMERS DIRECTORY (ADMIN)
   ============================================================================== */
app.get('/api/customers', auth('superadmin', 'manager'), (req, res) => {
  const list = db.customers.map(c => {
    const custOrders = db.orders.filter(o => o.phone === c.phone || (o.address && o.address.includes(c.name)));
    const totalSpent = custOrders.reduce((s, o) => s + (o.status !== 'Cancelled' ? o.total : 0), 0);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      active: c.active,
      orderCount: custOrders.length,
      totalSpent,
      createdAt: c.createdAt
    };
  });
  res.json(list);
});

/* ==============================================================================
   14. REPORTS & ANALYTICS OVERVIEW
   ============================================================================== */
app.get('/api/reports/overview', auth('superadmin', 'manager'), (req, res) => {
  const totalProducts = db.products.length;
  const totalOrders = db.orders.length;
  const pendingOrders = db.orders.filter(o => o.status === 'New' || o.status === 'Packed').length;
  const deliveredOrders = db.orders.filter(o => o.status === 'Delivered').length;
  const lowStockProducts = db.products.filter(p => p.stock > 0 && p.stock <= (p.lowStockThreshold || 5)).length;
  const outOfStockProducts = db.products.filter(p => p.stock === 0).length;
  const totalCustomers = db.customers.length;
  const totalRevenue = db.orders.filter(o => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0);

  // Top selling products by order frequency
  const salesCount = {};
  db.orders.forEach(o => {
    if (o.status !== 'Cancelled' && Array.isArray(o.items)) {
      o.items.forEach(it => {
        salesCount[it.name] = (salesCount[it.name] || 0) + it.qty;
      });
    }
  });

  const topSelling = Object.entries(salesCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  res.json({
    totalProducts,
    totalOrders,
    pendingOrders,
    deliveredOrders,
    lowStockProducts,
    outOfStockProducts,
    totalCustomers,
    totalRevenue,
    topSelling
  });
});

/* ==============================================================================
   15. STORE SETTINGS & SEO ENDPOINTS
   ============================================================================== */
app.get('/api/settings', (req, res) => {
  res.json(db.settings || {});
});

app.put('/api/settings', auth('superadmin'), (req, res) => {
  db.settings = { ...db.settings, ...req.body };
  save();
  log(req.user.username, 'updated store & SEO settings', req.ip);
  res.json(db.settings);
});

/* ==============================================================================
   16. SEO: DYNAMIC SITEMAP.XML & ROBOTS.TXT
   ============================================================================== */
app.get('/sitemap.xml', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const staticUrls = ['#home', '#shop', '#story', '#contact'];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  staticUrls.forEach(u => {
    xml += `  <url>\n    <loc>${host}/${u}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  db.products.filter(p => p.isVisible !== false).forEach(p => {
    xml += `  <url>\n    <loc>${host}/#product?id=${p.id}</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
  });

  xml += `</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

app.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /#staff\n\nSitemap: ${host}/sitemap.xml\n`);
});

/* ==============================================================================
   17. STAFF USERS, BACKUPS & SECURITY LOGS
   ============================================================================== */
app.get('/api/users', auth('superadmin'), (req, res) => res.json(db.users.map(pubUser)));

app.post('/api/users', auth('superadmin'), (req, res) => {
  const b = req.body;
  const username = str(b.username, 20).toLowerCase();
  const name = str(b.name, 60);
  const pw = String(b.password || '');

  if (!/^[a-z0-9_]{3,20}$/.test(username) || !name || pw.length < 8 || !ROLES.includes(b.role)) {
    return res.status(400).json({ error: 'Use a 3–20 letter username, a name, a valid role and password (8+ chars).' });
  }
  if (db.users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const u = {
    id: nid(db.users),
    username,
    name,
    role: b.role,
    hash: bcrypt.hashSync(pw, 10),
    active: true
  };

  db.users.push(u);
  save();
  log(req.user.username, `created staff account ${username} (${u.role})`, req.ip);
  res.status(201).json(pubUser(u));
});

app.patch('/api/users/:id', auth('superadmin'), (req, res) => {
  const u = db.users.find(x => x.id === +req.params.id);
  const b = req.body;
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (u.id === req.user.id && ('role' in b || 'active' in b)) {
    return res.status(400).json({ error: 'You cannot change your own role or access status.' });
  }
  if ('role' in b) {
    if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'Invalid role.' });
    u.role = b.role;
  }
  if ('active' in b) u.active = !!b.active;
  if ('password' in b) {
    if (String(b.password).length < 8) return res.status(400).json({ error: 'Password needs 8+ characters.' });
    u.hash = bcrypt.hashSync(String(b.password), 10);
  }
  save();
  log(req.user.username, `updated staff user ${u.username}`, req.ip);
  res.json(pubUser(u));
});

const backupNow = () => {
  const f = 'db-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.copyFileSync(DB, path.join(BK, f));
  return f;
};

const backups = () => {
  try {
    return fs.readdirSync(BK).filter(f => /^db-[\w.-]+\.json$/.test(f)).sort().reverse()
      .map(f => ({ file: f, size: fs.statSync(path.join(BK, f)).size }));
  } catch (e) {
    return [];
  }
};

app.get('/api/backups', auth('superadmin'), (req, res) => res.json(backups()));

app.post('/api/backups', auth('superadmin'), (req, res) => {
  const f = backupNow();
  log(req.user.username, 'created backup ' + f, req.ip);
  res.status(201).json({ file: f });
});

app.post('/api/backups/restore', auth('superadmin'), (req, res) => {
  const f = String(req.body.file || '');
  if (!/^db-[\w.-]+\.json$/.test(f) || !fs.existsSync(path.join(BK, f))) {
    return res.status(400).json({ error: 'Backup not found.' });
  }
  backupNow();
  fs.copyFileSync(path.join(BK, f), DB);
  db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  log(req.user.username, 'restored backup ' + f, req.ip);
  res.json({ ok: true, message: `Database restored from ${f}` });
});

app.get('/api/logs', auth('superadmin'), (req, res) => res.json(db.logs));

if (!isVercel) {
  setInterval(() => {
    try {
      backupNow();
      backups().slice(14).forEach(b => {
        try { fs.unlinkSync(path.join(BK, b.file)); } catch (e) {}
      });
    } catch (e) {}
  }, 24 * 3600e3);
}

/* ---------- 404 & Global Error Handler ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message);
  res.status(err.status && err.status < 500 ? err.status : 500).json({
    error: err.message || 'Internal server error.'
  });
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => console.log(`Pairaplants enterprise shop running at http://localhost:${PORT}`));
}

module.exports = app;
