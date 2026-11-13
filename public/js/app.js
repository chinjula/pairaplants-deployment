'use strict';

/* ==============================================================================
   PAIRAPLANTS ENTERPRISE STOREFRONT & ADVANCED ADMIN DASHBOARD
   ============================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const when = t => new Date(t).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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

const ROLE_NAMES = { superadmin: 'Super Admin', manager: 'Manager', support: 'Customer Support' };

// 15 Admin Sections
const ADMIN_SECTIONS = [
  { id: 'dashboard', name: 'Dashboard', icon: '📊', roles: ['superadmin', 'manager'] },
  { id: 'products', name: 'Products', icon: '🌿', roles: ['superadmin', 'manager'] },
  { id: 'categories', name: 'Categories', icon: '📁', roles: ['superadmin'] },
  { id: 'inventory', name: 'Inventory', icon: '📦', roles: ['superadmin', 'manager', 'support'] },
  { id: 'orders', name: 'Orders', icon: '🛍️', roles: ['superadmin', 'manager', 'support'] },
  { id: 'homepage', name: 'Homepage Editor', icon: '🎨', roles: ['superadmin'] },
  { id: 'media', name: 'Banners & Media', icon: '🖼️', roles: ['superadmin'] },
  { id: 'customers', name: 'Customers', icon: '👥', roles: ['superadmin', 'manager'] },
  { id: 'inquiries', name: 'Customer Inquiries', icon: '💬', roles: ['superadmin', 'support'] },
  { id: 'coupons', name: 'Coupons', icon: '🏷️', roles: ['superadmin'] },
  { id: 'seo', name: 'SEO Settings', icon: '🔍', roles: ['superadmin'] },
  { id: 'reports', name: 'Reports & Analytics', icon: '📈', roles: ['superadmin', 'manager'] },
  { id: 'staff', name: 'Staff Management', icon: '🔑', roles: ['superadmin'] },
  { id: 'settings', name: 'Website Settings', icon: '⚙️', roles: ['superadmin'] },
  { id: 'backups', name: 'Security & Backups', icon: '🛡️', roles: ['superadmin'] }
];

/* ---------- Global State ---------- */
let products = [];
let categories = [];
let homepageConfig = null;
let storeSettings = null;
let filter = 'All';
let subfilter = 'All';
let search = '';
let staffUser = null;
let customerUser = null;
let adminTab = 'dashboard';
let toastTimer = null;
let lastOrder = null;
let activeModal = null;
let appliedCoupon = null;

// Cart stored in localStorage
let cart = {};
try { cart = JSON.parse(localStorage.getItem('cart') || '{}'); } catch (e) {}
const saveCart = () => { try { localStorage.setItem('cart', JSON.stringify(cart)); } catch (e) {} };
const findProduct = id => products.find(p => p.id == id);
const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
const cartSubtotal = () => Object.entries(cart).reduce((s, [id, q]) => {
  const p = findProduct(id);
  return s + (p ? (p.salePrice || p.price) * q : 0);
}, 0);

// Wishlist stored in localStorage + customer sync
let localWishlist = [];
try { localWishlist = JSON.parse(localStorage.getItem('paira_wishlist') || '[]'); } catch (e) {}
const saveWishlist = () => { try { localStorage.setItem('paira_wishlist', JSON.stringify(localWishlist)); } catch (e) {} };
const inWishlist = id => localWishlist.includes(+id);

