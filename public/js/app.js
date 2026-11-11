'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const when = t => new Date(t).toLocaleString();

const CATS = ['Fish', 'Shrimps & Invertebrates', 'Aquatic Plants & Mosses', 'Substrates & Hardscape'];
const PLANT_SUBS = ['All', 'Foreground & Carpet Plants', 'Stem & Background Plants', 'Ferns & Mosses', 'Floating & Surface Plants'];

const EMOJI = {
  'Fish': '🐠',
  'Shrimps & Invertebrates': '🦐',
  'Aquatic Plants & Mosses': '🌿',
  'Substrates & Hardscape': '🪵',
  'Foreground & Carpet Plants': '🌱',
  'Stem & Background Plants': '🌿',
  'Ferns & Mosses': '🌾',
  'Floating & Surface Plants': '🪷',
  'Substrates': '🪨',
  'Hardscape': '🪵',
  'Snails': '🐌',
  'Shrimps': '🦐'
};

const ROLE = { superadmin: 'Super Admin', manager: 'Manager', support: 'Customer Support' };
const TABS = {
  superadmin: ['Stock', 'Orders', 'Inquiries', 'Products', 'Users', 'Backups', 'Security'],
  manager: ['Stock', 'Orders'],
  support: ['Inquiries', 'Stock']
};

let products = [], filter = 'All', subfilter = 'All', search = '', me = null, tab = '', toastT, lastOrder = null;
let cart = {}; try { cart = JSON.parse(localStorage.getItem('cart') || '{}'); } catch (e) {}
const saveCart = () => { try { localStorage.setItem('cart', JSON.stringify(cart)); } catch (e) {} };
const find = id => products.find(p => p.id == id);
const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
const total = () => Object.entries(cart).reduce((s, [id, q]) => s + (find(id) ? find(id).price * q : 0), 0);

async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}

async function loadProducts() {
  products = await api('/products');
  Object.keys(cart).forEach(id => { if (!find(id)) delete cart[id]; });
}

function toast(t) {
  clearTimeout(toastT); let e = $('.toast');
  if (!e) { e = document.createElement('div'); e.className = 'toast'; e.setAttribute('role', 'status'); document.body.appendChild(e); }
  e.textContent = t; toastT = setTimeout(() => e.remove(), 2600);
}

const stockLabel = p => p.stock == 0 ? 'Out of stock' : p.stock <= 5 ? `Only ${p.stock} left` : `${p.stock} in stock`;

function getFilteredProducts() {
  let list = products;
  if (filter !== 'All') {
    list = list.filter(p => p.category === filter);
  }
  if (filter === 'Aquatic Plants & Mosses' && subfilter !== 'All') {
    list = list.filter(p => p.subcategory === subfilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase().trim();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.subcategory && p.subcategory.toLowerCase().includes(q)) ||
      p.category.toLowerCase().includes(q)
    );
  }
  return list;
}

function renderCards(list) {
  if (!list.length) {
    return `<p class="muted" style="grid-column:1/-1;padding:24px 0">No products found matching your search or filter.</p>`;
  }
  return list.map(p => `
    <div class="card">
      <div class="art" aria-hidden="true">${EMOJI[p.subcategory] || EMOJI[p.category] || '🐟'}</div>
      <h3>${esc(p.name)}</h3>
      ${p.subcategory ? `<span class="tag" style="margin-bottom:6px">${esc(p.subcategory)}</span>` : ''}
      <p class="muted" style="margin:.2em 0 .6em">${esc(p.description || '')}</p>
      <div class="price">${money(p.price)}</div>
      <p style="margin:.3em 0 .8em" class="${p.stock <= 5 ? 'low' : 'muted'}">${stockLabel(p)}</p>
      <button class="btn sm" data-a="add" data-id="${p.id}" ${p.stock == 0 ? 'disabled' : ''}>Add to cart</button>
    </div>
  `).join('');
}

