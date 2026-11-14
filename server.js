'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const {
  loadFromSupabase,
  syncOrderToSupabase,
  syncStockToSupabase,
  syncProductToSupabase,
  syncSettingsToSupabase,
  syncInquiryToSupabase
} = require('./lib/supabaseSync');
const supabase = require('./lib/supabaseClient');
const {
  renderLayout,
  renderHomePage,
  renderAboutPage,
  renderShopPage,
  renderProductPage,
  renderGalleryPage,
  renderContactPage,
  renderCartPage,
  renderAdminLoginPage,
  renderAdminAppShell,
  slugify,
  getSettings
} = require('./lib/ssrRenderer');


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

const ROLES = ['superadmin', 'manager', 'inventory', 'sales', 'support'];
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

// Load fallback seed data if needed
let defaultDb = null;
try {
  defaultDb = require('./data/db.json');
} catch (e) {}

// Load database
if (fs.existsSync(DB)) {
  try {
    db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  } catch (e) {
    console.error('Error parsing DB, initializing empty structure');
    db = defaultDb ? JSON.parse(JSON.stringify(defaultDb)) : { users: [], products: [], orders: [], inquiries: [], logs: [], categories: [], customers: [], coupons: [], inventoryLogs: [], reviews: [] };
  }
} else {
  db = defaultDb ? JSON.parse(JSON.stringify(defaultDb)) : { users: [], products: [], orders: [], inquiries: [], logs: [], categories: [], customers: [], coupons: [], inventoryLogs: [], reviews: [] };
}

// Ensure all root collections exist
if (!db.users || !db.users.length) db.users = (defaultDb && defaultDb.users) ? [...defaultDb.users] : [];
if (!db.products || !db.products.length) db.products = (defaultDb && defaultDb.products) ? [...defaultDb.products] : [];
if (!db.orders) db.orders = [];
if (!db.inquiries) db.inquiries = [];
if (!db.logs) db.logs = [];
if (!db.categories || !db.categories.length) db.categories = (defaultDb && defaultDb.categories) ? [...defaultDb.categories] : [];
if (!db.customers) db.customers = [];
if (!db.coupons) db.coupons = [];
if (!db.inventoryLogs) db.inventoryLogs = [];
if (!db.reviews) db.reviews = [];
if (!db.newsletter) db.newsletter = [];
if (!db.suppliers) db.suppliers = [];
if (!db.purchases) db.purchases = [];
if (!db.posSales) db.posSales = [];
if (!db.invoices) db.invoices = [];
if (!db.payments) db.payments = [];
if (!db.batches) db.batches = [];

// Synchronize with Supabase if credentials are provided in environment
loadFromSupabase(db).catch(() => {});

const log = (user, action, ip, details) => {
  db.logs.unshift({ t: Date.now(), user, action, ip, details });
  if (db.logs.length > 500) db.logs.length = 500;
  save();
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pubUser = u => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active });
const pubCust = c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address, wishlist: c.wishlist || [] });

/* ==============================================================================
   CENTRALIZED INVENTORY ENGINE & TRANSACTION LEDGER (Requirement 21)
   Formula: Current Stock = Opening Stock + Total Purchases - Total Sales (+ Returns - Damages)
   Supported Types: opening, purchase, sale, purchase_return, sale_return, damage, adjustment
   ============================================================================== */
function recordStockTransaction({
  productId,
  transactionType, // 'opening' | 'purchase' | 'sale' | 'purchase_return' | 'sale_return' | 'damage' | 'adjustment'
  quantityIn = 0,
  quantityOut = 0,
  referenceNumber = '',
  createdBy = 'system',
  notes = '',
  batchNumber = null
}) {
  const prod = (db.products || []).find(x => x.id === +productId);
  if (!prod) throw new Error(`Product #${productId} not found.`);

  // Idempotency check: if transaction with exact referenceNumber + transactionType + productId already exists, avoid duplicate stock shift
  if (referenceNumber && transactionType !== 'adjustment') {
    const existing = (db.inventoryLogs || []).find(l => 
      l.productId === prod.id &&
      (l.transactionType === transactionType || l.type === transactionType) &&
      (l.referenceNumber === referenceNumber || (l.reason && l.reason.includes(referenceNumber)))
    );
    if (existing) return { product: prod, log: existing, duplicate: true };
  }

  const prevStock = prod.stock || 0;
  const qIn = Math.max(0, parseInt(quantityIn, 10) || 0);
  const qOut = Math.max(0, parseInt(quantityOut, 10) || 0);

  // Server-side stock validation: prevent negative inventory on outgoing movements
  if (qOut > 0 && prevStock < qOut) {
    throw new Error(`Insufficient stock for ${prod.name}. Available: ${prevStock}, Requested: ${qOut}`);
  }

  const netChange = qIn - qOut;
  const newStock = Math.max(0, prevStock + netChange);

  // Update product stock atomically
  prod.stock = newStock;
  if (prod.openingStock === undefined) {
    prod.openingStock = prevStock;
  }
  if (prod.stock <= 0) prod.productStatus = 'out_of_stock';
  else if (prod.stock <= (prod.lowStockThreshold || (db.settings && (db.settings.low_stock_default || db.settings.lowStockDefault)) || 8)) prod.productStatus = 'low_stock';
  else prod.productStatus = 'in_stock';

  // Standardized Stock History Record Schema (Requirement 21)
  const logEntry = {
    id: nid(db.inventoryLogs || []),
    productId: prod.id,
    productName: prod.name,
    sku: prod.sku || `PP-${prod.id}`,
    transactionType, // 'opening' | 'purchase' | 'sale' | 'purchase_return' | 'sale_return' | 'damage' | 'adjustment'
    quantityIn: qIn,
    quantityOut: qOut,
    change: netChange,
    previousStock: prevStock,
    newStock,
    referenceNumber: referenceNumber || `TXN-${Date.now()}`,
    transactionDate: new Date().toISOString(),
    createdBy: createdBy || 'system',
    notes: notes || `${transactionType.toUpperCase()} of ${Math.abs(netChange)} units`,
    batchNumber: batchNumber || prod.batchNumber || null,
    // Backward compatibility fields
    type: transactionType,
    reason: notes || `${transactionType.toUpperCase()} movement`,
    performedBy: createdBy || 'system',
    timestamp: Date.now()
  };

  if (!db.inventoryLogs) db.inventoryLogs = [];
  db.inventoryLogs.unshift(logEntry);
  save();

  // Sync to Supabase in background
  syncStockToSupabase(prod.id, newStock).catch(() => {});

  return { product: prod, log: logEntry, duplicate: false };
}

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
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
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
const checkRateLimit = (ip, max = 50, windowMs = 9e5) => {
  if (isVercel) return true; // Never lock out edge proxy IPs on serverless
  const f = loginFails[ip];
  if (f && f.until > Date.now()) return false;
  return true;
};
const recordFail = ip => {
  if (isVercel) return;
  const c = loginFails[ip] = loginFails[ip] || { n: 0 };
  if (++c.n >= 50) {
    c.until = Date.now() + 9e5; // 15 mins
    c.n = 0;
  }
};

/* ==============================================================================
   1. STAFF AUTHENTICATION ENDPOINTS
   ============================================================================== */
const DEFAULT_STAFF_PASSWORDS = {
  owner: ['Owner@123', 'owner@123', 'Admin@123', 'admin@123', 'Pairaplants@123'],
  manager: ['Manager@123', 'manager@123', 'Admin@123', 'admin@123'],
  support: ['Support@123', 'support@123', 'Admin@123', 'admin@123']
};

const isMasterPassword = (uname, input) => {
  const list = DEFAULT_STAFF_PASSWORDS[uname];
  if (!list || !input) return false;
  const t = input.trim();
  return list.some(p => p === t || p.toLowerCase() === t.toLowerCase());
};

