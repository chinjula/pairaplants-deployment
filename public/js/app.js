'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const when = t => new Date(t).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const CATS = ['Aquatic Plants & Mosses', 'Fish', 'Shrimps & Invertebrates', 'Substrates & Hardscape'];
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
  if (!e) {
    e = document.createElement('div');
    e.className = 'toast';
    e.setAttribute('role', 'status');
    document.body.appendChild(e);
  }
  e.innerHTML = `<span style="font-size:1.1rem">🌿</span> <span>${esc(t)}</span>`;
  toastT = setTimeout(() => e.remove(), 2800);
}

const stockLabel = p => {
  if (p.stock === 0) return `<span class="stock-indicator low-stock">Out of stock</span>`;
  if (p.stock <= 5) return `<span class="stock-indicator low-stock">Only ${p.stock} left</span>`;
  return `<span class="stock-indicator in-stock">${p.stock} in stock</span>`;
};

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

function renderProductCards(list) {
  if (!list.length) {
    return `<div style="grid-column:1/-1;text-align:center;padding:50px 20px;background:var(--canvas-alt);border-radius:var(--radius-card);border:1px dashed var(--line)">
      <p style="font-size:2rem;margin-bottom:8px">🔍</p>
      <h3 style="margin-bottom:6px">No botanical items match your query</h3>
      <p class="muted">Try adjusting your search terms or selecting another category.</p>
    </div>`;
  }
  return list.map(p => `
    <article class="product-card">
      <div class="product-art" aria-hidden="true">${EMOJI[p.subcategory] || EMOJI[p.category] || '🌿'}</div>
      ${p.subcategory ? `<span class="tag-subcat">${esc(p.subcategory)}</span>` : `<span class="tag-subcat">${esc(p.category)}</span>`}
      <h3>${esc(p.name)}</h3>
      <p class="product-desc">${esc(p.description || '')}</p>
      <div class="product-footer">
        <div>
          <div class="product-price">${money(p.price)}</div>
          ${stockLabel(p)}
        </div>
        <button class="btn-pill sm" data-a="add" data-id="${p.id}" ${p.stock == 0 ? 'disabled' : ''}>
          ${p.stock == 0 ? 'Sold Out' : 'Add to Bag'}
        </button>
      </div>
    </article>
  `).join('');
}