/* ---------- storefront pages ---------- */
const pages = {
  async home() {
    await loadProducts();
    return `<section class="hero"><div><h1>Everything for a living tank.</h1><p>Healthy aquatic plants, hand-picked fish, shrimps and natural substrates, packed fresh and sent to your door.</p><a class="btn" href="#shop">Shop now</a></div>
<div class="tank" aria-hidden="true"><svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><circle cx="90" cy="120" r="5" fill="#ffffff44"/><circle cx="300" cy="150" r="4" fill="#ffffff44"/>
<g class="fish"><ellipse cx="120" cy="110" rx="22" ry="11" fill="#ff8a4c"/><path d="M98 110l-16-10v20z" fill="#ff8a4c"/><circle cx="133" cy="107" r="2.5" fill="#0f3b34"/></g>
<g class="fish fish2"><ellipse cx="170" cy="170" rx="16" ry="8" fill="#7dd3c8"/><path d="M154 170l-12-7v14z" fill="#7dd3c8"/><circle cx="180" cy="168" r="2" fill="#0f3b34"/></g>
<path d="M60 250q-20-70 10-110q10 50 0 110zM90 250q10-90 40-100q-10 60-20 100zM320 250q-10-80 20-120q20 60-5 120z" fill="#5f8a2f"/>
<rect y="248" width="400" height="52" fill="#b9a98a"/><g fill="#8e7f64"><circle cx="30" cy="262" r="8"/><circle cx="200" cy="260" r="9"/><circle cx="360" cy="262" r="7"/></g></svg></div></section>
<div class="cats">${CATS.map(c => `<div class="card"><div class="art" style="height:60px;font-size:2rem;margin-bottom:8px" aria-hidden="true">${EMOJI[c] || '🐟'}</div><h3>${c}</h3><p class="muted">${products.filter(p => p.category == c).length} products available.</p><button class="btn alt sm" data-a="browse" data-v="${c}">Browse ${c.toLowerCase()}</button></div>`).join('')}</div>`;
  },
  async story() {
    return `<div class="narrow"><h1>Our story</h1><p>Green Bed Aquatics started with one 20-litre tank on a kitchen shelf. Every fish we lost taught us something, and we wanted to pass that on to the next hobbyist.</p><p>Today we grow our plants in-house, quarantine every fish and invertebrate before sale, and carefully prepare all hardscapes and soils before they ship.</p><p class="muted">Your living underwater world starts with healthy foundation stock.</p></div>`;
  },
  async shop() {
    await loadProducts();
    const list = getFilteredProducts();
    const subchipsHtml = filter === 'Aquatic Plants & Mosses'
      ? `<div class="subchips" role="group" aria-label="Filter plants by type">${PLANT_SUBS.map(s => `<button data-a="subfilter" data-v="${s}" aria-pressed="${subfilter == s}">${s === 'All' ? 'All Types' : s.replace(' Plants', '')}</button>`).join('')}</div>`
      : '';

    return `<h1>Shop</h1>
<div class="search-wrap">
  <input type="search" placeholder="Search by name, type, or variety..." value="${esc(search)}" data-i="search" aria-label="Search catalog">
</div>
<div class="chips" role="group" aria-label="Filter by category">${['All', ...CATS].map(c => `<button data-a="filter" data-v="${c}" aria-pressed="${filter == c}">${c}</button>`).join('')}</div>
${subchipsHtml}
<div class="grid" id="shop-grid">${renderCards(list)}</div>`;
  },
  async cart() {
    await loadProducts();
    const rows = Object.entries(cart).map(([id, q]) => {
      const p = find(id);
      if (!p) return '';
      return `<tr><td>${esc(p.name)}</td><td>${money(p.price)}</td><td><input type="number" min="1" max="${p.stock}" value="${q}" data-c="qty" data-id="${id}" aria-label="Quantity for ${esc(p.name)}"></td><td>${money(p.price * q)}</td><td><button class="btn alt sm" data-a="remove" data-id="${id}">Remove</button></td></tr>`;
    }).join('');
    if (!rows) return `<h1>Your cart</h1><p>Your cart is empty. <a href="#shop">Browse the shop</a> to add plants, fishes, shrimps or substrates.</p>`;
    return `<h1>Your cart</h1><div class="wrap"><table><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr>${rows}</table></div>
<p style="font-size:1.3rem"><strong>Total: ${money(total())}</strong></p>
<form class="narrow" data-f="order"><label for="cn">Your name</label><input id="cn" name="name" required maxlength="80"><label for="cp">Phone number</label><input id="cp" name="phone" type="tel" required maxlength="20"><label for="ca">Delivery address</label><textarea id="ca" name="address" rows="2" required maxlength="300"></textarea><p><button class="btn">Place order</button></p></form>`;
  },
  async confirmed() {
    if (!lastOrder) {
      return `<div class="narrow"><h1>Order Placed</h1><p>Your order has been received. Thank you for shopping with Green Bed Aquatics!</p><p><a class="btn" href="#shop">Back to Shop</a></p></div>`;
    }
    const o = lastOrder;
    return `<div class="narrow">
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <span style="font-size:2rem">🎉</span>
          <div>
            <h1 style="margin:0;font-size:1.8rem">Order Confirmed!</h1>
            <span class="muted">Order #${o.id} · ${when(o.date)}</span>
          </div>
        </div>
        <p>Thank you for your order, <strong>${esc(o.name)}</strong>!</p>
        <div style="margin:16px 0;padding:14px;background:var(--bg);border-radius:10px">
          <strong>Delivery Details:</strong>
          <p style="margin:4px 0 0">${esc(o.name)} (${esc(o.phone)})<br>${esc(o.address)}</p>
        </div>
        <div class="wrap" style="margin:16px 0">
          <table>
            <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
            ${o.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`).join('')}
          </table>
        </div>
        <p style="font-size:1.3rem;margin:16px 0 6px"><strong>Total: ${money(o.total)}</strong></p>
        <p class="muted" style="font-size:.9rem">Payment method: <strong>Cash / UPI on Delivery</strong>. Live fishes, shrimps and plants are packed in insulated temperature-regulated boxes with oxygen bags.</p>
        <p style="margin-top:20px"><a class="btn" href="#shop">Continue Shopping</a></p>
      </div>
    </div>`;
  },
  async contact() {
    return `<div class="two"><div><h1>Contact us</h1><p>Questions about stock, shipping or tank setup? Send a message and our support team will reply by email.</p></div>