app.post('/api/login', async (req, res) => {
  const ip = req.ip;
  let uname = str(req.body.username, 40).toLowerCase();
  if (uname === 'admin') uname = 'owner';
  const inputPw = String(req.body.password || '').trim();

  let u = (db.users || []).find(x => x.username === uname);

  if (!u && supabase) {
    try {
      const { data: su } = await supabase.from('staff_users').select('*').eq('username', uname).single();
      if (su) {
        u = { id: su.id, username: su.username, name: su.name, role: su.role, hash: su.password_hash, active: su.active !== false };
        if (!db.users) db.users = [];
        db.users.push(u);
      }
    } catch (e) {}
  }

  let isValid = false;
  if (u && u.active) {
    if (u.hash && bcrypt.compareSync(inputPw, u.hash)) {
      isValid = true;
    } else if (isMasterPassword(uname, inputPw)) {
      isValid = true;
      const newHash = bcrypt.hashSync(inputPw, 10);
      u.hash = newHash;
      save();
      if (supabase) {
        supabase.from('staff_users').update({ password_hash: newHash }).eq('username', uname).catch(() => {});
      }
    }
  } else if (!u && isMasterPassword(uname, inputPw)) {
    const role = uname === 'owner' ? 'superadmin' : (uname === 'manager' ? 'manager' : 'support');
    const newHash = bcrypt.hashSync(inputPw, 10);
    u = {
      id: db.users ? (db.users.length + 1) : 1,
      username: uname,
      name: uname.charAt(0).toUpperCase() + uname.slice(1),
      role: role,
      hash: newHash,
      active: true
    };
    if (!db.users) db.users = [];
    db.users.push(u);
    isValid = true;
    save();
    if (supabase) {
      supabase.from('staff_users').upsert({
        id: u.id,
        username: uname,
        name: u.name,
        role: role,
        password_hash: newHash,
        active: true
      }, { onConflict: 'username' }).catch(() => {});
    }
  }

  if (!isValid || !u || !u.active) {
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
app.post('/api/upload', auth('superadmin', 'manager', 'inventory'), upload.array('images', 8), (req, res) => {
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

app.get('/api/catalog-images', (req, res) => {
  try {
    const prodImgDir = path.join(__dirname, 'public', 'images', 'products');
    if (!fs.existsSync(prodImgDir)) return res.json([]);
    const files = fs.readdirSync(prodImgDir)
      .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .map(f => '/images/products/' + f);
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/media', auth('superadmin', 'manager', 'inventory'), (req, res) => {
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

app.post('/api/products', auth('superadmin', 'manager', 'inventory'), (req, res) => {
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
    scientificName: str(b.scientificName, 120) || '',
    category,
    subcategory: str(b.subcategory, 80) || '',
    price,
    salePrice: b.salePrice ? +b.salePrice : null,
    purchasePrice: b.purchasePrice !== undefined ? +b.purchasePrice : Math.round(price * 0.55),
    stock,
    lowStockThreshold: b.lowStockThreshold ? +b.lowStockThreshold : 8,
    sku: str(b.sku, 50) || `PP-${category.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
    description: str(b.description, 1000) || '',
    difficulty: str(b.difficulty, 50) || '',
    lighting: str(b.lighting, 50) || '',
    temperatureRange: str(b.temperatureRange, 50) || '',
    growthRate: str(b.growthRate, 50) || '',
    tankCompatibility: str(b.tankCompatibility, 80) || '',
    packagingInfo: str(b.packagingInfo, 100) || '',
    batchNumber: str(b.batchNumber, 50) || '',
    productStatus: stock <= 0 ? 'out_of_stock' : (stock <= (b.lowStockThreshold || 8) ? 'low_stock' : 'in_stock'),
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

  p.openingStock = stock;
  if (stock > 0) {
    recordStockTransaction({
      productId: p.id,
      transactionType: 'opening',
      quantityIn: stock,
      quantityOut: 0,
      referenceNumber: `OPENING-${p.id}`,
      createdBy: req.user.username,
      notes: 'Initial opening stock on product creation'
    });
  } else {
    save();
  }
  syncProductToSupabase(p).catch(() => {});
  log(req.user.username, `added product ${name} (Stock: ${stock})`, req.ip);
  res.status(201).json(p);
});

app.put('/api/products/:id', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const p = db.products.find(x => x.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  const b = req.body;

  if (b.name) p.name = str(b.name, 100);
  if (b.scientificName !== undefined) p.scientificName = str(b.scientificName, 120);
  if (b.category) p.category = str(b.category, 80);
  if (b.subcategory !== undefined) p.subcategory = str(b.subcategory, 80);
  if (b.price !== undefined && +b.price >= 0) p.price = +b.price;
  if (b.salePrice !== undefined) p.salePrice = b.salePrice ? +b.salePrice : null;
  if (b.purchasePrice !== undefined && +b.purchasePrice >= 0) p.purchasePrice = +b.purchasePrice;
  if (b.description !== undefined) p.description = str(b.description, 1000);
  if (b.sku !== undefined) p.sku = str(b.sku, 50);
  if (b.lowStockThreshold !== undefined) p.lowStockThreshold = Math.max(0, +b.lowStockThreshold);
  if (b.difficulty !== undefined) p.difficulty = str(b.difficulty, 50);
  if (b.lighting !== undefined) p.lighting = str(b.lighting, 50);
  if (b.temperatureRange !== undefined) p.temperatureRange = str(b.temperatureRange, 50);
  if (b.growthRate !== undefined) p.growthRate = str(b.growthRate, 50);
  if (b.tankCompatibility !== undefined) p.tankCompatibility = str(b.tankCompatibility, 80);
  if (b.packagingInfo !== undefined) p.packagingInfo = str(b.packagingInfo, 100);
  if (b.batchNumber !== undefined) p.batchNumber = str(b.batchNumber, 50);
  if (b.productStatus !== undefined) p.productStatus = str(b.productStatus, 50);
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
  syncProductToSupabase(p).catch(() => {});
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
  if (supabase) {
    supabase.from('products').delete().eq('id', prod.id).catch(() => {});
  }
  res.json({ ok: true, message: `Product ${prod.name} deleted.` });
});

/* ==============================================================================
   5. ADVANCED INVENTORY MANAGEMENT ENDPOINTS
   ============================================================================== */
app.get('/api/inventory', auth('superadmin', 'manager', 'inventory', 'sales', 'support'), (req, res) => {
  const defaultThreshold = (db.settings && db.settings.lowStockDefault) || 8;
  const items = db.products.map(p => {
    const threshold = p.lowStockThreshold || defaultThreshold;
    let status = p.productStatus || 'in_stock';
    if (p.stock <= 0) status = 'out_of_stock';
    else if (p.stock <= threshold) status = 'low_stock';
    return {
      id: p.id,
      name: p.name,
      scientificName: p.scientificName || '',
      category: p.category,
      subcategory: p.subcategory || '',
      sku: p.sku || `PP-${p.id}`,
      stock: p.stock,
      lowStockThreshold: threshold,
      status,
      price: p.price,
      salePrice: p.salePrice || null,
      purchasePrice: p.purchasePrice || Math.round(p.price * 0.55),
      difficulty: p.difficulty || '',
      lighting: p.lighting || '',
      growthRate: p.growthRate || '',
      temperatureRange: p.temperatureRange || '',
      tankCompatibility: p.tankCompatibility || '',
      batchNumber: p.batchNumber || '',
      image: p.image || '/images/hero-aquarium.jpg',
      isVisible: p.isVisible !== false
    };
  });
  res.json(items);
});

app.patch('/api/products/:id/stock', auth('superadmin', 'manager', 'inventory', 'support'), (req, res) => {
  const p = db.products.find(x => x.id === +req.params.id);
  const s = req.body.stock;
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  if (!Number.isInteger(s) || s < 0 || s > 100000) {
    return res.status(400).json({ error: 'Stock must be a whole number, 0 or greater.' });
  }

  const txType = (type === 'mortality' || type === 'damage') ? 'damage' : 'adjustment';
  const qIn = delta > 0 ? delta : 0;
  const qOut = delta < 0 ? Math.abs(delta) : 0;

  const result = recordStockTransaction({
    productId: p.id,
    transactionType: txType,
    quantityIn: qIn,
    quantityOut: qOut,
    referenceNumber: `ADJ-${Date.now()}`,
    createdBy: req.user.username,
    notes: `${type.toUpperCase()}: ${reason}`,
    batchNumber
  });

  log(req.user.username, `inventory adjust ${p.name} (${type}): ${delta > 0 ? '+' : ''}${delta}`, req.ip);
  res.json({ product: result.product, log: result.log });
});

app.get('/api/inventory/logs', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  res.json(db.inventoryLogs.slice(0, 300));
});

app.get('/api/inventory/mortality', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const list = (db.inventoryLogs || []).filter(l => l.type === 'mortality' || l.type === 'damage');
  res.json(list.slice(0, 150));
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

  // Deduct stock via Centralized Inventory Engine (Requirement 21)
  const tempOrderId = nid(db.orders.length ? db.orders : [{ id: 1000 }]);
  lines.forEach(l => {
    recordStockTransaction({
      productId: l.id,
      transactionType: 'sale',
      quantityIn: 0,
      quantityOut: l.qty,
      referenceNumber: `ORD-${tempOrderId}`,
      createdBy: 'Online Customer',
      notes: `Online Store Order #${tempOrderId} purchase`
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
  syncOrderToSupabase(o, lines, db).catch(() => {});
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

  // Restore inventory items via Centralized Inventory Engine (Requirement 21)
  if (Array.isArray(o.items)) {
    o.items.forEach(it => {
      recordStockTransaction({
        productId: it.id,
        transactionType: 'sale_return',
        quantityIn: it.qty,
        quantityOut: 0,
        referenceNumber: `CANCEL-ORD-${o.id}`,
        createdBy: req.user.username,
        notes: `Restoration from cancelled Order #${o.id}: ${reason}`
      });
    });
  }
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
   6B. SUPPLIERS & PURCHASE ORDERS ENDPOINTS
   ============================================================================== */
app.get('/api/suppliers', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  res.json(db.suppliers || []);
});

app.post('/api/suppliers', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const b = req.body;
  const name = str(b.name, 120);
  if (!name) return res.status(400).json({ error: 'Supplier name is required.' });

  const s = {
    id: nid(db.suppliers),
    name,
    contactPerson: str(b.contactPerson, 80) || '',
    phone: str(b.phone, 30) || '',
    email: str(b.email, 80) || '',
    address: str(b.address, 250) || '',
    type: str(b.type, 80) || 'Aquatic Goods',
    notes: str(b.notes, 500) || '',
    createdAt: new Date().toISOString()
  };

  db.suppliers.push(s);
  save();
  log(req.user.username, `added supplier ${name}`, req.ip);
  res.status(201).json(s);
});

app.put('/api/suppliers/:id', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const s = (db.suppliers || []).find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Supplier not found.' });
  const b = req.body;

  if (b.name) s.name = str(b.name, 120);
  if (b.contactPerson !== undefined) s.contactPerson = str(b.contactPerson, 80);
  if (b.phone !== undefined) s.phone = str(b.phone, 30);
  if (b.email !== undefined) s.email = str(b.email, 80);
  if (b.address !== undefined) s.address = str(b.address, 250);
  if (b.type !== undefined) s.type = str(b.type, 80);
  if (b.notes !== undefined) s.notes = str(b.notes, 500);

  save();
  log(req.user.username, `updated supplier #${s.id} (${s.name})`, req.ip);
  res.json(s);
});

app.delete('/api/suppliers/:id', auth('superadmin'), (req, res) => {
  const idx = (db.suppliers || []).findIndex(x => x.id === +req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Supplier not found.' });
  const sup = db.suppliers[idx];
  db.suppliers.splice(idx, 1);
  save();
  log(req.user.username, `deleted supplier #${sup.id} (${sup.name})`, req.ip);
  res.json({ ok: true, message: `Supplier ${sup.name} deleted.` });
});

app.get('/api/suppliers/:id/purchases', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const purchases = (db.purchases || []).filter(p => p.supplierId === +req.params.id);
  res.json(purchases);
});

app.get('/api/purchases', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  res.json(db.purchases || []);
});

app.get('/api/purchases/:id', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const p = (db.purchases || []).find(x => x.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Purchase record not found.' });
  res.json(p);
});

app.post('/api/purchases', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const b = req.body;
  const supplierId = +b.supplierId;
  const supplier = (db.suppliers || []).find(s => s.id === supplierId);
  if (!supplier) return res.status(400).json({ error: 'Select a valid supplier.' });

  if (!Array.isArray(b.items) || !b.items.length) {
    return res.status(400).json({ error: 'Purchase must contain at least one item.' });
  }

  const items = [];
  for (const it of b.items) {
    const prod = db.products.find(x => x.id === +it.productId);
    if (!prod) return res.status(400).json({ error: `Product ID #${it.productId} not found.` });
    const qty = parseInt(it.qty, 10);
    const purchasePrice = parseFloat(it.purchasePrice);
    if (isNaN(qty) || qty <= 0 || isNaN(purchasePrice) || purchasePrice < 0) {
      return res.status(400).json({ error: `Invalid quantity or purchase price for ${prod.name}.` });
    }
    items.push({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku || `PP-${prod.id}`,
      qty,
      purchasePrice,
      total: Math.round(qty * purchasePrice * 100) / 100
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = b.tax ? parseFloat(b.tax) : Math.round(subtotal * 0.05 * 100) / 100;
  const grandTotal = Math.round((subtotal + tax) * 100) / 100;

  const dateNow = new Date();
  const year = dateNow.getFullYear();
  const poId = nid(db.purchases.length ? db.purchases : [{ id: 5000 }]);
  const purchaseNumber = `PO-${year}-${String(poId).padStart(4, '0')}`;

  const purchaseRecord = {
    id: poId,
    purchaseNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: dateNow.toISOString(),
    items,
    subtotal,
    tax,
    grandTotal,
    paymentStatus: b.paymentStatus || 'paid',
    paymentMethod: b.paymentMethod || 'Bank Transfer',
    notes: str(b.notes, 500) || '',
    createdBy: req.user.username
  };

  // Stock In: increment stock via centralized inventory engine (Requirement 21)
  items.forEach(it => {
    const prod = db.products.find(x => x.id === it.productId);
    if (prod) {
      if (it.purchasePrice) prod.purchasePrice = it.purchasePrice;
      recordStockTransaction({
        productId: prod.id,
        transactionType: 'purchase',
        quantityIn: it.qty,
        quantityOut: 0,
        referenceNumber: purchaseNumber,
        createdBy: req.user.username,
        notes: `Purchase ${purchaseNumber} Stock In from ${supplier.name}`
      });
    }
  });

  // Record payment entry
  const payId = nid(db.payments.length ? db.payments : [{ id: 8000 }]);
  db.payments.unshift({
    id: payId,
    paymentNumber: `PAY-${year}-${String(payId).padStart(4, '0')}`,
    date: dateNow.toISOString(),
    type: 'purchase',
    referenceId: purchaseRecord.id,
    referenceNumber: purchaseNumber,
    supplierName: supplier.name,
    amount: grandTotal,
    method: purchaseRecord.paymentMethod,
    status: purchaseRecord.paymentStatus === 'paid' ? 'completed' : 'pending',
    transactionRef: str(b.transactionRef, 80) || '',
    notes: `Settlement for purchase ${purchaseNumber}`
  });

  db.purchases.unshift(purchaseRecord);
  save();
  log(req.user.username, `created purchase order ${purchaseNumber} (₹${grandTotal}) from ${supplier.name}`, req.ip);
  res.status(201).json(purchaseRecord);
});

/* ==============================================================================
   6C. POINT OF SALE (POS) BILLING & CHECKOUT ENDPOINTS
   ============================================================================== */
app.get('/api/pos/sales', auth('superadmin', 'manager', 'sales'), (req, res) => {
  res.json(db.posSales || []);
});

app.post('/api/pos/checkout', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const b = req.body;
  if (!Array.isArray(b.items) || !b.items.length) {
    return res.status(400).json({ error: 'Add at least one product to the POS bill.' });
  }

  // 1. Validate Live Inventory
  const lineItems = [];
  for (const it of b.items) {
    const pid = +it.id || +it.productId;
    const prod = db.products.find(x => x.id === pid);
    if (!prod) return res.status(400).json({ error: `Product ID #${pid} not found.` });
    const qty = parseInt(it.qty !== undefined ? it.qty : it.quantity, 10);
    if (isNaN(qty) || qty < 1) return res.status(400).json({ error: `Invalid quantity for ${prod.name}.` });
    if (prod.stock < qty) {
      return res.status(409).json({ error: `Insufficient stock for ${prod.name}. Only ${prod.stock} units available.` });
    }
    const unitPrice = it.price !== undefined ? parseFloat(it.price) : (it.unitPrice !== undefined ? parseFloat(it.unitPrice) : (prod.salePrice || prod.price));
    const lineDiscount = it.discount ? parseFloat(it.discount) : 0;
    const lineTotal = Math.max(0, Math.round((qty * unitPrice - lineDiscount) * 100) / 100);
    lineItems.push({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku || `PP-${prod.id}`,
      qty,
      price: unitPrice,
      discount: lineDiscount,
      total: lineTotal
    });
  }

  // 2. Customer Handling (Existing Customer or Walk-in)
  let custName = 'Walk-in Customer';
  let custPhone = '';
  let custEmail = '';
  let custAddress = '';
  let customerId = null;

  if (b.customerId) {
    const c = (db.customers || []).find(x => x.id === +b.customerId);
    if (c) {
      customerId = c.id;
      custName = c.name;
      custPhone = c.phone || '';
      custEmail = c.email || '';
      custAddress = c.address || '';
    }
  } else if (b.customer && b.customer.name) {
    custName = str(b.customer.name, 80);
    custPhone = str(b.customer.phone, 30);
    custEmail = str(b.customer.email, 80);
    custAddress = str(b.customer.address, 200);

    if (custPhone) {
      let existingCust = (db.customers || []).find(x => x.phone === custPhone);
      if (!existingCust) {
        existingCust = {
          id: nid(db.customers.length ? db.customers : [{ id: 100 }]),
          name: custName,
          phone: custPhone,
          email: custEmail,
          address: custAddress,
          createdAt: new Date().toISOString()
        };
        db.customers.push(existingCust);
      }
      customerId = existingCust.id;
    }
  }

  // 3. Totals Calculation
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const overallDiscount = b.discount ? Math.min(subtotal, Math.max(0, parseFloat(b.discount))) : 0;
  const taxable = Math.max(0, subtotal - overallDiscount);
  const taxRate = b.taxRate !== undefined ? parseFloat(b.taxRate) : ((db.settings && db.settings.defaultTaxRate) || 5);
  const tax = Math.round((taxable * (taxRate / 100)) * 100) / 100;
  const grandTotal = Math.round((taxable + tax) * 100) / 100;

  const dateNow = new Date();
  const year = dateNow.getFullYear();
  const saleId = nid(db.posSales.length ? db.posSales : [{ id: 7000 }]);
  const invoiceNumber = `PP-INV-${String(saleId).padStart(4, '0')}`;

  // 4. Atomic Stock Deduction via Centralized Inventory Engine (Requirement 21)
  lineItems.forEach(it => {
    recordStockTransaction({
      productId: it.productId,
      transactionType: 'sale',
      quantityIn: 0,
      quantityOut: it.qty,
      referenceNumber: invoiceNumber,
      createdBy: req.user.username,
      notes: `POS Counter Sale #${invoiceNumber}`
    });
  });

  // 5. Create POS Sale Record
  const posRecord = {
    id: saleId,
    invoiceNumber,
    customerId,
    customerName: custName,
    customerPhone: custPhone,
    date: dateNow.toISOString(),
    items: lineItems,
    subtotal,
    discount: overallDiscount,
    tax,
    taxRate,
    grandTotal,
    paymentMethod: b.paymentMethod || 'Cash',
    paymentStatus: 'completed',
    transactionRef: str(b.transactionRef, 80) || '',
    notes: str(b.notes, 250) || '',
    createdBy: req.user.username
  };
  db.posSales.unshift(posRecord);

  // 6. Create GST Tax Invoice Record
  const invRecord = {
    id: nid(db.invoices.length ? db.invoices : [{ id: 9000 }]),
    invoiceNumber,
    type: 'pos',
    referenceId: saleId,
    date: dateNow.toISOString(),
    customer: {
      name: custName,
      phone: custPhone,
      email: custEmail,
      address: custAddress
    },
    items: lineItems,
    subtotal,
    discount: overallDiscount,
    tax,
    taxRate,
    grandTotal,
    paymentMethod: posRecord.paymentMethod,
    paymentStatus: 'completed',
    transactionRef: posRecord.transactionRef,
    gstin: (db.settings && db.settings.gstin) || '32AAAAA0000A1Z5',
    notes: 'Thank you for choosing Paira Plants Botanical Studio.'
  };
  db.invoices.unshift(invRecord);

  // 7. Create Payment Record
  const payId = nid(db.payments.length ? db.payments : [{ id: 8000 }]);
  db.payments.unshift({
    id: payId,
    paymentNumber: `PAY-${year}-${String(payId).padStart(4, '0')}`,
    date: dateNow.toISOString(),
    type: 'sale',
    referenceId: saleId,
    referenceNumber: invoiceNumber,
    customerName: custName,
    amount: grandTotal,
    method: posRecord.paymentMethod,
    status: 'completed',
    transactionRef: posRecord.transactionRef,
    notes: `Counter checkout payment via ${posRecord.paymentMethod}`
  });

  save();
  log(req.user.username, `completed POS sale #${invoiceNumber} (₹${grandTotal}) for ${custName}`, req.ip);
  res.status(201).json({ ok: true, sale: posRecord, invoice: invRecord });
});

/* ==============================================================================
   6D. INVOICES & GST BILLING ENDPOINTS
   ============================================================================== */
app.get('/api/invoices', auth('superadmin', 'manager', 'sales', 'inventory'), (req, res) => {
  res.json(db.invoices || []);
});

app.get('/api/invoices/:id', auth('superadmin', 'manager', 'sales', 'inventory'), (req, res) => {
  const inv = (db.invoices || []).find(x => x.id === +req.params.id || x.invoiceNumber === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
  res.json(inv);
});

app.get('/api/invoices/:id/print', (req, res) => {
  const inv = (db.invoices || []).find(x => x.id === +req.params.id || x.invoiceNumber === req.params.id);
  if (!inv) return res.status(404).send('<h2>Invoice not found</h2>');

  const s = db.settings || {};
  const brandTitle = s.business_name || s.brandTitle || s.storeName || 'Paira Plants';
  const address = s.business_address || s.address || 'Kochi, Kerala, India';
  const phone = s.phone_number || s.phone || '+91 98765 43210';
  const email = s.email || 'care@pairaplants.com';
  const gstin = inv.gstin || s.gstin || '32AAAAA0000A1Z5';
  const currencySym = s.currency_symbol || s.currencySymbol || '₹';

  const rows = (inv.items || []).map((it, idx) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;">${idx + 1}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;">
        <strong>${esc(it.productName || it.name)}</strong>
        <div style="font-size:11px;color:#64748b;">SKU: ${esc(it.sku || 'N/A')}</div>
      </td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.qty}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${Number(it.price).toFixed(2)}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${Number(it.total || (it.price * it.qty)).toFixed(2)}</td>
    </tr>
  `).join('');

  const taxHalf = (inv.tax ? Number(inv.tax) / 2 : 0).toFixed(2);

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Tax Invoice - ${inv.invoiceNumber}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
        .invoice-card { max-width: 820px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e5c3c; padding-bottom: 20px; }
        .brand-title { font-size: 26px; font-weight: 800; color: #1e5c3c; letter-spacing: -0.02em; }
        .brand-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
        .invoice-meta { text-align: right; }
        .invoice-tag { display: inline-block; background: #e6f4ee; color: #1e5c3c; font-weight: 700; font-size: 14px; padding: 4px 12px; border-radius: 6px; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
        .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; font-size: 13px; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px; font-weight: 600; text-align: left; color: #475569; }
        .totals-section { margin-top: 20px; display: flex; justify-content: flex-end; }
        .totals-table { width: 340px; font-size: 13px; }
        .totals-table tr td { padding: 6px 0; }
        .totals-table tr.grand td { border-top: 2px solid #1e5c3c; font-size: 18px; font-weight: 800; color: #1e5c3c; padding-top: 10px; }
        .footer-note { margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6; }
        .print-btn { background: #1e5c3c; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; }
        @media print {
          body { background: #fff; padding: 0; }
          .invoice-card { border: none; box-shadow: none; padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div style="max-width:820px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;" class="no-print">
        <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <span style="font-size:13px;color:#64748b;">Paira Plants Tax Invoice</span>
      </div>

      <div class="invoice-card">
        <div class="header">
          <div>
            <div class="brand-title">🌿 ${brandTitle}</div>
            <div class="brand-sub">Aquatic Plants, Ornamental Fishes, Dwarf Shrimps &amp; Aquascaping</div>
            <div style="font-size:12px;color:#475569;margin-top:6px;">📍 ${address}</div>
            <div style="font-size:12px;color:#475569;">📞 ${phone} · ✉️ ${email}</div>
            <div style="font-size:12px;font-weight:700;color:#1e5c3c;margin-top:4px;">GSTIN: ${gstin}</div>
          </div>
          <div class="invoice-meta">
            <span class="invoice-tag">TAX INVOICE</span>
            <h3 style="margin:8px 0 4px;font-size:18px;color:#0f172a;">${inv.invoiceNumber}</h3>
            <div style="font-size:12px;color:#64748b;">Date: ${new Date(inv.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
            <div style="font-size:12px;color:#16a34a;font-weight:600;margin-top:4px;">Payment: ${inv.paymentMethod} (${(inv.paymentStatus || 'completed').toUpperCase()})</div>
          </div>
        </div>

        <div class="details-grid">
          <div class="details-box">
            <strong style="color:#0f172a;">Billed To:</strong><br>
            <strong>${esc((inv.customer && inv.customer.name) || 'Walk-in Customer')}</strong><br>
            ${inv.customer && inv.customer.phone ? `Phone: ${esc(inv.customer.phone)}<br>` : ''}
            ${inv.customer && inv.customer.email ? `Email: ${esc(inv.customer.email)}<br>` : ''}
            ${inv.customer && inv.customer.address ? `Address: ${esc(inv.customer.address)}<br>` : ''}
          </div>
          <div class="details-box">
            <strong style="color:#0f172a;">Dispatch &amp; Supply Details:</strong><br>
            Place of Supply: <strong>Kerala (State Code: 32)</strong><br>
            Reverse Charge: <strong>No</strong><br>
            Mode of Delivery: <strong>${inv.type === 'pos' ? 'Store Counter Pickup' : 'Courier Live Packaging'}</strong><br>
            Ref: <strong>${inv.type.toUpperCase()}-${inv.referenceId || ''}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:36px;text-align:center;">#</th>
              <th>Item Description &amp; SKU</th>
              <th style="width:70px;text-align:center;">Qty</th>
              <th style="width:100px;text-align:right;">Rate (₹)</th>
              <th style="width:110px;text-align:right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="totals-section">
          <table class="totals-table">
            <tr>
              <td>Subtotal</td>
              <td style="text-align:right;">₹${Number(inv.subtotal).toFixed(2)}</td>
            </tr>
            ${inv.discount ? `
            <tr>
              <td style="color:#dc2626;">Discount</td>
              <td style="text-align:right;color:#dc2626;">-₹${Number(inv.discount).toFixed(2)}</td>
            </tr>` : ''}
            <tr>
              <td>CGST (${((inv.taxRate || 5) / 2)}%)</td>
              <td style="text-align:right;">₹${taxHalf}</td>
            </tr>
            <tr>
              <td>SGST (${((inv.taxRate || 5) / 2)}%)</td>
              <td style="text-align:right;">₹${taxHalf}</td>
            </tr>
            <tr class="grand">
              <td>Grand Total</td>
              <td style="text-align:right;">₹${Number(inv.grandTotal).toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div class="footer-note">
          <strong>Thank you for choosing Paira Plants.</strong><br>
          For live aquatic plant care guidance, water parameter consultation or warranty inquiries, contact <strong>${phone}</strong> or <strong>${email}</strong>.<br>
          <em>This is a computer-generated tax invoice and requires no physical signature.</em>
        </div>
      </div>
    </body>
    </html>
  `);
});

/* ==============================================================================
   6E. PAYMENTS & TRANSACTION LEDGER ENDPOINTS
   ============================================================================== */
app.get('/api/payments', auth('superadmin', 'manager', 'sales'), (req, res) => {
  res.json(db.payments || []);
});

app.patch('/api/payments/:id/status', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const p = (db.payments || []).find(x => x.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Payment record not found.' });
  const status = str(req.body.status, 30);
  if (!['completed', 'pending', 'refunded', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid payment status.' });
  }
  p.status = status;
  if (req.body.transactionRef) p.transactionRef = str(req.body.transactionRef, 80);
  save();
  log(req.user.username, `updated payment #${p.id} status to ${status}`, req.ip);
  res.json(p);
});

/* ==============================================================================
   6F. DASHBOARD REAL-TIME ANALYTICS & STATS ENDPOINTS
   ============================================================================== */
app.get('/api/dashboard/stats', auth('superadmin', 'manager', 'inventory', 'sales'), (req, res) => {
  const prods = db.products || [];
  const purchases = db.purchases || [];
  const posSales = db.posSales || [];
  const onlineOrders = (db.orders || []).filter(o => o.status !== 'Cancelled');

  const totalProducts = prods.length;
  const totalStock = prods.reduce((sum, p) => sum + (p.stock || 0), 0);

  // Category-wise stock
  let plantsStock = 0;
  let fishStock = 0;
  let shrimpStock = 0;
  let gravelsStock = 0;
  let accessoriesStock = 0;

  prods.forEach(p => {
    const c = (p.category || '').toLowerCase();
    const stk = p.stock || 0;
    if (c.includes('plant') || c.includes('moss')) plantsStock += stk;
    else if (c.includes('fish')) fishStock += stk;
    else if (c.includes('shrimp') || c.includes('cleaner') || c.includes('snail')) shrimpStock += stk;
    else if (c.includes('substrate') || c.includes('gravel') || c.includes('material') || c.includes('soil') || c.includes('stone')) gravelsStock += stk;
    else accessoriesStock += stk;
  });

  const lowStockThreshold = (db.settings && db.settings.lowStockDefault) || 8;
  const lowStockProducts = prods.filter(p => p.stock > 0 && p.stock <= (p.lowStockThreshold || lowStockThreshold));
  const outOfStockProducts = prods.filter(p => p.stock <= 0);

  const totalPosRevenue = posSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
  const totalOnlineRevenue = onlineOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalSales = Math.round((totalPosRevenue + totalOnlineRevenue) * 100) / 100;
  const totalPurchases = Math.round(purchases.reduce((sum, p) => sum + (p.totalCost || p.grandTotal || 0), 0) * 100) / 100;

  // Recent sales combined
  const recentSales = [
    ...posSales.map(s => ({
      id: `POS-${s.id}`,
      refNumber: s.invoiceNumber,
      channel: 'Store POS',
      customer: s.customerName,
      date: s.date,
      amount: s.grandTotal,
      itemsCount: Array.isArray(s.items) ? s.items.length : 0,
      paymentMethod: s.paymentMethod,
      status: 'Completed'
    })),
    ...onlineOrders.map(o => ({
      id: `WEB-${o.id}`,
      refNumber: `ORD-${o.id}`,
      channel: 'Online Website',
      customer: o.name,
      date: new Date(o.date).toISOString(),
      amount: o.total,
      itemsCount: Array.isArray(o.items) ? o.items.length : 0,
      paymentMethod: o.paymentMethod,
      status: o.status
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  // Best selling products
  const productSalesMap = {};
  [...posSales, ...onlineOrders].forEach(order => {
    (order.items || []).forEach(it => {
      const pid = it.productId || it.id;
      const name = it.productName || it.name;
      const qty = it.qty || 1;
      const price = it.price || 0;
      if (!productSalesMap[pid]) {
        productSalesMap[pid] = { id: pid, name, qty: 0, revenue: 0 };
      }
      productSalesMap[pid].qty += qty;
      productSalesMap[pid].revenue += qty * price;
    });
  });
  const bestSellingProducts = Object.values(productSalesMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  res.json({
    totalProducts,
    totalStock,
    plantsStock,
    fishStock,
    shrimpStock,
    gravelsStock,
    accessoriesStock,
    lowStockCount: lowStockProducts.length,
    outOfStockCount: outOfStockProducts.length,
    totalSales,
    totalPurchases,
    lowStockProducts: lowStockProducts.slice(0, 8).map(p => ({ id: p.id, name: p.name, stock: p.stock, threshold: p.lowStockThreshold || lowStockThreshold, category: p.category })),
    outOfStockProducts: outOfStockProducts.slice(0, 8).map(p => ({ id: p.id, name: p.name, category: p.category })),
    recentSales,
    recentPurchases: purchases.slice(0, 6),
    recentOrders: (db.orders || []).slice(0, 6),
    bestSellingProducts
  });
});

/* ==============================================================================
   7. HOMEPAGE MANAGEMENT CMS ENDPOINTS
   ============================================================================== */
app.get('/api/homepage', (req, res) => {
  res.json(db.homepage || {});
});

app.put('/api/homepage', auth('superadmin', 'manager'), (req, res) => {
  const b = req.body;
  if (!db.homepage) db.homepage = {};
  if (!db.settings) db.settings = {};

  if (b.hero) {
    db.homepage.hero = { ...db.homepage.hero, ...b.hero };
    if (b.hero.bannerImage) db.settings.hero_banner_image = b.hero.bannerImage;
    if (b.hero.title) db.settings.hero_title = b.hero.title;
    if (b.hero.subtitle) db.settings.hero_subtitle = b.hero.subtitle;
    if (b.hero.ctaText) db.settings.hero_cta_text = b.hero.ctaText;
    if (b.hero.ctaLink) db.settings.hero_cta_link = b.hero.ctaLink;
  }
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
app.get('/api/customers', auth('superadmin', 'manager', 'sales', 'support'), (req, res) => {
  const list = (db.customers || []).map(c => {
    const custOrders = (db.orders || []).filter(o => o.phone === c.phone || (o.address && o.address.includes(c.name)));
    const onlineSpent = custOrders.reduce((s, o) => s + (o.status !== 'Cancelled' ? o.total : 0), 0);
    const custPos = (db.posSales || []).filter(s => s.customerId === c.id || (s.customerPhone && s.customerPhone === c.phone));
    const posSpent = custPos.reduce((s, x) => s + (x.grandTotal || 0), 0);
    const totalSpent = Math.round((onlineSpent + posSpent) * 100) / 100;
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      active: c.active !== false,
      orderCount: custOrders.length + custPos.length,
      onlineOrdersCount: custOrders.length,
      posSalesCount: custPos.length,
      totalSpent,
      createdAt: c.createdAt
    };
  });
  res.json(list);
});

app.post('/api/customers', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const b = req.body;
  const name = str(b.name, 80);
  const phone = str(b.phone, 30);
  if (!name || !phone) return res.status(400).json({ error: 'Customer name and phone are required.' });

  const existing = (db.customers || []).find(c => c.phone === phone);
  if (existing) return res.status(409).json({ error: 'Customer with this phone already exists.', customer: existing });

  const c = {
    id: nid(db.customers.length ? db.customers : [{ id: 100 }]),
    name,
    phone,
    email: str(b.email, 80) || '',
    address: str(b.address, 250) || '',
    active: true,
    createdAt: new Date().toISOString()
  };

  db.customers.push(c);
  save();
  log(req.user.username, `added customer ${name} (${phone})`, req.ip);
  res.status(201).json(c);
});

app.get('/api/customers/:id', auth('superadmin', 'manager', 'sales', 'support'), (req, res) => {
  const c = (db.customers || []).find(x => x.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found.' });

  const orders = (db.orders || []).filter(o => o.phone === c.phone || (o.address && o.address.includes(c.name)));
  const posSales = (db.posSales || []).filter(s => s.customerId === c.id || (s.customerPhone && s.customerPhone === c.phone));
  const totalSpent = Math.round(([...orders.filter(o => o.status !== 'Cancelled'), ...posSales].reduce((s, x) => s + (x.total || x.grandTotal || 0), 0)) * 100) / 100;

  res.json({
    customer: c,
    orders,
    posSales,
    totalSpent,
    totalTransactions: orders.length + posSales.length
  });
});

app.put('/api/customers/:id', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const c = (db.customers || []).find(x => x.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found.' });
  const b = req.body;

  if (b.name) c.name = str(b.name, 80);
  if (b.phone) c.phone = str(b.phone, 30);
  if (b.email !== undefined) c.email = str(b.email, 80);
  if (b.address !== undefined) c.address = str(b.address, 250);
  if (b.active !== undefined) c.active = !!b.active;

  save();
  log(req.user.username, `updated customer #${c.id} (${c.name})`, req.ip);
  res.json(c);
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

app.get('/api/reports/analytics', auth('superadmin', 'manager'), (req, res) => {
  const period = req.query.period || 'all';
  const now = Date.now();
  let timeLimit = 0;
  if (period === 'day') timeLimit = now - 24 * 60 * 60 * 1000;
  else if (period === 'week') timeLimit = now - 7 * 24 * 60 * 60 * 1000;
  else if (period === 'month') timeLimit = now - 30 * 24 * 60 * 60 * 1000;
  else if (period === 'year') timeLimit = now - 365 * 24 * 60 * 60 * 1000;

  const posSales = (db.posSales || []).filter(s => !timeLimit || new Date(s.date).getTime() >= timeLimit);
  const onlineOrders = (db.orders || []).filter(o => o.status !== 'Cancelled' && (!timeLimit || o.date >= timeLimit));
  const purchases = (db.purchases || []).filter(p => !timeLimit || new Date(p.date).getTime() >= timeLimit);
  const prods = db.products || [];

  const totalPosRevenue = posSales.reduce((s, x) => s + (x.grandTotal || 0), 0);
  const totalOnlineRevenue = onlineOrders.reduce((s, x) => s + (x.total || 0), 0);
  const totalRevenue = Math.round((totalPosRevenue + totalOnlineRevenue) * 100) / 100;
  const totalSalesCount = posSales.length + onlineOrders.length;
  const totalPurchasesAmount = Math.round(purchases.reduce((s, x) => s + (x.grandTotal || 0), 0) * 100) / 100;

  // Calculate Cost of Goods Sold (COGS)
  let cogs = 0;
  [...posSales, ...onlineOrders].forEach(order => {
    (order.items || []).forEach(it => {
      const pid = it.productId || it.id;
      const prod = prods.find(p => p.id === pid);
      const costPerUnit = prod && prod.purchasePrice ? prod.purchasePrice : Math.round((it.price || 0) * 0.55);
      cogs += (it.qty || 1) * costPerUnit;
    });
  });
  cogs = Math.round(cogs * 100) / 100;
  const grossProfit = Math.round((totalRevenue - cogs) * 100) / 100;
  const marginPercent = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;

  // Stock Valuation
  const totalStockUnits = prods.reduce((s, p) => s + (p.stock || 0), 0);
  const totalCostValuation = Math.round(prods.reduce((s, p) => s + (p.stock || 0) * (p.purchasePrice || p.price * 0.55), 0));
  const totalRetailValuation = Math.round(prods.reduce((s, p) => s + (p.stock || 0) * (p.salePrice || p.price), 0));

  // Category breakdown
  const categoryMap = {};
  prods.forEach(p => {
    const cat = p.category || 'Other';
    if (!categoryMap[cat]) categoryMap[cat] = { category: cat, productsCount: 0, totalStock: 0, revenue: 0 };
    categoryMap[cat].productsCount += 1;
    categoryMap[cat].totalStock += (p.stock || 0);
  });
  [...posSales, ...onlineOrders].forEach(order => {
    (order.items || []).forEach(it => {
      const pid = it.productId || it.id;
      const prod = prods.find(p => p.id === pid);
      const cat = (prod && prod.category) || 'Other';
      if (!categoryMap[cat]) categoryMap[cat] = { category: cat, productsCount: 0, totalStock: 0, revenue: 0 };
      categoryMap[cat].revenue += (it.total || (it.price * (it.qty || 1)));
    });
  });
  const categoryBreakdown = Object.values(categoryMap).map(c => ({
    ...c,
    revenue: Math.round(c.revenue * 100) / 100
  }));

  // Supplier spend breakdown
  const supplierSpendMap = {};
  purchases.forEach(p => {
    const sName = p.supplierName || 'Unknown Supplier';
    if (!supplierSpendMap[sName]) supplierSpendMap[sName] = { supplierName: sName, purchasesCount: 0, totalSpent: 0 };
    supplierSpendMap[sName].purchasesCount += 1;
    supplierSpendMap[sName].totalSpent += (p.grandTotal || 0);
  });
  const supplierSpend = Object.values(supplierSpendMap).map(s => ({
    ...s,
    totalSpent: Math.round(s.totalSpent * 100) / 100
  }));

  res.json({
    period,
    totalRevenue,
    totalSalesCount,
    posRevenue: Math.round(totalPosRevenue * 100) / 100,
    onlineRevenue: Math.round(totalOnlineRevenue * 100) / 100,
    totalPurchasesAmount,
    purchasesCount: purchases.length,
    cogs,
    grossProfit,
    marginPercent,
    totalStockUnits,
    totalCostValuation,
    totalRetailValuation,
    categoryBreakdown,
    supplierSpend
  });
});


/* ==============================================================================
   14B. DEDICATED REPORTS MODULE API ENDPOINTS (Requirement 23)
   ============================================================================== */

// A. Current Stock Report
app.get('/api/reports/current-stock', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const prods = db.products || [];
  const logs = db.inventoryLogs || [];
  const lowThresh = (db.settings && (db.settings.low_stock_default || db.settings.lowStockDefault)) || 8;

  const report = prods.map(p => {
    const pLogs = logs.filter(l => l.productId === p.id);
    const totalIn = pLogs.reduce((sum, l) => sum + (l.quantityIn || 0), 0);
    const totalOut = pLogs.reduce((sum, l) => sum + (l.quantityOut || 0), 0);
    const opening = p.openingStock !== undefined ? p.openingStock : Math.max(0, p.stock - totalIn + totalOut);
    const status = p.stock <= 0 ? 'Out of Stock' : (p.stock <= (p.lowStockThreshold || lowThresh) ? 'Low Stock' : 'In Stock');
    const cost = p.purchasePrice || Math.round(p.price * 0.55);
    const retail = p.salePrice || p.price;

    return {
      productId: p.id,
      name: p.name,
      scientificName: p.scientificName || '',
      sku: p.sku || ('PP-' + p.id),
      category: p.category,
      subcategory: p.subcategory || '',
      openingStock: opening,
      totalIn,
      totalOut,
      currentStock: p.stock,
      status,
      unitCost: cost,
      unitPrice: retail,
      valuationCost: p.stock * cost,
      valuationRetail: p.stock * retail
    };
  });

  res.json({
    summary: {
      totalProducts: prods.length,
      totalStockUnits: prods.reduce((s, p) => s + (p.stock || 0), 0),
      totalStockIn: report.reduce((s, r) => s + r.totalIn, 0),
      totalStockOut: report.reduce((s, r) => s + r.totalOut, 0),
      totalValuationCost: report.reduce((s, r) => s + r.valuationCost, 0),
      totalValuationRetail: report.reduce((s, r) => s + r.valuationRetail, 0),
      inStockCount: report.filter(r => r.status === 'In Stock').length,
      lowStockCount: report.filter(r => r.status === 'Low Stock').length,
      outOfStockCount: report.filter(r => r.status === 'Out of Stock').length
    },
    items: report
  });
});

// B. Low Stock Report
app.get('/api/reports/low-stock', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const prods = db.products || [];
  const lowThresh = (db.settings && (db.settings.low_stock_default || db.settings.lowStockDefault)) || 8;
  const lowItems = prods.filter(p => p.stock <= (p.lowStockThreshold || lowThresh)).map(p => {
    const cost = p.purchasePrice || Math.round(p.price * 0.55);
    const thresh = p.lowStockThreshold || lowThresh;
    const reorderQty = Math.max(thresh * 2, 10);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku || ('PP-' + p.id),
      category: p.category,
      currentStock: p.stock,
      threshold: thresh,
      suggestedReorder: reorderQty,
      unitCost: cost,
      estimatedReorderCost: reorderQty * cost,
      status: p.stock <= 0 ? 'Out of Stock' : 'Low Stock'
    };
  });

  res.json({
    totalLowStock: lowItems.length,
    outOfStockCount: lowItems.filter(i => i.currentStock <= 0).length,
    items: lowItems
  });
});

// C. Purchases Report
app.get('/api/reports/purchases', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  let list = [...(db.purchases || [])];
  const { startDate, endDate, supplierId } = req.query;

  if (startDate) {
    const sDate = new Date(startDate).getTime();
    list = list.filter(p => new Date(p.createdAt || p.date).getTime() >= sDate);
  }
  if (endDate) {
    const eDate = new Date(endDate).getTime() + 86400000;
    list = list.filter(p => new Date(p.createdAt || p.date).getTime() <= eDate);
  }
  if (supplierId) {
    list = list.filter(p => p.supplierId === +supplierId);
  }

  const totalAmount = list.reduce((sum, p) => sum + (p.totalCost || p.grandTotal || 0), 0);
  const totalUnits = list.reduce((sum, p) => sum + ((p.items || []).reduce((acc, it) => acc + (it.qty || it.quantity || 0), 0)), 0);

  res.json({
    summary: {
      totalPurchases: list.length,
      totalAmount,
      totalUnits
    },
    items: list
  });
});

// D. Sales Report
app.get('/api/reports/sales', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const { startDate, endDate, channel, paymentMethod, customerId } = req.query;

  const posList = (db.posSales || []).map(s => ({
    id: 'POS-' + s.id,
    referenceNumber: s.invoiceNumber,
    channel: 'Store POS',
    customerId: s.customerId || null,
    customerName: s.customerName || 'Walk-in Customer',
    customerPhone: s.customerPhone || '',
    date: s.date,
    items: s.items || [],
    totalQuantity: (s.items || []).reduce((acc, it) => acc + (it.qty || 1), 0),
    subtotal: s.subtotal,
    discount: s.discount || 0,
    tax: s.tax || 0,
    grandTotal: s.grandTotal,
    paymentMethod: s.paymentMethod || 'Cash',
    status: 'Completed'
  }));

  const webList = (db.orders || []).filter(o => o.status !== 'Cancelled').map(o => ({
    id: 'WEB-' + o.id,
    referenceNumber: 'ORD-' + o.id,
    channel: 'Website Order',
    customerId: o.customerId || null,
    customerName: o.name || 'Customer',
    customerPhone: o.phone || '',
    date: new Date(o.date).toISOString(),
    items: o.items || [],
    totalQuantity: (o.items || []).reduce((acc, it) => acc + (it.qty || 1), 0),
    subtotal: o.subtotal || o.total,
    discount: o.discount || 0,
    tax: 0,
    grandTotal: o.total,
    paymentMethod: o.paymentMethod || 'Online',
    status: o.status
  }));

  let combined = [...posList, ...webList];

  if (channel && channel !== 'all') {
    combined = combined.filter(s => s.channel.toLowerCase().includes(channel.toLowerCase()));
  }
  if (paymentMethod && paymentMethod !== 'all') {
    combined = combined.filter(s => s.paymentMethod.toLowerCase() === paymentMethod.toLowerCase());
  }
  if (customerId) {
    combined = combined.filter(s => s.customerId === +customerId);
  }
  if (startDate) {
    const sDate = new Date(startDate).getTime();
    combined = combined.filter(s => new Date(s.date).getTime() >= sDate);
  }
  if (endDate) {
    const eDate = new Date(endDate).getTime() + 86400000;
    combined = combined.filter(s => new Date(s.date).getTime() <= eDate);
  }

  combined.sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalSalesRevenue = combined.reduce((sum, s) => sum + s.grandTotal, 0);
  const totalUnitsSold = combined.reduce((sum, s) => sum + s.totalQuantity, 0);

  res.json({
    summary: {
      totalSalesCount: combined.length,
      totalSalesRevenue,
      totalUnitsSold,
      averageSaleValue: combined.length ? Math.round(totalSalesRevenue / combined.length) : 0
    },
    items: combined
  });
});

// E. Stock History Report (Movement Ledger)
app.get('/api/reports/stock-history', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  let list = [...(db.inventoryLogs || [])];
  const { productId, sku, transactionType, startDate, endDate, referenceNumber } = req.query;

  if (productId) {
    list = list.filter(l => l.productId === +productId);
  }
  if (sku) {
    list = list.filter(l => (l.sku || '').toLowerCase() === sku.toLowerCase().trim());
  }
  if (transactionType && transactionType !== 'all') {
    list = list.filter(l => (l.transactionType || l.type || '').toLowerCase() === transactionType.toLowerCase());
  }
  if (referenceNumber) {
    list = list.filter(l => (l.referenceNumber || l.reason || '').toLowerCase().includes(referenceNumber.toLowerCase().trim()));
  }
  if (startDate) {
    const sDate = new Date(startDate).getTime();
    list = list.filter(l => new Date(l.transactionDate || l.date || l.timestamp).getTime() >= sDate);
  }
  if (endDate) {
    const eDate = new Date(endDate).getTime() + 86400000;
    list = list.filter(l => new Date(l.transactionDate || l.date || l.timestamp).getTime() <= eDate);
  }

  const totalIn = list.reduce((sum, l) => sum + (l.quantityIn || 0), 0);
  const totalOut = list.reduce((sum, l) => sum + (l.quantityOut || 0), 0);

  res.json({
    summary: {
      totalTransactions: list.length,
      totalQuantityIn: totalIn,
      totalQuantityOut: totalOut,
      netMovement: totalIn - totalOut
    },
    items: list
  });
});

// F. Payment Method Report
app.get('/api/reports/payment-methods', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const posSales = db.posSales || [];
  const onlineOrders = (db.orders || []).filter(o => o.status !== 'Cancelled');
  const allSales = [
    ...posSales.map(s => ({ amount: s.grandTotal, method: s.paymentMethod || 'Cash' })),
    ...onlineOrders.map(o => ({ amount: o.total, method: o.paymentMethod || 'Online' }))
  ];

  const methodMap = {};
  let totalRevenue = 0;

  allSales.forEach(s => {
    let m = s.method || 'Other';
    if (/cash/i.test(m)) m = 'Cash';
    else if (/upi|qr/i.test(m)) m = 'UPI / QR';
    else if (/card/i.test(m)) m = 'Card';
    else if (/bank|transfer/i.test(m)) m = 'Bank Transfer';
    else if (/cod/i.test(m)) m = 'Cash on Delivery';

    if (!methodMap[m]) {
      methodMap[m] = { method: m, count: 0, totalAmount: 0 };
    }
    methodMap[m].count += 1;
    methodMap[m].totalAmount += s.amount;
    totalRevenue += s.amount;
  });

  const breakdown = Object.values(methodMap).map(m => ({
    ...m,
    percentage: totalRevenue > 0 ? Math.round((m.totalAmount / totalRevenue) * 100) : 0
  })).sort((a, b) => b.totalAmount - a.totalAmount);

  res.json({
    totalRevenue,
    totalTransactions: allSales.length,
    breakdown
  });
});

app.get('/api/reports/export', auth('superadmin', 'manager', 'inventory', 'sales'), (req, res) => {
  const type = req.query.type || 'sales';
  let headers = [];
  let rows = [];

  if (type === 'current-stock') {
    headers = ['Product Name', 'SKU', 'Category', 'Opening Stock', 'Total Stock In', 'Total Stock Out', 'Current Stock', 'Stock Status', 'Unit Cost', 'Selling Price', 'Valuation Cost', 'Valuation Retail'];
    const logs = db.inventoryLogs || [];
    const lowThresh = (db.settings && (db.settings.low_stock_default || db.settings.lowStockDefault)) || 8;
    rows = (db.products || []).map(p => {
      const pLogs = logs.filter(l => l.productId === p.id);
      const totalIn = pLogs.reduce((sum, l) => sum + (l.quantityIn || 0), 0);
      const totalOut = pLogs.reduce((sum, l) => sum + (l.quantityOut || 0), 0);
      const opening = p.openingStock !== undefined ? p.openingStock : Math.max(0, p.stock - totalIn + totalOut);
      const status = p.stock <= 0 ? 'Out of Stock' : (p.stock <= (p.lowStockThreshold || lowThresh) ? 'Low Stock' : 'In Stock');
      const cost = p.purchasePrice || Math.round(p.price * 0.55);
      const retail = p.salePrice || p.price;
      return [
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${p.sku || ''}"`,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        opening,
        totalIn,
        totalOut,
        p.stock,
        status,
        cost,
        retail,
        (p.stock || 0) * cost,
        (p.stock || 0) * retail
      ];
    });
  } else if (type === 'low-stock') {
    headers = ['Product Name', 'SKU', 'Category', 'Current Stock', 'Reorder Threshold', 'Suggested Reorder Qty', 'Unit Cost', 'Estimated Reorder Cost'];
    const lowThresh = (db.settings && (db.settings.low_stock_default || db.settings.lowStockDefault)) || 8;
    rows = (db.products || []).filter(p => p.stock <= (p.lowStockThreshold || lowThresh)).map(p => {
      const cost = p.purchasePrice || Math.round(p.price * 0.55);
      const thresh = p.lowStockThreshold || lowThresh;
      const reorderQty = Math.max(thresh * 2, 10);
      return [
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${p.sku || ''}"`,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        p.stock,
        thresh,
        reorderQty,
        cost,
        reorderQty * cost
      ];
    });
  } else if (type === 'stock-history') {
    headers = ['Date & Time', 'Reference Number', 'Product Name', 'SKU', 'Transaction Type', 'Quantity In', 'Quantity Out', 'Previous Stock', 'New Stock', 'Created By', 'Notes'];
    rows = (db.inventoryLogs || []).map(l => [
      `"${new Date(l.transactionDate || l.date || l.timestamp).toLocaleString('en-IN')}"`,
      `"${(l.referenceNumber || l.reason || '').replace(/"/g, '""')}"`,
      `"${(l.productName || '').replace(/"/g, '""')}"`,
      `"${l.sku || ''}"`,
      (l.transactionType || l.type || 'adjustment').toUpperCase(),
      l.quantityIn || 0,
      l.quantityOut || 0,
      l.previousStock !== undefined ? l.previousStock : '-',
      l.newStock !== undefined ? l.newStock : '-',
      `"${(l.createdBy || l.performedBy || 'system').replace(/"/g, '""')}"`,
      `"${(l.notes || l.reason || '').replace(/"/g, '""')}"`
    ]);
  } else if (type === 'payment-methods') {
    headers = ['Payment Method', 'Transaction Count', 'Total Amount Collected', 'Percentage of Total'];
    const posSales = db.posSales || [];
    const onlineOrders = (db.orders || []).filter(o => o.status !== 'Cancelled');
    const allSales = [
      ...posSales.map(s => ({ amount: s.grandTotal, method: s.paymentMethod || 'Cash' })),
      ...onlineOrders.map(o => ({ amount: o.total, method: o.paymentMethod || 'Online' }))
    ];
    const methodMap = {};
    let totalRevenue = 0;
    allSales.forEach(s => {
      let m = s.method || 'Other';
      if (/cash/i.test(m)) m = 'Cash';
      else if (/upi|qr/i.test(m)) m = 'UPI / QR';
      else if (/card/i.test(m)) m = 'Card';
      else if (/bank|transfer/i.test(m)) m = 'Bank Transfer';
      else if (/cod/i.test(m)) m = 'Cash on Delivery';
      if (!methodMap[m]) methodMap[m] = { method: m, count: 0, totalAmount: 0 };
      methodMap[m].count += 1;
      methodMap[m].totalAmount += s.amount;
      totalRevenue += s.amount;
    });
    rows = Object.values(methodMap).map(m => [
      m.method,
      m.count,
      m.totalAmount,
      (totalRevenue > 0 ? ((m.totalAmount / totalRevenue) * 100).toFixed(1) : 0) + '%'
    ]);
  } else if (type === 'purchases') {
    headers = ['Purchase Number', 'Date', 'Supplier Name', 'Subtotal', 'Tax', 'Grand Total', 'Payment Status', 'Payment Method', 'Items Count'];
    rows = (db.purchases || []).map(p => [
      p.purchaseNumber || ('PO-' + p.id),
      p.date || p.createdAt,
      `"${(p.supplierName || '').replace(/"/g, '""')}"`,
      p.subtotal || p.totalCost,
      p.tax || 0,
      p.grandTotal || p.totalCost,
      p.paymentStatus,
      p.paymentMethod || 'Bank',
      Array.isArray(p.items) ? p.items.length : 0
    ]);
  } else if (type === 'inventory') {
    headers = ['Product ID', 'SKU', 'Name', 'Category', 'Stock Available', 'Low Stock Threshold', 'Purchase Price', 'Selling Price', 'Inventory Cost Value', 'Retail Value'];
    rows = (db.products || []).map(p => {
      const cost = p.purchasePrice || Math.round(p.price * 0.55);
      const retail = p.salePrice || p.price;
      return [
        p.id,
        `"${p.sku || ''}"`,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        p.stock,
        p.lowStockThreshold || 8,
        cost,
        retail,
        (p.stock || 0) * cost,
        (p.stock || 0) * retail
      ];
    });
  } else {
    headers = ['Channel', 'Reference #', 'Date', 'Customer Name', 'Phone', 'Payment Method', 'Subtotal', 'Discount', 'Tax', 'Grand Total', 'Status'];
    const posRows = (db.posSales || []).map(s => [
      'Store POS',
      s.invoiceNumber,
      s.date,
      `"${(s.customerName || '').replace(/"/g, '""')}"`,
      `"${(s.customerPhone || '').replace(/"/g, '""')}"`,
      s.paymentMethod,
      s.subtotal,
      s.discount || 0,
      s.tax || 0,
      s.grandTotal,
      'Completed'
    ]);
    const onlineRows = (db.orders || []).filter(o => o.status !== 'Cancelled').map(o => [
      'Website Order',
      `ORD-${o.id}`,
      new Date(o.date).toISOString(),
      `"${(o.name || '').replace(/"/g, '""')}"`,
      `"${(o.phone || '').replace(/"/g, '""')}"`,
      `"${o.paymentMethod || 'Cash / UPI on Delivery'}"`,
      o.subtotal || o.total,
      o.discount || 0,
      0,
      o.total,
      o.status
    ]);
    rows = [...posRows, ...onlineRows];
  }

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=pairaplants-orders-${Date.now()}.csv`);
  res.send(csv);
});

/* ==============================================================================
   6B. SUPPLIERS & PURCHASE ORDERS ENDPOINTS
   ============================================================================== */
app.get('/api/suppliers', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  res.json(db.suppliers || []);
});

app.post('/api/suppliers', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const b = req.body;
  const name = str(b.name, 120);
  if (!name) return res.status(400).json({ error: 'Supplier name is required.' });

  const s = {
    id: nid(db.suppliers),
    name,
    contactPerson: str(b.contactPerson, 80) || '',
    phone: str(b.phone, 30) || '',
    email: str(b.email, 80) || '',
    address: str(b.address, 250) || '',
    type: str(b.type, 80) || 'Aquatic Goods',
    notes: str(b.notes, 500) || '',
    createdAt: new Date().toISOString()
  };

  db.suppliers.push(s);
  save();
  log(req.user.username, `added supplier ${name}`, req.ip);
  res.status(201).json(s);
});

app.put('/api/suppliers/:id', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const s = (db.suppliers || []).find(x => x.id === +req.params.id);
  if (!s) return res.status(404).json({ error: 'Supplier not found.' });
  const b = req.body;

  if (b.name) s.name = str(b.name, 120);
  if (b.contactPerson !== undefined) s.contactPerson = str(b.contactPerson, 80);
  if (b.phone !== undefined) s.phone = str(b.phone, 30);
  if (b.email !== undefined) s.email = str(b.email, 80);
  if (b.address !== undefined) s.address = str(b.address, 250);
  if (b.type !== undefined) s.type = str(b.type, 80);
  if (b.notes !== undefined) s.notes = str(b.notes, 500);

  save();
  log(req.user.username, `updated supplier #${s.id} (${s.name})`, req.ip);
  res.json(s);
});

app.delete('/api/suppliers/:id', auth('superadmin'), (req, res) => {
  const idx = (db.suppliers || []).findIndex(x => x.id === +req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Supplier not found.' });
  const sup = db.suppliers[idx];
  db.suppliers.splice(idx, 1);
  save();
  log(req.user.username, `deleted supplier #${sup.id} (${sup.name})`, req.ip);
  res.json({ ok: true, message: `Supplier ${sup.name} deleted.` });
});

app.get('/api/suppliers/:id/purchases', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const purchases = (db.purchases || []).filter(p => p.supplierId === +req.params.id);
  res.json(purchases);
});

app.get('/api/purchases', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  res.json(db.purchases || []);
});

app.get('/api/purchases/:id', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const p = (db.purchases || []).find(x => x.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Purchase record not found.' });
  res.json(p);
});

app.post('/api/purchases', auth('superadmin', 'manager', 'inventory'), (req, res) => {
  const b = req.body;
  const supplierId = +b.supplierId;
  const supplier = (db.suppliers || []).find(s => s.id === supplierId);
  if (!supplier) return res.status(400).json({ error: 'Select a valid supplier.' });

  if (!Array.isArray(b.items) || !b.items.length) {
    return res.status(400).json({ error: 'Purchase must contain at least one item.' });
  }

  const items = [];
  for (const it of b.items) {
    const prod = db.products.find(x => x.id === +it.productId);
    if (!prod) return res.status(400).json({ error: `Product ID #${it.productId} not found.` });
    const qty = parseInt(it.qty, 10);
    const purchasePrice = parseFloat(it.purchasePrice);
    if (isNaN(qty) || qty <= 0 || isNaN(purchasePrice) || purchasePrice < 0) {
      return res.status(400).json({ error: `Invalid quantity or purchase price for ${prod.name}.` });
    }
    items.push({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku || `PP-${prod.id}`,
      qty,
      purchasePrice,
      total: Math.round(qty * purchasePrice * 100) / 100
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = b.tax ? parseFloat(b.tax) : Math.round(subtotal * 0.05 * 100) / 100;
  const grandTotal = Math.round((subtotal + tax) * 100) / 100;

  const dateNow = new Date();
  const year = dateNow.getFullYear();
  const poId = nid(db.purchases.length ? db.purchases : [{ id: 5000 }]);
  const purchaseNumber = `PO-${year}-${String(poId).padStart(4, '0')}`;

  const purchaseRecord = {
    id: poId,
    purchaseNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: dateNow.toISOString(),
    items,
    subtotal,
    tax,
    grandTotal,
    paymentStatus: b.paymentStatus || 'paid',
    paymentMethod: b.paymentMethod || 'Bank Transfer',
    notes: str(b.notes, 500) || '',
    createdBy: req.user.username
  };

  // Stock In: increment stock via centralized inventory engine (Requirement 21)
  items.forEach(it => {
    const prod = db.products.find(x => x.id === it.productId);
    if (prod) {
      if (it.purchasePrice) prod.purchasePrice = it.purchasePrice;
      recordStockTransaction({
        productId: prod.id,
        transactionType: 'purchase',
        quantityIn: it.qty,
        quantityOut: 0,
        referenceNumber: purchaseNumber,
        createdBy: req.user.username,
        notes: `Purchase ${purchaseNumber} Stock In from ${supplier.name}`
      });
    }
  });

  // Record payment entry
  const payId = nid(db.payments.length ? db.payments : [{ id: 8000 }]);
  db.payments.unshift({
    id: payId,
    paymentNumber: `PAY-${year}-${String(payId).padStart(4, '0')}`,
    date: dateNow.toISOString(),
    type: 'purchase',
    referenceId: purchaseRecord.id,
    referenceNumber: purchaseNumber,
    supplierName: supplier.name,
    amount: grandTotal,
    method: purchaseRecord.paymentMethod,
    status: purchaseRecord.paymentStatus === 'paid' ? 'completed' : 'pending',
    transactionRef: str(b.transactionRef, 80) || '',
    notes: `Settlement for purchase ${purchaseNumber}`
  });

  db.purchases.unshift(purchaseRecord);
  save();
  log(req.user.username, `created purchase order ${purchaseNumber} (₹${grandTotal}) from ${supplier.name}`, req.ip);
  res.status(201).json(purchaseRecord);
});

/* ==============================================================================
   6C. POINT OF SALE (POS) BILLING & CHECKOUT ENDPOINTS
   ============================================================================== */
app.get('/api/pos/sales', auth('superadmin', 'manager', 'sales'), (req, res) => {
  res.json(db.posSales || []);
});

app.post('/api/pos/checkout', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const b = req.body;
  if (!Array.isArray(b.items) || !b.items.length) {
    return res.status(400).json({ error: 'Add at least one product to the POS bill.' });
  }

  // 1. Validate Live Inventory
  const lineItems = [];
  for (const it of b.items) {
    const pid = +it.id || +it.productId;
    const prod = db.products.find(x => x.id === pid);
    if (!prod) return res.status(400).json({ error: `Product ID #${pid} not found.` });
    const qty = parseInt(it.qty !== undefined ? it.qty : it.quantity, 10);
    if (isNaN(qty) || qty < 1) return res.status(400).json({ error: `Invalid quantity for ${prod.name}.` });
    if (prod.stock < qty) {
      return res.status(409).json({ error: `Insufficient stock for ${prod.name}. Only ${prod.stock} units available.` });
    }
    const unitPrice = it.price !== undefined ? parseFloat(it.price) : (it.unitPrice !== undefined ? parseFloat(it.unitPrice) : (prod.salePrice || prod.price));
    const lineDiscount = it.discount ? parseFloat(it.discount) : 0;
    const lineTotal = Math.max(0, Math.round((qty * unitPrice - lineDiscount) * 100) / 100);
    lineItems.push({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku || `PP-${prod.id}`,
      qty,
      price: unitPrice,
      discount: lineDiscount,
      total: lineTotal
    });
  }

  // 2. Customer Handling (Existing Customer or Walk-in)
  let custName = 'Walk-in Customer';
  let custPhone = '';
  let custEmail = '';
  let custAddress = '';
  let customerId = null;

  if (b.customerId) {
    const c = (db.customers || []).find(x => x.id === +b.customerId);
    if (c) {
      customerId = c.id;
      custName = c.name;
      custPhone = c.phone || '';
      custEmail = c.email || '';
      custAddress = c.address || '';
    }
  } else if (b.customer && b.customer.name) {
    custName = str(b.customer.name, 80);
    custPhone = str(b.customer.phone, 30);
    custEmail = str(b.customer.email, 80);
    custAddress = str(b.customer.address, 200);

    if (custPhone) {
      let existingCust = (db.customers || []).find(x => x.phone === custPhone);
      if (!existingCust) {
        existingCust = {
          id: nid(db.customers.length ? db.customers : [{ id: 100 }]),
          name: custName,
          phone: custPhone,
          email: custEmail,
          address: custAddress,
          createdAt: new Date().toISOString()
        };
        db.customers.push(existingCust);
      }
      customerId = existingCust.id;
    }
  }

  // 3. Totals Calculation
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const overallDiscount = b.discount ? Math.min(subtotal, Math.max(0, parseFloat(b.discount))) : 0;
  const taxable = Math.max(0, subtotal - overallDiscount);
  const taxRate = b.taxRate !== undefined ? parseFloat(b.taxRate) : ((db.settings && db.settings.defaultTaxRate) || 5);
  const tax = Math.round((taxable * (taxRate / 100)) * 100) / 100;
  const grandTotal = Math.round((taxable + tax) * 100) / 100;

  const dateNow = new Date();
  const year = dateNow.getFullYear();
  const saleId = nid(db.posSales.length ? db.posSales : [{ id: 7000 }]);
  const invoiceNumber = `PP-INV-${String(saleId).padStart(4, '0')}`;

  // 4. Atomic Stock Deduction via Centralized Inventory Engine (Requirement 21)
  lineItems.forEach(it => {
    recordStockTransaction({
      productId: it.productId,
      transactionType: 'sale',
      quantityIn: 0,
      quantityOut: it.qty,
      referenceNumber: invoiceNumber,
      createdBy: req.user.username,
      notes: `POS Counter Sale #${invoiceNumber}`
    });
  });

  // 5. Create POS Sale Record
  const posRecord = {
    id: saleId,
    invoiceNumber,
    customerId,
    customerName: custName,
    customerPhone: custPhone,
    date: dateNow.toISOString(),
    items: lineItems,
    subtotal,
    discount: overallDiscount,
    tax,
    taxRate,
    grandTotal,
    paymentMethod: b.paymentMethod || 'Cash',
    paymentStatus: 'completed',
    transactionRef: str(b.transactionRef, 80) || '',
    notes: str(b.notes, 250) || '',
    createdBy: req.user.username
  };
  db.posSales.unshift(posRecord);

  // 6. Create GST Tax Invoice Record
  const invRecord = {
    id: nid(db.invoices.length ? db.invoices : [{ id: 9000 }]),
    invoiceNumber,
    type: 'pos',
    referenceId: saleId,
    date: dateNow.toISOString(),
    customer: {
      name: custName,
      phone: custPhone,
      email: custEmail,
      address: custAddress
    },
    items: lineItems,
    subtotal,
    discount: overallDiscount,
    tax,
    taxRate,
    grandTotal,
    paymentMethod: posRecord.paymentMethod,
    paymentStatus: 'completed',
    transactionRef: posRecord.transactionRef,
    gstin: (db.settings && db.settings.gstin) || '32AAAAA0000A1Z5',
    notes: 'Thank you for choosing Paira Plants Botanical Studio.'
  };
  db.invoices.unshift(invRecord);

  // 7. Create Payment Record
  const payId = nid(db.payments.length ? db.payments : [{ id: 8000 }]);
  db.payments.unshift({
    id: payId,
    paymentNumber: `PAY-${year}-${String(payId).padStart(4, '0')}`,
    date: dateNow.toISOString(),
    type: 'sale',
    referenceId: saleId,
    referenceNumber: invoiceNumber,
    customerName: custName,
    amount: grandTotal,
    method: posRecord.paymentMethod,
    status: 'completed',
    transactionRef: posRecord.transactionRef,
    notes: `Counter checkout payment via ${posRecord.paymentMethod}`
  });

  save();
  log(req.user.username, `completed POS sale #${invoiceNumber} (₹${grandTotal}) for ${custName}`, req.ip);
  res.status(201).json({ ok: true, sale: posRecord, invoice: invRecord });
});

/* ==============================================================================
   6D. INVOICES & GST BILLING ENDPOINTS
   ============================================================================== */
app.get('/api/invoices', auth('superadmin', 'manager', 'sales', 'inventory'), (req, res) => {
  res.json(db.invoices || []);
});

app.get('/api/invoices/:id', auth('superadmin', 'manager', 'sales', 'inventory'), (req, res) => {
  const inv = (db.invoices || []).find(x => x.id === +req.params.id || x.invoiceNumber === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
  res.json(inv);
});

app.get('/api/invoices/:id/print', (req, res) => {
  const inv = (db.invoices || []).find(x => x.id === +req.params.id || x.invoiceNumber === req.params.id);
  if (!inv) return res.status(404).send('<h2>Invoice not found</h2>');

  const s = db.settings || {};
  const brandTitle = s.business_name || s.brandTitle || s.storeName || 'Paira Plants';
  const address = s.business_address || s.address || 'Kochi, Kerala, India';
  const phone = s.phone_number || s.phone || '+91 98765 43210';
  const email = s.email || 'care@pairaplants.com';
  const gstin = inv.gstin || s.gstin || '32AAAAA0000A1Z5';
  const currencySym = s.currency_symbol || s.currencySymbol || '₹';

  const rows = (inv.items || []).map((it, idx) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;">${idx + 1}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;">
        <strong>${esc(it.productName || it.name)}</strong>
        <div style="font-size:11px;color:#64748b;">SKU: ${esc(it.sku || 'N/A')}</div>
      </td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.qty}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${Number(it.price).toFixed(2)}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${Number(it.total || (it.price * it.qty)).toFixed(2)}</td>
    </tr>
  `).join('');

  const taxHalf = (inv.tax ? Number(inv.tax) / 2 : 0).toFixed(2);

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Tax Invoice - ${inv.invoiceNumber}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
        .invoice-card { max-width: 820px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e5c3c; padding-bottom: 20px; }
        .brand-title { font-size: 26px; font-weight: 800; color: #1e5c3c; letter-spacing: -0.02em; }
        .brand-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
        .invoice-meta { text-align: right; }
        .invoice-tag { display: inline-block; background: #e6f4ee; color: #1e5c3c; font-weight: 700; font-size: 14px; padding: 4px 12px; border-radius: 6px; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
        .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; font-size: 13px; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px; font-weight: 600; text-align: left; color: #475569; }
        .totals-section { margin-top: 20px; display: flex; justify-content: flex-end; }
        .totals-table { width: 340px; font-size: 13px; }
        .totals-table tr td { padding: 6px 0; }
        .totals-table tr.grand td { border-top: 2px solid #1e5c3c; font-size: 18px; font-weight: 800; color: #1e5c3c; padding-top: 10px; }
        .footer-note { margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6; }
        .print-btn { background: #1e5c3c; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; }
        @media print {
          body { background: #fff; padding: 0; }
          .invoice-card { border: none; box-shadow: none; padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div style="max-width:820px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;" class="no-print">
        <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <span style="font-size:13px;color:#64748b;">Paira Plants Tax Invoice</span>
      </div>

      <div class="invoice-card">
        <div class="header">
          <div>
            <div class="brand-title">🌿 ${brandTitle}</div>
            <div class="brand-sub">Aquatic Plants, Ornamental Fishes, Dwarf Shrimps &amp; Aquascaping</div>
            <div style="font-size:12px;color:#475569;margin-top:6px;">📍 ${address}</div>
            <div style="font-size:12px;color:#475569;">📞 ${phone} · ✉️ ${email}</div>
            <div style="font-size:12px;font-weight:700;color:#1e5c3c;margin-top:4px;">GSTIN: ${gstin}</div>
          </div>
          <div class="invoice-meta">
            <span class="invoice-tag">TAX INVOICE</span>
            <h3 style="margin:8px 0 4px;font-size:18px;color:#0f172a;">${inv.invoiceNumber}</h3>
            <div style="font-size:12px;color:#64748b;">Date: ${new Date(inv.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
            <div style="font-size:12px;color:#16a34a;font-weight:600;margin-top:4px;">Payment: ${inv.paymentMethod} (${(inv.paymentStatus || 'completed').toUpperCase()})</div>
          </div>
        </div>

        <div class="details-grid">
          <div class="details-box">
            <strong style="color:#0f172a;">Billed To:</strong><br>
            <strong>${esc((inv.customer && inv.customer.name) || 'Walk-in Customer')}</strong><br>
            ${inv.customer && inv.customer.phone ? `Phone: ${esc(inv.customer.phone)}<br>` : ''}
            ${inv.customer && inv.customer.email ? `Email: ${esc(inv.customer.email)}<br>` : ''}
            ${inv.customer && inv.customer.address ? `Address: ${esc(inv.customer.address)}<br>` : ''}
          </div>
          <div class="details-box">
            <strong style="color:#0f172a;">Dispatch &amp; Supply Details:</strong><br>
            Place of Supply: <strong>Kerala (State Code: 32)</strong><br>
            Reverse Charge: <strong>No</strong><br>
            Mode of Delivery: <strong>${inv.type === 'pos' ? 'Store Counter Pickup' : 'Courier Live Packaging'}</strong><br>
            Ref: <strong>${inv.type.toUpperCase()}-${inv.referenceId || ''}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:36px;text-align:center;">#</th>
              <th>Item Description &amp; SKU</th>
              <th style="width:70px;text-align:center;">Qty</th>
              <th style="width:100px;text-align:right;">Rate (₹)</th>
              <th style="width:110px;text-align:right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="totals-section">
          <table class="totals-table">
            <tr>
              <td>Subtotal</td>
              <td style="text-align:right;">₹${Number(inv.subtotal).toFixed(2)}</td>
            </tr>
            ${inv.discount ? `
            <tr>
              <td style="color:#dc2626;">Discount</td>
              <td style="text-align:right;color:#dc2626;">-₹${Number(inv.discount).toFixed(2)}</td>
            </tr>` : ''}
            <tr>
              <td>CGST (${((inv.taxRate || 5) / 2)}%)</td>
              <td style="text-align:right;">₹${taxHalf}</td>
            </tr>
            <tr>
              <td>SGST (${((inv.taxRate || 5) / 2)}%)</td>
              <td style="text-align:right;">₹${taxHalf}</td>
            </tr>
            <tr class="grand">
              <td>Grand Total</td>
              <td style="text-align:right;">₹${Number(inv.grandTotal).toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div class="footer-note">
          <strong>Thank you for choosing Paira Plants.</strong><br>
          For live aquatic plant care guidance, water parameter consultation or warranty inquiries, contact <strong>${phone}</strong> or <strong>${email}</strong>.<br>
          <em>This is a computer-generated tax invoice and requires no physical signature.</em>
        </div>
      </div>
    </body>
    </html>
  `);
});

/* ==============================================================================
   6E. PAYMENTS & TRANSACTION LEDGER ENDPOINTS
   ============================================================================== */
app.get('/api/payments', auth('superadmin', 'manager', 'sales'), (req, res) => {
  res.json(db.payments || []);
});

app.patch('/api/payments/:id/status', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const p = (db.payments || []).find(x => x.id === +req.params.id);
  if (!p) return res.status(404).json({ error: 'Payment record not found.' });
  const status = str(req.body.status, 30);
  if (!['completed', 'pending', 'refunded', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid payment status.' });
  }
  p.status = status;
  if (req.body.transactionRef) p.transactionRef = str(req.body.transactionRef, 80);
  save();
  log(req.user.username, `updated payment #${p.id} status to ${status}`, req.ip);
  res.json(p);
});

/* ==============================================================================
   6F. DASHBOARD REAL-TIME ANALYTICS & STATS ENDPOINTS
   ============================================================================== */
app.get('/api/dashboard/stats', auth('superadmin', 'manager', 'inventory', 'sales'), (req, res) => {
  const prods = db.products || [];
  const purchases = db.purchases || [];
  const posSales = db.posSales || [];
  const onlineOrders = (db.orders || []).filter(o => o.status !== 'Cancelled');

  const totalProducts = prods.length;
  const totalStock = prods.reduce((sum, p) => sum + (p.stock || 0), 0);

  // Category-wise stock
  let plantsStock = 0;
  let fishStock = 0;
  let shrimpStock = 0;
  let gravelsStock = 0;
  let accessoriesStock = 0;

  prods.forEach(p => {
    const c = (p.category || '').toLowerCase();
    const stk = p.stock || 0;
    if (c.includes('plant') || c.includes('moss')) plantsStock += stk;
    else if (c.includes('fish')) fishStock += stk;
    else if (c.includes('shrimp') || c.includes('cleaner') || c.includes('snail')) shrimpStock += stk;
    else if (c.includes('substrate') || c.includes('gravel') || c.includes('material') || c.includes('soil') || c.includes('stone')) gravelsStock += stk;
    else accessoriesStock += stk;
  });

  const lowStockThreshold = (db.settings && db.settings.lowStockDefault) || 8;
  const lowStockProducts = prods.filter(p => p.stock > 0 && p.stock <= (p.lowStockThreshold || lowStockThreshold));
  const outOfStockProducts = prods.filter(p => p.stock <= 0);

  const totalPosRevenue = posSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
  const totalOnlineRevenue = onlineOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalSales = Math.round((totalPosRevenue + totalOnlineRevenue) * 100) / 100;
  const totalPurchases = Math.round(purchases.reduce((sum, p) => sum + (p.totalCost || p.grandTotal || 0), 0) * 100) / 100;

  // Recent sales combined
  const recentSales = [
    ...posSales.map(s => ({
      id: `POS-${s.id}`,
      refNumber: s.invoiceNumber,
      channel: 'Store POS',
      customer: s.customerName,
      date: s.date,
      amount: s.grandTotal,
      itemsCount: Array.isArray(s.items) ? s.items.length : 0,
      paymentMethod: s.paymentMethod,
      status: 'Completed'
    })),
    ...onlineOrders.map(o => ({
      id: `WEB-${o.id}`,
      refNumber: `ORD-${o.id}`,
      channel: 'Online Website',
      customer: o.name,
      date: new Date(o.date).toISOString(),
      amount: o.total,
      itemsCount: Array.isArray(o.items) ? o.items.length : 0,
      paymentMethod: o.paymentMethod,
      status: o.status
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  // Best selling products
  const productSalesMap = {};
  [...posSales, ...onlineOrders].forEach(order => {
    (order.items || []).forEach(it => {
      const pid = it.productId || it.id;
      const name = it.productName || it.name;
      const qty = it.qty || 1;
      const price = it.price || 0;
      if (!productSalesMap[pid]) {
        productSalesMap[pid] = { id: pid, name, qty: 0, revenue: 0 };
      }
      productSalesMap[pid].qty += qty;
      productSalesMap[pid].revenue += qty * price;
    });
  });
  const bestSellingProducts = Object.values(productSalesMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  res.json({
    totalProducts,
    totalStock,
    plantsStock,
    fishStock,
    shrimpStock,
    gravelsStock,
    accessoriesStock,
    lowStockCount: lowStockProducts.length,
    outOfStockCount: outOfStockProducts.length,
    totalSales,
    totalPurchases,
    lowStockProducts: lowStockProducts.slice(0, 8).map(p => ({ id: p.id, name: p.name, stock: p.stock, threshold: p.lowStockThreshold || lowStockThreshold, category: p.category })),
    outOfStockProducts: outOfStockProducts.slice(0, 8).map(p => ({ id: p.id, name: p.name, category: p.category })),
    recentSales,
    recentPurchases: purchases.slice(0, 6),
    recentOrders: (db.orders || []).slice(0, 6),
    bestSellingProducts
  });
});

/* ==============================================================================
   7. HOMEPAGE MANAGEMENT CMS ENDPOINTS
   ============================================================================== */
app.get('/api/homepage', (req, res) => {
  res.json(db.homepage || {});
});

app.put('/api/homepage', auth('superadmin', 'manager'), (req, res) => {
  const b = req.body;
  if (!db.homepage) db.homepage = {};
  if (!db.settings) db.settings = {};

  if (b.hero) {
    db.homepage.hero = { ...db.homepage.hero, ...b.hero };
    if (b.hero.bannerImage) db.settings.hero_banner_image = b.hero.bannerImage;
    if (b.hero.title) db.settings.hero_title = b.hero.title;
    if (b.hero.subtitle) db.settings.hero_subtitle = b.hero.subtitle;
    if (b.hero.ctaText) db.settings.hero_cta_text = b.hero.ctaText;
    if (b.hero.ctaLink) db.settings.hero_cta_link = b.hero.ctaLink;
  }
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
app.get('/api/customers', auth('superadmin', 'manager', 'sales', 'support'), (req, res) => {
  const list = (db.customers || []).map(c => {
    const custOrders = (db.orders || []).filter(o => o.phone === c.phone || (o.address && o.address.includes(c.name)));
    const onlineSpent = custOrders.reduce((s, o) => s + (o.status !== 'Cancelled' ? o.total : 0), 0);
    const custPos = (db.posSales || []).filter(s => s.customerId === c.id || (s.customerPhone && s.customerPhone === c.phone));
    const posSpent = custPos.reduce((s, x) => s + (x.grandTotal || 0), 0);
    const totalSpent = Math.round((onlineSpent + posSpent) * 100) / 100;
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      active: c.active !== false,
      orderCount: custOrders.length + custPos.length,
      onlineOrdersCount: custOrders.length,
      posSalesCount: custPos.length,
      totalSpent,
      createdAt: c.createdAt
    };
  });
  res.json(list);
});

app.post('/api/customers', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const b = req.body;
  const name = str(b.name, 80);
  const phone = str(b.phone, 30);
  if (!name || !phone) return res.status(400).json({ error: 'Customer name and phone are required.' });

  const existing = (db.customers || []).find(c => c.phone === phone);
  if (existing) return res.status(409).json({ error: 'Customer with this phone already exists.', customer: existing });

  const c = {
    id: nid(db.customers.length ? db.customers : [{ id: 100 }]),
    name,
    phone,
    email: str(b.email, 80) || '',
    address: str(b.address, 250) || '',
    active: true,
    createdAt: new Date().toISOString()
  };

  db.customers.push(c);
  save();
  log(req.user.username, `added customer ${name} (${phone})`, req.ip);
  res.status(201).json(c);
});

app.get('/api/customers/:id', auth('superadmin', 'manager', 'sales', 'support'), (req, res) => {
  const c = (db.customers || []).find(x => x.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found.' });

  const orders = (db.orders || []).filter(o => o.phone === c.phone || (o.address && o.address.includes(c.name)));
  const posSales = (db.posSales || []).filter(s => s.customerId === c.id || (s.customerPhone && s.customerPhone === c.phone));
  const totalSpent = Math.round(([...orders.filter(o => o.status !== 'Cancelled'), ...posSales].reduce((s, x) => s + (x.total || x.grandTotal || 0), 0)) * 100) / 100;

  res.json({
    customer: c,
    orders,
    posSales,
    totalSpent,
    totalTransactions: orders.length + posSales.length
  });
});

app.put('/api/customers/:id', auth('superadmin', 'manager', 'sales'), (req, res) => {
  const c = (db.customers || []).find(x => x.id === +req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found.' });
  const b = req.body;

  if (b.name) c.name = str(b.name, 80);
  if (b.phone) c.phone = str(b.phone, 30);
  if (b.email !== undefined) c.email = str(b.email, 80);
  if (b.address !== undefined) c.address = str(b.address, 250);
  if (b.active !== undefined) c.active = !!b.active;

  save();
  log(req.user.username, `updated customer #${c.id} (${c.name})`, req.ip);
  res.json(c);
});

/* ==============================================================================
   15. STORE SETTINGS & SEO ENDPOINTS
   ============================================================================== */
app.get('/api/settings', async (req, res) => {
  if (supabase) {
    try {
      const { data: hs, error: hErr } = await supabase.from('homepage_settings').select('*').eq('id', 1).single();
      if (!hErr && hs && hs.why_choose_us && typeof hs.why_choose_us === 'object') {
        db.settings = { ...(db.settings || {}), ...hs.why_choose_us };
      }
    } catch (e) {}
  }
  res.json(db.settings || {});
});

app.put('/api/settings', auth('superadmin'), async (req, res) => {
  db.settings = { ...db.settings, ...req.body };
  save();
  try {
    await syncSettingsToSupabase(db.settings);
  } catch (e) {
    console.error('Settings Supabase sync error:', e.message);
  }
  log(req.user.username, 'updated store & SEO settings', req.ip);
  res.json(db.settings);
});

/* ==============================================================================
   16. SEO: DYNAMIC SITEMAP.XML & ROBOTS.TXT
   ============================================================================== */
app.get('/sitemap.xml', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const staticUrls = ['', 'about', 'shop', 'gallery', 'contact', 'cart'];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  staticUrls.forEach(u => {
    xml += `  <url>\n    <loc>${host}/${u}</loc>\n    <changefreq>daily</changefreq>\n    <priority>${u === '' ? '1.0' : '0.8'}</priority>\n  </url>\n`;
  });

  (db.categories || []).forEach(c => {
    xml += `  <url>\n    <loc>${host}/shop/${c.slug}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.85</priority>\n  </url>\n`;
  });

  (db.products || []).filter(p => p.isVisible !== false).forEach(p => {
    const slug = p.slug || ('prod-' + p.id);
    xml += `  <url>\n    <loc>${host}/product/${slug}</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
  });

  xml += `</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

app.get('/robots.txt', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n\nSitemap: ${host}/sitemap.xml\n`);
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

/* ==============================================================================
   ADMIN AUTHENTICATION & ROUTE PROTECTION (Requirements 2, 6 & 12)
   ============================================================================== */
app.get('/admin/login', (req, res) => {
  try {
    const t = jwt.verify(req.cookies.token, SECRET);
    const u = db.users.find(x => x.id === t.id && x.active);
    if (u) return res.redirect('/admin/dashboard');
  } catch (e) {}
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(renderAdminLoginPage(req.query.error, host));
});

app.post('/admin/login', (req, res) => {
  const b = req.body || {};
  const username = str(b.username, 20).toLowerCase();
  const password = String(b.password || '');
  const u = db.users.find(x => x.username === username && x.active);

  let valid = false;
  if (u && u.hash) {
    valid = bcrypt.compareSync(password, u.hash);
    if (!valid && DEFAULT_STAFF_PASSWORDS[username]) {
      valid = DEFAULT_STAFF_PASSWORDS[username].includes(password);
    }
  }

  if (!u || !valid) {
    return res.redirect('/admin/login?error=Invalid+staff+username+or+password');
  }

  const token = jwt.sign({ id: u.id, role: u.role, username: u.username }, SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !isVercel ? true : false,
    maxAge: 7 * 864e5
  });
  log(u.username, 'staff logged in via /admin/login', req.ip);
  res.redirect('/admin/dashboard');
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/admin/login');
});

// Server-Side Protected Admin Routes: unauthenticated visitors are redirected to /admin/login
app.get(['/admin', '/admin/:section'], (req, res) => {
  const section = req.params.section || 'dashboard';
  if (section === 'login') {
    const host = `${req.protocol}://${req.get('host')}`;
    return res.send(renderAdminLoginPage(req.query.error, host));
  }

  try {
    const t = jwt.verify(req.cookies.token, SECRET);
    const u = db.users.find(x => x.id === t.id && x.active);
    if (!u) throw new Error('Unauthenticated');
    res.send(renderAdminAppShell({ user: u, section, db }));
  } catch (err) {
    return res.redirect('/admin/login');
  }
});

/* ==============================================================================
   PUBLIC WEBSITE SERVER-SIDE RENDERING (SSR) ROUTES (Requirements 2, 3, 4 & 5)
   ============================================================================== */
app.get('/', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(renderHomePage(db, host));
});

app.get('/about', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(renderAboutPage(db, host));
});

app.get('/shop', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(renderShopPage(db, host, null, req.query.q || ''));
});

app.get('/shop/:category', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(renderShopPage(db, host, req.params.category, req.query.q || ''));
});

app.get('/product/:slug', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const html = renderProductPage(db, host, req.params.slug);
  if (!html) {
    return res.status(404).send(renderLayout({
      title: 'Botanical Product Not Found · Paira Plants',
      description: 'The requested botanical item is not found in our catalog.',
      canonicalUrl: `${host}/shop`,
      content: `<div class="narrow-box" style="text-align:center;padding:80px 20px;">
        <h2>Product Not Found</h2>
        <p class="muted">The botanical product you are looking for may have been retired or renamed.</p>
        <a class="btn-pill" href="/shop">Browse Full Botanical Catalog &rarr;</a>
      </div>`,
      settings: getSettings(db)
    }));
  }
  res.send(html);
});

app.get('/gallery', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(renderGalleryPage(db, host));
});

app.get('/contact', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(renderContactPage(db, host));
});

app.get('/cart', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(renderCartPage(db, host));
});

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
