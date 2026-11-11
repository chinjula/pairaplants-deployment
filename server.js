'use strict';
const express = require('express'), cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const isVercel = !!process.env.VERCEL;
const DATA = isVercel ? '/tmp/data' : path.join(__dirname, 'data');
const DB = isVercel ? '/tmp/data/db.json' : path.join(DATA, 'db.json');
const BK = path.join(DATA, 'backups'), SF = path.join(DATA, '.secret');

try { fs.mkdirSync(BK, { recursive: true }); } catch (e) {}

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

const ROLES = ['superadmin', 'manager', 'support'];
const CATS = ['Fish', 'Shrimps & Invertebrates', 'Aquatic Plants & Mosses', 'Substrates & Hardscape'];
const STATUSES = ['New', 'Packed', 'Shipped', 'Delivered'];

/* ---------- tiny JSON database ---------- */
let db;
const save = () => {
  try {
    fs.writeFileSync(DB + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(DB + '.tmp', DB);
  } catch (e) {
    console.error('Failed to save db:', e.message);
  }
};
const nid = a => a.reduce((m, x) => Math.max(m, x.id), 0) + 1;
function seed() {
  console.log('\nFirst run: staff accounts created. Save these passwords now (change them after login):');
  const mk = (username, name, role) => {
    const pw = crypto.randomBytes(6).toString('base64url');
    console.log(`  ${username.padEnd(8)} ${role.padEnd(11)} password: ${pw}`);
    return { username, name, role, hash: bcrypt.hashSync(pw, 10), active: true };
  };
  const users = [mk('owner', 'Owner', 'superadmin'), mk('manager', 'Manager', 'manager'), mk('support', 'Support', 'support')]
    .map((u, i) => ({ id: i + 1, ...u }));
  console.log('');
  const P = [
    ['Java fern', 'Plants', 180, 42, 'Hardy, low light, attach to wood or rock.'],
    ['Amazon sword', 'Plants', 260, 6, 'Large rooted centerpiece plant.'],
    ['Anubias nana', 'Plants', 220, 19, 'Slow-growing, tough leaves.'],
    ['Neon tetra (6 pack)', 'Fishes', 300, 25, 'Peaceful schooling fish for community tanks.'],
    ['Betta, male', 'Fishes', 450, 4, 'Keep one per tank. Long flowing fins.'],
    ['Guppy pair', 'Fishes', 150, 31, 'Colorful, easy to breed.'],
    ['River gravel, 2 kg', 'Gravels', 240, 50, 'Smooth natural stones, 3–5 mm.'],
    ['Black sand, 2 kg', 'Gravels', 280, 3, 'Fine substrate that makes colors pop.'],
    ['Planted tank soil, 3 kg', 'Gravels', 620, 14, 'Nutrient-rich base for planted tanks.']
  ];
  db = { users, products: P.map((p, i) => ({ id: i + 1, name: p[0], category: p[1], price: p[2], stock: p[3], description: p[4] })),
    orders: [], inquiries: [], logs: [] };
  save();
}
fs.existsSync(DB) ? (db = JSON.parse(fs.readFileSync(DB, 'utf8'))) : seed();

const log = (user, action, ip) => { db.logs.unshift({ t: Date.now(), user, action, ip }); db.logs.length = Math.min(db.logs.length, 300); save(); };
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const pub = u => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active });

/* ---------- app + security headers ---------- */
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use((q, s, n) => {
  s.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:" });
  n();
});
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- auth ---------- */
// Super Admin passes every role check.
const auth = (...roles) => (req, res, next) => {
  try {
    const t = jwt.verify(req.cookies.token, SECRET);
    const u = db.users.find(x => x.id === t.id && x.active);
    if (!u) throw new Error('no user');
    if (roles.length && u.role !== 'superadmin' && !roles.includes(u.role)) return res.status(403).json({ error: 'Your role cannot do this.' });
    req.user = u; next();
  } catch (e) { res.status(401).json({ error: 'Please sign in.' }); }
};