<form data-f="contact"><label for="n">Name</label><input id="n" name="name" required maxlength="80"><label for="e">Email</label><input id="e" name="email" type="email" required maxlength="120"><label for="m">Message</label><textarea id="m" name="message" rows="4" required maxlength="1000"></textarea><p><button class="btn">Send message</button></p></form></div>`;
  },

  /* ---------- staff panel (the server enforces every permission) ---------- */
  async staff() {
    if (!me) return `<form class="narrow" data-f="login"><h1>Staff login</h1><label for="u">Username</label><input id="u" name="username" autocomplete="username" required><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required><p><button class="btn">Sign in</button></p></form>`;
    const tabs = TABS[me.role]; if (!tabs.includes(tab)) tab = tabs[0];
    let body; try { body = await views[tab](); } catch (e) { body = `<p class="low">${esc(e.message)}</p>`; }
    return `<div class="row"><h1 style="margin:0;font-size:2.2rem">${ROLE[me.role]}</h1><span class="muted">${esc(me.name)}</span><button class="btn alt sm" data-a="logout">Sign out</button></div>
<div class="tabs" role="group" aria-label="Staff tools">${tabs.map(t => `<button data-a="tab" data-v="${t}" aria-pressed="${t == tab}">${t}</button>`).join('')}</div>${body}`;
  }
};

const views = {
  async Stock() {
    await loadProducts();
    return `<h2>Stock update</h2>
<div class="search-wrap">
  <input type="search" placeholder="Search product to update stock..." data-i="stock-search" aria-label="Search stock items">