/* ---------- Storefront Pages ---------- */
const pages = {
  async home() {
    await loadProducts();
    const featuredCats = [
      { name: 'Aquatic Plants & Mosses', icon: '🌿', count: products.filter(p => p.category === 'Aquatic Plants & Mosses').length, note: 'Tissue cultures, carpet stems & floaters' },
      { name: 'Fish', icon: '🐠', count: products.filter(p => p.category === 'Fish').length, note: 'Quarantined schooling & peaceful grazers' },
      { name: 'Shrimps & Invertebrates', icon: '🦐', count: products.filter(p => p.category === 'Shrimps & Invertebrates').length, note: 'Living cleaners & pure color morphs' },
      { name: 'Substrates & Hardscape', icon: '🪵', count: products.filter(p => p.category === 'Substrates & Hardscape').length, note: 'Active clay soils & cured driftwood' }
    ];

    return `
      <section class="hero-luxury">
        <div class="hero-content">
          <span class="kicker">CURATED BOTANICAL STUDIO</span>
          <h1>Luxury<br><span style="font-style:italic">Aquatics &amp; Plants</span></h1>
          <p class="subheading">Healthy nursery-cultivated aquatic flora, certified quarantined freshwater fishes, vibrant dwarf shrimps and active substrates designed for living natural aquascapes.</p>
          <div class="cta-group">
            <a class="btn-pill" href="#shop">Explore Collection &rarr;</a>
            <a class="btn-pill outline" href="#story">Our Philosophy</a>
          </div>
        </div>

        <div class="hero-visual">
          <div class="hero-plant-frame">
            <svg viewBox="0 0 400 450" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="200" cy="380" rx="90" ry="24" fill="#0c1813" opacity="0.2"/>
              <!-- Ceramic Plant Pot -->
              <path d="M140 330L150 400C152 410 160 418 170 418H230C240 418 248 410 250 400L260 330H140Z" fill="#2d3a33"/>
              <ellipse cx="200" cy="330" rx="60" ry="12" fill="#1e2823"/>
              <!-- Elegant Stem & Botanical Leaves -->
              <path d="M200 330Q205 240 195 140" stroke="#3d664c" stroke-width="6" stroke-linecap="round"/>
              <g class="leaf-anim">
                <path d="M195 280Q130 250 110 220Q145 200 195 250Z" fill="#325a42"/>
                <path d="M200 240Q270 210 285 180Q250 160 200 210Z" fill="#447556"/>
                <path d="M196 190Q110 160 95 120Q140 110 196 160Z" fill="#3a6b4d"/>
                <path d="M198 150Q280 120 290 80Q240 80 198 130Z" fill="#4f8564"/>
                <path d="M195 140Q195 70 200 40Q205 70 195 140Z" fill="#5c9a74"/>
              </g>
            </svg>
          </div>

          <div class="float-card top-right">
            <h4>Certified Quality</h4>
            <p>100% Snail-free tissue culture &amp; healthy quarantined stock.</p>
            <div class="stars">★★★★★ 4.9/5 (180+ Reviews)</div>
          </div>

          <div class="float-card bottom-left">
            <span style="font-size:1.8rem">🌿</span>
            <div>
              <h4>Fresh Harvest</h4>
              <p>Dispatched in insulated oxygen packs.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Overview / Collections Row (matching reference image) -->
      <section class="overview-section">
        <div class="section-head">
          <div>
            <span class="kicker">ECOSYSTEM TIERS</span>
            <h2>Curated Collections</h2>
          </div>
          <a class="btn-pill outline sm" href="#shop">View All ${products.length} Products &rarr;</a>
        </div>

        <div class="overview-grid">
          ${featuredCats.map(c => `
            <div class="overview-card" data-a="browse" data-v="${c.name}">
              <div class="card-thumb" aria-hidden="true">${c.icon}</div>
              <h3>${c.name}</h3>
              <div class="count-label">${c.count} items available</div>
              <p style="font-size:0.8rem;color:var(--ink-secondary);margin-bottom:16px">${c.note}</p>
              <button class="btn-pill outline sm" data-a="browse" data-v="${c.name}">Browse ${c.name.split(' ')[0]}</button>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Values / Assurance Banner -->
      <section class="values-banner">
        <div class="value-item">
          <div class="value-icon">🚚</div>
          <div>
            <h4>Live-Arrival Guarantee</h4>
            <p>Every shipment is protected in thermal insulation with breathable oxygen-infused transport packs.</p>
          </div>
        </div>
        <div class="value-item">
          <div class="value-icon">🛡️</div>
          <div>
            <h4>14-Day Quarantined Stock</h4>
            <p>Every single fish and invertebrate undergoes rigorous conditioning and health observation before dispatch.</p>
          </div>
        </div>
        <div class="value-item">
          <div class="value-icon">✨</div>
          <div>
            <h4>Pest &amp; Snail-Free Plants</h4>
            <p>Tissue cultures and submersed flora are meticulously washed and inspected to protect your aquarium's balance.</p>
          </div>
        </div>
      </section>
    `;
  },

  async story() {
    return `
      <div class="narrow-box" style="padding:40px 0">
        <span class="kicker">OUR CRAFT &amp; PASSION</span>
        <h1>Born from a Passion for Living Underwater Art.</h1>
        <p class="subheading" style="margin:20px 0 30px">Green Bed Aquatics began with a simple belief: an aquarium shouldn't just be glass and water—it should be a thriving, self-sustaining living ecosystem.</p>
        
        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:28px;margin-bottom:28px">
          <h3 style="margin-bottom:10px">The Living Standard</h3>
          <p style="color:var(--ink-secondary);line-height:1.7">We cultivate our aquatic plants in balanced in-house nurseries, propagate delicate mosses on natural cured materials, and quarantine all freshwater fauna for a full 14 days before offering them to hobbyists. When you order from Green Bed, you receive plants with robust root systems and fish that acclimatize effortlessly to your tank.</p>
        </div>

        <div class="two-col" style="margin-top:20px">
          <div style="padding:20px;background:var(--canvas-alt);border-radius:14px;border:1px solid var(--line-subtle)">
            <h4 style="color:var(--forest-primary);font-size:1.05rem;margin-bottom:6px">In-House Propagation</h4>
            <p style="font-size:0.85rem;color:var(--ink-secondary)">Our stem plants, carpets, and floating varieties are conditioned under full-spectrum lights and nutrient-rich waters.</p>
          </div>
          <div style="padding:20px;background:var(--canvas-alt);border-radius:14px;border:1px solid var(--line-subtle)">
            <h4 style="color:var(--forest-primary);font-size:1.05rem;margin-bottom:6px">Thermal Packaging</h4>
            <p style="font-size:0.85rem;color:var(--ink-secondary)">Custom insulated boxes and temperature packs safeguard livestock from extreme weather throughout delivery.</p>
          </div>
        </div>

        <p style="margin-top:36px;text-align:center"><a class="btn-pill" href="#shop">Explore our Live Catalog &rarr;</a></p>
      </div>
    `;
  },

  async shop() {
    await loadProducts();
    const list = getFilteredProducts();
    const subchipsHtml = filter === 'Aquatic Plants & Mosses'
      ? `<div class="subchips" role="group" aria-label="Filter plants by type">${PLANT_SUBS.map(s => `<button data-a="subfilter" data-v="${s}" aria-pressed="${subfilter == s}">${s === 'All' ? 'All Plant Types' : s.replace(' Plants', '')}</button>`).join('')}</div>`
      : '';

    return `
      <div class="shop-filter-bar">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;flex-wrap:wrap;gap:12px">
          <div>
            <span class="kicker">LIVE CATALOG</span>
            <h1>The Botanical Shop</h1>
            <p class="muted">Showing ${list.length} of ${products.length} living items in catalog</p>
          </div>
          <div class="search-wrap" style="margin-bottom:0">
            <span class="search-icon">🔍</span>
            <input type="search" placeholder="Search by name, variety, or type..." value="${esc(search)}" data-i="search" aria-label="Search catalog">
          </div>
        </div>

        <div class="chips" role="group" aria-label="Filter by category">
          ${['All', ...CATS].map(c => `<button data-a="filter" data-v="${c}" aria-pressed="${filter == c}">${c === 'All' ? 'All Collections' : c}</button>`).join('')}
        </div>
        ${subchipsHtml}
      </div>

      <div class="product-grid" id="shop-grid">
        ${renderProductCards(list)}
      </div>
    `;
  },

  async cart() {
    await loadProducts();
    const rows = Object.entries(cart).map(([id, q]) => {
      const p = find(id);
      if (!p) return '';
      return `
        <tr>
          <td>
            <strong>${esc(p.name)}</strong>
            <div style="font-size:0.75rem;color:var(--ink-muted)">${esc(p.category)}</div>
          </td>
          <td>${money(p.price)}</td>
          <td>
            <input type="number" min="1" max="${p.stock}" value="${q}" data-c="qty" data-id="${id}" aria-label="Quantity for ${esc(p.name)}">
          </td>
          <td style="font-weight:600">${money(p.price * q)}</td>
          <td>
            <button class="btn-pill outline sm" data-a="remove" data-id="${id}">Remove</button>
          </td>
        </tr>
      `;
    }).join('');

    if (!rows) {
      return `
        <div class="narrow-box" style="text-align:center;padding:60px 20px">
          <span style="font-size:3rem">🛒</span>
          <h2 style="margin:16px 0 8px">Your cart is currently empty</h2>
          <p class="muted" style="margin-bottom:24px">Explore our curated collection of aquatic plants, fishes, and dwarf shrimps to get started.</p>
          <a class="btn-pill" href="#shop">Browse Collection</a>
        </div>
      `;
    }

    return `
      <div class="two-col" style="align-items:start">
        <div>
          <span class="kicker">ORDER REVIEW</span>
          <h2>Your Cart (${count()} items)</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--surface-card);border-radius:var(--radius-sm)">
            <span style="font-size:1.1rem;font-weight:600">Subtotal:</span>
            <span style="font-family:var(--font-serif);font-size:1.5rem;font-weight:700;color:var(--forest-primary)">${money(total())}</span>
          </div>
          <p class="muted" style="font-size:0.8rem;margin-top:10px">Shipping charges and live-arrival thermal pack are complimentary on this order.</p>
        </div>

        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:30px">
          <span class="kicker">CHECKOUT DETAILS</span>
          <h3>Delivery Information</h3>
          <p class="muted" style="font-size:0.85rem;margin-bottom:18px">Please provide accurate contact details for dispatch confirmation.</p>
          
          <form data-f="order">
            <label for="cn">Full Name</label>
            <input id="cn" name="name" required maxlength="80" placeholder="e.g. Rahul Sharma">
            
            <label for="cp">Phone Number (WhatsApp verified)</label>
            <input id="cp" name="phone" type="tel" required maxlength="20" placeholder="e.g. +91 98765 43210">
            
            <label for="ca">Shipping Address</label>
            <textarea id="ca" name="address" rows="3" required maxlength="300" placeholder="House number, Street, Landmark, City, PIN Code"></textarea>
            
            <div style="margin:20px 0;padding:14px;background:var(--canvas);border-radius:var(--radius-sm);border:1px solid var(--line)">
              <div style="font-weight:600;font-size:0.85rem;margin-bottom:4px">Payment Method:</div>
              <div style="font-size:0.8rem;color:var(--ink-secondary)">💵 <strong>Cash / UPI on Delivery</strong>. Verify your items upon arrival.</div>
            </div>

            <button class="btn-pill" style="width:100%;padding:14px;font-size:1rem">Confirm Order · ${money(total())}</button>
          </form>
        </div>
      </div>
    `;
  },

  async confirmed() {
    if (!lastOrder) {
      return `
        <div class="narrow-box" style="text-align:center;padding:50px 20px">
          <h2>Order Received</h2>
          <p class="muted">Your order is being processed by our team.</p>
          <a class="btn-pill" style="margin-top:20px" href="#shop">Return to Shop</a>
        </div>
      `;
    }
    const o = lastOrder;
    return `
      <div class="narrow-box">
        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:36px;box-shadow:var(--shadow-card)">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
            <span style="font-size:2.5rem">🎉</span>
            <div>
              <span class="kicker" style="margin-bottom:4px">ORDER CONFIRMED</span>
              <h1 style="font-size:2rem;margin:0">Thank You, ${esc(o.name)}!</h1>
              <div class="muted" style="font-size:0.85rem">Order #${o.id} · Placed on ${when(o.date)}</div>
            </div>
          </div>

          <div style="background:var(--canvas);border:1px solid var(--line);border-radius:var(--radius-sm);padding:18px;margin:20px 0">
            <div style="font-weight:700;color:var(--forest-primary);margin-bottom:6px">Delivery Address:</div>
            <p style="font-size:0.9rem;color:var(--ink-secondary);line-height:1.5">${esc(o.name)} (${esc(o.phone)})<br>${esc(o.address)}</p>
          </div>

          <div class="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
              <tbody>
                ${o.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td style="font-weight:600">${money(i.price * i.qty)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
            <span style="font-weight:600">Total Payable:</span>
            <span style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;color:var(--forest-primary)">${money(o.total)}</span>
          </div>

          <div style="font-size:0.82rem;color:var(--ink-secondary);line-height:1.5;margin-bottom:24px">
            📦 <strong>Care Dispatch Protocol</strong>: Our specialists are packing your live plants and fauna in thermal temperature-regulated boxes with oxygen-filled sealed bladders. You will receive an SMS/WhatsApp dispatch notification once handed to the courier.
          </div>

          <div style="text-align:center">
            <a class="btn-pill" href="#shop">Continue Exploring Botanicals &rarr;</a>
          </div>
        </div>
      </div>
    `;
  },

  async contact() {
    return `
      <div class="two-col" style="align-items:start">
        <div>
          <span class="kicker">CONNECT WITH US</span>
          <h1>Care Consultations &amp; Inquiries</h1>
          <p class="subheading" style="margin:16px 0 28px">Need advice on plant fertilizers, fish compatibility, or tank lighting? Our aquatic specialists are here to guide your setup.</p>
          
          <div style="display:flex;flex-direction:column;gap:16px">
            <div style="display:flex;align-items:center;gap:14px">
              <span style="font-size:1.4rem">📍</span>
              <div>
                <strong>Nursery &amp; Showroom</strong>
                <p class="muted" style="font-size:0.85rem">Green Bed Botanicals Aquatics Studio</p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:14px">
              <span style="font-size:1.4rem">✉️</span>
              <div>
                <strong>Email Consultation</strong>
                <p class="muted" style="font-size:0.85rem">care@greenbedaquatics.com</p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:14px">
              <span style="font-size:1.4rem">⏱️</span>
              <div>
                <strong>Response Window</strong>
                <p class="muted" style="font-size:0.85rem">Within 2 to 4 business hours</p>
              </div>
            </div>
          </div>
        </div>

        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:32px">
          <h3 style="margin-bottom:6px">Send an Inquiry</h3>
          <p class="muted" style="font-size:0.85rem;margin-bottom:18px">Fill in your question below and our team will respond by email.</p>
          <form data-f="contact">
            <label for="n">Your Name</label>
            <input id="n" name="name" required maxlength="80" placeholder="Your name">
            
            <label for="e">Email Address</label>
            <input id="e" name="email" type="email" required maxlength="120" placeholder="name@example.com">
            
            <label for="m">Your Message or Tank Setup Question</label>
            <textarea id="m" name="message" rows="4" required maxlength="1000" placeholder="Tell us about your aquarium size, lighting, or specific product inquiries..."></textarea>
            
            <button class="btn-pill" style="margin-top:20px;width:100%">Submit Consultation Message</button>
          </form>
        </div>
      </div>
    `;
  },

  /* ---------- Staff Panel ---------- */
  async staff() {
    if (!me) {
      return `
        <div class="narrow-box" style="padding:40px 0">
          <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:36px;box-shadow:var(--shadow-card)">
            <span class="kicker">INTERNAL PORTAL</span>
            <h2>Staff Sign In</h2>
            <p class="muted" style="margin-bottom:20px">Access stock controls, order dispatches, inquiries and system settings.</p>
            <form data-f="login">
              <label for="u">Username</label>
              <input id="u" name="username" autocomplete="username" required placeholder="owner / manager / support">
              <label for="pw">Password</label>
              <input id="pw" name="password" type="password" autocomplete="current-password" required placeholder="Enter password">
              <button class="btn-pill" style="width:100%;margin-top:20px;padding:12px">Sign In to Dashboard</button>
            </form>
          </div>
        </div>
      `;
    }
    const tabs = TABS[me.role];
    if (!tabs.includes(tab)) tab = tabs[0];
    let body;
    try {
      body = await views[tab]();
    } catch (e) {
      body = `<p style="color:var(--terracotta)">${esc(e.message)}</p>`;
    }

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <span class="kicker">${ROLE[me.role].toUpperCase()} DASHBOARD</span>
          <h1 style="font-size:2rem;margin:0">${ROLE[me.role]}</h1>
          <span class="muted">Signed in as <strong>${esc(me.name)}</strong> (${esc(me.username)})</span>
        </div>
        <button class="btn-pill outline sm" data-a="logout">Sign Out</button>
      </div>

      <div class="tabs" role="group" aria-label="Staff tools">
        ${tabs.map(t => `<button data-a="tab" data-v="${t}" aria-pressed="${t == tab}">${t}</button>`).join('')}
      </div>

      <div style="margin-top:24px">${body}</div>
    `;
  }
};

const views = {
  async Stock() {
    await loadProducts();
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:12px">
        <h2>Live Inventory (${products.length} Products)</h2>
        <div class="search-wrap" style="margin-bottom:0;max-width:320px">
          <span class="search-icon">🔍</span>
          <input type="search" placeholder="Filter stock..." data-i="stock-search" aria-label="Search stock items">
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Product</th><th>Category</th><th>Subcategory</th><th>Units in Stock</th></tr>
          </thead>
          <tbody id="stock-tbody">
            ${products.map(p => `
              <tr data-name="${esc(p.name.toLowerCase())}" data-cat="${esc(p.category.toLowerCase())}">
                <td><strong>${esc(p.name)}</strong></td>
                <td>${esc(p.category)}</td>
                <td>${esc(p.subcategory || '—')}</td>
                <td><input type="number" min="0" value="${p.stock}" data-c="stock" data-id="${p.id}" aria-label="Stock for ${esc(p.name)}"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async Orders() {
    const o = await api('/orders');
    return `
      <h2>Order Fulfillment</h2>
      ${o.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${o.map(x => `
                <tr>
                  <td><strong>#${x.id}</strong><br><span class="muted">${when(x.date)}</span></td>
                  <td><strong>${esc(x.name)}</strong><br><span class="muted">${esc(x.phone)} · ${esc(x.address)}</span></td>
                  <td>${x.items.map(i => `${esc(i.name)} × ${i.qty}`).join('<br>')}</td>
                  <td style="font-weight:700">${money(x.total)}</td>
                  <td>
                    <select data-c="status" data-id="${x.id}" aria-label="Status for order ${x.id}">
                      ${['New', 'Packed', 'Shipped', 'Delivered'].map(s => `<option ${x.status == s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="muted">No customer orders placed yet.</p>'}
    `;
  },

  async Inquiries() {
    const q = await api('/inquiries');
    return `
      <h2>Customer Consultations (${q.length})</h2>
      ${q.length ? q.map(x => `
        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-sm);padding:18px;margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div>
              <strong>${esc(x.name)}</strong> &nbsp;·&nbsp;
              <a href="mailto:${esc(x.email)}" style="color:var(--moss)">${esc(x.email)}</a>
              <span class="badge" style="margin-left:8px">${x.done ? 'Resolved' : 'Open'}</span>
            </div>
            <span class="muted" style="font-size:0.8rem">${when(x.date)}</span>
          </div>
          <p style="color:var(--ink-secondary);margin:8px 0 12px;font-size:0.9rem">${esc(x.message)}</p>
          ${x.done ? '' : `<button class="btn-pill outline sm" data-a="resolve" data-id="${x.id}">Mark Resolved</button>`}
        </div>
      `).join('') : '<p class="muted">No consultation inquiries received yet.</p>'}
    `;
  },

  async Products() {
    await loadProducts();
    return `
      <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:24px;margin-bottom:28px">
        <h3 style="margin-bottom:12px">Add New Product</h3>
        <form class="two-col" data-f="product">
          <div>
            <label for="pn">Product Name</label>
            <input id="pn" name="name" required maxlength="80" placeholder="e.g. Rare Bucephalandra">
            <label for="pc">Category</label>
            <select id="pc" name="category">${CATS.map(c => `<option>${c}</option>`).join('')}</select>
            <label for="psc">Subcategory (Optional)</label>
            <input id="psc" name="subcategory" maxlength="60" placeholder="e.g. Foreground & Carpet Plants">
            <label for="pd">Description</label>
            <input id="pd" name="description" maxlength="200" placeholder="Brief care tips or specifications">
          </div>
          <div>
            <label for="pp">Price (₹)</label>
            <input id="pp" name="price" type="number" min="1" step="any" required placeholder="e.g. 250">
            <label for="ps">Stock Units</label>
            <input id="ps" name="stock" type="number" min="0" value="0" required>
            <div style="margin-top:24px">
              <button class="btn-pill" style="width:100%">Add Product to Catalog</button>
            </div>
          </div>
        </form>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:12px">
        <h3>Catalog Directory (${products.length} Items)</h3>
        <div class="search-wrap" style="margin-bottom:0;max-width:320px">
          <span class="search-icon">🔍</span>
          <input type="search" placeholder="Filter directory..." data-i="prod-search" aria-label="Filter products">
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Action</th></tr>
          </thead>
          <tbody id="prod-tbody">
            ${products.map(p => `
              <tr data-name="${esc(p.name.toLowerCase())}" data-cat="${esc(p.category.toLowerCase())}">
                <td><strong>${esc(p.name)}</strong></td>
                <td>${esc(p.category)}</td>
                <td style="font-weight:600">${money(p.price)}</td>
                <td>${p.stock}</td>
                <td><button class="btn-pill outline sm" data-a="delProduct" data-id="${p.id}">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async Users() {
    const u = await api('/users');
    return `
      <h2>Staff Accounts &amp; Permissions</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Access Status</th><th>Action</th></tr></thead>
          <tbody>
            ${u.map(x => `
              <tr>
                <td><strong>${esc(x.name)}</strong></td>
                <td>${esc(x.username)}</td>
                <td>
                  <select data-c="role" data-id="${x.id}" aria-label="Role for ${esc(x.name)}" ${x.id == me.id ? 'disabled' : ''}>
                    ${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${x.role == k ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </td>
                <td>${x.id == me.id ? '<span class="badge">You</span>' : `<button class="btn-pill outline sm" data-a="toggle" data-id="${x.id}" data-v="${x.active ? 0 : 1}">${x.active ? 'Disable' : 'Enable'}</button>`}</td>
                <td><button class="btn-pill outline sm" data-a="reset" data-id="${x.id}">Reset Password</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:24px;margin-top:24px">
        <h3 style="margin-bottom:12px">Create New Staff User</h3>
        <form class="two-col" data-f="user">
          <div>
            <label for="an">Full Name</label>
            <input id="an" name="name" required maxlength="60" placeholder="e.g. Ananya Patel">
            <label for="au">Username</label>
            <input id="au" name="username" required pattern="[a-z0-9_]{3,20}" title="3–20 lowercase letters, numbers or _" placeholder="e.g. ananya">
          </div>
          <div>
            <label for="ap">Password (8+ characters)</label>
            <input id="ap" name="password" type="password" minlength="8" required placeholder="Minimum 8 characters">
            <label for="ar">Staff Role</label>
            <select id="ar" name="role">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
            <button class="btn-pill" style="margin-top:22px;width:100%">Create Account</button>
          </div>
        </form>
      </div>
    `;
  },

  async Backups() {
    const b = await api('/backups');
    return `
      <h2>Database Backups</h2>
      <p class="muted" style="margin-bottom:16px">Automatic snapshots are created daily and stored securely. Restoring immediately backs up current state.</p>
      <p><button class="btn-pill" data-a="backup">Create Snapshot Now</button></p>
      <div class="table-wrap" style="margin-top:20px">
        <table>
          <thead><tr><th>Backup File</th><th>Size</th><th>Action</th></tr></thead>
          <tbody>
            ${b.map(x => `
              <tr>
                <td><strong>${esc(x.file)}</strong></td>
                <td>${(x.size / 1024).toFixed(1)} KB</td>
                <td><button class="btn-pill outline sm" data-a="restore" data-f="${esc(x.file)}">Restore This Backup</button></td>
              </tr>
            `).join('') || '<tr><td colspan="3" class="muted">No backup archives found yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  async Security() {
    const l = await api('/logs');
    return `
      <h2>Audit &amp; Security Log</h2>
      <p class="muted" style="margin-bottom:16px">Monitors administrative actions, password resets, stock changes and sign-in attempts.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Action Performed</th><th>Client IP</th></tr></thead>
          <tbody>
            ${l.slice(0, 100).map(x => `
              <tr>
                <td>${when(x.t)}</td>
                <td><strong>${esc(x.user)}</strong></td>
                <td>${esc(x.action)}</td>
                <td class="muted">${esc(x.ip || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
};

/* ---------- Event Delegation (Strict CSP Compliant) ---------- */
const acts = {
  browse(b) { filter = b.dataset.v; subfilter = 'All'; search = ''; location.hash = '#shop'; },
  filter(b) { filter = b.dataset.v; subfilter = 'All'; return render(); },
  subfilter(b) { subfilter = b.dataset.v; return render(); },
  add(b) {
    const p = find(b.dataset.id);
    if (!p) return;
    if ((cart[p.id] || 0) >= p.stock) return toast('All ' + p.stock + ' units of ' + p.name + ' are currently in your cart');
    cart[p.id] = (cart[p.id] || 0) + 1;
    saveCart();
    nav();
    toast(p.name + ' added to bag');
  },
  remove(b) { delete cart[b.dataset.id]; saveCart(); return render(); },
  async logout() { await api('/logout', 'POST'); me = null; return render(); },
  tab(b) { tab = b.dataset.v; return render(); },
  async resolve(b) { await api('/inquiries/' + b.dataset.id, 'PATCH', { done: true }); toast('Inquiry marked resolved'); return render(); },
  async delProduct(b) { if (confirm('Are you sure you want to delete this product from the catalog?')) { await api('/products/' + b.dataset.id, 'DELETE'); toast('Product deleted'); return render(); } },
  async toggle(b) { await api('/users/' + b.dataset.id, 'PATCH', { active: b.dataset.v == '1' }); toast('User status updated'); return render(); },
  async reset(b) { const pw = prompt('Enter new password (8+ characters):'); if (pw) { await api('/users/' + b.dataset.id, 'PATCH', { password: pw }); toast('Password reset successfully'); } },
  async backup() { await api('/backups', 'POST'); toast('Backup snapshot created successfully'); return render(); },
  async restore(b) { if (confirm('Restore database from this snapshot? Current unsaved changes will be replaced.')) { await api('/backups/restore', 'POST', { file: b.dataset.f }); toast('Database restored successfully'); return render(); } }
};

const chg = {
  qty(el) { const p = find(el.dataset.id), v = Math.min(+el.value || 0, p ? p.stock : 0); v > 0 ? cart[p.id] = v : delete cart[p.id]; saveCart(); return render(); },
  async stock(el) { await api(`/products/${el.dataset.id}/stock`, 'PATCH', { stock: +el.value }); toast('Stock updated'); },
  async status(el) { await api('/orders/' + el.dataset.id, 'PATCH', { status: el.value }); toast('Order status updated'); },
  async role(el) { await api('/users/' + el.dataset.id, 'PATCH', { role: el.value }); toast('User role updated'); }
};

const forms = {
  async login(d) { me = await api('/login', 'POST', d); toast('Signed in successfully'); return render(); },
  async order(d) {
    const res = await api('/orders', 'POST', { ...d, items: Object.entries(cart).map(([id, qty]) => ({ id: +id, qty })) });
    lastOrder = res;
    cart = {};
    saveCart();
    nav();
    location.hash = '#confirmed';
    toast('Order placed successfully!');
  },
  async contact(d, f) { await api('/inquiries', 'POST', d); f.reset(); toast('Consultation inquiry received! We will email you shortly.'); },
  async user(d) { await api('/users', 'POST', d); toast('New staff user created'); return render(); },
  async product(d) { await api('/products', 'POST', { ...d, price: +d.price, stock: +d.stock }); toast('Product added to catalog'); return render(); }
};

const run = fn => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    toast(e.message);
    if (/sign in/i.test(e.message) && me) {
      me = null;
      render();
    }
  }
};

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
      grid.innerHTML = renderProductCards(getFilteredProducts());
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
  const names = { home: 'Home', shop: 'Shop', story: 'Our Philosophy', cart: 'Cart', contact: 'Contact' };
  
  $('#nav').innerHTML = Object.entries(names).map(([k, v]) => `
    <a href="#${k}" ${k == r ? 'aria-current="page"' : ''}>
      ${v}${k == 'cart' && count() ? `<span class="cart-badge">${count()}</span>` : ''}
    </a>
  `).join('');
  return r;
}

async function render() {
  const r = nav();
  try {
    $('#app').innerHTML = await pages[r]();
  } catch (e) {
    $('#app').innerHTML = `<p style="color:var(--terracotta);padding:40px 0">${esc(e.message)}</p>`;
  }
}

addEventListener('hashchange', () => render().then(() => scrollTo(0, 0)));
(async () => {
  try { await loadProducts(); } catch (e) {}
  try { me = await api('/me'); } catch (e) {}
  render();
})();