/* ---------- Generic API Helper ---------- */
async function api(url, method = 'GET', body, isFormData = false) {
  const options = { method };
  if (body) {
    if (isFormData) {
      options.body = body;
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
  }
  const r = await fetch('/api' + url, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Server request failed.');
  return data;
}

/* ---------- Data Loaders ---------- */
async function loadProducts() {
  try {
    products = await api('/products?admin=1');
  } catch (e) {
    console.error('Failed to load products:', e.message);
  }
}

async function loadStoreMetadata() {
  try {
    homepageConfig = await api('/homepage');
    storeSettings = await api('/settings');
    categories = await api('/categories');
  } catch (e) {
    console.error('Metadata load error:', e.message);
  }
}

/* ---------- Toast Notification ---------- */
function toast(msg, type = 'info') {
  clearTimeout(toastTimer);
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  const icon = type === 'error' ? '⚠️' : '🌿';
  el.innerHTML = `<span>${icon}</span> <span>${esc(msg)}</span>`;
  toastTimer = setTimeout(() => el.remove(), 3200);
}

/* ---------- Modal Management ---------- */
function openModal(html) {
  const root = $('#modal-root');
  if (!root) return;
  root.innerHTML = html;
  root.style.display = 'grid';
  root.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const root = $('#modal-root');
  if (!root) return;
  root.innerHTML = '';
  root.style.display = 'none';
  root.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ---------- Stock Status Formatter ---------- */
const stockBadge = p => {
  if (p.stock <= 0) return `<span class="stock-pill out">Out of stock</span>`;
  const thresh = p.lowStockThreshold || 5;
  if (p.stock <= thresh) return `<span class="stock-pill low">Only ${p.stock} left</span>`;
  return `<span class="stock-pill in">${p.stock} in stock</span>`;
};

/* ---------- Filtered Products List ---------- */
function getFilteredProducts() {
  let list = products.filter(p => p.isVisible !== false);
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

/* ---------- Product Card Renderer ---------- */
function renderProductCards(list) {
  if (!list.length) {
    return `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;background:var(--canvas-alt);border-radius:var(--radius-card);border:1px dashed var(--line);margin:0 48px">
        <p style="font-size:2.5rem;margin-bottom:12px">🔍</p>
        <h3 style="margin-bottom:8px">No botanical items match your query</h3>
        <p class="muted">Try adjusting your search terms or clearing your collection filter.</p>
        <button class="btn-pill sm outline" style="margin-top:16px" data-a="clearFilters">View All Items</button>
      </div>
    `;
  }

  return list.map(p => {
    const mainImg = p.image || (p.images && p.images[0]) || '';
    const hasSale = p.salePrice && p.salePrice < p.price;
    const isWished = inWishlist(p.id);
    const isOutOfStock = p.stock <= 0;
    const isLowStock = !isOutOfStock && p.stock <= (p.lowStockThreshold || 5);

    return `
      <article class="product-card" data-id="${p.id}">
        <div class="product-art-wrap">
          <div class="product-card-photo" data-a="viewProduct" data-id="${p.id}" title="Click to view ${esc(p.name)}">
            ${mainImg && !mainImg.includes('hero-aquarium') ? `
              <img src="${esc(mainImg)}" alt="${esc(p.name)}" loading="lazy">
            ` : `
              <div class="product-art" aria-hidden="true">${EMOJI[p.subcategory] || EMOJI[p.category] || '🌿'}</div>
            `}
          </div>

          <div class="product-stock-tag ${isOutOfStock ? 'out' : (isLowStock ? 'low' : 'in')}">
            <span class="stock-dot"></span>
            <span class="stock-text">${isOutOfStock ? 'Out of Stock' : (isLowStock ? 'Limited Stock' : 'In Stock')}</span>
          </div>

          <button class="wishlist-btn-corner ${isWished ? 'wished' : ''}" 
                  data-a="toggleWishlist" 
                  data-id="${p.id}" 
                  type="button" 
                  aria-label="${isWished ? 'Remove from wishlist' : 'Save to wishlist'}" 
                  title="${isWished ? 'Remove from wishlist' : 'Save to wishlist'}">
            <svg class="heart-icon" viewBox="0 0 24 24" width="16" height="16" fill="${isWished ? '#e11d48' : 'none'}" stroke="${isWished ? '#e11d48' : '#112217'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>

        <div class="product-meta-header">
          <span class="product-category">${esc(p.subcategory || p.category)}</span>
          ${p.labels && p.labels.length ? `<span class="product-label-tag">${esc(p.labels[0])}</span>` : ''}
        </div>

        <h3 class="product-title" data-a="viewProduct" data-id="${p.id}" title="${esc(p.name)}">${esc(p.name)}</h3>
        <p class="product-desc" title="${esc(p.description || '')}">${esc(p.description || '')}</p>

        <div class="product-availability">
          <span class="avail-dot ${isOutOfStock ? 'out' : (isLowStock ? 'low' : 'in')}"></span>
          <span>${isOutOfStock ? 'Out of Stock' : (isLowStock ? `Limited Stock (${p.stock} available)` : `In Stock (${p.stock} available)`)}</span>
        </div>

        <div class="product-footer">
          <div class="price-wrap">
            ${hasSale ? `
              <span class="price-sale">${money(p.salePrice)}</span>
              <span class="price-original">${money(p.price)}</span>
            ` : `
              <span class="price-regular">${money(p.price)}</span>
            `}
          </div>

          <div class="action-wrap">
            <button class="btn-info" data-a="viewProduct" data-id="${p.id}" type="button" title="Quick View & Specifications" aria-label="Quick View">
              <span>Info</span>
            </button>
            <button class="btn-add-bag ${isOutOfStock ? 'disabled' : ''}" 
                    data-a="add" 
                    data-id="${p.id}" 
                    type="button" 
                    ${isOutOfStock ? 'disabled' : ''} 
                    aria-label="${isOutOfStock ? 'Sold Out' : 'Add to Bag'}">
              <span>${isOutOfStock ? 'Sold Out' : 'Add to Bag'}</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/* ==============================================================================
   STOREFRONT PAGES (Home, Shop, Product Modal, Cart, Confirmed, Account, Policies)
   ============================================================================== */
const pages = {
  /* ---------- Home Page (Dynamic CMS Driven) ---------- */
  async home() {
    await loadProducts();
    if (!homepageConfig) await loadStoreMetadata();

    const hero = (homepageConfig && homepageConfig.hero) || {
      title: 'Bring Life to Your Aquarium',
      subtitle: 'Pairaplants brings the beauty of aquatic nature into your home and workspace with premium, healthy aquatic plants, quarantined fishes & gravels.',
      ctaText: 'Explore Collection →',
      ctaLink: '#shop',
      secondaryCtaText: 'About Pairaplants',
      secondaryCtaLink: '#story',
      bannerImage: '/images/hero-aquarium.jpg'
    };

    const why = (homepageConfig && homepageConfig.whyChooseUs) || {
      title: 'Why Choose Us',
      cards: [
        { icon: '🌿', title: 'Healthy & Vibrant Plants', description: 'We deliver pest-free, carefully nurtured plants that thrive in your aquarium.' },
        { icon: '🚚', title: 'Fast & Reliable Shipping', description: 'Secure packaging ensures your plants arrive fresh and ready to flourish.' },
        { icon: '💡', title: 'Expert Guidance', description: 'Our team provides simple tips and support to help you succeed in aquascaping.' },
        { icon: '♻️', title: 'Sustainable Practices', description: 'We source responsibly and use eco-friendly methods to protect natural habitats.' }
      ]
    };

    const featuredProducts = products.filter(p => p.isFeatured && p.isVisible !== false).slice(0, 4);

    return `
      <!-- HERO PHOTO BANNER -->
      <section class="hero-photo-banner" style="background-image:linear-gradient(rgba(17, 26, 21, 0.45), rgba(17, 26, 21, 0.65)), url('${esc(hero.bannerImage || '/images/hero-aquarium.jpg')}');">
        <h1 class="banner-title">${esc(hero.title)}</h1>
        <p class="banner-sub">${esc(hero.subtitle)}</p>
        <div class="banner-cta">
          <a class="btn-banner" href="${esc(hero.ctaLink || '#shop')}">${esc(hero.ctaText || 'Explore Collection →')}</a>
          <a class="btn-banner outline-light" href="${esc(hero.secondaryCtaLink || '#story')}">${esc(hero.secondaryCtaText || 'About Pairaplants')}</a>
        </div>
      </section>

      <!-- WHY CHOOSE US -->
      <section class="why-choose-section">
        <div class="why-inner">
          <a class="view-all-pill" href="#shop">View All Products</a>
          <h2 class="why-title">${esc(why.title || 'Why Choose Us')}</h2>

          <div class="why-cards-grid">
            ${(why.cards || []).map(c => `
              <div class="why-card">
                <div style="font-size:1.8rem;margin-bottom:8px">${c.icon || '🌿'}</div>
                <h3>${esc(c.title)}</h3>
                <div class="card-divider"></div>
                <p>${esc(c.description)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- FEATURED BOTANICALS ROW -->
      ${featuredProducts.length ? `
        <div class="section-container" style="padding-top:20px;">
          <div class="section-head">
            <div>
              <span class="kicker">CURATED HIGHLIGHTS</span>
              <h2>Featured Botanicals &amp; Livestock</h2>
            </div>
            <a class="btn-pill outline sm" href="#shop">Explore All &rarr;</a>
          </div>
          <div class="product-grid" style="padding:0;">
            ${renderProductCards(featuredProducts)}
          </div>
        </div>
      ` : ''}

      <!-- CURATED ECOSYSTEM COLLECTIONS -->
      <div class="section-container" style="padding-top:40px;">
        <section class="overview-section">
          <div class="section-head">
            <div>
              <span class="kicker">ECOSYSTEM TIERS</span>
              <h2>Curated Collections</h2>
            </div>
            <a class="btn-pill outline sm" href="#shop">View All ${products.length} Products &rarr;</a>
          </div>

          <div class="overview-grid">
            ${CATS.map(cat => {
              const count = products.filter(p => p.category === cat).length;
              return `
                <div class="overview-card" data-a="browse" data-v="${esc(cat)}">
                  <div class="card-thumb" aria-hidden="true">${EMOJI[cat] || '🌿'}</div>
                  <h3>${esc(cat)}</h3>
                  <div class="count-label">${count} items available</div>
                  <button class="btn-pill outline sm" data-a="browse" data-v="${esc(cat)}">Browse ${cat.split(' ')[0]}</button>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      </div>

      <!-- COMPLIMENTARY CARE DISPATCH PROMO -->
      <div class="section-container" style="padding-bottom:50px;">
        <div style="background:var(--forest-primary);color:#fff;border-radius:var(--radius-card);padding:40px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:24px;">
          <div style="max-width:650px;">
            <span class="badge" style="background:rgba(255,255,255,0.15);color:#a8d5b8;border:none;margin-bottom:12px;">LIVE ARRIVAL THERMAL DISPATCH</span>
            <h3 style="font-size:1.8rem;color:#fff;margin-bottom:8px;">Zero Risk Aquascaping Guarantee</h3>
            <p style="color:#c5d8cc;font-size:0.95rem;line-height:1.6;">
              Every order containing live aquatic plants, quarantined freshwater fishes, or dwarf shrimps is insulated with thermal shielding and medical-grade oxygen canisters at zero additional charge.
            </p>
          </div>
          <a class="btn-pill" style="background:#fff;color:var(--forest-primary);" href="#policy-shipping">Shipping Details &rarr;</a>
        </div>
      </div>
    `;
  },

  /* ---------- Shop Catalog Page ---------- */
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
            <span class="kicker">PAIRAPLANTS COLLECTION</span>
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

  /* ---------- Cart & Checkout Page ---------- */
  async cart() {
    await loadProducts();
    const items = Object.entries(cart).map(([id, q]) => {
      const p = findProduct(id);
      return p ? { p, q } : null;
    }).filter(Boolean);

    if (!items.length) {
      return `
        <div class="narrow-box" style="text-align:center;padding:80px 20px">
          <span style="font-size:4rem">🛒</span>
          <h2 style="margin:20px 0 10px">Your cart is currently empty</h2>
          <p class="muted" style="margin-bottom:28px">Explore Pairaplants collection of aquatic plants, ornamental fishes, and dwarf shrimps to get started.</p>
          <a class="btn-pill" href="#shop">Explore Catalog</a>
        </div>
      `;
    }

    const subtotal = cartSubtotal();
    let discount = 0;
    if (appliedCoupon) {
      discount = appliedCoupon.discount || 0;
    }
    const finalTotal = Math.max(0, subtotal - discount);

    const rows = items.map(({ p, q }) => {
      const unitPrice = p.salePrice || p.price;
      return `
        <tr>
          <td>
            <strong>${esc(p.name)}</strong>
            <div style="font-size:0.75rem;color:var(--ink-muted)">${esc(p.category)} · SKU: ${esc(p.sku || `PP-${p.id}`)}</div>
          </td>
          <td>${money(unitPrice)}</td>
          <td>
            <input type="number" min="1" max="${p.stock}" value="${q}" data-c="qty" data-id="${p.id}" aria-label="Quantity for ${esc(p.name)}" style="width:65px;padding:6px;border-radius:6px;border:1px solid var(--line);">
          </td>
          <td style="font-weight:600">${money(unitPrice * q)}</td>
          <td>
            <button class="btn-pill outline sm" data-a="remove" data-id="${p.id}">Remove</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="two-col" style="align-items:start;padding-top:40px">
        <div>
          <span class="kicker">ORDER REVIEW</span>
          <h2>Your Cart (${cartCount()} items)</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Botanical Item</th><th>Unit Price</th><th>Qty</th><th>Total</th><th></th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>

          <!-- Coupon Code Input Box -->
          <div style="background:var(--surface-card);border:1px solid var(--line);border-radius:var(--radius-sm);padding:18px;margin:20px 0;">
            <div style="font-weight:600;font-size:0.9rem;margin-bottom:8px;">Have a Promo Coupon?</div>
            <div style="display:flex;gap:10px;">
              <input id="coupon-code-input" placeholder="e.g. PAIRAWELCOME" value="${appliedCoupon ? esc(appliedCoupon.code) : ''}" style="flex:1;text-transform:uppercase;padding:8px 12px;border:1px solid var(--line);border-radius:var(--radius-sm);">
              <button class="btn-pill sm" data-a="applyCoupon">${appliedCoupon ? 'Applied' : 'Apply Coupon'}</button>
            </div>
            ${appliedCoupon ? `
              <div style="margin-top:8px;font-size:0.85rem;color:var(--moss);font-weight:600;">
                ✓ Coupon <strong>${esc(appliedCoupon.code)}</strong> applied: Saved ${money(appliedCoupon.discount)}!
                <button data-a="removeCoupon" style="background:none;border:none;color:var(--terracotta);cursor:pointer;margin-left:8px;font-size:0.8rem;">(Remove)</button>
              </div>
            ` : '<div style="font-size:0.75rem;color:var(--ink-muted);margin-top:6px;">Try <strong>PAIRAWELCOME</strong> for 10% off or <strong>GREEN100</strong> for ₹100 off!</div>'}
          </div>

          <!-- Summary Breakdown -->
          <div style="padding:20px;background:var(--surface-card);border-radius:var(--radius-sm);border:1px solid var(--line);">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span class="muted">Cart Subtotal:</span>
              <span style="font-weight:600;">${money(subtotal)}</span>
            </div>
            ${discount > 0 ? `
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;color:var(--terracotta);">
                <span>Discount (${esc(appliedCoupon.code)}):</span>
                <span>-${money(discount)}</span>
              </div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span class="muted">Live Arrival Thermal Dispatch:</span>
              <span style="color:var(--moss);font-weight:600;">COMPLIMENTARY</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--line);margin-top:8px;">
              <span style="font-size:1.1rem;font-weight:700;">Total Payable:</span>
              <span style="font-family:var(--font-serif);font-size:1.7rem;font-weight:700;color:var(--forest-primary)">${money(finalTotal)}</span>
            </div>
          </div>
        </div>

        <!-- Checkout Form -->
        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:32px">
          <span class="kicker">SECURE CHECKOUT</span>
          <h3>Delivery Information</h3>
          <p class="muted" style="font-size:0.85rem;margin-bottom:18px">Please provide accurate contact details for dispatch confirmation.</p>
          
          <form data-f="order">
            <label for="cn">Full Name</label>
            <input id="cn" name="name" required maxlength="80" value="${customerUser ? esc(customerUser.name) : ''}" placeholder="e.g. Rahul Sharma">
            
            <label for="cp">Phone Number (WhatsApp verified for live delivery updates)</label>
            <input id="cp" name="phone" type="tel" required maxlength="20" value="${customerUser ? esc(customerUser.phone) : ''}" placeholder="e.g. +91 98765 43210">
            
            <label for="ca">Shipping Address</label>
            <textarea id="ca" name="address" rows="3" required maxlength="300" placeholder="House/Flat number, Street, Landmark, City, PIN Code">${customerUser && customerUser.address ? esc(customerUser.address) : ''}</textarea>
            
            <div style="margin:20px 0;padding:16px;background:var(--canvas);border-radius:var(--radius-sm);border:1px solid var(--line)">
              <div style="font-weight:600;font-size:0.88rem;margin-bottom:4px">Payment Mode:</div>
              <div style="font-size:0.82rem;color:var(--ink-secondary);line-height:1.5">
                💵 <strong>Cash / UPI on Delivery</strong>. Pay safely upon inspecting your healthy live plants and items.
              </div>
            </div>

            <button class="btn-pill" style="width:100%;padding:14px;font-size:1rem">Confirm Order · ${money(finalTotal)}</button>
          </form>
        </div>
      </div>
    `;
  },

  /* ---------- Order Confirmed Page ---------- */
  async confirmed() {
    if (!lastOrder) {
      return `
        <div class="narrow-box" style="text-align:center;padding:60px 20px">
          <h2>Order Received</h2>
          <p class="muted">Your order is being processed by Pairaplants specialists.</p>
          <a class="btn-pill" style="margin-top:20px" href="#shop">Explore Catalog</a>
        </div>
      `;
    }
    const o = lastOrder;
    return `
      <div class="narrow-box" style="padding-top:40px">
        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:36px;box-shadow:var(--shadow-card)">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
            <span style="font-size:2.8rem">🎉</span>
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
              <thead><tr><th>Botanical Item</th><th>Qty</th><th>Price</th></tr></thead>
              <tbody>
                ${o.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td style="font-weight:600">${money(i.price * i.qty)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
            <span style="font-weight:600">Total Payable (Cash/UPI on Delivery):</span>
            <span style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;color:var(--forest-primary)">${money(o.total)}</span>
          </div>

          <div style="display:flex;gap:12px;margin:24px 0;flex-wrap:wrap;">
            <a class="btn-pill outline sm" href="/api/orders/${o.id}/invoice" target="_blank">🖨️ Print Tax Invoice</a>
            <a class="btn-whatsapp sm" href="https://wa.me/919876543210?text=Hello%20Pairaplants!%20My%20order%20is%20%23${o.id}%20for%20${encodeURIComponent(o.name)}." target="_blank">💬 WhatsApp Support</a>
          </div>

          <div style="font-size:0.85rem;color:var(--ink-secondary);line-height:1.5;margin-bottom:24px">
            📦 <strong>Care Dispatch Protocol</strong>: Pairaplants specialists are packaging your live flora and fauna in insulated boxes with oxygen-filled sealed pouches. You will receive an SMS/WhatsApp notification once dispatched.
          </div>

          <div style="text-align:center">
            <a class="btn-pill" href="#shop">Continue Exploring Botanicals &rarr;</a>
          </div>
        </div>
      </div>
    `;
  },

  /* ---------- Customer Account Dashboard ---------- */
  async account() {
    // Check if customer is logged in
    try {
      customerUser = await api('/customer/me');
    } catch (e) {
      customerUser = null;
    }

    if (!customerUser) {
      return `
        <div class="narrow-box" style="padding:50px 24px">
          <div style="background:var(--surface-card);border:1px solid var(--line);border-radius:var(--radius-card);padding:36px;box-shadow:var(--shadow-card)">
            <span class="kicker">MY ACCOUNT</span>
            <h2>Sign In or Create Account</h2>
            <p class="muted" style="margin-bottom:24px">Track your botanical orders, manage saved delivery addresses and access your wishlist.</p>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;">
              <!-- Login Form -->
              <form data-f="customerLogin">
                <h3 style="font-size:1.1rem;margin-bottom:12px;">Returning Customer</h3>
                <label for="cl-e">Email Address</label>
                <input id="cl-e" name="email" type="email" required placeholder="name@example.com">
                <label for="cl-p">Password</label>
                <input id="cl-p" name="password" type="password" required placeholder="••••••••">
                <button class="btn-pill" style="width:100%;margin-top:16px;">Sign In</button>
              </form>

              <!-- Register Form -->
              <form data-f="customerRegister">
                <h3 style="font-size:1.1rem;margin-bottom:12px;">New to Pairaplants?</h3>
                <label for="cr-n">Full Name</label>
                <input id="cr-n" name="name" required placeholder="e.g. Ananya Patel">
                <label for="cr-e">Email Address</label>
                <input id="cr-e" name="email" type="email" required placeholder="name@example.com">
                <label for="cr-p">Password</label>
                <input id="cr-p" name="password" type="password" minlength="6" required placeholder="Minimum 6 characters">
                <label for="cr-ph">Phone Number</label>
                <input id="cr-ph" name="phone" placeholder="+91 98765 43210">
                <button class="btn-pill outline" style="width:100%;margin-top:16px;">Create Account</button>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    const c = customerUser;
    const orders = c.orders || [];

    return `
      <div class="narrow-box" style="padding:40px 24px;max-width:960px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
          <div>
            <span class="kicker">CUSTOMER PORTAL</span>
            <h1>Welcome back, ${esc(c.name)}</h1>
            <p class="muted">${esc(c.email)} · ${esc(c.phone || 'No phone registered')}</p>
          </div>
          <button class="btn-pill outline sm" data-a="customerLogout">Sign Out</button>
        </div>

        <div style="background:var(--surface-card);border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;margin-bottom:30px;">
          <h3 style="margin-bottom:16px;">Your Order History (${orders.length})</h3>
          ${orders.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Order ID</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th>Invoice</th></tr></thead>
                <tbody>
                  ${orders.map(o => `
                    <tr>
                      <td><strong>#${o.id}</strong></td>
                      <td>${when(o.date)}</td>
                      <td>${(o.items || []).map(i => `${esc(i.name)} × ${i.qty}`).join('<br>')}</td>
                      <td style="font-weight:700;">${money(o.total)}</td>
                      <td><span class="badge-status ${o.status.toLowerCase()}">${o.status}</span></td>
                      <td><a class="btn-pill sm outline" href="/api/orders/${o.id}/invoice" target="_blank">PDF</a></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="muted">You have not placed any orders with Pairaplants yet.</p>'}
        </div>

        <!-- Wishlist Section -->
        <div style="background:var(--surface-card);border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;">
          <h3 style="margin-bottom:16px;">Saved Wishlist Items (${localWishlist.length})</h3>
          ${localWishlist.length ? `
            <div class="product-grid" style="padding:0;">
              ${renderProductCards(products.filter(p => localWishlist.includes(p.id)))}
            </div>
          ` : '<p class="muted">Your wishlist is currently empty. Click the heart icon on any botanical product to save it here!</p>'}
        </div>
      </div>
    `;
  },

  /* ---------- Our Story Page ---------- */
  async story() {
    return `
      <div class="narrow-box" style="padding:50px 24px">
        <span class="kicker">PAIRAPLANTS HERITAGE</span>
        <h1 style="font-size:clamp(2.4rem, 5vw, 3.8rem);margin-bottom:24px">About Pairaplants</h1>

        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:36px;margin-bottom:32px">
          <h2 style="font-size:1.8rem;color:var(--forest-primary);margin-bottom:12px">Our Story</h2>
          <p style="font-size:1.08rem;color:var(--ink-secondary);line-height:1.75">
            Pairaplants brings the beauty of aquatic nature into your home and workspace. We provide premium, healthy aquatic plants and aquascaping essentials. Our mission is to make every aquarium vibrant, serene, and easy to maintain.
          </p>
        </div>

        <div style="background:var(--canvas-alt);border:1px solid var(--line);border-radius:var(--radius-card);padding:36px;margin-bottom:36px">
          <h2 style="font-size:1.8rem;color:var(--moss);margin-bottom:12px">Our Mission</h2>
          <p style="font-size:1.08rem;color:var(--ink-secondary);line-height:1.75">
            At Pairaplants, our mission is to inspire and support aquascaping by providing premium aquatic plants and expert guidance, helping every enthusiast create thriving, beautiful underwater worlds.
          </p>
        </div>

        <div class="why-cards-grid" style="margin-top:20px">
          <div class="why-card">
            <h3>Pest-Free Guarantee</h3>
            <div class="card-divider"></div>
            <p>Every tissue culture cup and submersed stem undergoes a rigorous inspection protocol to guarantee zero unwanted hitchhikers, algae spores, or snails.</p>
          </div>
          <div class="why-card">
            <h3>Thermal Packaging</h3>
            <div class="card-divider"></div>
            <p>Specially insulated polystyrene crates paired with oxygen-enriched water transport ensures your aquatic pets and delicate ferns thrive during dispatch.</p>
          </div>
        </div>

        <p style="margin-top:40px;text-align:center">
          <a class="btn-pill" href="#shop">Explore Pairaplants Catalog &rarr;</a>
        </p>
      </div>
    `;
  },

  /* ---------- Contact & Care Consultation Page ---------- */
  async contact() {
    return `
      <div class="two-col" style="align-items:start;padding-top:40px">
        <div>
          <span class="kicker">CONNECT WITH US</span>
          <h1>Care Consultations &amp; Inquiries</h1>
          <p class="subheading" style="margin:16px 0 28px">Need advice on plant fertilizers, fish compatibility, or tank lighting? Our aquatic specialists are here to guide your setup.</p>
          
          <div style="display:flex;flex-direction:column;gap:16px">
            <div style="display:flex;align-items:center;gap:14px">
              <span style="font-size:1.4rem">📍</span>
              <div>
                <strong>Pairaplants Studio &amp; Nursery</strong>
                <p class="muted" style="font-size:0.85rem">Aquatic Plants, Fishes &amp; Gravels Hub</p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:14px">
              <span style="font-size:1.4rem">✉️</span>
              <div>
                <strong>Email Consultation</strong>
                <p class="muted" style="font-size:0.85rem">care@pairaplants.com</p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:14px">
              <span style="font-size:1.4rem">💬</span>
              <div>
                <strong>WhatsApp Care Line</strong>
                <p class="muted" style="font-size:0.85rem">+91 98765 43210 (10 AM – 7 PM IST)</p>
              </div>
            </div>
          </div>
        </div>

        <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:32px">
          <h3 style="margin-bottom:6px">Send an Aquascaping Inquiry</h3>
          <p class="muted" style="font-size:0.85rem;margin-bottom:18px">Fill in your question below and our specialists will respond within 4 hours.</p>
          <form data-f="contact">
            <label for="n">Your Name</label>
            <input id="n" name="name" required maxlength="80" placeholder="Your name">
            
            <label for="e">Email Address</label>
            <input id="e" name="email" type="email" required maxlength="120" placeholder="name@example.com">
            
            <label for="ph">Phone Number (Optional)</label>
            <input id="ph" name="phone" placeholder="+91 98765 43210">
            
            <label for="m">Your Setup Question or Plant Inquiry</label>
            <textarea id="m" name="message" rows="4" required maxlength="1000" placeholder="Tell us about your aquarium size, lighting specs, CO2 setup, or specific plant/fish questions..."></textarea>
            
            <button class="btn-pill" style="margin-top:20px;width:100%">Submit Consultation Message</button>
          </form>
        </div>
      </div>
    `;
  },

  /* ---------- Shipping Policy Page ---------- */
  async 'policy-shipping'() {
    return `
      <div class="narrow-box" style="padding:50px 24px">
        <span class="kicker">POLICY &amp; PROTOCOL</span>
        <h1>Thermal Packaging &amp; Live Arrival Guarantee</h1>
        <div style="background:var(--surface-card);border:1px solid var(--line);border-radius:var(--radius-card);padding:32px;margin:24px 0;line-height:1.75;color:var(--ink-secondary);">
          <h3 style="color:var(--forest-primary);margin-bottom:10px;">1. Professional Live Travel Packaging</h3>
          <p>Pairaplants employs multi-layer insulated polystyrene packaging specifically calibrated for tropical live flora and fauna. Live plants are sealed with moisture sponges, and all ornamental fishes and dwarf shrimps travel in pure oxygen-filled leakproof chambers.</p>
          <h3 style="color:var(--forest-primary);margin:24px 0 10px;">2. Transit Timelines</h3>
          <p>Orders are dispatched Monday through Thursday to prevent parcels from idling over weekends. Major metropolitan deliveries arrive within 24–48 hours; regional hubs arrive in 48–72 hours.</p>
          <h3 style="color:var(--forest-primary);margin:24px 0 10px;">3. 100% Live Arrival Guarantee</h3>
          <p>In the unlikely event of transit casualty or damaged plants, simply photograph the parcel within 2 hours of documented courier delivery and contact our WhatsApp care team. We will immediately issue a replacement or refund.</p>
        </div>
        <div style="text-align:center"><a class="btn-pill" href="#shop">Explore Catalog &rarr;</a></div>
      </div>
    `;
  },

  /* ---------- Refund Policy Page ---------- */
  async 'policy-refund'() {
    return `
      <div class="narrow-box" style="padding:50px 24px">
        <span class="kicker">CUSTOMER SATISFACTION</span>
        <h1>Return &amp; Refund Policy</h1>
        <div style="background:var(--surface-card);border:1px solid var(--line);border-radius:var(--radius-card);padding:32px;margin:24px 0;line-height:1.75;color:var(--ink-secondary);">
          <h3 style="color:var(--forest-primary);margin-bottom:10px;">1. Non-Perishable Equipment &amp; Substrates</h3>
          <p>Substrates, hardscape woods, and dry goods can be returned within 7 calendar days of receipt if unopened and in original condition.</p>
          <h3 style="color:var(--forest-primary);margin:24px 0 10px;">2. Live Plants &amp; Living Livestock</h3>
          <p>Because live biological species cannot be returned via standard courier routes, we replace or refund damaged live items immediately upon receiving photo/video verification. No return shipment of dead flora or fauna is required.</p>
          <h3 style="color:var(--forest-primary);margin:24px 0 10px;">3. Refund Processing</h3>
          <p>Approved refunds are processed via UPI or direct bank transfer within 24 hours of claim validation.</p>
        </div>
        <div style="text-align:center"><a class="btn-pill" href="#shop">Explore Catalog &rarr;</a></div>
      </div>
    `;
  },

  /* ==============================================================================
     STAFF PORTAL & 15-SECTION ADMIN DASHBOARD
     ============================================================================== */
  async staff() {
    // If not logged in as staff, show login form
    if (!staffUser) {
      return `
        <div class="narrow-box" style="padding:60px 24px">
          <div style="background:var(--surface-card);border:1px solid var(--line-subtle);border-radius:var(--radius-card);padding:40px;box-shadow:var(--shadow-card)">
            <span class="kicker">INTERNAL ACCESS</span>
            <h2>Pairaplants Staff Portal</h2>
            <p class="muted" style="margin-bottom:24px">Sign in to manage catalog, multi-image uploads, inventory, customer orders, and homepage CMS.</p>
            <form data-f="staffLogin">
              <label for="su">Username</label>
              <input id="su" name="username" autocomplete="username" required placeholder="owner / manager / support">
              <label for="spw">Password</label>
              <input id="spw" name="password" type="password" autocomplete="current-password" required placeholder="Enter password">
              <button class="btn-pill" style="width:100%;margin-top:20px;padding:12px">Sign In to Dashboard</button>
            </form>
          </div>
        </div>
      `;
    }

    // Role-filtered sections
    const allowedSections = ADMIN_SECTIONS.filter(s => s.roles.includes(staffUser.role));
    if (!allowedSections.some(s => s.id === adminTab)) {
      adminTab = allowedSections[0].id;
    }

    let viewContent = '';
    try {
      if (adminViews[adminTab]) {
        viewContent = await adminViews[adminTab]();
      } else {
        viewContent = `<p class="muted">Section under maintenance.</p>`;
      }
    } catch (e) {
      viewContent = `<div style="color:var(--terracotta);padding:20px;background:#fef2f2;border-radius:var(--radius-sm)"><strong>Error:</strong> ${esc(e.message)}</div>`;
    }

    return `
      <div class="admin-shell">
        <!-- Sidebar Navigation (15 Sections) -->
        <aside class="admin-sidebar">
          <div class="admin-brand">
            <h2>🌿 Pairaplants</h2>
            <div class="admin-user-pill">
              <strong>${esc(staffUser.name)}</strong> · ${ROLE_NAMES[staffUser.role]}
            </div>
          </div>

          <ul class="admin-nav" role="tablist">
            ${allowedSections.map(s => `
              <li class="admin-nav-item">
                <button data-a="adminNav" data-v="${s.id}" aria-pressed="${adminTab === s.id}">
                  <span class="admin-nav-icon">${s.icon}</span>
                  <span>${s.name}</span>
                </button>
              </li>
            `).join('')}
          </ul>

          <div style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.1)">
            <button class="btn-pill sm outline" style="width:100%;color:#fff;border-color:rgba(255,255,255,0.3)" data-a="staffLogout">Sign Out</button>
          </div>
        </aside>

        <!-- Main Content Area -->
        <section class="admin-content">
          ${viewContent}
        </section>
      </div>
    `;
  }
};

/* ==============================================================================
   ADMIN DASHBOARD VIEWS (15 SECTIONS)
   ============================================================================== */
const adminViews = {
  /* 1. Dashboard */
  async dashboard() {
    const r = await api('/reports/overview');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">OVERVIEW &amp; PERFORMANCE</span>
          <h1 style="font-size:2rem;margin:0">Admin Dashboard</h1>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-pill sm" data-a="openAddProductModal">+ Add New Product</button>
          <a class="btn-pill sm outline" href="#shop" target="_blank">View Live Store ↗</a>
        </div>
      </div>

      <!-- KPI Grid -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-title">Total Products</span>
          <div class="kpi-value">${r.totalProducts}</div>
          <span class="kpi-subtitle">Active Botanical Items</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Total Orders</span>
          <div class="kpi-value">${r.totalOrders}</div>
          <span class="kpi-subtitle">All-time customer orders</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Pending Orders</span>
          <div class="kpi-value">${r.pendingOrders}</div>
          <span class="kpi-subtitle">Require packing &amp; dispatch</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Delivered Orders</span>
          <div class="kpi-value">${r.deliveredOrders}</div>
          <span class="kpi-subtitle">Successfully received</span>
        </div>
        <div class="kpi-card ${r.lowStockProducts > 0 ? 'alert' : ''}">
          <span class="kpi-title">Low Stock Alerts</span>
          <div class="kpi-value" style="color:var(--terracotta);">${r.lowStockProducts}</div>
          <span class="kpi-subtitle">At or below threshold</span>
        </div>
        <div class="kpi-card ${r.outOfStockProducts > 0 ? 'alert' : ''}">
          <span class="kpi-title">Out of Stock</span>
          <div class="kpi-value" style="color:#b91c1c;">${r.outOfStockProducts}</div>
          <span class="kpi-subtitle">Unavailable for checkout</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Registered Customers</span>
          <div class="kpi-value">${r.totalCustomers}</div>
          <span class="kpi-subtitle">Active accounts</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Sales Revenue</span>
          <div class="kpi-value" style="color:var(--moss);">${money(r.totalRevenue)}</div>
          <span class="kpi-subtitle">Gross verified orders</span>
        </div>
      </div>

      <!-- Top Selling Products -->
      <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;margin-top:20px;">
        <h3 style="margin-bottom:16px;">Top Selling Botanicals</h3>
        ${(r.topSelling || []).length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Product Name</th><th>Units Sold</th></tr></thead>
              <tbody>
                ${r.topSelling.map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${s.qty} units</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="muted">No sales metrics recorded yet.</p>'}
      </div>
    `;
  },

  /* 2. Products Management */
  async products() {
    await loadProducts();
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">CATALOG MANAGEMENT</span>
          <h1 style="font-size:2rem;margin:0">Products (${products.length})</h1>
        </div>
        <div style="display:flex;gap:12px;">
          <div class="search-wrap" style="margin-bottom:0;width:260px;">
            <span class="search-icon">🔍</span>
            <input type="search" placeholder="Search catalog..." data-i="admin-prod-search">
          </div>
          <button class="btn-pill sm" data-a="openAddProductModal">+ Add Product</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Item</th><th>Category</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody id="admin-prod-tbody">
            ${products.map(p => `
              <tr data-name="${esc(p.name.toLowerCase())}" data-cat="${esc(p.category.toLowerCase())}">
                <td style="display:flex;align-items:center;gap:10px;">
                  ${p.image && !p.image.includes('hero-aquarium') ? `
                    <img src="${esc(p.image)}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid var(--line);">
                  ` : `
                    <span style="font-size:1.2rem;width:36px;text-align:center;">${EMOJI[p.subcategory] || EMOJI[p.category] || '🌿'}</span>
                  `}
                  <div>
                    <strong>${esc(p.name)}</strong>
                    ${p.isFeatured ? '<span class="badge" style="background:#eaf2ec;margin-left:4px;">Featured</span>' : ''}
                    ${p.isVisible === false ? '<span class="badge" style="background:#fee2e2;color:#b91c1c;margin-left:4px;">Hidden</span>' : ''}
                  </div>
                </td>
                <td>${esc(p.category)}</td>
                <td><code style="font-size:0.8rem">${esc(p.sku || `PP-${p.id}`)}</code></td>
                <td>${p.salePrice ? `<strong style="color:var(--terracotta)">${money(p.salePrice)}</strong> <del class="muted">${money(p.price)}</del>` : `<strong>${money(p.price)}</strong>`}</td>
                <td>${stockBadge(p)}</td>
                <td>${p.stock > 0 ? '<span style="color:#15803d;font-weight:600;">Active</span>' : '<span style="color:#b91c1c;font-weight:600;">Sold Out</span>'}</td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <button class="btn-pill outline sm" data-a="editProduct" data-id="${p.id}">Edit</button>
                    <button class="btn-pill outline sm" data-a="delProduct" data-id="${p.id}" style="color:var(--terracotta);border-color:var(--terracotta);">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 3. Categories */
  async categories() {
    const cats = await api('/categories');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">TAXONOMY</span>
          <h1 style="font-size:2rem;margin:0">Categories &amp; Subcategories</h1>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Icon</th><th>Category Name</th><th>Slug</th><th>Subcategories</th></tr></thead>
          <tbody>
            ${cats.map(c => `
              <tr>
                <td style="font-size:1.5rem">${c.icon || '🌿'}</td>
                <td><strong>${esc(c.name)}</strong></td>
                <td><code>${esc(c.slug)}</code></td>
                <td>${(c.subcategories || []).map(s => `<span class="badge" style="margin:2px;">${esc(s)}</span>`).join('')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 4. Advanced Inventory Management */
  async inventory() {
    const items = await api('/inventory');
    const logs = await api('/inventory/logs');

    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">STOCK CONTROL &amp; AUDIT</span>
          <h1 style="font-size:2rem;margin:0">Inventory Management</h1>
        </div>
        <div class="search-wrap" style="margin-bottom:0;width:280px;">
          <span class="search-icon">🔍</span>
          <input type="search" placeholder="Filter inventory..." data-i="admin-inv-search">
        </div>
      </div>

      <div class="table-wrap" style="margin-bottom:32px;">
        <table>
          <thead>
            <tr><th>Botanical Product</th><th>Category</th><th>SKU</th><th>Current Stock</th><th>Low-Stock Alert</th><th>Quick Adjust</th></tr>
          </thead>
          <tbody id="admin-inv-tbody">
            ${items.map(it => `
              <tr data-name="${esc(it.name.toLowerCase())}" data-cat="${esc(it.category.toLowerCase())}">
                <td><strong>${esc(it.name)}</strong></td>
                <td>${esc(it.category)}</td>
                <td><code>${esc(it.sku)}</code></td>
                <td>
                  <input type="number" min="0" value="${it.stock}" data-c="stockOverride" data-id="${it.id}" style="width:75px;padding:6px;border:1px solid var(--line);border-radius:6px;font-weight:700;">
                </td>
                <td>${it.status === 'out_of_stock' ? '<span class="stock-pill out">Out of Stock</span>' : (it.status === 'low_stock' ? '<span class="stock-pill low">Low Stock (&le; ' + it.lowStockThreshold + ')</span>' : '<span class="stock-pill in">Healthy</span>')}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn-pill sm outline" data-a="invDelta" data-id="${it.id}" data-v="-1">-1</button>
                    <button class="btn-pill sm outline" data-a="invDelta" data-id="${it.id}" data-v="1">+1</button>
                    <button class="btn-pill sm outline" data-a="invDelta" data-id="${it.id}" data-v="5">+5</button>
                    <button class="btn-pill sm outline" data-a="invDelta" data-id="${it.id}" data-v="10">+10</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Movement Audit Trail -->
      <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;">
        <h3 style="margin-bottom:12px;">Recent Stock Movement Audit Logs</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Timestamp</th><th>Product</th><th>Change</th><th>Old &rarr; New</th><th>Reason</th><th>User</th></tr></thead>
            <tbody>
              ${logs.slice(0, 25).map(l => `
                <tr>
                  <td>${when(l.timestamp)}</td>
                  <td><strong>${esc(l.productName)}</strong></td>
                  <td style="font-weight:700;color:${l.change > 0 ? '#15803d' : '#b91c1c'};">${l.change > 0 ? '+' : ''}${l.change}</td>
                  <td>${l.previousStock} &rarr; <strong>${l.newStock}</strong></td>
                  <td>${esc(l.reason)}</td>
                  <td><code>${esc(l.performedBy)}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  /* 5. Orders Management */
  async orders() {
    const list = await api('/orders');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">ORDER DISPATCH</span>
          <h1 style="font-size:2rem;margin:0">Customer Orders (${list.length})</h1>
        </div>
        <div style="display:flex;gap:10px;">
          <a class="btn-pill sm outline" href="/api/reports/orders/export" target="_blank">📥 Export CSV</a>
        </div>
      </div>

      ${list.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${list.map(o => `
                <tr>
                  <td>
                    <strong>#${o.id}</strong><br>
                    <span class="muted" style="font-size:0.8rem">${when(o.date)}</span>
                  </td>
                  <td>
                    <strong>${esc(o.name)}</strong><br>
                    <span class="muted">${esc(o.phone)}</span><br>
                    <span style="font-size:0.75rem;color:var(--ink-secondary);">${esc(o.address)}</span>
                  </td>
                  <td>
                    ${(o.items || []).map(i => `${esc(i.name)} &times; ${i.qty}`).join('<br>')}
                  </td>
                  <td style="font-weight:700;">${money(o.total)}</td>
                  <td>
                    <select data-c="orderStatus" data-id="${o.id}" class="badge-status ${(o.status || 'new').toLowerCase()}" style="cursor:pointer;padding:6px 10px;">
                      ${['New', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].map(s => `
                        <option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>
                      `).join('')}
                    </select>
                  </td>
                  <td>
                    <div style="display:flex;flex-direction:column;gap:4px;">
                      <a class="btn-pill sm outline" href="/api/orders/${o.id}/invoice" target="_blank" style="text-align:center;">Invoice</a>
                      <a class="btn-pill sm outline" href="https://wa.me/${encodeURIComponent(o.phone.replace(/[^0-9]/g, ''))}?text=${encodeURIComponent(`Hello ${o.name}! Pairaplants update regarding your order #${o.id}: status is now ${o.status}.`)}" target="_blank" style="text-align:center;">WhatsApp</a>
                      ${o.status !== 'Cancelled' ? `
                        <button class="btn-pill sm outline" data-a="cancelOrder" data-id="${o.id}" style="color:var(--terracotta);border-color:var(--terracotta);">Cancel</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="muted">No customer orders placed yet.</p>'}
    `;
  },

  /* 6. Homepage CMS Editor */
  async homepage() {
    const config = await api('/homepage');
    const hero = config.hero || {};
    const why = config.whyChooseUs || { cards: [] };

    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">CMS &amp; BANNERS</span>
          <h1 style="font-size:2rem;margin:0">Homepage Editor</h1>
        </div>
      </div>

      <form data-f="saveHomepage" style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:32px;">
        <h3 style="margin-bottom:16px;">Hero Banner Content</h3>
        <div class="two-col" style="padding:0;margin-bottom:24px;">
          <div>
            <label for="h-title">Hero Main Heading</label>
            <input id="h-title" name="hero_title" value="${esc(hero.title || '')}" required>
            
            <label for="h-sub">Subtitle Description</label>
            <textarea id="h-sub" name="hero_subtitle" rows="3" required>${esc(hero.subtitle || '')}</textarea>
          </div>
          <div>
            <label for="h-cta">Primary CTA Text</label>
            <input id="h-cta" name="hero_ctaText" value="${esc(hero.ctaText || 'Explore Collection →')}">
            
            <label for="h-link">Primary CTA Link</label>
            <input id="h-link" name="hero_ctaLink" value="${esc(hero.ctaLink || '#shop')}">

            <label for="h-img">Hero Image Path or Cloudinary URL</label>
            <input id="h-img" name="hero_bannerImage" value="${esc(hero.bannerImage || '/images/hero-aquarium.jpg')}">
          </div>
        </div>

        <h3 style="margin-top:24px;margin-bottom:16px;">Why Choose Us Section</h3>
        <label for="w-title">Section Heading</label>
        <input id="w-title" name="why_title" value="${esc(why.title || 'Why Choose Us')}" style="max-width:400px;margin-bottom:16px;">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          ${(why.cards || []).map((c, i) => `
            <div style="background:var(--canvas-alt);padding:16px;border-radius:var(--radius-sm);border:1px solid var(--line);">
              <strong>Card ${i + 1}</strong>
              <div style="display:flex;gap:10px;margin-top:8px;">
                <input name="why_card_${i}_icon" value="${esc(c.icon || '🌿')}" style="width:50px;">
                <input name="why_card_${i}_title" value="${esc(c.title || '')}" style="flex:1;">
              </div>
              <textarea name="why_card_${i}_desc" rows="2" style="margin-top:8px;">${esc(c.description || '')}</textarea>
            </div>
          `).join('')}
        </div>

        <button class="btn-pill" style="margin-top:24px;padding:12px 30px;">Save Homepage Settings</button>
      </form>
    `;
  },

  /* 7. Media Library */
  async media() {
    const list = await api('/media');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">ASSET MANAGEMENT</span>
          <h1 style="font-size:2rem;margin:0">Banners &amp; Media Library</h1>
        </div>
      </div>

      <!-- Drag & Drop Uploader -->
      <div class="upload-dropzone" style="margin-bottom:28px;">
        <span style="font-size:2.5rem">📸</span>
        <h3 style="margin:8px 0;">Upload Botanical Photos &amp; Banners</h3>
        <p class="muted">Supports JPEG, PNG, WebP, GIF up to 5MB.</p>
        <input type="file" id="media-file-input" multiple accept="image/*" style="margin-top:12px;">
        <div style="margin-top:10px;">
          <button class="btn-pill sm" data-a="uploadMedia">Upload Selected Files</button>
        </div>
      </div>

      <div class="gallery-preview-grid">
        ${list.map(f => `
          <div class="gallery-preview-item" style="aspect-ratio:1;">
            <img src="${esc(f.url)}" alt="${esc(f.filename)}">
            <button class="gallery-preview-remove" data-a="copyUrl" data-v="${esc(f.url)}" title="Copy URL">📋</button>
          </div>
        `).join('')}
      </div>
    `;
  },

  /* 8. Customers Directory */
  async customers() {
    const list = await api('/customers');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">CLIENT DATABASE</span>
          <h1 style="font-size:2rem;margin:0">Registered Customers (${list.length})</h1>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Total Orders</th><th>Total Spend</th><th>Status</th></tr></thead>
          <tbody>
            ${list.map(c => `
              <tr>
                <td><strong>${esc(c.name)}</strong></td>
                <td>${esc(c.email)}</td>
                <td>${esc(c.phone || '—')}</td>
                <td>${c.orderCount} orders</td>
                <td style="font-weight:700;">${money(c.totalSpent)}</td>
                <td>${c.active ? '<span class="badge" style="background:#eaf2ec;color:#204c32;">Active</span>' : '<span class="badge" style="background:#fee2e2;color:#b91c1c;">Disabled</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 9. Customer Inquiries */
  async inquiries() {
    const q = await api('/inquiries');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">SUPPORT INBOX</span>
          <h1 style="font-size:2rem;margin:0">Care Consultations (${q.length})</h1>
        </div>
      </div>

      ${q.length ? q.map(x => `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:20px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div>
              <strong>${esc(x.name)}</strong> &nbsp;·&nbsp;
              <a href="mailto:${esc(x.email)}" style="color:var(--moss)">${esc(x.email)}</a>
              ${x.phone ? ` &nbsp;·&nbsp; <span>${esc(x.phone)}</span>` : ''}
              <span class="badge" style="margin-left:8px;background:${x.done ? '#eaf2ec' : '#fef3c7'}">${x.done ? 'Resolved' : 'Open'}</span>
            </div>
            <span class="muted" style="font-size:0.8rem">${when(x.date)}</span>
          </div>
          <p style="color:var(--ink-secondary);margin:10px 0;line-height:1.5;">${esc(x.message)}</p>
          <div style="display:flex;gap:10px;margin-top:12px;">
            ${!x.done ? `<button class="btn-pill sm" data-a="resolveInquiry" data-id="${x.id}">Mark Resolved</button>` : ''}
            <a class="btn-pill sm outline" href="mailto:${esc(x.email)}?subject=Pairaplants Care Consultation Reply">Email Response</a>
          </div>
        </div>
      `).join('') : '<p class="muted">No consultation requests logged.</p>'}
    `;
  },

  /* 10. Coupons */
  async coupons() {
    const list = await api('/coupons');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">PROMOTIONS</span>
          <h1 style="font-size:2rem;margin:0">Discount Coupons</h1>
        </div>
      </div>

      <div class="two-col" style="padding:0;align-items:start;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Uses</th><th>Actions</th></tr></thead>
            <tbody>
              ${list.map(c => `
                <tr>
                  <td><strong><code>${esc(c.code)}</code></strong></td>
                  <td>${c.discountType === 'percent' ? `${c.discountValue}%` : money(c.discountValue)}</td>
                  <td>${money(c.minOrder)}</td>
                  <td>${c.usageCount || 0}</td>
                  <td><button class="btn-pill sm outline" data-a="delCoupon" data-id="${c.id}" style="color:var(--terracotta);">Delete</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <form data-f="addCoupon" style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;">
          <h3>Create Coupon</h3>
          <label for="cp-c">Coupon Code</label>
          <input id="cp-c" name="code" required placeholder="e.g. MONSOON20" style="text-transform:uppercase;">
          <label for="cp-t">Discount Type</label>
          <select id="cp-t" name="discountType">
            <option value="percent">Percentage (%)</option>
            <option value="fixed">Fixed Amount (₹)</option>
          </select>
          <label for="cp-v">Discount Value</label>
          <input id="cp-v" name="discountValue" type="number" required placeholder="e.g. 10 or 150">
          <label for="cp-m">Minimum Cart Total (₹)</label>
          <input id="cp-m" name="minOrder" type="number" value="0">
          <button class="btn-pill" style="width:100%;margin-top:16px;">Create Coupon</button>
        </form>
      </div>
    `;
  },

  /* 11. SEO Settings */
  async seo() {
    const set = (storeSettings && storeSettings.seo) || {};
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">SEARCH ENGINE OPTIMIZATION</span>
          <h1 style="font-size:2rem;margin:0">SEO &amp; Indexing</h1>
        </div>
      </div>

      <form data-f="saveSeo" style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:32px;max-width:800px;">
        <label for="seo-t">Meta Title</label>
        <input id="seo-t" name="metaTitle" value="${esc(set.metaTitle || '')}" required>

        <label for="seo-d">Meta Description</label>
        <textarea id="seo-d" name="metaDescription" rows="3" required>${esc(set.metaDescription || '')}</textarea>

        <label for="seo-og">Social Sharing Open Graph Image</label>
        <input id="seo-og" name="ogImage" value="${esc(set.ogImage || '/images/hero-aquarium.jpg')}">

        <label for="seo-u">Canonical URL</label>
        <input id="seo-u" name="canonicalUrl" value="${esc(set.canonicalUrl || 'https://pairaplants.vercel.app')}">

        <div style="margin:20px 0;padding:16px;background:var(--canvas-alt);border-radius:var(--radius-sm);border:1px solid var(--line);">
          <strong>Public Bot Endpoints:</strong>
          <div style="margin-top:6px;font-size:0.88rem;">
            🗺️ <a href="/sitemap.xml" target="_blank" style="color:var(--moss);">/sitemap.xml (Dynamic Product XML Sitemap)</a><br>
            🤖 <a href="/robots.txt" target="_blank" style="color:var(--moss);">/robots.txt (Crawler Directive)</a>
          </div>
        </div>

        <button class="btn-pill">Save SEO Settings</button>
      </form>
    `;
  },

  /* 12. Reports & Analytics */
  async reports() {
    const r = await api('/reports/overview');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">BUSINESS INTELLIGENCE</span>
          <h1 style="font-size:2rem;margin:0">Reports &amp; Analytics</h1>
        </div>
        <a class="btn-pill sm outline" href="/api/reports/orders/export" target="_blank">Export Orders CSV</a>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-title">Gross Revenue</span><div class="kpi-value">${money(r.totalRevenue)}</div></div>
        <div class="kpi-card"><span class="kpi-title">Total Orders</span><div class="kpi-value">${r.totalOrders}</div></div>
        <div class="kpi-card"><span class="kpi-title">Delivered Orders</span><div class="kpi-value">${r.deliveredOrders}</div></div>
        <div class="kpi-card"><span class="kpi-title">Fulfillment Ratio</span><div class="kpi-value">${r.totalOrders ? Math.round((r.deliveredOrders / r.totalOrders) * 100) : 100}%</div></div>
      </div>
    `;
  },

  /* 13. Staff Accounts */
  async staff() {
    const users = await api('/users');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">PERMISSIONS</span>
          <h1 style="font-size:2rem;margin:0">Staff Management</h1>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Access Status</th><th>Action</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td><strong>${esc(u.name)}</strong></td>
                <td><code>${esc(u.username)}</code></td>
                <td><span class="badge">${ROLE_NAMES[u.role] || u.role}</span></td>
                <td>${u.active ? '<span style="color:#15803d;font-weight:600;">Active</span>' : '<span style="color:#b91c1c;font-weight:600;">Disabled</span>'}</td>
                <td>
                  ${u.id !== staffUser.id ? `
                    <button class="btn-pill sm outline" data-a="toggleStaff" data-id="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? 'Disable' : 'Enable'}</button>
                  ` : '<span class="badge">You</span>'}
                  <button class="btn-pill sm outline" data-a="resetStaffPw" data-id="${u.id}">Reset Password</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <form data-f="createStaff" style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;margin-top:24px;max-width:600px;">
        <h3>Create New Staff Account</h3>
        <label for="st-n">Full Name</label>
        <input id="st-n" name="name" required placeholder="e.g. Priya Iyer">
        <label for="st-u">Username</label>
        <input id="st-u" name="username" required pattern="[a-z0-9_]{3,20}" placeholder="e.g. priya">
        <label for="st-p">Password</label>
        <input id="st-p" name="password" type="password" minlength="8" required placeholder="Minimum 8 characters">
        <label for="st-r">Staff Role</label>
        <select id="st-r" name="role">
          <option value="manager">Manager (Inventory &amp; Orders)</option>
          <option value="support">Customer Support (Inquiries &amp; Lookups)</option>
          <option value="superadmin">Super Admin (Full Website Control)</option>
        </select>
        <button class="btn-pill" style="margin-top:16px;">Create Staff User</button>
      </form>
    `;
  },

  /* 14. Website Settings */
  async settings() {
    const s = storeSettings || {};
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">GENERAL CONFIGURATION</span>
          <h1 style="font-size:2rem;margin:0">Website Settings</h1>
        </div>
      </div>

      <form data-f="saveSettings" style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:32px;max-width:700px;">
        <label for="s-sn">Store Name</label>
        <input id="s-sn" name="storeName" value="${esc(s.storeName || 'Pairaplants')}" required>

        <label for="s-bt">Brand Title</label>
        <input id="s-bt" name="brandTitle" value="${esc(s.brandTitle || 'Paira Plants')}" required>

        <label for="s-tl">Tagline</label>
        <input id="s-tl" name="tagline" value="${esc(s.tagline || 'Aquatic Plants, Fishes & Gravels')}">

        <label for="s-e">Support Email</label>
        <input id="s-e" name="email" type="email" value="${esc(s.email || 'care@pairaplants.com')}" required>

        <label for="s-p">Support Phone</label>
        <input id="s-p" name="phone" value="${esc(s.phone || '+91 98765 43210')}" required>

        <label for="s-w">WhatsApp Hotline (Numbers only, e.g. 919876543210)</label>
        <input id="s-w" name="whatsappNumber" value="${esc(s.whatsappNumber || '919876543210')}">

        <label for="s-a">Store Address</label>
        <textarea id="s-a" name="address" rows="2">${esc(s.address || '')}</textarea>

        <button class="btn-pill" style="margin-top:20px;">Save Store Settings</button>
      </form>
    `;
  },

  /* 15. Security & Backups */
  async backups() {
    const b = await api('/backups');
    const logs = await api('/logs');

    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">DATA PROTECTION</span>
          <h1 style="font-size:2rem;margin:0">Security &amp; Backups</h1>
        </div>
        <button class="btn-pill sm" data-a="createBackup">Snapshot Now</button>
      </div>

      <div class="table-wrap" style="margin-bottom:32px;">
        <table>
          <thead><tr><th>Snapshot File</th><th>Archive Size</th><th>Action</th></tr></thead>
          <tbody>
            ${b.map(x => `
              <tr>
                <td><strong><code>${esc(x.file)}</code></strong></td>
                <td>${(x.size / 1024).toFixed(1)} KB</td>
                <td><button class="btn-pill sm outline" data-a="restoreBackup" data-f="${esc(x.file)}">Restore</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;">
        <h3 style="margin-bottom:12px;">Administrative Audit Trail</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Timestamp</th><th>User</th><th>Action Performed</th><th>Client IP</th></tr></thead>
            <tbody>
              ${logs.slice(0, 30).map(l => `
                <tr>
                  <td>${when(l.t)}</td>
                  <td><strong>${esc(l.user)}</strong></td>
                  <td>${esc(l.action)}</td>
                  <td><code>${esc(l.ip || '—')}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
};

/* ==============================================================================
   PRODUCT DETAIL MODAL / QUICK VIEW
   ============================================================================== */
async function showProductDetailModal(id) {
  const p = await api(`/products/${id}`);
  const images = (p.images && p.images.length) ? p.images : [p.image || '/images/hero-aquarium.jpg'];
  const specs = p.specifications || {};
  const reviews = p.reviews || [];
  const related = p.related || [];
  const isWished = inWishlist(p.id);

  const html = `
    <div class="modal-card" style="max-width:960px;">
      <div class="modal-head">
        <h3>${esc(p.name)}</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="product-detail-layout">
          <!-- Image Gallery Viewer -->
          <div>
            <div class="gallery-main-viewport" id="modal-gallery-viewport">
              <img src="${esc(images[0])}" alt="${esc(p.name)}" id="modal-main-img">
            </div>
            ${images.length > 1 ? `
              <div class="gallery-thumbs-row">
                ${images.map((img, i) => `
                  <button class="gallery-thumb-btn ${i === 0 ? 'active' : ''}" data-a="selectThumb" data-src="${esc(img)}">
                    <img src="${esc(img)}" alt="Thumbnail ${i + 1}">
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Product Details & Actions -->
          <div>
            <span class="tag-subcat">${esc(p.subcategory || p.category)}</span>
            <h1 style="font-size:1.8rem;margin:8px 0;">${esc(p.name)}</h1>
            
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="font-size:1.4rem;font-weight:700;color:var(--forest-primary)">
                ${p.salePrice ? `<span style="color:var(--terracotta)">${money(p.salePrice)}</span> <del class="muted" style="font-size:0.9rem">${money(p.price)}</del>` : money(p.price)}
              </div>
              ${stockBadge(p)}
            </div>

            <p style="color:var(--ink-secondary);line-height:1.6;margin-bottom:16px;">${esc(p.description || '')}</p>

            <table class="spec-table">
              <tbody>
                <tr><td>SKU Code</td><td><code>${esc(p.sku || `PP-${p.id}`)}</code></td></tr>
                ${Object.entries(specs).map(([k, v]) => `
                  <tr><td>${esc(k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()))}</td><td>${esc(v)}</td></tr>
                `).join('')}
              </tbody>
            </table>

            <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;">
              <button class="btn-pill" data-a="add" data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
                ${p.stock <= 0 ? 'Out of Stock' : 'Add to Bag'}
              </button>
              <a class="btn-whatsapp" href="https://wa.me/919876543210?text=${encodeURIComponent(`Hello Pairaplants! I would like to order ${p.name} (SKU: ${p.sku || p.id}).`)}" target="_blank">Order via WhatsApp</a>
              <button class="btn-pill outline" data-a="toggleWishlist" data-id="${p.id}">
                ${isWished ? '❤️ Saved' : '🤍 Wishlist'}
              </button>
            </div>
          </div>
        </div>

        <!-- Reviews & Ratings Section -->
        <div style="margin-top:36px;border-top:1px solid var(--line);padding-top:24px;">
          <h3>Customer Reviews (${reviews.length})</h3>
          ${reviews.length ? reviews.map(r => `
            <div style="background:var(--canvas-alt);padding:14px 18px;border-radius:var(--radius-sm);margin-top:10px;">
              <div style="display:flex;justify-content:space-between;">
                <strong>${esc(r.customerName)}</strong>
                <span style="color:var(--gold)">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
              </div>
              <div style="font-weight:600;font-size:0.9rem;margin:4px 0;">${esc(r.title || '')}</div>
              <p style="font-size:0.85rem;color:var(--ink-secondary);margin:0;">${esc(r.comment)}</p>
            </div>
          `).join('') : '<p class="muted" style="margin-top:8px;">No reviews yet. Be the first to share your experience!</p>'}

          <!-- Add Review Form -->
          <form data-f="submitReview" data-id="${p.id}" style="margin-top:20px;background:var(--surface-card);padding:20px;border-radius:var(--radius-sm);">
            <h4>Write a Botanical Review</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
              <input name="name" required placeholder="Your Name">
              <select name="rating">
                <option value="5">★★★★★ (5 Stars - Exceptional)</option>
                <option value="4">★★★★☆ (4 Stars - Great)</option>
                <option value="3">★★★☆☆ (3 Stars - Average)</option>
              </select>
            </div>
            <input name="title" placeholder="Review Title" style="margin-top:8px;">
            <textarea name="comment" rows="2" required placeholder="Share details about plant health, packing, or fish coloration..." style="margin-top:8px;"></textarea>
            <button class="btn-pill sm" style="margin-top:10px;">Submit Review</button>
          </form>
        </div>
      </div>
    </div>
  `;
  openModal(html);
}

/* ==============================================================================
   ADD / EDIT PRODUCT MODAL
   ============================================================================== */
function showProductFormModal(p = null) {
  const isEdit = !!p;
  const images = p && p.images ? p.images : (p && p.image ? [p.image] : []);

  const html = `
    <div class="modal-card" style="max-width:850px;">
      <div class="modal-head">
        <h3>${isEdit ? 'Edit Product: ' + esc(p.name) : 'Add New Product to Catalog'}</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <form data-f="saveProduct" data-id="${isEdit ? p.id : ''}">
          <div class="two-col" style="padding:0;">
            <div>
              <label for="p-n">Product Name</label>
              <input id="p-n" name="name" required value="${isEdit ? esc(p.name) : ''}" placeholder="e.g. Bucephalandra Kedagang">

              <label for="p-c">Category</label>
              <select id="p-c" name="category">
                ${CATS.map(c => `<option ${isEdit && p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>

              <label for="p-sc">Subcategory</label>
              <input id="p-sc" name="subcategory" value="${isEdit ? esc(p.subcategory || '') : ''}" placeholder="e.g. Ferns & Mosses">

              <label for="p-sku">SKU Code</label>
              <input id="p-sku" name="sku" value="${isEdit ? esc(p.sku || '') : ''}" placeholder="e.g. PP-PLT-087">

              <label for="p-d">Description</label>
              <textarea id="p-d" name="description" rows="3">${isEdit ? esc(p.description || '') : ''}</textarea>
            </div>

            <div>
              <label for="p-pr">Regular Price (₹)</label>
              <input id="p-pr" name="price" type="number" min="0" step="any" required value="${isEdit ? p.price : ''}" placeholder="250">

              <label for="p-sp">Sale Price (₹, optional)</label>
              <input id="p-sp" name="salePrice" type="number" min="0" step="any" value="${isEdit && p.salePrice ? p.salePrice : ''}" placeholder="Leave blank if not on sale">

              <label for="p-st">Stock Quantity</label>
              <input id="p-st" name="stock" type="number" min="0" required value="${isEdit ? p.stock : 10}">

              <label for="p-th">Low Stock Threshold</label>
              <input id="p-th" name="lowStockThreshold" type="number" min="0" value="${isEdit ? p.lowStockThreshold : 5}">

              <div style="margin-top:16px;display:flex;gap:16px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" name="isFeatured" ${isEdit && p.isFeatured ? 'checked' : ''}>
                  <span>Featured on Home</span>
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" name="isVisible" ${!isEdit || p.isVisible !== false ? 'checked' : ''}>
                  <span>Visible in Store</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Multi-Image Upload Section -->
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line);">
            <h4>Product Images &amp; Gallery</h4>
            <p class="muted" style="font-size:0.8rem;">Upload multiple images. First image will be set as primary.</p>
            
            <div style="display:flex;gap:10px;margin-top:8px;">
              <input type="file" id="prod-file-input" multiple accept="image/*">
              <button type="button" class="btn-pill sm outline" data-a="uploadProdImages">Upload Files</button>
            </div>

            <div class="gallery-preview-grid" id="modal-prod-gallery">
              ${images.map((img, i) => `
                <div class="gallery-preview-item" data-url="${esc(img)}">
                  <img src="${esc(img)}" alt="Product Image">
                  ${i === 0 ? '<span class="gallery-main-badge">Primary</span>' : ''}
                  <button type="button" class="gallery-preview-remove" data-a="removeImgFromList">&times;</button>
                </div>
              `).join('')}
            </div>
            <input type="hidden" name="images_json" id="images_json_input" value="${esc(JSON.stringify(images))}">
          </div>

          <div class="modal-footer" style="margin-top:24px;padding:0;background:none;border:none;">
            <button type="button" class="btn-pill sm outline" data-a="closeModal">Cancel</button>
            <button type="submit" class="btn-pill sm">${isEdit ? 'Update Product' : 'Add to Catalog'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
  openModal(html);
}

/* ==============================================================================
   EVENT DISPATCHER & EVENT DELEGATION
   ============================================================================== */
const actions = {
  browse(btn) {
    filter = btn.dataset.v;
    subfilter = 'All';
    search = '';
    location.hash = '#shop';
  },
  filter(btn) {
    filter = btn.dataset.v;
    subfilter = 'All';
    return render();
  },
  subfilter(btn) {
    subfilter = btn.dataset.v;
    return render();
  },
  clearFilters() {
    filter = 'All';
    subfilter = 'All';
    search = '';
    return render();
  },
  add(btn) {
    const p = findProduct(btn.dataset.id);
    if (!p) return;
    if (p.stock <= 0) {
      return toast(`${p.name} is currently out of stock.`, 'error');
    }
    if ((cart[p.id] || 0) >= p.stock) {
      return toast(`All ${p.stock} units of ${p.name} are in your cart.`, 'error');
    }
    cart[p.id] = (cart[p.id] || 0) + 1;
    saveCart();
    updateHeaderNav();
    toast(`${p.name} added to cart!`);

    // Subtle feedback animation on button
    const origHtml = btn.innerHTML;
    btn.classList.add('added');
    btn.innerHTML = '<span>Added ✓</span>';
    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML = origHtml;
    }, 1400);
  },
  remove(btn) {
    delete cart[btn.dataset.id];
    saveCart();
    return render();
  },
  async applyCoupon() {
    const input = $('#coupon-code-input');
    if (!input || !input.value.trim()) return toast('Please enter a coupon code.', 'error');
    try {
      const res = await api('/coupons/validate', 'POST', {
        code: input.value.trim(),
        subtotal: cartSubtotal()
      });
      appliedCoupon = res;
      toast(`Coupon ${res.code} applied! Saved ${money(res.discount)}`);
      return render();
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  removeCoupon() {
    appliedCoupon = null;
    toast('Coupon removed.');
    return render();
  },
  toggleWishlist(btn) {
    const pid = +btn.dataset.id;
    if (!pid) return;
    const idx = localWishlist.indexOf(pid);
    if (idx >= 0) {
      localWishlist.splice(idx, 1);
      toast('Item removed from wishlist');
    } else {
      localWishlist.push(pid);
      toast('Item saved to wishlist! ❤️');
    }
    saveWishlist();
    return render();
  },
  viewProduct(btn) {
    const id = btn.dataset.id;
    if (id) showProductDetailModal(id);
  },
  closeModal() {
    closeModal();
  },
  selectThumb(btn) {
    const src = btn.dataset.src;
    const main = $('#modal-main-img');
    if (main && src) main.src = src;
    $$('.gallery-thumb-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  },
  adminNav(btn) {
    adminTab = btn.dataset.v;
    return render();
  },
  openAddProductModal() {
    showProductFormModal();
  },
  async editProduct(btn) {
    const p = findProduct(btn.dataset.id);
    if (p) showProductFormModal(p);
  },
  async delProduct(btn) {
    if (confirm('Are you sure you want to delete this product from the master catalog?')) {
      await api(`/products/${btn.dataset.id}`, 'DELETE');
      toast('Product deleted.');
      await loadProducts();
      return render();
    }
  },
  async invDelta(btn) {
    const id = +btn.dataset.id;
    const delta = +btn.dataset.v;
    try {
      await api('/inventory/adjust', 'POST', { productId: id, change: delta, reason: 'Quick adjustment in admin' });
      toast('Inventory updated');
      await loadProducts();
      return render();
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  async cancelOrder(btn) {
    const reason = prompt('Please enter the mandatory cancellation reason (stock will be restored):');
    if (reason) {
      try {
        await api(`/orders/${btn.dataset.id}/cancel`, 'POST', { reason });
        toast('Order cancelled and stock restored to inventory!');
        return render();
      } catch (e) {
        toast(e.message, 'error');
      }
    }
  },
  async createBackup() {
    const r = await api('/backups', 'POST');
    toast(`Backup created: ${r.file}`);
    return render();
  },
  async restoreBackup(btn) {
    if (confirm(`Restore database from snapshot ${btn.dataset.f}? Current unsaved modifications will be replaced.`)) {
      await api('/backups/restore', 'POST', { file: btn.dataset.f });
      toast('Database restored successfully!');
      await loadProducts();
      return render();
    }
  },
  async toggleStaff(btn) {
    await api(`/users/${btn.dataset.id}`, 'PATCH', { active: btn.dataset.v === '1' });
    toast('Staff account status updated');
    return render();
  },
  async resetStaffPw(btn) {
    const pw = prompt('Enter new password for staff account (8+ characters):');
    if (pw) {
      await api(`/users/${btn.dataset.id}`, 'PATCH', { password: pw });
      toast('Password reset successfully');
    }
  },
  async delCoupon(btn) {
    if (confirm('Delete this coupon code?')) {
      await api(`/coupons/${btn.dataset.id}`, 'DELETE');
      toast('Coupon deleted');
      return render();
    }
  },
  async resolveInquiry(btn) {
    await api(`/inquiries/${btn.dataset.id}`, 'PATCH', { done: true, status: 'resolved' });
    toast('Inquiry marked resolved');
    return render();
  },
  async uploadMedia() {
    const input = $('#media-file-input');
    if (!input || !input.files.length) return toast('Please select image files to upload.', 'error');
    const fd = new FormData();
    for (const f of input.files) fd.append('images', f);
    try {
      const res = await api('/upload', 'POST', fd, true);
      toast(`Uploaded ${res.urls.length} files successfully!`);
      return render();
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  async uploadProdImages() {
    const input = $('#prod-file-input');
    if (!input || !input.files.length) return toast('Select image files first.', 'error');
    const fd = new FormData();
    for (const f of input.files) fd.append('images', f);
    try {
      const res = await api('/upload', 'POST', fd, true);
      const hidden = $('#images_json_input');
      let cur = [];
      try { cur = JSON.parse(hidden.value || '[]'); } catch (e) {}
      cur = [...cur, ...res.urls];
      hidden.value = JSON.stringify(cur);

      const gallery = $('#modal-prod-gallery');
      if (gallery) {
        gallery.innerHTML = cur.map((img, i) => `
          <div class="gallery-preview-item" data-url="${esc(img)}">
            <img src="${esc(img)}" alt="Product Image">
            ${i === 0 ? '<span class="gallery-main-badge">Primary</span>' : ''}
            <button type="button" class="gallery-preview-remove" data-a="removeImgFromList">&times;</button>
          </div>
        `).join('');
      }
      toast('Images uploaded!');
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  removeImgFromList(btn) {
    const item = btn.closest('.gallery-preview-item');
    if (!item) return;
    const url = item.dataset.url;
    item.remove();
    const hidden = $('#images_json_input');
    if (hidden) {
      try {
        let cur = JSON.parse(hidden.value || '[]');
        cur = cur.filter(u => u !== url);
        hidden.value = JSON.stringify(cur);
      } catch (e) {}
    }
  },
  copyUrl(btn) {
    navigator.clipboard.writeText(location.origin + btn.dataset.v);
    toast('Image URL copied to clipboard!');
  },
  async staffLogout() {
    await api('/logout', 'POST');
    staffUser = null;
    toast('Signed out from staff portal');
    location.hash = '#home';
    return render();
  },
  async customerLogout() {
    await api('/customer/logout', 'POST');
    customerUser = null;
    toast('Signed out of customer account');
    location.hash = '#home';
    return render();
  }
};

/* ---------- Change Handlers ---------- */
const changes = {
  qty(el) {
    const p = findProduct(el.dataset.id);
    const v = Math.min(+el.value || 0, p ? p.stock : 0);
    if (v > 0) cart[p.id] = v;
    else delete cart[p.id];
    saveCart();
    return render();
  },
  async stockOverride(el) {
    const val = +el.value;
    await api(`/products/${el.dataset.id}/stock`, 'PATCH', { stock: val, reason: 'Manual override in admin' });
    toast('Stock updated');
    await loadProducts();
  },
  async orderStatus(el) {
    await api(`/orders/${el.dataset.id}`, 'PATCH', { status: el.value });
    toast(`Order status set to ${el.value}`);
  }
};

/* ---------- Form Submissions ---------- */
const forms = {
  async staffLogin(d) {
    staffUser = await api('/login', 'POST', d);
    toast(`Welcome, ${staffUser.name}!`);
    return render();
  },
  async customerLogin(d) {
    customerUser = await api('/customer/login', 'POST', d);
    toast(`Welcome back, ${customerUser.name}!`);
    return render();
  },
  async customerRegister(d) {
    customerUser = await api('/customer/register', 'POST', d);
    toast('Account created successfully!');
    return render();
  },
  async order(d) {
    const subtotal = cartSubtotal();
    const payload = {
      ...d,
      coupon: appliedCoupon ? appliedCoupon.code : null,
      items: Object.entries(cart).map(([id, qty]) => ({ id: +id, qty }))
    };
    const res = await api('/orders', 'POST', payload);
    lastOrder = res;
    cart = {};
    appliedCoupon = null;
    saveCart();
    updateHeaderNav();
    location.hash = '#confirmed';
    toast('Order placed successfully! Live dispatch in progress.');
  },
  async contact(d, f) {
    await api('/inquiries', 'POST', d);
    f.reset();
    toast('Inquiry submitted! Our care specialists will email you shortly.');
  },
  async newsletter(d, f) {
    const res = await api('/newsletter', 'POST', d);
    f.reset();
    toast(res.message);
  },
  async saveProduct(d, f) {
    const id = f.dataset.id;
    let images = [];
    try { images = JSON.parse(d.images_json || '[]'); } catch (e) {}

    const payload = {
      name: d.name,
      category: d.category,
      subcategory: d.subcategory,
      price: +d.price,
      salePrice: d.salePrice ? +d.salePrice : null,
      stock: +d.stock,
      lowStockThreshold: +d.lowStockThreshold || 5,
      sku: d.sku,
      description: d.description,
      isFeatured: !!d.isFeatured,
      isVisible: !!d.isVisible,
      images,
      image: images[0] || '/images/hero-aquarium.jpg'
    };

    if (id) {
      await api(`/products/${id}`, 'PUT', payload);
      toast('Product updated successfully!');
    } else {
      await api('/products', 'POST', payload);
      toast('Product added to catalog!');
    }
    closeModal();
    await loadProducts();
    return render();
  },
  async addCoupon(d, f) {
    await api('/coupons', 'POST', {
      code: d.code,
      discountType: d.discountType,
      discountValue: +d.discountValue,
      minOrder: +d.minOrder || 0
    });
    f.reset();
    toast('Coupon created!');
    return render();
  },
  async createStaff(d, f) {
    await api('/users', 'POST', d);
    f.reset();
    toast('Staff account created!');
    return render();
  },
  async saveHomepage(d) {
    const payload = {
      hero: {
        title: d.hero_title,
        subtitle: d.hero_subtitle,
        ctaText: d.hero_ctaText,
        ctaLink: d.hero_ctaLink,
        bannerImage: d.hero_bannerImage
      },
      whyChooseUs: {
        title: d.why_title,
        cards: [0, 1, 2, 3].map(i => ({
          icon: d[`why_card_${i}_icon`] || '🌿',
          title: d[`why_card_${i}_title`] || '',
          description: d[`why_card_${i}_desc`] || ''
        }))
      }
    };
    await api('/homepage', 'PUT', payload);
    homepageConfig = await api('/homepage');
    toast('Homepage CMS updated successfully!');
    return render();
  },
  async saveSeo(d) {
    await api('/settings', 'PUT', { seo: d });
    storeSettings = await api('/settings');
    toast('SEO settings updated!');
    return render();
  },
  async saveSettings(d) {
    await api('/settings', 'PUT', d);
    storeSettings = await api('/settings');
    toast('Website settings updated!');
    return render();
  },
  async submitReview(d, f) {
    const id = f.dataset.id;
    await api(`/products/${id}/reviews`, 'POST', d);
    toast('Thank you for your review!');
    showProductDetailModal(id);
  }
};

/* ---------- Safe Event Execution Wrapper ---------- */
const safe = fn => async (...args) => {
  try {
    await fn(...args);
  } catch (e) {
    toast(e.message, 'error');
    if (/sign in/i.test(e.message) && staffUser) {
      staffUser = null;
      render();
    }
  }
};

/* ---------- Global Click Listener ---------- */
document.addEventListener('click', safe(async e => {
  const btn = e.target.closest('[data-a]');
  if (btn) {
    const act = btn.dataset.a;
    if (actions[act]) await actions[act](btn);
  }
}));

/* ---------- Global Change Listener ---------- */
document.addEventListener('change', safe(async e => {
  const ch = e.target.dataset.c;
  if (ch && changes[ch]) await changes[ch](e.target);
}));

/* ---------- Global Form Submit Listener ---------- */
document.addEventListener('submit', safe(async e => {
  const formName = e.target.dataset.f;
  if (formName && forms[formName]) {
    e.preventDefault();
    await forms[formName](Object.fromEntries(new FormData(e.target)), e.target);
  }
}));

/* ---------- Live Search Inputs ---------- */
document.addEventListener('input', e => {
  if (e.target.dataset.i === 'search') {
    search = e.target.value;
    const grid = $('#shop-grid');
    if (grid) grid.innerHTML = renderProductCards(getFilteredProducts());
  } else if (e.target.dataset.i === 'admin-prod-search') {
    const q = e.target.value.toLowerCase().trim();
    $$('#admin-prod-tbody tr').forEach(tr => {
      tr.style.display = (!q || tr.dataset.name.includes(q) || tr.dataset.cat.includes(q)) ? '' : 'none';
    });
  } else if (e.target.dataset.i === 'admin-inv-search') {
    const q = e.target.value.toLowerCase().trim();
    $$('#admin-inv-tbody tr').forEach(tr => {
      tr.style.display = (!q || tr.dataset.name.includes(q) || tr.dataset.cat.includes(q)) ? '' : 'none';
    });
  }
});

/* ---------- Header Navigation Updater ---------- */
function updateHeaderNav() {
  const hash = location.hash.slice(1).split('?')[0];
  const r = pages[hash] ? hash : 'home';
  const navMap = { home: 'Home', story: 'Our Story', shop: 'Shop', cart: 'Cart', contact: 'Contact Us' };

  $('#nav').innerHTML = Object.entries(navMap).map(([k, v]) => `
    <a href="#${k}" ${k == r ? 'aria-current="page"' : ''}>
      ${v}${k == 'cart' && cartCount() ? `<span class="cart-badge">${cartCount()}</span>` : ''}
    </a>
  `).join('');

  const actionsEl = $('#header-user-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      <a class="btn-pill outline sm" href="#account">${customerUser ? 'My Account' : 'Sign In'}</a>
      <a class="btn-pill outline sm staff-btn" href="#staff">${staffUser ? 'Staff Dashboard' : 'Staff Portal'}</a>
    `;
  }
  return r;
}

/* ---------- Page Render Execution ---------- */
async function render() {
  const route = updateHeaderNav();
  try {
    $('#app').innerHTML = await pages[route]();
  } catch (e) {
    $('#app').innerHTML = `<div style="color:var(--terracotta);padding:60px 24px;text-align:center;"><h2>Page Render Error</h2><p>${esc(e.message)}</p></div>`;
  }
}

addEventListener('hashchange', () => render().then(() => scrollTo(0, 0)));

/* ---------- Application Bootstrap ---------- */
(async () => {
  try { await loadStoreMetadata(); } catch (e) {}
  try { await loadProducts(); } catch (e) {}
  try { staffUser = await api('/me'); } catch (e) {}
  try { customerUser = await api('/customer/me'); } catch (e) {}
  render();
})();