</div>
<div class="wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Subcategory</th><th>In stock</th></tr></thead><tbody id="stock-tbody">${products.map(p => `<tr data-name="${esc(p.name.toLowerCase())}" data-cat="${esc(p.category.toLowerCase())}"><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc(p.subcategory || '—')}</td><td><input type="number" min="0" value="${p.stock}" data-c="stock" data-id="${p.id}" aria-label="Stock for ${esc(p.name)}"></td></tr>`).join('')}</tbody></table></div>`;
  },
  async Orders() {
    const o = await api('/orders');
    return `<h2>Orders</h2>` + (o.length ? `<div class="wrap"><table><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr>${o.map(x => `<tr><td>#${x.id}<br><span class="muted">${when(x.date)}</span></td><td>${esc(x.name)}<br><span class="muted">${esc(x.phone)} · ${esc(x.address)}</span></td><td>${x.items.map(i => `${esc(i.name)} × ${i.qty}`).join('<br>')}</td><td>${money(x.total)}</td><td><select data-c="status" data-id="${x.id}" aria-label="Status for order ${x.id}">${['New', 'Packed', 'Shipped', 'Delivered'].map(s => `<option ${x.status == s ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table></div>` : '<p class="muted">No orders yet.</p>');
  },
  async Inquiries() {
    const q = await api('/inquiries');
    return `<h2>Customer inquiries</h2>` + (q.length ? q.map(x => `<div class="card" style="margin-bottom:10px"><strong>${esc(x.name)}</strong> <a href="mailto:${esc(x.email)}">${esc(x.email)}</a> <span class="tag">${x.done ? 'Resolved' : 'Open'}</span> <span class="muted">${when(x.date)}</span><p>${esc(x.message)}</p>${x.done ? '' : `<button class="btn sm" data-a="resolve" data-id="${x.id}">Mark resolved</button>`}</div>`).join('') : '<p class="muted">No inquiries yet.</p>');
  },
  async Products() {
    await loadProducts();
    return `<h2>Products (${products.length})</h2><form class="two" data-f="product"><div><label for="pn">Name</label><input id="pn" name="name" required maxlength="80"><label for="pc">Category</label><select id="pc" name="category">${CATS.map(c => `<option>${c}</option>`).join('')}</select><label for="psc">Subcategory</label><input id="psc" name="subcategory" maxlength="60" placeholder="e.g. Foreground & Carpet Plants"><label for="pd">Description</label><input id="pd" name="description" maxlength="200"></div><div><label for="pp">Price (₹)</label><input id="pp" name="price" type="number" min="1" step="any" required><label for="ps">Stock</label><input id="ps" name="stock" type="number" min="0" value="0" required><p><button class="btn">Add product</button></p></div></form>
<div class="search-wrap" style="margin-top:24px">
  <input type="search" placeholder="Filter product list..." data-i="prod-search" aria-label="Filter products">
</div>
<div class="wrap panel"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Action</th></tr></thead><tbody id="prod-tbody">${products.map(p => `<tr data-name="${esc(p.name.toLowerCase())}" data-cat="${esc(p.category.toLowerCase())}"><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td><button class="btn alt sm" data-a="delProduct" data-id="${p.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
  },
  async Users() {
    const u = await api('/users');
    return `<h2>User accounts</h2><div class="wrap"><table><tr><th>Name</th><th>Username</th><th>Role</th><th>Access</th><th></th></tr>${u.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.username)}</td><td><select data-c="role" data-id="${x.id}" aria-label="Role for ${esc(x.name)}" ${x.id == me.id ? 'disabled' : ''}>${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${x.role == k ? 'selected' : ''}>${v}</option>`).join('')}</select></td><td>${x.id == me.id ? '<span class="tag">You</span>' : `<button class="btn alt sm" data-a="toggle" data-id="${x.id}" data-v="${x.active ? 0 : 1}">${x.active ? 'Disable' : 'Enable'}</button>`}</td><td><button class="btn alt sm" data-a="reset" data-id="${x.id}">Reset password</button></td></tr>`).join('')}</table></div>
<h3 class="panel">Add a user</h3><form class="two" data-f="user"><div><label for="an">Name</label><input id="an" name="name" required maxlength="60"><label for="au">Username</label><input id="au" name="username" required pattern="[a-z0-9_]{3,20}" title="3–20 lowercase letters, numbers or _"></div><div><label for="ap">Password (8+ characters)</label><input id="ap" name="password" type="password" minlength="8" required><label for="ar">Role</label><select id="ar" name="role">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><p><button class="btn">Add user</button></p></div></form>`;
  },
  async Backups() {
    const b = await api('/backups');
    return `<h2>Backups</h2><p class="muted">A backup is made every 24 hours and kept for 14 days. Restoring first saves a backup of the current data.</p><p><button class="btn" data-a="backup">Back up now</button></p>
<div class="wrap"><table>${b.map(x => `<tr><td>${esc(x.file)}</td><td>${(x.size / 1024).toFixed(1)} KB</td><td><button class="btn alt sm" data-a="restore" data-f="${esc(x.file)}">Restore</button></td></tr>`).join('') || '<tr><td class="muted">No backups yet.</td></tr>'}</table></div>`;
  },
  async Security() {
    const l = await api('/logs');
    return `<h2>Security log</h2><p class="muted">Logins, failed attempts and staff changes. Five failed logins lock that device for 15 minutes.</p><div class="wrap"><table><tr><th>Time</th><th>User</th><th>Action</th><th>IP</th></tr>${l.slice(0, 100).map(x => `<tr><td>${when(x.t)}</td><td>${esc(x.user)}</td><td>${esc(x.action)}</td><td>${esc(x.ip || '')}</td></tr>`).join('')}</table></div>`;
  }
};