const fails = {};
app.post('/api/login', (req, res) => {
  const ip = req.ip, f = fails[ip];
  if (f && f.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const uname = str(req.body.username, 40).toLowerCase();
  const u = db.users.find(x => x.username === uname);
  if (!u || !u.active || !bcrypt.compareSync(String(req.body.password || ''), u.hash)) {
    const c = fails[ip] = fails[ip] || { n: 0 };
    if (++c.n >= 5) { c.until = Date.now() + 9e5; c.n = 0; }
    log(uname || '?', 'failed login', ip);
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  delete fails[ip];
  res.cookie('token', jwt.sign({ id: u.id }, SECRET, { expiresIn: '8h' }),
    { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600e3 });
  log(u.username, 'login', ip);
  res.json(pub(u));
});
app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
app.get('/api/me', auth(), (req, res) => res.json(pub(req.user)));

/* ---------- products ---------- */
app.get('/api/products', (req, res) => res.json(db.products));
app.patch('/api/products/:id/stock', auth('manager', 'support'), (req, res) => {
  const p = db.products.find(x => x.id === +req.params.id), s = req.body.stock;
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  if (!Number.isInteger(s) || s < 0 || s > 100000) return res.status(400).json({ error: 'Stock must be a whole number, 0 or more.' });
  p.stock = s; save(); log(req.user.username, `stock ${p.name} = ${s}`, req.ip); res.json(p);
});
app.post('/api/products', auth('superadmin'), (req, res) => {
  const b = req.body, name = str(b.name, 80), price = +b.price, stock = +b.stock;
  if (!name || !CATS.includes(b.category) || !(price > 0) || !Number.isInteger(stock) || stock < 0)
    return res.status(400).json({ error: 'Enter a name, category, price and stock.' });
  const p = { id: nid(db.products), name, category: b.category, subcategory: str(b.subcategory, 80), price, stock, description: str(b.description, 200) };
  db.products.push(p); save(); log(req.user.username, `added product ${name}`, req.ip); res.status(201).json(p);
});
app.delete('/api/products/:id', auth('superadmin'), (req, res) => {
  const i = db.products.findIndex(x => x.id === +req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Product not found.' });
  log(req.user.username, `deleted product ${db.products[i].name}`, req.ip); db.products.splice(i, 1); save(); res.json({ ok: true });
});

/* ---------- orders ---------- */
app.post('/api/orders', (req, res) => {
  const b = req.body, name = str(b.name, 80), phone = str(b.phone, 20), address = str(b.address, 300);
  if (!name || !phone || !address || !Array.isArray(b.items) || !b.items.length || b.items.length > 50)
    return res.status(400).json({ error: 'Enter your name, phone, address and at least one item.' });
  const lines = [];
  for (const it of b.items) {
    const p = db.products.find(x => x.id === it.id);
    if (!p || !Number.isInteger(it.qty) || it.qty < 1 || lines.some(l => l.id === p.id)) return res.status(400).json({ error: 'Invalid item in cart.' });
    if (it.qty > p.stock) return res.status(409).json({ error: `Only ${p.stock} of ${p.name} left.` });
    lines.push({ id: p.id, name: p.name, qty: it.qty, price: p.price });
  }
  lines.forEach(l => { db.products.find(x => x.id === l.id).stock -= l.qty; });
  const o = { id: nid(db.orders.length ? db.orders : [{ id: 1000 }]), name, phone, address, items: lines,
    total: lines.reduce((s, l) => s + l.price * l.qty, 0), status: 'New', date: Date.now() };
  db.orders.unshift(o); save(); res.status(201).json(o);
});
app.get('/api/orders', auth('manager'), (req, res) => res.json(db.orders));
app.patch('/api/orders/:id', auth('manager'), (req, res) => {
  const o = db.orders.find(x => x.id === +req.params.id);
  if (!o || !STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid order or status.' });
  o.status = req.body.status; save(); log(req.user.username, `order #${o.id} ${o.status}`, req.ip); res.json(o);
});

/* ---------- inquiries (Contact Us) ---------- */
app.post('/api/inquiries', (req, res) => {
  const b = req.body, name = str(b.name, 80), email = str(b.email, 120), msg = str(b.message, 1000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !msg) return res.status(400).json({ error: 'Enter your name, a valid email and a message.' });
  if (db.inquiries.length >= 500) return res.status(503).json({ error: 'Inbox is full. Please call us instead.' });
  db.inquiries.unshift({ id: nid(db.inquiries), name, email, message: msg, done: false, date: Date.now() }); save(); res.status(201).json({ ok: true });
});
app.get('/api/inquiries', auth('support'), (req, res) => res.json(db.inquiries));
app.patch('/api/inquiries/:id', auth('support'), (req, res) => {
  const q = db.inquiries.find(x => x.id === +req.params.id);
  if (!q) return res.status(404).json({ error: 'Inquiry not found.' });
  q.done = !!req.body.done; save(); res.json(q);
});

/* ---------- super admin: users, backups, security log ---------- */
app.get('/api/users', auth('superadmin'), (req, res) => res.json(db.users.map(pub)));
app.post('/api/users', auth('superadmin'), (req, res) => {
  const b = req.body, username = str(b.username, 20).toLowerCase(), name = str(b.name, 60), pw = String(b.password || '');
  if (!/^[a-z0-9_]{3,20}$/.test(username) || !name || pw.length < 8 || !ROLES.includes(b.role))
    return res.status(400).json({ error: 'Use a 3–20 letter username, a name, a role and a password of 8+ characters.' });
  if (db.users.some(u => u.username === username)) return res.status(409).json({ error: 'That username is taken.' });
  const u = { id: nid(db.users), username, name, role: b.role, hash: bcrypt.hashSync(pw, 10), active: true };
  db.users.push(u); save(); log(req.user.username, `created user ${username} (${u.role})`, req.ip); res.status(201).json(pub(u));
});
app.patch('/api/users/:id', auth('superadmin'), (req, res) => {
  const u = db.users.find(x => x.id === +req.params.id), b = req.body;
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (u.id === req.user.id && ('role' in b || 'active' in b)) return res.status(400).json({ error: 'You cannot change your own role or access.' });
  if ('role' in b) { if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'Invalid role.' }); u.role = b.role; }
  if ('active' in b) u.active = !!b.active;
  if ('password' in b) { if (String(b.password).length < 8) return res.status(400).json({ error: 'Password needs 8+ characters.' }); u.hash = bcrypt.hashSync(String(b.password), 10); }
  save(); log(req.user.username, `updated user ${u.username}`, req.ip); res.json(pub(u));
});

const backupNow = () => { const f = 'db-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'; fs.copyFileSync(DB, path.join(BK, f)); return f; };
const backups = () => fs.readdirSync(BK).filter(f => /^db-[\w.-]+\.json$/.test(f)).sort().reverse()
  .map(f => ({ file: f, size: fs.statSync(path.join(BK, f)).size }));
app.get('/api/backups', auth('superadmin'), (req, res) => res.json(backups()));
app.post('/api/backups', auth('superadmin'), (req, res) => { const f = backupNow(); log(req.user.username, 'backup ' + f, req.ip); res.status(201).json({ file: f }); });
app.post('/api/backups/restore', auth('superadmin'), (req, res) => {
  const f = String(req.body.file || '');
  if (!/^db-[\w.-]+\.json$/.test(f) || !fs.existsSync(path.join(BK, f))) return res.status(400).json({ error: 'Backup not found.' });
  backupNow(); fs.copyFileSync(path.join(BK, f), DB); db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  log(req.user.username, 'restored ' + f, req.ip); res.json({ ok: true });
});
app.get('/api/logs', auth('superadmin'), (req, res) => res.json(db.logs));
if (!isVercel) {
  setInterval(() => { backupNow(); backups().slice(14).forEach(b => fs.unlinkSync(path.join(BK, b.file))); }, 24 * 3600e3);
}

app.use('/api', (q, s) => s.status(404).json({ error: 'Not found' }));
app.use((err, q, s, n) => s.status(err.status && err.status < 500 ? err.status : 500).json({ error: 'Request failed.' }));
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => console.log(`Shop running at http://localhost:${PORT}`));
}
module.exports = app;