/* ---------- events (no inline handlers, so the strict CSP holds) ---------- */
const acts = {
  browse(b) { filter = b.dataset.v; subfilter = 'All'; search = ''; location.hash = '#shop'; },
  filter(b) { filter = b.dataset.v; subfilter = 'All'; return render(); },
  subfilter(b) { subfilter = b.dataset.v; return render(); },
  add(b) {
    const p = find(b.dataset.id);
    if (!p) return;
    if ((cart[p.id] || 0) >= p.stock) return toast('No more stock for ' + p.name);
    cart[p.id] = (cart[p.id] || 0) + 1;
    saveCart();
    nav();
    toast(p.name + ' added to cart');
  },
  remove(b) { delete cart[b.dataset.id]; saveCart(); return render(); },
  async logout() { await api('/logout', 'POST'); me = null; return render(); },
  tab(b) { tab = b.dataset.v; return render(); },
  async resolve(b) { await api('/inquiries/' + b.dataset.id, 'PATCH', { done: true }); return render(); },
  async delProduct(b) { if (confirm('Delete this product?')) { await api('/products/' + b.dataset.id, 'DELETE'); return render(); } },
  async toggle(b) { await api('/users/' + b.dataset.id, 'PATCH', { active: b.dataset.v == '1' }); return render(); },
  async reset(b) { const pw = prompt('New password (8+ characters)'); if (pw) { await api('/users/' + b.dataset.id, 'PATCH', { password: pw }); toast('Password reset'); } },
  async backup() { await api('/backups', 'POST'); toast('Backup created'); return render(); },
  async restore(b) { if (confirm('Restore this backup? Current data will be replaced.')) { await api('/backups/restore', 'POST', { file: b.dataset.f }); toast('Backup restored'); return render(); } }
};

const chg = {
  qty(el) { const p = find(el.dataset.id), v = Math.min(+el.value || 0, p ? p.stock : 0); v > 0 ? cart[p.id] = v : delete cart[p.id]; saveCart(); return render(); },
  async stock(el) { await api(`/products/${el.dataset.id}/stock`, 'PATCH', { stock: +el.value }); toast('Stock updated'); },
  async status(el) { await api('/orders/' + el.dataset.id, 'PATCH', { status: el.value }); toast('Order updated'); },
  async role(el) { await api('/users/' + el.dataset.id, 'PATCH', { role: el.value }); toast('Role updated'); }
};

const forms = {
  async login(d) { me = await api('/login', 'POST', d); return render(); },
  async order(d) {
    const res = await api('/orders', 'POST', { ...d, items: Object.entries(cart).map(([id, qty]) => ({ id: +id, qty })) });
    lastOrder = res;
    cart = {};
    saveCart();
    location.hash = '#confirmed';
    toast('Order #' + res.id + ' placed successfully!');
  },
  async contact(d, f) { await api('/inquiries', 'POST', d); f.reset(); toast('Message sent. We will reply by email.'); },
  async user(d) { await api('/users', 'POST', d); toast('User added'); return render(); },
  async product(d) { await api('/products', 'POST', { ...d, price: +d.price, stock: +d.stock }); toast('Product added'); return render(); }
};

const run = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); if (/sign in/i.test(e.message) && me) { me = null; render(); } } };

document.addEventListener('click', run(async e => {
  const b = e.target.closest('[data-a]');
  if (b) await acts[b.dataset.a](b);
}));

document.addEventListener('change', run(async e => {
  const c = e.target.dataset.c;
  if (c) await chg[c](e.target);
}));

document.addEventListener('input', e => {
  if (e.target.dataset.i === 'search') {
    search = e.target.value;
    const grid = $('#shop-grid');
    if (grid) {
      grid.innerHTML = renderCards(getFilteredProducts());
    }
  } else if (e.target.dataset.i === 'stock-search') {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#stock-tbody tr').forEach(tr => {
      tr.style.display = (!q || tr.dataset.name.includes(q) || tr.dataset.cat.includes(q)) ? '' : 'none';
    });
  } else if (e.target.dataset.i === 'prod-search') {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#prod-tbody tr').forEach(tr => {
      tr.style.display = (!q || tr.dataset.name.includes(q) || tr.dataset.cat.includes(q)) ? '' : 'none';
    });
  }
});

document.addEventListener('submit', run(async e => {
  e.preventDefault();
  await forms[e.target.dataset.f](Object.fromEntries(new FormData(e.target)), e.target);
}));

function nav() {
  const hash = location.hash.slice(1).split('?')[0];
  const r = pages[hash] ? hash : 'home';
  const names = { home: 'Home', story: 'Our Story', shop: 'Shop', cart: 'Cart', contact: 'Contact Us' };
  $('#nav').innerHTML = Object.entries(names).map(([k, v]) => `<a href="#${k}" ${k == r ? 'aria-current="page"' : ''}>${v}${k == 'cart' && count() ? ` (${count()})` : ''}</a>`).join('');
  return r;
}

async function render() {
  const r = nav();
  try {
    $('#app').innerHTML = await pages[r]();
  } catch (e) {
    $('#app').innerHTML = `<p class="low">${esc(e.message)}</p>`;
  }
}

addEventListener('hashchange', () => render().then(() => scrollTo(0, 0)));
(async () => {
  try { await loadProducts(); } catch (e) {}
  try { me = await api('/me'); } catch (e) {}
  render();
})();
