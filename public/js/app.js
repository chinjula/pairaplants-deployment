'use strict';

/* ==============================================================================
   PAIRAPLANTS ENTERPRISE STOREFRONT & ADVANCED ADMIN DASHBOARD
   ============================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => {
  const sym = (storeSettings && (storeSettings.currency_symbol || storeSettings.currencySymbol)) || '₹';
  return sym + Number(n || 0).toLocaleString('en-IN');
};

/* ==============================================================================
   UNIVERSAL WHATSAPP LINK GENERATOR (Requirement 22)
   Template: https://wa.me/{phone}?text={encoded_message}
   Dynamic message: Hi, I am interested in {product_name} (SKU: {sku}) priced at {price}. Please share more details.
   WhatsApp enquiries are customer leads ONLY - NEVER automatically decrease stock or create completed sales.
   ============================================================================== */
function getWhatsAppEnquiryUrl(p) {
  const s = storeSettings || {};
  const phone = (s.whatsapp_number || s.whatsappNumber || s.phone_number || s.phone || '919876543210').replace(/[^0-9]/g, '');
  const sym = s.currency_symbol || s.currencySymbol || '₹';
  const price = p.salePrice || p.price;
  const msg = `Hi, I am interested in ${p.name} (SKU: ${p.sku || 'PP-' + p.id}) priced at ${sym}${price}. Please share more details.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

function getWhatsAppGeneralUrl(text = '') {
  const s = storeSettings || {};
  const phone = (s.whatsapp_number || s.whatsappNumber || s.phone_number || s.phone || '919876543210').replace(/[^0-9]/g, '');
  const bizName = s.business_name || s.brandTitle || s.storeName || 'Pairaplants';
  const msg = text || `Hello ${bizName}! I would like to inquire about your aquatic plants, fishes, and aquarium products.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
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

const ROLE_NAMES = {
  superadmin: 'Super Admin',
  manager: 'Manager',
  inventory: 'Inventory Staff',
  sales: 'Sales Staff',
  support: 'Customer Support'
};

// 13 Main Admin Dashboard Modules matching enterprise requirements
const ADMIN_SECTIONS = [
  { id: 'dashboard', name: 'Dashboard', icon: '📊', roles: ['superadmin', 'manager', 'inventory', 'sales'] },
  { id: 'products', name: 'Products', icon: '🌿', roles: ['superadmin', 'manager', 'inventory'] },
  { id: 'categories', name: 'Categories', icon: '📁', roles: ['superadmin', 'manager'] },
  { id: 'suppliers', name: 'Suppliers', icon: '🏭', roles: ['superadmin', 'manager', 'inventory'] },
  { id: 'purchases', name: 'Purchases', icon: '📥', roles: ['superadmin', 'manager', 'inventory'] },
  { id: 'inventory', name: 'Stock Management', icon: '📦', roles: ['superadmin', 'manager', 'inventory', 'sales', 'support'] },
  { id: 'stock-history', name: 'Stock History', icon: '📜', roles: ['superadmin', 'manager', 'inventory'] },
  { id: 'pos', name: 'Sales / POS', icon: '💳', roles: ['superadmin', 'manager', 'sales'] },
  { id: 'customers', name: 'Customers', icon: '👥', roles: ['superadmin', 'manager', 'sales', 'support'] },
  { id: 'orders', name: 'Website Orders', icon: '🛍️', roles: ['superadmin', 'manager', 'sales', 'support'] },
  { id: 'payments', name: 'Payments', icon: '💰', roles: ['superadmin', 'manager', 'sales'] },
  { id: 'invoices', name: 'Invoices', icon: '🧾', roles: ['superadmin', 'manager', 'sales', 'inventory'] },
  { id: 'reports', name: 'Reports', icon: '📈', roles: ['superadmin', 'manager'] },
  { id: 'settings', name: 'Settings', icon: '⚙️', roles: ['superadmin'] }
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
let posCart = [];
let posSelectedCustomer = null;
let posCategoryFilter = 'All';
let posSearchQuery = '';
let reportsPeriod = 'all';
let reportsTab = 'current-stock';
let stockHistoryFilter = { product: '', type: 'all', search: '', startDate: '', endDate: '' };
let salesReportFilter = { channel: 'all', paymentMethod: 'all', startDate: '', endDate: '' };
let purchaseReportFilter = { supplierId: '', startDate: '', endDate: '' };
let settingsTab = 'store';
let stockTab = 'all';
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

function applyStoreSettings() {
  const s = storeSettings || {};
  const footerEl = $('#footer-store-contact');
  if (footerEl) {
    const addr = s.address ? esc(s.address).replace(/\n/g, '<br>') : 'Pairaplants Studio &amp; Flora Nursery';
    const email = s.email || 'care@pairaplants.com';
    const phone = s.phone || '+91 98765 43210';
    footerEl.innerHTML = `
      📍 ${addr}<br>
      ✉️ <a href="mailto:${esc(email)}" style="color:inherit;text-decoration:none;">${esc(email)}</a> · 📞 <a href="tel:${esc(phone)}" style="color:inherit;text-decoration:none;">${esc(phone)}</a>
    `;
  }
  const brandTitleEl = $('.logo-title');
  if (brandTitleEl && s.brandTitle) {
    brandTitleEl.innerHTML = esc(s.brandTitle);
  }
  const rawWa = s.whatsapp_number || s.whatsappNumber || s.phone_number || s.phone || '919876543210';
  const waClean = rawWa.replace(/[^0-9]/g, '');
  const waLink = `https://wa.me/${waClean}?text=Hello%20Pairaplants!%20I%20have%20an%20aquarium%20question.`;
  const waBtn = $('#whatsapp-btn-circle');
  if (waBtn) waBtn.href = waLink;
  const waBubble = $('#whatsapp-chat-bubble');
  if (waBubble) waBubble.href = waLink;
}

async function loadStoreMetadata() {
  try {
    homepageConfig = await api('/homepage');
    storeSettings = await api('/settings');
    categories = await api('/categories');
    applyStoreSettings();
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

    const catSubtitle = (p.category && p.subcategory && p.category.toLowerCase() !== p.subcategory.toLowerCase())
      ? `${p.category} • ${p.subcategory}`
      : (p.subcategory || p.category || 'BOTANICAL');

    const stockSubline = isOutOfStock
      ? 'Currently out of stock'
      : (isLowStock ? `Only ${p.stock} left in nursery` : 'In stock & ready to dispatch');

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
            <span class="stock-text">${isOutOfStock ? 'Out of Stock' : (isLowStock ? `Limited Stock (${p.stock} left)` : `In Stock (${p.stock} left)`)}</span>
          </div>

          <button class="wishlist-btn-corner ${isWished ? 'wished' : ''}" 
                  data-a="toggleWishlist" 
                  data-id="${p.id}" 
                  type="button" 
                  aria-label="${isWished ? 'Remove from wishlist' : 'Save to wishlist'}" 
                  title="${isWished ? 'Remove from wishlist' : 'Save to wishlist'}">
            <svg class="heart-icon" viewBox="0 0 24 24" width="18" height="18" fill="${isWished ? '#e11d48' : 'none'}" stroke="${isWished ? '#e11d48' : '#1a1a1a'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>

        <div class="product-meta-header">
          <span class="product-category">${esc(catSubtitle)}</span>
          ${p.labels && p.labels.length ? `<span class="product-label-tag">${esc(p.labels[0])}</span>` : ''}
        </div>

        <h3 class="product-title" data-a="viewProduct" data-id="${p.id}" title="${esc(p.name)}">${esc(p.name)}</h3>
        <p class="product-desc" title="${esc(p.description || '')}">${esc(p.description || '')}</p>

        <div class="product-greenhouse-note">
          ${esc(stockSubline)}
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
            <button class="btn-eye-info" data-a="viewProduct" data-id="${p.id}" type="button" title="Quick View" aria-label="Quick View">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button class="btn-add-bag ${isOutOfStock ? 'disabled' : ''}" 
                    data-a="add" 
                    data-id="${p.id}" 
                    type="button" 
                    ${isOutOfStock ? 'disabled' : ''} 
                    aria-label="${isOutOfStock ? 'Sold Out' : 'Add to Bag'}">
              <svg class="bag-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
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
    const s = storeSettings || {};
    const storeName = s.storeName || 'Pairaplants Studio & Nursery';
    const tagline = s.tagline || 'Aquatic Plants, Fishes & Gravels Hub';
    const addr = s.address ? esc(s.address).replace(/\n/g, '<br>') : `${esc(storeName)}<br><span class="muted" style="font-size:0.85rem">${esc(tagline)}</span>`;
    const email = s.email || 'care@pairaplants.com';
    const phone = s.phone || '+91 98765 43210';
    const wa = s.whatsappNumber || phone;

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
                <strong>${esc(storeName)}</strong>
                <p class="muted" style="font-size:0.85rem">${addr}</p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:14px">
              <span style="font-size:1.4rem">✉️</span>
              <div>
                <strong>Email Consultation</strong>
                <p class="muted" style="font-size:0.85rem"><a href="mailto:${esc(email)}" style="color:inherit;text-decoration:none;">${esc(email)}</a></p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:14px">
              <span style="font-size:1.4rem">💬</span>
              <div>
                <strong>WhatsApp Care Line</strong>
                <p class="muted" style="font-size:0.85rem"><a href="https://wa.me/${esc(wa.replace(/[^0-9]/g, ''))}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${esc(phone)} (10 AM – 7 PM IST)</a></p>
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
    const s = await api('/dashboard/stats');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">REAL-TIME OVERVIEW</span>
          <h1 style="font-size:2rem;margin:0">Admin Dashboard</h1>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-pill sm" data-a="adminNav" data-v="pos">💳 Open POS</button>
          <button class="btn-pill sm outline" data-a="openNewPurchaseModal">📥 Record Purchase</button>
          <button class="btn-pill sm outline" data-a="openStockAdjustModal">⚖️ Adjust Stock</button>
          <button class="btn-pill sm outline" data-a="openAddProductModal">+ New Product</button>
        </div>
      </div>

      <!-- 10 Summary KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-title">Total Products</span>
          <div class="kpi-value">${s.totalProducts || s.productsCount || 0}</div>
          <span class="kpi-subtitle">Catalog botanical items</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Available Stock</span>
          <div class="kpi-value">${s.totalStock || s.totalStockUnits || 0}</div>
          <span class="kpi-subtitle">Total units on hand</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Aquatic Plants</span>
          <div class="kpi-value">${s.plantsStock || s.plantsCount || 0}</div>
          <span class="kpi-subtitle">Flora varieties in stock</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Ornamental Fish</span>
          <div class="kpi-value">${s.fishStock || s.fishCount || 0}</div>
          <span class="kpi-subtitle">Freshwater live species</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Dwarf Shrimps</span>
          <div class="kpi-value">${s.shrimpStock || s.shrimpCount || 0}</div>
          <span class="kpi-subtitle">Cleaners &amp; invertebrates</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Gravels &amp; Substrates</span>
          <div class="kpi-value">${s.gravelsStock || s.gravelCount || 0}</div>
          <span class="kpi-subtitle">Aquascaping materials</span>
        </div>
        <div class="kpi-card ${s.lowStockCount > 0 ? 'alert' : ''}">
          <span class="kpi-title">Low Stock Alerts</span>
          <div class="kpi-value" style="color:var(--terracotta);">${s.lowStockCount || 0}</div>
          <span class="kpi-subtitle">At or below threshold</span>
        </div>
        <div class="kpi-card ${s.outOfStockCount > 0 ? 'alert' : ''}">
          <span class="kpi-title">Out of Stock</span>
          <div class="kpi-value" style="color:#b91c1c;">${s.outOfStockCount || 0}</div>
          <span class="kpi-subtitle">Zero available inventory</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Total Sales Revenue</span>
          <div class="kpi-value" style="color:var(--moss);">${money(s.totalSales || s.totalSalesRevenue || 0)}</div>
          <span class="kpi-subtitle">POS counter &amp; web revenue</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Total Purchases Cost</span>
          <div class="kpi-value">${money(s.totalPurchases || s.totalPurchasesCost || 0)}</div>
          <span class="kpi-subtitle">Supplier stock investments</span>
        </div>
      </div>

      <!-- Action Alerts & Live Panels -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(420px, 1fr));gap:24px;margin-top:24px;">
        
        <!-- Recent Sales -->
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="margin:0;">Recent Sales</h3>
            <button class="btn-pill sm outline" data-a="adminNav" data-v="orders">View Orders ↗</button>
          </div>
          ${(s.recentSales && s.recentSales.length) ? `
            <div class="table-wrap" style="margin:0;">
              <table>
                <thead><tr><th>Ref</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  ${s.recentSales.map(sl => `
                    <tr>
                      <td><code>${esc(sl.invoiceNumber || sl.orderNumber || '#' + sl.id)}</code></td>
                      <td>${esc(sl.customerName || (sl.customer && sl.customer.name) || 'Walk-in Customer')}</td>
                      <td><strong>${money(sl.total || sl.grandTotal || 0)}</strong></td>
                      <td><span class="badge-status ${esc((sl.status || 'completed').toLowerCase())}">${esc(sl.status || 'Completed')}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="muted">No sales recorded yet.</p>'}
        </div>

        <!-- Recent Purchases -->
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="margin:0;">Recent Purchases (Stock In)</h3>
            <button class="btn-pill sm outline" data-a="adminNav" data-v="purchases">View Purchases ↗</button>
          </div>
          ${(s.recentPurchases && s.recentPurchases.length) ? `
            <div class="table-wrap" style="margin:0;">
              <table>
                <thead><tr><th>PO #</th><th>Supplier</th><th>Cost</th><th>Items</th></tr></thead>
                <tbody>
                  ${s.recentPurchases.map(po => `
                    <tr>
                      <td><code>${esc(po.poNumber || 'PO-' + po.id)}</code></td>
                      <td>${esc(po.supplierName || 'Supplier')}</td>
                      <td><strong>${money(po.totalCost || 0)}</strong></td>
                      <td><span class="badge-status instock">${(po.items || []).length} items</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="muted">No supplier purchases recorded yet.</p>'}
        </div>

        <!-- Low Stock Alerts -->
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="margin:0;color:var(--terracotta);">Critical &amp; Low Stock</h3>
            <button class="btn-pill sm outline" data-a="adminNav" data-v="inventory">Manage Stock ↗</button>
          </div>
          ${((s.lowStockProducts || s.lowStockList) && (s.lowStockProducts || s.lowStockList).length) ? `
            <div class="table-wrap" style="margin:0;">
              <table>
                <thead><tr><th>Product</th><th>Stock</th><th>Threshold</th><th>Action</th></tr></thead>
                <tbody>
                  ${(s.lowStockProducts || s.lowStockList).map(p => `
                    <tr>
                      <td>
                        <strong>${esc(p.name)}</strong>
                        <div style="font-size:0.75rem;color:var(--ink-secondary)"><code>${esc(p.sku || '')}</code> · ${esc(p.category)}</div>
                      </td>
                      <td><span class="badge-status ${p.stock <= 0 ? 'out' : 'low'}">${p.stock} units</span></td>
                      <td>${p.lowStockThreshold || p.threshold || 5} units</td>
                      <td>
                        <button class="btn-pill sm outline" style="padding:4px 10px;font-size:0.75rem" data-a="openStockAdjustModal" data-id="${p.id}">+ Adjust / In</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="muted">All catalog items have healthy inventory levels.</p>'}
        </div>

        <!-- Best-Selling Products -->
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="margin:0;">Best-Selling Products</h3>
            <button class="btn-pill sm outline" data-a="adminNav" data-v="reports">Analytics ↗</button>
          </div>
          ${((s.bestSellingProducts || s.bestSellers) && (s.bestSellingProducts || s.bestSellers).length) ? `
            <div class="table-wrap" style="margin:0;">
              <table>
                <thead><tr><th>Product Name</th><th>Units Sold</th><th>Sales Value</th></tr></thead>
                <tbody>
                  ${(s.bestSellingProducts || s.bestSellers).map(b => `
                    <tr>
                      <td><strong>${esc(b.name)}</strong></td>
                      <td><span class="badge-status instock">${b.unitsSold || b.qty || 0} units</span></td>
                      <td><strong>${money(b.revenue || 0)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="muted">No sales metrics recorded yet.</p>'}
        </div>

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
          <h1 style="font-size:2rem;margin:0">Products Directory (${products.length})</h1>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <div class="search-wrap" style="margin-bottom:0;width:240px;">
            <span class="search-icon">🔍</span>
            <input type="search" placeholder="Search by name, SKU..." data-i="admin-prod-search">
          </div>
          <button class="btn-pill sm" data-a="openAddProductModal">+ Add New Product</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item / Scientific Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Cost</th>
              <th>Price</th>
              <th>Margin</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="admin-prod-tbody">
            ${products.map(p => {
              const cost = p.purchasePrice || Math.round(p.price * 0.55);
              const margin = p.price > 0 ? Math.round(((p.price - cost) / p.price) * 100) : 0;
              const isLow = p.stock <= (p.lowStockThreshold || 5);
              const isOut = p.stock <= 0;
              const stockClass = isOut ? 'out' : (isLow ? 'low' : 'instock');
              return `
                <tr data-name="${esc(p.name.toLowerCase())}" data-cat="${esc(p.category.toLowerCase())}">
                  <td style="display:flex;align-items:center;gap:12px;">
                    ${p.image && !p.image.includes('hero-aquarium') ? `
                      <img src="${esc(p.image)}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid var(--line);">
                    ` : `
                      <span style="font-size:1.4rem;width:40px;text-align:center;">${EMOJI[p.subcategory] || EMOJI[p.category] || '🌿'}</span>
                    `}
                    <div>
                      <strong>${esc(p.name)}</strong>
                      ${p.scientificName ? `<div style="font-size:0.75rem;font-style:italic;color:var(--ink-secondary)">${esc(p.scientificName)}</div>` : ''}
                      ${p.difficulty ? `<span class="badge-status new" style="font-size:0.68rem;padding:1px 6px;">${esc(p.difficulty)}</span>` : ''}
                    </div>
                  </td>
                  <td><code>${esc(p.sku || `PP-${p.id}`)}</code></td>
                  <td>
                    <div>${esc(p.category)}</div>
                    <div style="font-size:0.75rem;color:var(--ink-secondary)">${esc(p.subcategory || '')}</div>
                  </td>
                  <td>${money(cost)}</td>
                  <td><strong>${money(p.price)}</strong></td>
                  <td><span style="color:${margin >= 40 ? '#166534' : '#b45309'};font-weight:700;">${margin}%</span></td>
                  <td>
                    <span class="badge-status ${stockClass}">${p.stock} units</span>
                  </td>
                  <td>
                    <span class="badge-status ${p.isVisible !== false ? 'instock' : 'out'}">${p.isVisible !== false ? 'Active' : 'Hidden'}</span>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px;">
                      <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="editProduct" data-id="${p.id}">Edit</button>
                      <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="openStockAdjustModal" data-id="${p.id}">Stock</button>
                      <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;color:#b91c1c;border-color:#fecaca;" data-a="delProduct" data-id="${p.id}">&times;</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 3. Categories Management */
  async categories() {
    const cats = await api('/categories');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">PRODUCT HIERARCHY</span>
          <h1 style="font-size:2rem;margin:0">Categories &amp; Subcategories</h1>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;">
        ${cats.map(c => `
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;box-shadow:var(--shadow-subtle);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:1.8rem;">${EMOJI[c.name] || '🌿'}</span>
                <div>
                  <h3 style="margin:0;font-size:1.15rem;">${esc(c.name)}</h3>
                  <span class="muted" style="font-size:0.8rem;">${c.count || 0} active products</span>
                </div>
              </div>
            </div>
            
            <div style="margin-top:14px;border-top:1px solid var(--line-subtle);padding-top:12px;">
              <span style="font-size:0.75rem;font-weight:700;color:var(--forest-primary);text-transform:uppercase;letter-spacing:0.04em;">Subcategories</span>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
                ${(c.subcategories || []).map(sub => `
                  <span style="background:var(--canvas-alt);padding:4px 10px;border-radius:var(--radius-pill);font-size:0.8rem;border:1px solid var(--line-subtle);">${esc(sub)}</span>
                `).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  /* 4. Suppliers Directory */
  async suppliers() {
    const list = await api('/suppliers');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">VENDOR MANAGEMENT</span>
          <h1 style="font-size:2rem;margin:0">Suppliers Directory (${list.length})</h1>
        </div>
        <button class="btn-pill sm" data-a="openAddSupplierModal">+ Add New Supplier</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Supplier Name</th>
              <th>Contact Person</th>
              <th>Phone / WhatsApp</th>
              <th>Email</th>
              <th>Address / State</th>
              <th>GSTIN</th>
              <th>Payment Terms</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(s => `
              <tr>
                <td><strong>${esc(s.name)}</strong></td>
                <td>${esc(s.contactPerson || '-')}</td>
                <td><a href="tel:${esc(s.phone)}">${esc(s.phone || '-')}</a></td>
                <td><a href="mailto:${esc(s.email)}">${esc(s.email || '-')}</a></td>
                <td>${esc(s.address || s.state || '-')}</td>
                <td><code>${esc(s.gstin || 'Unregistered')}</code></td>
                <td><span class="badge-status instock">${esc(s.paymentTerms || 'Net 30')}</span></td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="openNewPurchaseModal" data-sup="${s.id}">+ PO</button>
                    <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="editSupplier" data-id="${s.id}">Edit</button>
                    <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;color:#b91c1c;border-color:#fecaca;" data-a="delSupplier" data-id="${s.id}">&times;</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 5. Purchases & Stock In */
  async purchases() {
    const list = await api('/purchases');
    const totalCost = list.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">PROCUREMENT &amp; STOCK IN</span>
          <h1 style="font-size:2rem;margin:0">Purchase Orders (${list.length})</h1>
        </div>
        <button class="btn-pill sm" data-a="openNewPurchaseModal">+ Record Purchase / Stock In</button>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));">
        <div class="kpi-card">
          <span class="kpi-title">Total Purchases Value</span>
          <div class="kpi-value" style="color:var(--forest-primary);">${money(totalCost)}</div>
          <span class="kpi-subtitle">All-time procurement</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Total Orders</span>
          <div class="kpi-value">${list.length}</div>
          <span class="kpi-subtitle">Generated PO records</span>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Items Ordered</th>
              <th>Total Cost</th>
              <th>Payment Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(p => `
              <tr>
                <td><code>${esc(p.poNumber || 'PO-' + p.id)}</code></td>
                <td>${new Date(p.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
                <td><strong>${esc(p.supplierName || 'Supplier')}</strong></td>
                <td>
                  <span class="badge-status instock">${(p.items || []).length} lines · ${(p.items || []).reduce((acc, i) => acc + (i.quantity || 0), 0)} units</span>
                </td>
                <td><strong>${money(p.totalCost || 0)}</strong></td>
                <td><span class="badge-status ${p.paymentStatus === 'Paid' ? 'paid' : 'pending'}">${esc(p.paymentStatus || 'Paid')}</span></td>
                <td>
                  <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="viewPurchase" data-id="${p.id}">View Details</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 6. Central Stock Management & Mortality Tracking */
  async inventory() {
    await loadProducts();
    const logs = await api('/inventory/logs');
    const lowStockItems = products.filter(p => p.stock <= (p.lowStockThreshold || 5) && p.stock > 0);
    const outStockItems = products.filter(p => p.stock <= 0);
    const mortalityLogs = logs.filter(l => l.type === 'mortality' || l.type === 'damage');

    // Valuation calculations
    const totalUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const totalCostValuation = products.reduce((acc, p) => acc + ((p.stock || 0) * (p.purchasePrice || Math.round(p.price * 0.55))), 0);
    const totalRetailValuation = products.reduce((acc, p) => acc + ((p.stock || 0) * p.price), 0);

    let displayItems = products;
    if (stockTab === 'low') displayItems = lowStockItems;
    else if (stockTab === 'out') displayItems = outStockItems;

    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">CENTRAL STOCK &amp; LIVING GOODS AUDIT</span>
          <h1 style="font-size:2rem;margin:0">Stock Management</h1>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-pill sm" data-a="openStockAdjustModal">⚖️ Adjust Stock / Log Loss</button>
        </div>
      </div>

      <!-- Valuation Summary -->
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));">
        <div class="kpi-card">
          <span class="kpi-title">Total Units on Hand</span>
          <div class="kpi-value">${totalUnits}</div>
          <span class="kpi-subtitle">Across all active botanicals</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Inventory Valuation (Cost)</span>
          <div class="kpi-value" style="color:var(--forest-primary);">${money(totalCostValuation)}</div>
          <span class="kpi-subtitle">Acquisition / wholesale value</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Inventory Valuation (Retail)</span>
          <div class="kpi-value" style="color:var(--moss);">${money(totalRetailValuation)}</div>
          <span class="kpi-subtitle">Projected retail value</span>
        </div>
        <div class="kpi-card ${lowStockItems.length > 0 ? 'alert' : ''}">
          <span class="kpi-title">Low Stock Items</span>
          <div class="kpi-value" style="color:var(--terracotta);">${lowStockItems.length}</div>
          <span class="kpi-subtitle">Needs reordering</span>
        </div>
      </div>

      <!-- Subnav Navigation -->
      <div class="admin-subnav" style="margin-top:20px;">
        <button class="admin-subnav-btn ${stockTab === 'all' ? 'active' : ''}" data-a="stockTab" data-v="all">📦 All Inventory (${products.length})</button>
        <button class="admin-subnav-btn ${stockTab === 'low' ? 'active' : ''}" data-a="stockTab" data-v="low">⚠️ Low Stock (${lowStockItems.length})</button>
        <button class="admin-subnav-btn ${stockTab === 'out' ? 'active' : ''}" data-a="stockTab" data-v="out">🚫 Out of Stock (${outStockItems.length})</button>
        <button class="admin-subnav-btn ${stockTab === 'mortality' ? 'active' : ''}" data-a="stockTab" data-v="mortality">🥀 Mortality &amp; Loss Logs (${mortalityLogs.length})</button>
        <button class="admin-subnav-btn ${stockTab === 'audit' ? 'active' : ''}" data-a="stockTab" data-v="audit">📜 Audit Ledger (${logs.length})</button>
      </div>

      ${(stockTab === 'all' || stockTab === 'low' || stockTab === 'out') ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product / Spec</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Low Threshold</th>
                <th>Unit Cost</th>
                <th>Stock Valuation</th>
                <th>Quick Adjust</th>
              </tr>
            </thead>
            <tbody id="admin-inv-tbody">
              ${displayItems.map(p => {
                const cost = p.purchasePrice || Math.round(p.price * 0.55);
                const isOut = p.stock <= 0;
                const isLow = p.stock <= (p.lowStockThreshold || 5);
                return `
                  <tr data-name="${esc(p.name.toLowerCase())}" data-cat="${esc(p.category.toLowerCase())}">
                    <td>
                      <strong>${esc(p.name)}</strong>
                      ${p.scientificName ? `<div style="font-size:0.75rem;font-style:italic;color:var(--ink-secondary)">${esc(p.scientificName)}</div>` : ''}
                    </td>
                    <td><code>${esc(p.sku || `PP-${p.id}`)}</code></td>
                    <td>${esc(p.category)}</td>
                    <td><span class="badge-status ${isOut ? 'out' : (isLow ? 'low' : 'instock')}">${p.stock} units</span></td>
                    <td>${p.lowStockThreshold || 5}</td>
                    <td>${money(cost)}</td>
                    <td><strong>${money(p.stock * cost)}</strong></td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="btn-pill sm outline" style="padding:2px 8px;font-size:0.75rem;" data-a="invDelta" data-id="${p.id}" data-v="-1">-1</button>
                        <button class="btn-pill sm outline" style="padding:2px 8px;font-size:0.75rem;" data-a="invDelta" data-id="${p.id}" data-v="1">+1</button>
                        <button class="btn-pill sm outline" style="padding:2px 8px;font-size:0.75rem;" data-a="openStockAdjustModal" data-id="${p.id}">Custom</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${stockTab === 'mortality' ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Product Name</th><th>Qty Lost</th><th>Category/Type</th><th>Mandatory Reason</th><th>Logged By</th></tr>
            </thead>
            <tbody>
              ${mortalityLogs.length ? mortalityLogs.map(l => `
                <tr>
                  <td>${new Date(l.date || Date.now()).toLocaleString('en-IN')}</td>
                  <td><strong>${esc(l.productName || 'Product #' + l.productId)}</strong></td>
                  <td><span class="badge-status mortality">${l.change} units</span></td>
                  <td><span class="badge-status new">${esc(l.type || 'mortality')}</span></td>
                  <td>${esc(l.reason || 'Plant melt / fish casualty')}</td>
                  <td>${esc(l.user || 'Staff')}</td>
                </tr>
              `).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;">No mortality losses recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${stockTab === 'audit' ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Product Name</th><th>Change</th><th>Balance After</th><th>Type / Reason</th><th>Staff</th></tr>
            </thead>
            <tbody>
              ${logs.length ? logs.slice().reverse().slice(0, 100).map(l => `
                <tr>
                  <td>${new Date(l.date || Date.now()).toLocaleString('en-IN')}</td>
                  <td><strong>${esc(l.productName || 'Product #' + l.productId)}</strong></td>
                  <td><span class="badge-status ${l.change > 0 ? 'instock' : 'out'}">${l.change > 0 ? '+' : ''}${l.change}</span></td>
                  <td><strong>${l.newStock !== undefined ? l.newStock : '-'}</strong></td>
                  <td>${esc(l.reason || l.type || 'Adjustment')}</td>
                  <td>${esc(l.user || 'system')}</td>
                </tr>
              `).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;">No stock movement logs recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  },

  /* 7. Point of Sale (POS) Counter Billing */
  async pos() {
    await loadProducts();
    const customers = await api('/customers');
    const filtered = products.filter(p => {
      const matchCat = (posCategoryFilter === 'All') || (p.category === posCategoryFilter);
      return matchCat && p.isVisible !== false;
    });

    const subtotal = posCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const taxRate = (storeSettings && storeSettings.defaultTaxRate) ? storeSettings.defaultTaxRate : 5;
    const taxAmount = Math.round(subtotal * (taxRate / 100));
    const grandTotal = subtotal + taxAmount;

    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">COUNTER BILLING &amp; CHECKOUT</span>
          <h1 style="font-size:2rem;margin:0">Point of Sale (POS) Terminal</h1>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-pill sm outline" data-a="posClearCart" ${!posCart.length ? 'disabled' : ''}>Clear Cart</button>
        </div>
      </div>

      <div class="pos-layout">
        <!-- Catalog & Selection (Left) -->
        <div class="pos-catalog">
          <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
            <div class="search-wrap" style="margin-bottom:0;flex:1;min-width:220px;">
              <span class="search-icon">🔍</span>
              <input type="search" placeholder="Scan SKU or type name..." data-i="pos-search" value="${esc(posSearchQuery)}">
            </div>
          </div>

          <!-- Category filter pills -->
          <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:14px;">
            ${['All', ...CATS].map(c => `
              <button class="btn-pill sm ${posCategoryFilter === c ? '' : 'outline'}" style="white-space:nowrap;padding:4px 12px;font-size:0.8rem;" data-a="posCategory" data-v="${c}">${c}</button>
            `).join('')}
          </div>

          <!-- Products Grid -->
          <div class="pos-prod-grid">
            ${filtered.map(p => {
              const inCart = posCart.find(i => i.id === p.id);
              const isOut = p.stock <= 0;
              return `
                <div class="pos-prod-card ${isOut ? 'out' : ''}" data-a="posAddToCart" data-id="${p.id}" data-name="${esc(p.name)}" data-sku="${esc(p.sku || '')}">
                  <div style="position:relative;">
                    ${p.image && !p.image.includes('hero-aquarium') ? `
                      <img src="${esc(p.image)}" alt="" style="width:100%;height:85px;object-fit:cover;border-radius:6px;margin-bottom:8px;">
                    ` : `
                      <div style="height:85px;display:flex;align-items:center;justify-content:center;background:var(--canvas-alt);border-radius:6px;font-size:2rem;margin-bottom:8px;">
                        ${EMOJI[p.subcategory] || EMOJI[p.category] || '🌿'}
                      </div>
                    `}
                    <span class="pos-badge ${p.stock <= 0 ? 'out' : (p.stock <= 5 ? 'low' : 'stock')}">
                      ${p.stock} in stock
                    </span>
                  </div>
                  <div style="font-weight:700;font-size:0.88rem;line-height:1.2;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                    ${esc(p.name)}
                  </div>
                  <div style="font-size:0.75rem;color:var(--ink-secondary);margin-bottom:6px;"><code>${esc(p.sku || `PP-${p.id}`)}</code></div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;">
                    <div style="font-weight:700;color:var(--forest-primary);font-size:0.95rem;">${money(p.price)}</div>
                    ${inCart ? `<span style="background:var(--moss);color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;">${inCart.qty}</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- POS Checkout Panel (Right) -->
        <div class="pos-checkout-panel">
          <h3 style="margin-top:0;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <span>Current Sale</span>
            <span class="badge-status instock">${posCart.reduce((sum, i) => sum + i.qty, 0)} Items</span>
          </h3>

          <!-- Customer Selection -->
          <div style="background:var(--canvas-alt);padding:12px;border-radius:var(--radius-sm);margin-bottom:14px;border:1px solid var(--line-subtle);">
            <label style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--forest-primary);margin-bottom:4px;display:block;">Customer</label>
            <div style="display:flex;gap:6px;margin-bottom:6px;">
              <select id="pos-cust-select" style="flex:1;padding:6px 8px;font-size:0.85rem;">
                <option value="walkin">👤 Walk-in Customer (General Counter)</option>
                ${customers.map(c => `
                  <option value="${c.id}" ${posSelectedCustomer === c.id ? 'selected' : ''}>${esc(c.name)} (${esc(c.phone || c.email)})</option>
                `).join('')}
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <input id="pos-cust-name" placeholder="Walk-in Name (optional)" style="padding:6px 8px;font-size:0.82rem;">
              <input id="pos-cust-phone" placeholder="Phone / WhatsApp" style="padding:6px 8px;font-size:0.82rem;">
            </div>
          </div>

          <!-- POS Cart Item List -->
          <div style="flex:1;max-height:300px;overflow-y:auto;border-bottom:1px solid var(--line);margin-bottom:14px;">
            ${posCart.length ? posCart.map(item => `
              <div class="pos-cart-item">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.name)}</div>
                  <div style="font-size:0.75rem;color:var(--ink-secondary);">${money(item.price)} each</div>
                </div>
                <div class="pos-qty-stepper">
                  <button class="pos-stepper-btn" data-a="posDecQty" data-id="${item.id}">-</button>
                  <span class="pos-qty-val">${item.qty}</span>
                  <button class="pos-stepper-btn" data-a="posIncQty" data-id="${item.id}">+</button>
                </div>
                <div style="font-weight:700;width:70px;text-align:right;">${money(item.price * item.qty)}</div>
                <button style="background:none;border:none;color:#b91c1c;cursor:pointer;padding:4px;" data-a="posRemoveItem" data-id="${item.id}">&times;</button>
              </div>
            `).join('') : `
              <div style="text-align:center;padding:40px 10px;color:var(--ink-secondary);">
                <div style="font-size:2rem;margin-bottom:6px;">🛒</div>
                <p style="margin:0;font-size:0.9rem;">Cart is empty. Click items from catalog to add to bill.</p>
              </div>
            `}
          </div>

          <!-- Totals Breakdown -->
          <div style="background:var(--canvas-alt);padding:14px;border-radius:var(--radius-sm);margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.88rem;">
              <span>Subtotal:</span>
              <strong>${money(subtotal)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.88rem;">
              <span>GST (${taxRate}% CGST+SGST):</span>
              <strong>${money(taxAmount)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.88rem;">
              <span>Discount (%):</span>
              <input type="number" id="pos-discount-pct" min="0" max="100" value="0" style="width:60px;padding:2px 6px;text-align:right;">
            </div>
            <div class="pos-total-banner">
              <span>Total Payable</span>
              <span>${money(grandTotal)}</span>
            </div>
          </div>

          <!-- Payment Mode -->
          <label style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--forest-primary);margin-bottom:6px;display:block;">Payment Mode</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
            <label style="display:flex;align-items:center;gap:6px;background:var(--canvas);padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--line);cursor:pointer;font-size:0.85rem;">
              <input type="radio" name="posPaymentMethod" value="Cash" checked>
              <span>💵 Cash</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;background:var(--canvas);padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--line);cursor:pointer;font-size:0.85rem;">
              <input type="radio" name="posPaymentMethod" value="UPI">
              <span>📱 UPI / QR</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;background:var(--canvas);padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--line);cursor:pointer;font-size:0.85rem;">
              <input type="radio" name="posPaymentMethod" value="Card">
              <span>💳 Card</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;background:var(--canvas);padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--line);cursor:pointer;font-size:0.85rem;">
              <input type="radio" name="posPaymentMethod" value="Bank Transfer">
              <span>🏛️ Bank</span>
            </label>
          </div>

          <!-- Checkout Button -->
          <button class="btn-pill" style="width:100%;padding:14px;font-size:1rem;display:flex;justify-content:center;align-items:center;gap:8px;" data-a="posCheckout" ${!posCart.length ? 'disabled' : ''}>
            <span>Complete Sale &amp; Print Bill</span>
            <span>&rarr;</span>
          </button>
        </div>
      </div>
    `;
  },

  /* 8. Customers Directory */
  async customers() {
    const list = await api('/customers');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">CLIENTELE DIRECTORY</span>
          <h1 style="font-size:2rem;margin:0">Customers (${list.length})</h1>
        </div>
        <button class="btn-pill sm" data-a="openAddCustomerModal">+ Add Customer</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Email</th>
              <th>City / Address</th>
              <th>Orders Count</th>
              <th>Total Spend</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(c => `
              <tr>
                <td><strong>${esc(c.name)}</strong></td>
                <td><a href="tel:${esc(c.phone)}">${esc(c.phone || '-')}</a></td>
                <td><a href="mailto:${esc(c.email)}">${esc(c.email || '-')}</a></td>
                <td>${esc(c.city || c.address || '-')}</td>
                <td><span class="badge-status instock">${c.totalOrders || 0} orders</span></td>
                <td><strong>${money(c.totalSpend || 0)}</strong></td>
                <td>
                  <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="viewCustomer" data-id="${c.id}">Profile</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 9. Website Customer Orders */
  async orders() {
    const list = await api('/orders');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">ORDER FULFILLMENT</span>
          <h1 style="font-size:2rem;margin:0">Website Orders (${list.length})</h1>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Fulfillment Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(o => `
              <tr>
                <td><code>#${o.id}</code></td>
                <td>${new Date(o.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
                <td>
                  <strong>${esc(o.name || (o.customer && o.customer.name) || 'Customer')}</strong>
                  <div style="font-size:0.75rem;color:var(--ink-secondary)">${esc(o.phone || '')}</div>
                </td>
                <td>${(o.items || []).length} items</td>
                <td><strong>${money(o.total || 0)}</strong></td>
                <td><span class="badge-status ${o.paymentMethod === 'cod' ? 'pending' : 'paid'}">${esc(o.paymentMethod || 'Online')}</span></td>
                <td>
                  <select data-c="orderStatus" data-id="${o.id}" style="padding:4px 8px;font-size:0.8rem;border-radius:var(--radius-pill);">
                    ${['new', 'processing', 'shipped', 'delivered', 'cancelled'].map(st => `
                      <option value="${st}" ${o.status === st ? 'selected' : ''}>${st.toUpperCase()}</option>
                    `).join('')}
                  </select>
                </td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="viewOrder" data-id="${o.id}">View</button>
                    ${o.status !== 'cancelled' ? `
                      <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;color:#b91c1c;border-color:#fecaca;" data-a="cancelOrder" data-id="${o.id}">Cancel &amp; Restore</button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 10. Payments Ledger */
  async payments() {
    const list = await api('/payments');
    const totalCollected = list.filter(p => p.status === 'Completed').reduce((sum, p) => sum + (p.amount || 0), 0);
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">FINANCIAL AUDIT</span>
          <h1 style="font-size:2rem;margin:0">Payments &amp; Ledger (${list.length})</h1>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));">
        <div class="kpi-card">
          <span class="kpi-title">Total Payments Collected</span>
          <div class="kpi-value" style="color:var(--forest-primary);">${money(totalCollected)}</div>
          <span class="kpi-subtitle">Completed transactions</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Transactions Count</span>
          <div class="kpi-value">${list.length}</div>
          <span class="kpi-subtitle">POS, Web &amp; Vendor payouts</span>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Txn ID</th>
              <th>Date</th>
              <th>Channel</th>
              <th>Reference #</th>
              <th>Party</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(p => `
              <tr>
                <td><code>${esc(p.transactionId || 'TXN-' + p.id)}</code></td>
                <td>${new Date(p.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
                <td><span class="badge-status ${p.source === 'pos' ? 'pos' : 'web'}">${esc(p.source || 'pos').toUpperCase()}</span></td>
                <td><code>${esc(p.referenceNumber || '-')}</code></td>
                <td><strong>${esc(p.customerName || p.partyName || 'Customer')}</strong></td>
                <td><strong>${money(p.amount || 0)}</strong></td>
                <td>${esc(p.method || 'Cash')}</td>
                <td><span class="badge-status ${esc((p.status || '').toLowerCase())}">${esc(p.status || 'Completed')}</span></td>
                <td>
                  ${p.status !== 'Completed' ? `
                    <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="verifyPayment" data-id="${p.id}">Verify</button>
                  ` : '<span style="color:#166534;font-size:0.8rem;font-weight:600;">✓ Verified</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 11. GST Tax Invoices */
  async invoices() {
    const list = await api('/invoices');
    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">STATUTORY GST TAX BILLING</span>
          <h1 style="font-size:2rem;margin:0">Tax Invoices (${list.length})</h1>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Channel</th>
              <th>Taxable</th>
              <th>GST (5%)</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(inv => `
              <tr>
                <td><code>${esc(inv.invoiceNumber)}</code></td>
                <td>${new Date(inv.date || inv.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
                <td>
                  <strong>${esc(inv.customerName || (inv.customer && inv.customer.name) || 'Walk-in')}</strong>
                  ${(inv.customer && inv.customer.phone) ? `<div style="font-size:0.75rem;color:var(--ink-secondary)">${esc(inv.customer.phone)}</div>` : ''}
                </td>
                <td><span class="badge-status ${inv.type === 'pos' ? 'pos' : 'web'}">${inv.type === 'pos' ? 'POS Counter' : 'Online Store'}</span></td>
                <td>${money(inv.subtotal || 0)}</td>
                <td>${money(inv.taxAmount || 0)}</td>
                <td><strong>${money(inv.grandTotal || 0)}</strong></td>
                <td><span class="badge-status ${esc((inv.status || 'paid').toLowerCase())}">${esc(inv.status || 'Paid')}</span></td>
                <td>
                  <a class="btn-pill sm outline" style="padding:4px 10px;font-size:0.75rem;" href="/api/invoices/${inv.id}/print" target="_blank">Print / PDF 🖨️</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 12. Stock History Movement Ledger (Requirement 21 & 24) */
  async 'stock-history'() {
    let q = '/reports/stock-history?';
    if (stockHistoryFilter.type && stockHistoryFilter.type !== 'all') q += `&transactionType=${encodeURIComponent(stockHistoryFilter.type)}`;
    if (stockHistoryFilter.search) q += `&referenceNumber=${encodeURIComponent(stockHistoryFilter.search)}`;
    if (stockHistoryFilter.startDate) q += `&startDate=${stockHistoryFilter.startDate}`;
    if (stockHistoryFilter.endDate) q += `&endDate=${stockHistoryFilter.endDate}`;
    if (stockHistoryFilter.product) q += `&productId=${stockHistoryFilter.product}`;

    const res = await api(q);
    const summary = res.summary || {};
    const items = res.items || [];
    await loadProducts();

    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">CENTRALIZED INVENTORY ENGINE</span>
          <h1 style="font-size:2rem;margin:0">Stock History &amp; Movement Ledger</h1>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-pill sm outline" data-a="printReport" data-v="stock-history">🖨️ Print Ledger</button>
          <a class="btn-pill sm outline" href="/api/reports/export?type=stock-history" target="_blank">📥 Export CSV</a>
        </div>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));">
        <div class="kpi-card">
          <span class="kpi-title">Total Movements</span>
          <div class="kpi-value">${summary.totalTransactions || items.length}</div>
          <span class="kpi-subtitle">Logged audit records</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Total Stock In (+)</span>
          <div class="kpi-value" style="color:var(--moss);">+${summary.totalQuantityIn || 0}</div>
          <span class="kpi-subtitle">Purchases, returns, adjustments</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Total Stock Out (-)</span>
          <div class="kpi-value" style="color:var(--terracotta);">-${summary.totalQuantityOut || 0}</div>
          <span class="kpi-subtitle">POS sales, orders, damages</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">Net Movement</span>
          <div class="kpi-value" style="color:var(--forest-primary);">${summary.netMovement >= 0 ? '+' : ''}${summary.netMovement || 0}</div>
          <span class="kpi-subtitle">Overall balance shift</span>
        </div>
      </div>

      <!-- Filters Form -->
      <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:18px 24px;margin:20px 0;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;align-items:end;">
          <div>
            <label style="font-size:0.75rem;font-weight:700;">Filter by Product</label>
            <select id="sh-filter-prod" style="padding:7px 10px;font-size:0.85rem;">
              <option value="">-- All Products --</option>
              ${products.map(p => `<option value="${p.id}" ${stockHistoryFilter.product == p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:0.75rem;font-weight:700;">Movement Type</label>
            <select id="sh-filter-type" style="padding:7px 10px;font-size:0.85rem;">
              <option value="all" ${stockHistoryFilter.type === 'all' ? 'selected' : ''}>All Transaction Types</option>
              <option value="opening" ${stockHistoryFilter.type === 'opening' ? 'selected' : ''}>Opening Stock</option>
              <option value="purchase" ${stockHistoryFilter.type === 'purchase' ? 'selected' : ''}>Purchase (Stock In)</option>
              <option value="sale" ${stockHistoryFilter.type === 'sale' ? 'selected' : ''}>Sale (Stock Out)</option>
              <option value="sale_return" ${stockHistoryFilter.type === 'sale_return' ? 'selected' : ''}>Sale Return / Cancellation</option>
              <option value="damage" ${stockHistoryFilter.type === 'damage' ? 'selected' : ''}>Damage / Mortality</option>
              <option value="adjustment" ${stockHistoryFilter.type === 'adjustment' ? 'selected' : ''}>Audit Adjustment</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.75rem;font-weight:700;">Reference # (PO/Inv/Ord)</label>
            <input id="sh-filter-search" placeholder="e.g. PP-INV or PO-" value="${esc(stockHistoryFilter.search)}" style="padding:7px 10px;font-size:0.85rem;">
          </div>
          <div>
            <label style="font-size:0.75rem;font-weight:700;">From Date</label>
            <input type="date" id="sh-filter-from" value="${stockHistoryFilter.startDate || ''}" style="padding:6px 10px;font-size:0.85rem;">
          </div>
          <div>
            <label style="font-size:0.75rem;font-weight:700;">To Date</label>
            <input type="date" id="sh-filter-to" value="${stockHistoryFilter.endDate || ''}" style="padding:6px 10px;font-size:0.85rem;">
          </div>
          <div>
            <button class="btn-pill sm" style="width:100%;padding:9px;" data-a="applyStockHistoryFilter">Apply Filters</button>
          </div>
        </div>
      </div>

      <!-- Movement Ledger Table -->
      <div class="table-wrap" id="printable-report-area">
        <table>
          <thead>
            <tr>
              <th>Date &amp; Time</th>
              <th>Reference #</th>
              <th>Product Name</th>
              <th>SKU</th>
              <th>Movement Type</th>
              <th>In (+)</th>
              <th>Out (-)</th>
              <th>Previous</th>
              <th>New Stock</th>
              <th>Staff / Actor</th>
              <th>Notes / Reason</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map(l => {
              const tx = (l.transactionType || l.type || 'adjustment').toLowerCase();
              let badgeClass = 'new';
              if (tx === 'purchase' || tx === 'opening') badgeClass = 'instock';
              else if (tx === 'sale') badgeClass = 'pos';
              else if (tx === 'damage') badgeClass = 'mortality';
              else if (tx === 'sale_return') badgeClass = 'web';

              return `
                <tr>
                  <td>${new Date(l.transactionDate || l.date || l.timestamp).toLocaleString('en-IN')}</td>
                  <td><code>${esc(l.referenceNumber || '-')}</code></td>
                  <td><strong>${esc(l.productName || 'Product #' + l.productId)}</strong></td>
                  <td><code>${esc(l.sku || '')}</code></td>
                  <td><span class="badge-status ${badgeClass}">${esc(tx.toUpperCase())}</span></td>
                  <td style="color:#166534;font-weight:700;">${l.quantityIn > 0 ? '+' + l.quantityIn : '-'}</td>
                  <td style="color:#b91c1c;font-weight:700;">${l.quantityOut > 0 ? '-' + l.quantityOut : '-'}</td>
                  <td>${l.previousStock !== undefined ? l.previousStock : '-'}</td>
                  <td><strong>${l.newStock !== undefined ? l.newStock : '-'}</strong></td>
                  <td>${esc(l.createdBy || l.performedBy || 'system')}</td>
                  <td style="font-size:0.8rem;color:var(--ink-secondary);">${esc(l.notes || l.reason || '')}</td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="11" class="muted" style="text-align:center;padding:30px;">No inventory movements match the selected filters.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  /* 13. Reports Suite (Requirement 23) */
  async reports() {
    let reportData = null;
    let exportUrl = `/api/reports/export?type=${reportsTab}`;

    if (reportsTab === 'current-stock') {
      reportData = await api('/reports/current-stock');
    } else if (reportsTab === 'low-stock') {
      reportData = await api('/reports/low-stock');
    } else if (reportsTab === 'purchases') {
      let q = '/reports/purchases?';
      if (purchaseReportFilter.supplierId) q += `&supplierId=${purchaseReportFilter.supplierId}`;
      if (purchaseReportFilter.startDate) q += `&startDate=${purchaseReportFilter.startDate}`;
      if (purchaseReportFilter.endDate) q += `&endDate=${purchaseReportFilter.endDate}`;
      reportData = await api(q);
    } else if (reportsTab === 'sales') {
      let q = '/reports/sales?';
      if (salesReportFilter.channel) q += `&channel=${salesReportFilter.channel}`;
      if (salesReportFilter.paymentMethod) q += `&paymentMethod=${salesReportFilter.paymentMethod}`;
      if (salesReportFilter.startDate) q += `&startDate=${salesReportFilter.startDate}`;
      if (salesReportFilter.endDate) q += `&endDate=${salesReportFilter.endDate}`;
      reportData = await api(q);
    } else if (reportsTab === 'payment-methods') {
      reportData = await api('/reports/payment-methods');
    } else if (reportsTab === 'analytics') {
      reportData = await api(`/reports/analytics?period=${reportsPeriod}`);
    }

    const suppliers = await api('/suppliers');

    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">STATUTORY AUDIT &amp; BUSINESS INTELLIGENCE</span>
          <h1 style="font-size:2rem;margin:0">Reports &amp; Analytics</h1>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-pill sm outline" data-a="printReport" data-v="${reportsTab}">🖨️ Print Report</button>
          <a class="btn-pill sm outline" href="${exportUrl}" target="_blank">📥 Export CSV</a>
        </div>
      </div>

      <!-- Reports Subnav Tabs (Requirement 23: A through G) -->
      <div class="admin-subnav" style="margin-top:0;">
        <button class="admin-subnav-btn ${reportsTab === 'current-stock' ? 'active' : ''}" data-a="reportsTab" data-v="current-stock">📦 Current Stock</button>
        <button class="admin-subnav-btn ${reportsTab === 'low-stock' ? 'active' : ''}" data-a="reportsTab" data-v="low-stock">⚠️ Low Stock</button>
        <button class="admin-subnav-btn ${reportsTab === 'purchases' ? 'active' : ''}" data-a="reportsTab" data-v="purchases">📥 Purchase Report</button>
        <button class="admin-subnav-btn ${reportsTab === 'sales' ? 'active' : ''}" data-a="reportsTab" data-v="sales">💳 Sales Report</button>
        <button class="admin-subnav-btn ${reportsTab === 'payment-methods' ? 'active' : ''}" data-a="reportsTab" data-v="payment-methods">💰 Payment Methods</button>
        <button class="admin-subnav-btn ${reportsTab === 'analytics' ? 'active' : ''}" data-a="reportsTab" data-v="analytics">📈 Financial Analytics</button>
      </div>

      <!-- REPORT A: CURRENT STOCK REPORT -->
      ${reportsTab === 'current-stock' ? (() => {
        const s = (reportData && reportData.summary) || {};
        const items = (reportData && reportData.items) || [];
        return `
          <div class="kpi-grid">
            <div class="kpi-card">
              <span class="kpi-title">Total Products</span>
              <div class="kpi-value">${s.totalProducts || items.length}</div>
              <span class="kpi-subtitle">Active catalog lines</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Current Stock Units</span>
              <div class="kpi-value">${s.totalStockUnits || 0}</div>
              <span class="kpi-subtitle">Available on hand</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Total Stock In</span>
              <div class="kpi-value" style="color:var(--moss);">+${s.totalStockIn || 0}</div>
              <span class="kpi-subtitle">Cumulative received</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Total Stock Out</span>
              <div class="kpi-value" style="color:var(--terracotta);">-${s.totalStockOut || 0}</div>
              <span class="kpi-subtitle">Cumulative sales &amp; loss</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Stock Valuation (Cost)</span>
              <div class="kpi-value" style="color:var(--forest-primary);">${money(s.totalValuationCost || 0)}</div>
              <span class="kpi-subtitle">Acquisition value</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Stock Valuation (Retail)</span>
              <div class="kpi-value" style="color:var(--moss);">${money(s.totalValuationRetail || 0)}</div>
              <span class="kpi-subtitle">Retail projected value</span>
            </div>
          </div>

          <div class="table-wrap" id="printable-report-area">
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Opening Stock</th>
                  <th>Stock In (+)</th>
                  <th>Stock Out (-)</th>
                  <th>Current Stock</th>
                  <th>Status</th>
                  <th>Unit Cost</th>
                  <th>Valuation (Cost)</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(p => `
                  <tr>
                    <td>
                      <strong>${esc(p.name)}</strong>
                      ${p.scientificName ? `<div style="font-size:0.75rem;font-style:italic;color:var(--ink-secondary)">${esc(p.scientificName)}</div>` : ''}
                    </td>
                    <td><code>${esc(p.sku)}</code></td>
                    <td>${esc(p.category)}</td>
                    <td>${p.openingStock}</td>
                    <td style="color:#166534;font-weight:600;">+${p.totalIn}</td>
                    <td style="color:#b91c1c;font-weight:600;">-${p.totalOut}</td>
                    <td><strong>${p.currentStock}</strong></td>
                    <td><span class="badge-status ${p.status === 'In Stock' ? 'instock' : (p.status === 'Low Stock' ? 'low' : 'out')}">${esc(p.status)}</span></td>
                    <td>${money(p.unitCost)}</td>
                    <td><strong>${money(p.valuationCost)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      })() : ''}

      <!-- REPORT B: LOW STOCK REPORT -->
      ${reportsTab === 'low-stock' ? (() => {
        const items = (reportData && reportData.items) || [];
        return `
          <div class="kpi-grid" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="kpi-card alert">
              <span class="kpi-title">Low Stock Items</span>
              <div class="kpi-value" style="color:var(--terracotta);">${items.length}</div>
              <span class="kpi-subtitle">At or below reorder threshold</span>
            </div>
            <div class="kpi-card alert">
              <span class="kpi-title">Out of Stock Items</span>
              <div class="kpi-value" style="color:#b91c1c;">${items.filter(i => i.currentStock <= 0).length}</div>
              <span class="kpi-subtitle">Zero available inventory</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Estimated Reorder Cost</span>
              <div class="kpi-value" style="color:var(--forest-primary);">${money(items.reduce((s, i) => s + (i.estimatedReorderCost || 0), 0))}</div>
              <span class="kpi-subtitle">Suggested replenishment spend</span>
            </div>
          </div>

          <div class="table-wrap" id="printable-report-area">
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Current Stock</th>
                  <th>Threshold</th>
                  <th>Suggested Reorder</th>
                  <th>Unit Cost</th>
                  <th>Estimated Cost</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${items.length ? items.map(p => `
                  <tr>
                    <td><strong>${esc(p.name)}</strong></td>
                    <td><code>${esc(p.sku)}</code></td>
                    <td>${esc(p.category)}</td>
                    <td><span class="badge-status ${p.currentStock <= 0 ? 'out' : 'low'}">${p.currentStock} units</span></td>
                    <td>${p.threshold} units</td>
                    <td><strong>${p.suggestedReorder} units</strong></td>
                    <td>${money(p.unitCost)}</td>
                    <td><strong>${money(p.estimatedReorderCost)}</strong></td>
                    <td>
                      <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="openStockAdjustModal" data-id="${p.id}">+ Reorder</button>
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="9" class="muted" style="text-align:center;padding:30px;">All catalog items have healthy inventory levels!</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      })() : ''}

      <!-- REPORT C: PURCHASES REPORT -->
      ${reportsTab === 'purchases' ? (() => {
        const s = (reportData && reportData.summary) || {};
        const items = (reportData && reportData.items) || [];
        return `
          <div class="kpi-grid" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="kpi-card">
              <span class="kpi-title">Total Purchases Value</span>
              <div class="kpi-value" style="color:var(--forest-primary);">${money(s.totalAmount || 0)}</div>
              <span class="kpi-subtitle">Period procurement</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Total Orders</span>
              <div class="kpi-value">${s.totalPurchases || items.length}</div>
              <span class="kpi-subtitle">Generated PO records</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Units Received</span>
              <div class="kpi-value" style="color:var(--moss);">${s.totalUnits || 0}</div>
              <span class="kpi-subtitle">Botanicals added to stock</span>
            </div>
          </div>

          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:16px 20px;margin:20px 0;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;align-items:end;">
              <div>
                <label style="font-size:0.75rem;font-weight:700;">Supplier</label>
                <select id="pr-filter-sup" style="padding:6px 10px;font-size:0.85rem;">
                  <option value="">All Suppliers</option>
                  ${suppliers.map(sup => `<option value="${sup.id}" ${purchaseReportFilter.supplierId == sup.id ? 'selected' : ''}>${esc(sup.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:700;">From Date</label>
                <input type="date" id="pr-filter-from" value="${purchaseReportFilter.startDate || ''}" style="padding:6px 10px;font-size:0.85rem;">
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:700;">To Date</label>
                <input type="date" id="pr-filter-to" value="${purchaseReportFilter.endDate || ''}" style="padding:6px 10px;font-size:0.85rem;">
              </div>
              <div>
                <button class="btn-pill sm" style="width:100%;padding:8px;" data-a="applyPurchaseReportFilter">Filter Purchases</button>
              </div>
            </div>
          </div>

          <div class="table-wrap" id="printable-report-area">
            <table>
              <thead>
                <tr>
                  <th>Purchase #</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Items Ordered</th>
                  <th>Total Amount</th>
                  <th>Payment Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(p => `
                  <tr>
                    <td><code>${esc(p.purchaseNumber || p.poNumber || 'PO-' + p.id)}</code></td>
                    <td>${new Date(p.createdAt || p.date).toLocaleDateString('en-IN')}</td>
                    <td><strong>${esc(p.supplierName || 'Supplier')}</strong></td>
                    <td>${(p.items || []).length} lines (${(p.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0)} units)</td>
                    <td><strong>${money(p.totalCost || p.grandTotal || 0)}</strong></td>
                    <td><span class="badge-status ${p.paymentStatus === 'Paid' ? 'paid' : 'pending'}">${esc(p.paymentStatus || 'Paid')}</span></td>
                    <td><button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="viewPurchase" data-id="${p.id}">View</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      })() : ''}

      <!-- REPORT D: SALES REPORT -->
      ${reportsTab === 'sales' ? (() => {
        const s = (reportData && reportData.summary) || {};
        const items = (reportData && reportData.items) || [];
        return `
          <div class="kpi-grid">
            <div class="kpi-card">
              <span class="kpi-title">Total Sales Revenue</span>
              <div class="kpi-value" style="color:var(--forest-primary);">${money(s.totalSalesRevenue || 0)}</div>
              <span class="kpi-subtitle">Period sales earnings</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Total Invoices &amp; Orders</span>
              <div class="kpi-value">${s.totalSalesCount || items.length}</div>
              <span class="kpi-subtitle">Completed transactions</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Units Sold</span>
              <div class="kpi-value" style="color:var(--moss);">${s.totalUnitsSold || 0}</div>
              <span class="kpi-subtitle">Botanicals dispatched</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Average Order Value</span>
              <div class="kpi-value">${money(s.averageSaleValue || 0)}</div>
              <span class="kpi-subtitle">Per transaction average</span>
            </div>
          </div>

          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:16px 20px;margin:20px 0;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;align-items:end;">
              <div>
                <label style="font-size:0.75rem;font-weight:700;">Sales Channel</label>
                <select id="sr-filter-chan" style="padding:6px 10px;font-size:0.85rem;">
                  <option value="all" ${salesReportFilter.channel === 'all' ? 'selected' : ''}>All Channels</option>
                  <option value="pos" ${salesReportFilter.channel === 'pos' ? 'selected' : ''}>Store POS Counter</option>
                  <option value="web" ${salesReportFilter.channel === 'web' ? 'selected' : ''}>Website Online Order</option>
                </select>
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:700;">Payment Method</label>
                <select id="sr-filter-meth" style="padding:6px 10px;font-size:0.85rem;">
                  <option value="all" ${salesReportFilter.paymentMethod === 'all' ? 'selected' : ''}>All Payment Modes</option>
                  <option value="cash" ${salesReportFilter.paymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
                  <option value="upi" ${salesReportFilter.paymentMethod === 'upi' ? 'selected' : ''}>UPI / QR</option>
                  <option value="card" ${salesReportFilter.paymentMethod === 'card' ? 'selected' : ''}>Card</option>
                  <option value="bank" ${salesReportFilter.paymentMethod === 'bank' ? 'selected' : ''}>Bank Transfer</option>
                </select>
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:700;">From Date</label>
                <input type="date" id="sr-filter-from" value="${salesReportFilter.startDate || ''}" style="padding:6px 10px;font-size:0.85rem;">
              </div>
              <div>
                <label style="font-size:0.75rem;font-weight:700;">To Date</label>
                <input type="date" id="sr-filter-to" value="${salesReportFilter.endDate || ''}" style="padding:6px 10px;font-size:0.85rem;">
              </div>
              <div>
                <button class="btn-pill sm" style="width:100%;padding:8px;" data-a="applySalesReportFilter">Filter Sales</button>
              </div>
            </div>
          </div>

          <div class="table-wrap" id="printable-report-area">
            <table>
              <thead>
                <tr>
                  <th>Ref / Invoice #</th>
                  <th>Channel</th>
                  <th>Customer</th>
                  <th>Sale Date</th>
                  <th>Total Qty</th>
                  <th>Amount</th>
                  <th>Payment Mode</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(s => `
                  <tr>
                    <td><code>${esc(s.referenceNumber || s.id)}</code></td>
                    <td><span class="badge-status ${s.channel.includes('POS') ? 'pos' : 'web'}">${esc(s.channel)}</span></td>
                    <td><strong>${esc(s.customerName)}</strong>${s.customerPhone ? `<div style="font-size:0.75rem;color:var(--ink-secondary)">${esc(s.customerPhone)}</div>` : ''}</td>
                    <td>${new Date(s.date).toLocaleDateString('en-IN')}</td>
                    <td>${s.totalQuantity} units</td>
                    <td><strong>${money(s.grandTotal)}</strong></td>
                    <td>${esc(s.paymentMethod)}</td>
                    <td><span class="badge-status instock">${esc(s.status)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      })() : ''}

      <!-- REPORT E: PAYMENT METHODS REPORT -->
      ${reportsTab === 'payment-methods' ? (() => {
        const breakdown = (reportData && reportData.breakdown) || [];
        const total = (reportData && reportData.totalRevenue) || 0;
        return `
          <div class="kpi-grid" style="grid-template-columns:1fr 1fr;">
            <div class="kpi-card">
              <span class="kpi-title">Total Collections</span>
              <div class="kpi-value" style="color:var(--forest-primary);">${money(total)}</div>
              <span class="kpi-subtitle">Across all payment channels</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Total Transactions</span>
              <div class="kpi-value">${(reportData && reportData.totalTransactions) || 0}</div>
              <span class="kpi-subtitle">POS &amp; Online checkouts</span>
            </div>
          </div>

          <div class="table-wrap" id="printable-report-area">
            <table>
              <thead>
                <tr>
                  <th>Payment Method</th>
                  <th>Transactions Count</th>
                  <th>Total Amount Collected</th>
                  <th>Percentage of Sales</th>
                </tr>
              </thead>
              <tbody>
                ${breakdown.map(b => `
                  <tr>
                    <td><strong>${esc(b.method)}</strong></td>
                    <td>${b.count} orders</td>
                    <td><strong>${money(b.totalAmount)}</strong></td>
                    <td>
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-weight:700;width:40px;">${b.percentage}%</span>
                        <div style="flex:1;background:var(--canvas-alt);border-radius:6px;height:8px;overflow:hidden;">
                          <div style="background:var(--forest-primary);width:${b.percentage}%;height:100%;"></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      })() : ''}

      <!-- REPORT F: FINANCIAL ANALYTICS -->
      ${reportsTab === 'analytics' ? (() => {
        const r = reportData || {};
        return `
          <div class="admin-subnav" style="margin-top:0;">
            <button class="admin-subnav-btn ${reportsPeriod === 'today' ? 'active' : ''}" data-a="reportsPeriod" data-v="today">Today</button>
            <button class="admin-subnav-btn ${reportsPeriod === '7d' ? 'active' : ''}" data-a="reportsPeriod" data-v="7d">Last 7 Days</button>
            <button class="admin-subnav-btn ${reportsPeriod === '30d' ? 'active' : ''}" data-a="reportsPeriod" data-v="30d">Last 30 Days</button>
            <button class="admin-subnav-btn ${reportsPeriod === 'all' ? 'active' : ''}" data-a="reportsPeriod" data-v="all">All Time</button>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <span class="kpi-title">Gross Revenue</span>
              <div class="kpi-value" style="color:var(--forest-primary);">${money(r.revenue || 0)}</div>
              <span class="kpi-subtitle">Total invoiced sales</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Cost of Goods Sold (COGS)</span>
              <div class="kpi-value">${money(r.cogs || 0)}</div>
              <span class="kpi-subtitle">Direct acquisition cost</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Gross Profit</span>
              <div class="kpi-value" style="color:var(--moss);">${money(r.grossProfit || 0)}</div>
              <span class="kpi-subtitle">Net markup earnings</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-title">Gross Margin</span>
              <div class="kpi-value" style="color:${(r.grossMargin || 0) >= 35 ? '#166534' : '#b45309'};">${r.grossMargin || 0}%</div>
              <span class="kpi-subtitle">Profit margin percentage</span>
            </div>
          </div>

          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:24px;margin-top:20px;">
            <h3 style="margin-top:0;margin-bottom:14px;">Sales by Category Breakdown</h3>
            <div class="table-wrap" style="margin:0;">
              <table>
                <thead><tr><th>Category</th><th>Units Sold</th><th>Revenue</th></tr></thead>
                <tbody>
                  ${(r.categoryBreakdown || []).map(c => `
                    <tr>
                      <td><strong>${esc(c.category)}</strong></td>
                      <td>${c.units} units</td>
                      <td><strong>${money(c.revenue)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      })() : ''}
    `;
  },

  /* 14. Settings Hub */
  async settings() {
    const s = storeSettings || {};
    const users = await api('/users');
    const config = await api('/homepage');
    const mediaList = await api('/media');
    const couponsList = await api('/coupons');
    const inquiriesList = await api('/inquiries');
    const backups = await api('/backups');
    const logs = await api('/logs');

    return `
      <div class="admin-header-row">
        <div>
          <span class="kicker">CONFIGURATION &amp; ROLES</span>
          <h1 style="font-size:2rem;margin:0">Settings Hub</h1>
        </div>
      </div>

      <!-- Subnav -->
      <div class="admin-subnav" style="margin-top:0;">
        <button class="admin-subnav-btn ${settingsTab === 'store' ? 'active' : ''}" data-a="settingsTab" data-v="store">🏪 Business &amp; GST</button>
        <button class="admin-subnav-btn ${settingsTab === 'staff' ? 'active' : ''}" data-a="settingsTab" data-v="staff">👥 Staff Roles</button>
        <button class="admin-subnav-btn ${settingsTab === 'homepage' ? 'active' : ''}" data-a="settingsTab" data-v="homepage">🏡 Homepage CMS</button>
        <button class="admin-subnav-btn ${settingsTab === 'media' ? 'active' : ''}" data-a="settingsTab" data-v="media">🖼️ Media Library</button>
        <button class="admin-subnav-btn ${settingsTab === 'coupons' ? 'active' : ''}" data-a="settingsTab" data-v="coupons">🏷️ Coupons</button>
        <button class="admin-subnav-btn ${settingsTab === 'inquiries' ? 'active' : ''}" data-a="settingsTab" data-v="inquiries">✉️ Inquiries</button>
        <button class="admin-subnav-btn ${settingsTab === 'backups' ? 'active' : ''}" data-a="settingsTab" data-v="backups">💾 Backups &amp; Logs</button>
      </div>

      ${settingsTab === 'store' ? `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:28px;max-width:850px;">
          <h3 style="margin-top:0;">Reusable Business Profile &amp; Core Configuration</h3>
          <p class="muted" style="margin-top:4px;font-size:0.85rem;">All values below are dynamically pulled across public store, bills, tax invoices, and WhatsApp enquiry links.</p>
          
          <form data-f="saveSettings">
            <div class="two-col" style="padding:0;">
              <div>
                <label for="set-bname">Business / Store Name</label>
                <input id="set-bname" name="business_name" value="${esc(s.business_name || s.storeName || 'Pairaplants')}" required>

                <label for="set-phone">Phone Number</label>
                <input id="set-phone" name="phone_number" value="${esc(s.phone_number || s.phone || '+91 98765 43210')}" required>

                <label for="set-wa">WhatsApp Enquiry Number (with country code, no +)</label>
                <input id="set-wa" name="whatsapp_number" value="${esc(s.whatsapp_number || s.whatsappNumber || '919876543210')}" required placeholder="919876543210">

                <label for="set-email">Business Email</label>
                <input id="set-email" name="email" type="email" value="${esc(s.email || 'care@pairaplants.com')}" required>

                <label for="set-addr">Physical Address</label>
                <textarea id="set-addr" name="business_address" rows="2">${esc(s.business_address || s.address || 'Kochi, Kerala, India')}</textarea>
              </div>

              <div>
                <div class="two-col" style="padding:0;">
                  <div>
                    <label for="set-cur-sym">Currency Symbol</label>
                    <input id="set-cur-sym" name="currency_symbol" value="${esc(s.currency_symbol || s.currencySymbol || '₹')}" required>
                  </div>
                  <div>
                    <label for="set-cur-cod">Currency Code</label>
                    <input id="set-cur-cod" name="currency_code" value="${esc(s.currency_code || s.currency || 'INR')}" required>
                  </div>
                </div>

                <label for="set-gstin">GSTIN (Statutory Tax ID)</label>
                <input id="set-gstin" name="gstin" value="${esc(s.gstin || '32AAAAA0000A1Z5')}" placeholder="32AAAAA0000A1Z5">

                <label for="set-prefix">Invoice Prefix</label>
                <input id="set-prefix" name="invoice_prefix" value="${esc(s.invoice_prefix || s.invoicePrefix || 'PP-INV-')}" required placeholder="PP-INV-">

                <div class="two-col" style="padding:0;">
                  <div>
                    <label for="set-tax">Default GST Tax Rate (%)</label>
                    <input id="set-tax" name="default_tax_rate" type="number" step="0.5" value="${s.default_tax_rate || s.defaultTaxRate || 5}">
                  </div>
                  <div>
                    <label for="set-th">Default Low Stock Threshold</label>
                    <input id="set-th" name="low_stock_default" type="number" value="${s.low_stock_default || s.lowStockDefault || 8}">
                  </div>
                </div>

                <div style="margin-top:14px;">
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" name="tax_enabled" ${s.tax_enabled !== false ? 'checked' : ''}>
                    <span style="font-weight:600;font-size:0.9rem;">Enable GST Tax Invoicing</span>
                  </label>
                </div>
              </div>
            </div>

            <button class="btn-pill" style="margin-top:20px;">Save Business Settings</button>
          </form>
        </div>
      ` : ''}

      ${settingsTab === 'staff' ? `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:28px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;">Staff Accounts &amp; RBAC Permissions</h3>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Username</th><th>Display Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td><strong>${esc(u.username)}</strong></td>
                    <td>${esc(u.name)}</td>
                    <td><span class="badge-status new">${esc(ROLE_NAMES[u.role] || u.role)}</span></td>
                    <td><span class="badge-status ${u.active ? 'instock' : 'out'}">${u.active ? 'Active' : 'Disabled'}</span></td>
                    <td>
                      <div style="display:flex;gap:6px;">
                        <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="resetStaffPw" data-id="${u.id}">Reset PW</button>
                        <button class="btn-pill sm outline" style="padding:4px 8px;font-size:0.75rem;" data-a="toggleStaff" data-id="${u.id}" data-v="${u.active ? '0' : '1'}">${u.active ? 'Disable' : 'Enable'}</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-top:28px;border-top:1px solid var(--line);padding-top:20px;max-width:550px;">
            <h4>Create New Staff Account</h4>
            <form data-f="createStaff" style="margin-top:12px;">
              <div class="two-col" style="padding:0;">
                <div>
                  <label for="ns-u">Username</label>
                  <input id="ns-u" name="username" required>
                  <label for="ns-n">Full Name</label>
                  <input id="ns-n" name="name" required>
                </div>
                <div>
                  <label for="ns-p">Password</label>
                  <input id="ns-p" name="password" type="password" required minlength="6">
                  <label for="ns-r">System Role</label>
                  <select id="ns-r" name="role">
                    <option value="manager">Manager</option>
                    <option value="inventory">Inventory Staff</option>
                    <option value="sales">Sales Staff</option>
                    <option value="support">Customer Support</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>
              </div>
              <button class="btn-pill sm" style="margin-top:12px;">Create Staff Account</button>
            </form>
          </div>
        </div>
      ` : ''}

      ${settingsTab === 'homepage' ? `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:28px;max-width:800px;">
          <h3 style="margin-top:0;">Homepage Hero &amp; CMS Editor</h3>
          <form data-f="saveHomepage">
            <label for="hp-t">Hero Main Title</label>
            <input id="hp-t" name="hero_title" value="${esc((config.hero && config.hero.title) || 'Living Aquatic Wonders')}" required>

            <label for="hp-st">Hero Subtitle</label>
            <input id="hp-st" name="hero_subtitle" value="${esc((config.hero && config.hero.subtitle) || '')}">

            <label for="hp-img">Hero Aquarium Image URL</label>
            <input id="hp-img" name="hero_bannerImage" value="${esc((config.hero && config.hero.bannerImage) || '/images/hero-aquarium.jpg')}">

            <div class="two-col" style="padding:0;margin-top:8px;">
              <div>
                <label for="hp-cta">CTA Button Text</label>
                <input id="hp-cta" name="hero_ctaText" value="${esc((config.hero && config.hero.ctaText) || 'Shop Aquatic Life')}">
              </div>
              <div>
                <label for="hp-link">CTA Button Link</label>
                <input id="hp-link" name="hero_ctaLink" value="${esc((config.hero && config.hero.ctaLink) || '#shop')}">
              </div>
            </div>

            <h4 style="margin-top:24px;border-top:1px solid var(--line);padding-top:16px;">Why Choose Pairaplants Highlights</h4>
            <label for="why-t">Highlights Section Title</label>
            <input id="why-t" name="why_title" value="${esc((config.whyChooseUs && config.whyChooseUs.title) || 'The Pairaplants Difference')}">

            <div class="two-col" style="padding:0;margin-top:12px;">
              ${[0, 1, 2, 3].map(i => {
                const card = (config.whyChooseUs && config.whyChooseUs.cards && config.whyChooseUs.cards[i]) || {};
                return `
                  <div style="background:var(--canvas-alt);padding:14px;border-radius:var(--radius-sm);margin-bottom:12px;">
                    <strong>Feature #${i + 1}</strong>
                    <input name="why_card_${i}_icon" value="${esc(card.icon || '🌿')}" placeholder="Icon (e.g. 🌿)" style="margin:4px 0;">
                    <input name="why_card_${i}_title" value="${esc(card.title || '')}" placeholder="Title" style="margin-bottom:4px;">
                    <textarea name="why_card_${i}_desc" rows="2" placeholder="Description">${esc(card.description || '')}</textarea>
                  </div>
                `;
              }).join('')}
            </div>

            <button class="btn-pill" style="margin-top:14px;">Update Homepage CMS</button>
          </form>
        </div>
      ` : ''}

      ${settingsTab === 'media' ? `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:28px;">
          <h3 style="margin-top:0;">Media Library</h3>
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;">
            <input type="file" id="media-file-input" multiple accept="image/*">
            <button class="btn-pill sm" data-a="uploadMedia">Upload Selected Images</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:14px;">
            ${mediaList.map(m => `
              <div style="border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--canvas);">
                <img src="${esc(m.url)}" alt="" style="width:100%;height:100px;object-fit:cover;">
                <div style="padding:6px;text-align:center;">
                  <button class="btn-pill sm outline" style="padding:2px 6px;font-size:0.7rem;width:100%;" data-a="copyUrl" data-v="${esc(m.url)}">Copy Link</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${settingsTab === 'coupons' ? `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:28px;">
          <h3 style="margin-top:0;">Promotional Coupons</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Actions</th></tr></thead>
              <tbody>
                ${couponsList.map(c => `
                  <tr>
                    <td><code>${esc(c.code)}</code></td>
                    <td><strong>${c.discountType === 'percent' ? `${c.discountValue}% OFF` : money(c.discountValue) + ' OFF'}</strong></td>
                    <td>${money(c.minOrder || 0)}</td>
                    <td>
                      <button class="btn-pill sm outline" style="color:#b91c1c;border-color:#fecaca;padding:2px 8px;" data-a="delCoupon" data-id="${c.id}">Delete</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-top:20px;max-width:500px;">
            <h4>Create New Coupon</h4>
            <form data-f="addCoupon" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
              <input name="code" placeholder="CODE (e.g. MONSOON20)" required>
              <select name="discountType">
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
              <input name="discountValue" type="number" placeholder="Discount Value" required>
              <input name="minOrder" type="number" placeholder="Min Order (₹)">
              <button class="btn-pill sm" style="grid-column:1 / -1;">Create Coupon</button>
            </form>
          </div>
        </div>
      ` : ''}

      ${settingsTab === 'inquiries' ? `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:28px;">
          <h3 style="margin-top:0;">Customer Inquiries (${inquiriesList.length})</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Name</th><th>Email / Phone</th><th>Message</th><th>Actions</th></tr></thead>
              <tbody>
                ${inquiriesList.map(q => `
                  <tr>
                    <td>${new Date(q.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
                    <td><strong>${esc(q.name)}</strong></td>
                    <td>${esc(q.email || q.phone || '-')}</td>
                    <td>${esc(q.message || '')}</td>
                    <td>
                      ${!q.done ? `
                        <button class="btn-pill sm outline" style="padding:2px 8px;font-size:0.75rem;" data-a="resolveInquiry" data-id="${q.id}">Resolve</button>
                      ` : '<span style="color:#166534;font-size:0.8rem;">✓ Resolved</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${settingsTab === 'backups' ? `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-card);padding:28px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;">Database Snapshots &amp; Audit Logs</h3>
            <button class="btn-pill sm" data-a="createBackup">Create Database Snapshot</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Snapshot File</th><th>Created At</th><th>Size</th><th>Actions</th></tr></thead>
              <tbody>
                ${backups.map(b => `
                  <tr>
                    <td><code>${esc(b.file)}</code></td>
                    <td>${new Date(b.created).toLocaleString('en-IN')}</td>
                    <td>${Math.round(b.size / 1024)} KB</td>
                    <td>
                      <button class="btn-pill sm outline" style="padding:2px 8px;font-size:0.75rem;" data-a="restoreBackup" data-f="${esc(b.file)}">Restore</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <h4 style="margin-top:24px;">Recent System Audit Logs</h4>
          <div style="background:var(--canvas-alt);border:1px solid var(--line);border-radius:var(--radius-sm);max-height:220px;overflow-y:auto;padding:12px;font-family:monospace;font-size:0.8rem;">
            ${logs.slice(0, 40).map(l => `
              <div style="padding:3px 0;border-bottom:1px solid var(--line-subtle);">
                <span class="muted">${new Date(l.date || Date.now()).toLocaleTimeString()}</span> · 
                <strong>[${esc(l.type || 'SYSTEM')}]</strong> ${esc(l.text || l.reason || '')}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
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
              <a class="btn-whatsapp" href="${getWhatsAppEnquiryUrl(p)}" title="WhatsApp Enquiry (Lead Only - No Stock Deduction)" target="_blank">💬 WhatsApp Enquiry (Customer Lead)</a>
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

              <label for="p-sn">Scientific Name (Botanical / Taxon)</label>
              <input id="p-sn" name="scientificName" value="${isEdit ? esc(p.scientificName || '') : ''}" placeholder="e.g. Bucephalandra sp. 'Kedagang'">

              <label for="p-c">Category</label>
              <select id="p-c" name="category">
                ${CATS.map(c => `<option ${isEdit && p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>

              <label for="p-sc">Subcategory</label>
              <input id="p-sc" name="subcategory" value="${isEdit ? esc(p.subcategory || '') : ''}" placeholder="e.g. Foreground Plants">

              <label for="p-sku">SKU / Product Code</label>
              <input id="p-sku" name="sku" value="${isEdit ? esc(p.sku || '') : ''}" placeholder="e.g. PP-PLT-087">

              <label for="p-d">Product Description</label>
              <textarea id="p-d" name="description" rows="3">${isEdit ? esc(p.description || '') : ''}</textarea>
            </div>

            <div>
              <div class="two-col" style="padding:0;">
                <div>
                  <label for="p-cp">Purchase Cost (₹)</label>
                  <input id="p-cp" name="purchasePrice" type="number" min="0" step="any" value="${isEdit ? (p.purchasePrice || '') : ''}" placeholder="120">
                </div>
                <div>
                  <label for="p-pr">Selling Price (₹)</label>
                  <input id="p-pr" name="price" type="number" min="0" step="any" required value="${isEdit ? p.price : ''}" placeholder="250">
                </div>
              </div>

              <label for="p-sp">Sale Price (₹, optional)</label>
              <input id="p-sp" name="salePrice" type="number" min="0" step="any" value="${isEdit && p.salePrice ? p.salePrice : ''}" placeholder="Leave blank if not on discount">

              <div class="two-col" style="padding:0;">
                <div>
                  <label for="p-st">Available Stock</label>
                  <input id="p-st" name="stock" type="number" min="0" required value="${isEdit ? p.stock : 10}">
                </div>
                <div>
                  <label for="p-th">Low Stock Threshold</label>
                  <input id="p-th" name="lowStockThreshold" type="number" min="0" value="${isEdit ? (p.lowStockThreshold || 5) : 5}">
                </div>
              </div>

              <div class="two-col" style="padding:0;">
                <div>
                  <label for="p-diff">Difficulty Level</label>
                  <select id="p-diff" name="difficulty">
                    <option value="Easy" ${isEdit && p.difficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                    <option value="Moderate" ${isEdit && p.difficulty === 'Moderate' ? 'selected' : ''}>Moderate</option>
                    <option value="Advanced" ${isEdit && p.difficulty === 'Advanced' ? 'selected' : ''}>Advanced</option>
                  </select>
                </div>
                <div>
                  <label for="p-light">Lighting Requirements</label>
                  <select id="p-light" name="lighting">
                    <option value="Low" ${isEdit && p.lighting === 'Low' ? 'selected' : ''}>Low Light</option>
                    <option value="Moderate" ${isEdit && p.lighting === 'Moderate' ? 'selected' : ''}>Moderate Light</option>
                    <option value="High" ${isEdit && p.lighting === 'High' ? 'selected' : ''}>High Light (CO2 Rec.)</option>
                  </select>
                </div>
              </div>

              <div class="two-col" style="padding:0;">
                <div>
                  <label for="p-temp">Temperature Range</label>
                  <input id="p-temp" name="temperatureRange" value="${isEdit ? esc(p.temperatureRange || '22°C - 28°C') : '22°C - 28°C'}">
                </div>
                <div>
                  <label for="p-batch">Batch / Lot #</label>
                  <input id="p-batch" name="batchNumber" value="${isEdit ? esc(p.batchNumber || '') : ''}" placeholder="BATCH-2026-03">
                </div>
              </div>

              <div style="margin-top:12px;display:flex;gap:16px;">
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
   ADDITIONAL ADMIN MODALS (SUPPLIERS, PURCHASES, STOCK, CUSTOMERS, ORDERS, POS)
   ============================================================================== */
function showSupplierModal(sup = null) {
  const isEdit = !!sup;
  const html = `
    <div class="modal-card" style="max-width:550px;">
      <div class="modal-head">
        <h3>${isEdit ? 'Edit Supplier: ' + esc(sup.name) : 'Add New Supplier'}</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <form data-f="saveSupplier" data-id="${isEdit ? sup.id : ''}">
          <label for="sup-n">Supplier / Nursery Name</label>
          <input id="sup-n" name="name" required value="${isEdit ? esc(sup.name) : ''}" placeholder="e.g. Kerala Aquatic Nursery">

          <div class="two-col" style="padding:0;">
            <div>
              <label for="sup-cp">Contact Person</label>
              <input id="sup-cp" name="contactPerson" value="${isEdit ? esc(sup.contactPerson || '') : ''}">

              <label for="sup-ph">Phone / WhatsApp</label>
              <input id="sup-ph" name="phone" required value="${isEdit ? esc(sup.phone || '') : ''}">
            </div>
            <div>
              <label for="sup-em">Email Address</label>
              <input id="sup-em" name="email" type="email" value="${isEdit ? esc(sup.email || '') : ''}">

              <label for="sup-gst">GSTIN</label>
              <input id="sup-gst" name="gstin" value="${isEdit ? esc(sup.gstin || '') : ''}" placeholder="32AAAAA0000A1Z5">
            </div>
          </div>

          <label for="sup-ad">Address / State</label>
          <input id="sup-ad" name="address" value="${isEdit ? esc(sup.address || '') : ''}">

          <div class="two-col" style="padding:0;">
            <div>
              <label for="sup-pt">Payment Terms</label>
              <select id="sup-pt" name="paymentTerms">
                <option value="Net 30" ${isEdit && sup.paymentTerms === 'Net 30' ? 'selected' : ''}>Net 30 Days</option>
                <option value="Net 15" ${isEdit && sup.paymentTerms === 'Net 15' ? 'selected' : ''}>Net 15 Days</option>
                <option value="Cash / Advance" ${isEdit && sup.paymentTerms === 'Cash / Advance' ? 'selected' : ''}>Cash / Advance</option>
              </select>
            </div>
            <div>
              <label for="sup-bal">Opening Balance (₹)</label>
              <input id="sup-bal" name="balance" type="number" value="${isEdit ? (sup.balance || 0) : 0}">
            </div>
          </div>

          <div class="modal-footer" style="margin-top:20px;padding:0;background:none;border:none;">
            <button type="button" class="btn-pill sm outline" data-a="closeModal">Cancel</button>
            <button type="submit" class="btn-pill sm">${isEdit ? 'Update Supplier' : 'Save Supplier'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
  openModal(html);
}

async function showNewPurchaseModal(supId = null) {
  const suppliers = await api('/suppliers');
  await loadProducts();
  const html = `
    <div class="modal-card" style="max-width:800px;">
      <div class="modal-head">
        <h3>Record Supplier Purchase / Stock In</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <form data-f="savePurchase">
          <div class="two-col" style="padding:0;">
            <div>
              <label for="po-sup">Supplier</label>
              <select id="po-sup" name="supplierId" required>
                ${suppliers.map(s => `<option value="${s.id}" ${supId && +supId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label for="po-pay">Payment Status</label>
              <select id="po-pay" name="paymentStatus">
                <option value="Paid">Paid</option>
                <option value="Pending">Pending / Credit</option>
              </select>
            </div>
          </div>

          <h4 style="margin-top:16px;margin-bottom:8px;">Line Items (Stock In)</h4>
          <div id="po-items-container">
            <div class="po-item-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 40px;gap:8px;margin-bottom:8px;align-items:center;">
              <select name="productId" required>
                <option value="">-- Select Product --</option>
                ${products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.sku || p.id)})</option>`).join('')}
              </select>
              <input name="quantity" type="number" min="1" value="10" placeholder="Qty" required>
              <input name="unitCost" type="number" min="0" step="any" placeholder="Unit Cost (₹)" required>
              <button type="button" class="btn-pill sm outline" style="padding:4px;color:#b91c1c;border-color:#fecaca;" onclick="this.closest('.po-item-row').remove()">&times;</button>
            </div>
          </div>

          <button type="button" class="btn-pill sm outline" style="margin-top:6px;" data-a="addPoLineItem">+ Add Another Line Item</button>

          <label for="po-notes" style="margin-top:14px;">Notes / Invoice Reference</label>
          <input id="po-notes" name="notes" placeholder="e.g. Nursery shipment invoice #9842">

          <div class="modal-footer" style="margin-top:20px;padding:0;background:none;border:none;">
            <button type="button" class="btn-pill sm outline" data-a="closeModal">Cancel</button>
            <button type="submit" class="btn-pill sm">Record Purchase &amp; Add Stock</button>
          </div>
        </form>
      </div>
    </div>
  `;
  openModal(html);
}

function showPurchaseDetailModal(po) {
  const html = `
    <div class="modal-card" style="max-width:700px;">
      <div class="modal-head">
        <h3>Purchase Order: ${esc(po.poNumber || 'PO-' + po.id)}</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;margin-bottom:16px;background:var(--canvas-alt);padding:14px;border-radius:var(--radius-sm);">
          <div>
            <div><strong>Supplier:</strong> ${esc(po.supplierName || 'Supplier')}</div>
            <div><strong>Date:</strong> ${new Date(po.createdAt || Date.now()).toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div><strong>Status:</strong> <span class="badge-status instock">${esc(po.status || 'Received')}</span></div>
            <div><strong>Payment:</strong> <span class="badge-status ${po.paymentStatus === 'Paid' ? 'paid' : 'pending'}">${esc(po.paymentStatus || 'Paid')}</span></div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Quantity</th><th>Unit Cost</th><th>Total</th></tr></thead>
            <tbody>
              ${(po.items || []).map(i => `
                <tr>
                  <td><strong>${esc(i.productName || 'Item #' + i.productId)}</strong></td>
                  <td>${i.quantity} units</td>
                  <td>${money(i.unitCost || 0)}</td>
                  <td><strong>${money(i.totalCost || (i.quantity * (i.unitCost || 0)))}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <th colspan="3" style="text-align:right;">Grand Total:</th>
                <th>${money(po.totalCost || 0)}</th>
              </tr>
            </tfoot>
          </table>
        </div>

        ${po.notes ? `<p style="margin-top:10px;font-size:0.85rem;color:var(--ink-secondary);"><strong>Notes:</strong> ${esc(po.notes)}</p>` : ''}

        <div class="modal-footer" style="margin-top:20px;padding:0;background:none;border:none;">
          <button type="button" class="btn-pill sm outline" data-a="closeModal">Close</button>
        </div>
      </div>
    </div>
  `;
  openModal(html);
}

async function showStockAdjustModal(pid = null) {
  await loadProducts();
  const html = `
    <div class="modal-card" style="max-width:550px;">
      <div class="modal-head">
        <h3>Adjust Stock / Record Living Goods Loss</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <form data-f="saveStockAdjust">
          <label for="adj-p">Select Botanical Item</label>
          <select id="adj-p" name="productId" required>
            ${products.map(p => `
              <option value="${p.id}" ${pid && +pid === p.id ? 'selected' : ''}>
                ${esc(p.name)} (Current Stock: ${p.stock})
              </option>
            `).join('')}
          </select>

          <div class="two-col" style="padding:0;">
            <div>
              <label for="adj-t">Adjustment Type</label>
              <select id="adj-t" name="type" required>
                <option value="adjustment">Physical Count Audit</option>
                <option value="mortality">Living Goods Mortality (Casualty / Melt)</option>
                <option value="damage">Transit Damage / Breakage</option>
                <option value="sample">Display Tank / Sample</option>
              </select>
            </div>
            <div>
              <label for="adj-c">Quantity Change (+ or -)</label>
              <input id="adj-c" name="change" type="number" required placeholder="-2 or +5">
              <span class="muted" style="font-size:0.75rem;">Negative (-) for loss/mortality, positive (+) for surplus.</span>
            </div>
          </div>

          <label for="adj-r">Mandatory Reason / Description</label>
          <input id="adj-r" name="reason" required placeholder="e.g. Cryptocoryne leaf melt during acclimatization">

          <label for="adj-b">Batch / Lot Number (Optional)</label>
          <input id="adj-b" name="batchNumber" placeholder="e.g. BATCH-2026-03">

          <div class="modal-footer" style="margin-top:20px;padding:0;background:none;border:none;">
            <button type="button" class="btn-pill sm outline" data-a="closeModal">Cancel</button>
            <button type="submit" class="btn-pill sm">Save Adjustment</button>
          </div>
        </form>
      </div>
    </div>
  `;
  openModal(html);
}

function showCustomerModal(c = null) {
  const isEdit = !!c;
  const html = `
    <div class="modal-card" style="max-width:550px;">
      <div class="modal-head">
        <h3>${isEdit ? 'Edit Customer' : 'Add New Customer'}</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <form data-f="saveCustomer" data-id="${isEdit ? c.id : ''}">
          <label for="cm-n">Full Name</label>
          <input id="cm-n" name="name" required value="${isEdit ? esc(c.name) : ''}">

          <div class="two-col" style="padding:0;">
            <div>
              <label for="cm-p">Phone / WhatsApp</label>
              <input id="cm-p" name="phone" required value="${isEdit ? esc(c.phone || '') : ''}">
            </div>
            <div>
              <label for="cm-e">Email Address</label>
              <input id="cm-e" name="email" type="email" value="${isEdit ? esc(c.email || '') : ''}">
            </div>
          </div>

          <label for="cm-a">Address</label>
          <input id="cm-a" name="address" value="${isEdit ? esc(c.address || '') : ''}">

          <div class="two-col" style="padding:0;">
            <div>
              <label for="cm-c">City</label>
              <input id="cm-c" name="city" value="${isEdit ? esc(c.city || '') : ''}">
            </div>
            <div>
              <label for="cm-s">State / Pincode</label>
              <input id="cm-s" name="state" value="${isEdit ? esc(c.state || '') : ''}">
            </div>
          </div>

          <div class="modal-footer" style="margin-top:20px;padding:0;background:none;border:none;">
            <button type="button" class="btn-pill sm outline" data-a="closeModal">Cancel</button>
            <button type="submit" class="btn-pill sm">${isEdit ? 'Update Customer' : 'Create Customer'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
  openModal(html);
}

async function showCustomerProfileModal(custId) {
  const cust = await api(`/customers/${custId}`);
  const html = `
    <div class="modal-card" style="max-width:700px;">
      <div class="modal-head">
        <h3>Customer Profile: ${esc(cust.name)}</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="kpi-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:18px;">
          <div class="kpi-card">
            <span class="kpi-title">Total Orders</span>
            <div class="kpi-value">${cust.totalOrders || (cust.orders || []).length || 0}</div>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">Total Spent</span>
            <div class="kpi-value" style="color:var(--forest-primary);">${money(cust.totalSpend || 0)}</div>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">Phone</span>
            <div style="font-size:0.95rem;font-weight:600;margin-top:8px;">${esc(cust.phone || '-')}</div>
          </div>
        </div>

        <div style="background:var(--canvas-alt);padding:14px;border-radius:var(--radius-sm);margin-bottom:16px;">
          <div><strong>Email:</strong> ${esc(cust.email || '-')}</div>
          <div><strong>Shipping Address:</strong> ${esc(cust.address || '-')}, ${esc(cust.city || '')} ${esc(cust.state || '')}</div>
        </div>

        <h4>Order History (${(cust.orders || []).length})</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Order ID</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              ${(cust.orders || []).length ? (cust.orders || []).map(o => `
                <tr>
                  <td><code>#${o.id}</code></td>
                  <td>${new Date(o.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
                  <td><strong>${money(o.total || 0)}</strong></td>
                  <td><span class="badge-status ${esc(o.status || 'completed')}">${esc(o.status || 'Completed')}</span></td>
                </tr>
              `).join('') : '<tr><td colspan="4" class="muted">No past orders.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="modal-footer" style="margin-top:20px;padding:0;background:none;border:none;">
          <button type="button" class="btn-pill sm outline" data-a="closeModal">Close</button>
        </div>
      </div>
    </div>
  `;
  openModal(html);
}

function showOrderDetailModal(o) {
  const html = `
    <div class="modal-card" style="max-width:700px;">
      <div class="modal-head">
        <h3>Order Details #${o.id}</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <div style="background:var(--canvas-alt);padding:14px;border-radius:var(--radius-sm);margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;">
            <div>
              <strong>Customer:</strong> ${esc(o.name || (o.customer && o.customer.name) || 'Customer')}<br>
              <strong>Phone:</strong> ${esc(o.phone || '-')}<br>
              <strong>Email:</strong> ${esc(o.email || '-')}<br>
              <strong>Shipping:</strong> ${esc(o.address || '-')}, ${esc(o.city || '')} ${esc(o.pincode || '')}
            </div>
            <div style="text-align:right;">
              <strong>Date:</strong> ${new Date(o.createdAt || Date.now()).toLocaleDateString('en-IN')}<br>
              <strong>Status:</strong> <span class="badge-status ${esc(o.status || 'new')}">${esc(o.status || 'NEW')}</span><br>
              <strong>Payment:</strong> <span class="badge-status ${o.paymentMethod === 'cod' ? 'pending' : 'paid'}">${esc(o.paymentMethod || 'Online')}</span>
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead><tr><th>Product Item</th><th>Quantity</th><th>Price</th><th>Line Total</th></tr></thead>
            <tbody>
              ${(o.items || []).map(i => {
                const prod = findProduct(i.id || i.productId);
                return `
                  <tr>
                    <td><strong>${esc(i.name || (prod ? prod.name : 'Item #' + i.id))}</strong></td>
                    <td>${i.qty || i.quantity || 1} units</td>
                    <td>${money(i.price || (prod ? prod.price : 0))}</td>
                    <td><strong>${money((i.qty || i.quantity || 1) * (i.price || (prod ? prod.price : 0)))}</strong></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <th colspan="3" style="text-align:right;">Grand Total:</th>
                <th>${money(o.total || 0)}</th>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="modal-footer" style="margin-top:20px;padding:0;background:none;border:none;">
          <button type="button" class="btn-pill sm outline" data-a="closeModal">Close</button>
        </div>
      </div>
    </div>
  `;
  openModal(html);
}

function showPosReceiptModal(sale, invoice) {
  const html = `
    <div class="modal-card" style="max-width:500px;">
      <div class="modal-head">
        <h3>POS Bill Generated ✓</h3>
        <button class="modal-close" data-a="closeModal">&times;</button>
      </div>
      <div class="modal-body" style="text-align:center;">
        <div style="font-size:3rem;margin-bottom:10px;">🧾</div>
        <h4 style="margin:0;color:var(--forest-primary)">Sale Completed Successfully</h4>
        <p class="muted" style="margin:4px 0 16px;">Tax Invoice: <strong>${esc(invoice.invoiceNumber)}</strong></p>

        <div style="background:var(--canvas-alt);padding:14px;border-radius:var(--radius-sm);text-align:left;font-size:0.88rem;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Customer:</span>
            <strong>${esc(sale.customerName || 'Walk-in')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Payment Mode:</span>
            <strong>${esc(sale.paymentMethod || 'Cash')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Taxable Subtotal:</span>
            <span>${money(sale.subtotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>GST (5%):</span>
            <span>${money(sale.taxAmount)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:6px;font-weight:700;font-size:1rem;color:var(--forest-primary);">
            <span>Grand Total Paid:</span>
            <span>${money(sale.grandTotal)}</span>
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:center;">
          <a class="btn-pill sm" href="/api/invoices/${invoice.id}/print" target="_blank">🖨️ Print Tax Invoice</a>
          <button class="btn-pill sm outline" data-a="closeModal">Start Next Sale</button>
        </div>
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
  posAddToCart(btn) {
    const pid = +btn.dataset.id;
    const p = findProduct(pid);
    if (!p) return;
    if (p.stock <= 0) return toast(`${p.name} is out of stock!`, 'error');
    const existing = posCart.find(i => i.id === pid);
    if (existing) {
      if (existing.qty >= p.stock) return toast(`Cannot add more than ${p.stock} units (current stock)`, 'error');
      existing.qty += 1;
    } else {
      posCart.push({ id: p.id, name: p.name, price: p.price, stock: p.stock, qty: 1, image: p.image, sku: p.sku });
    }
    return render();
  },
  posIncQty(btn) {
    const pid = +btn.dataset.id;
    const item = posCart.find(i => i.id === pid);
    if (!item) return;
    if (item.qty >= item.stock) return toast(`Cannot exceed available stock (${item.stock} units)`, 'error');
    item.qty += 1;
    return render();
  },
  posDecQty(btn) {
    const pid = +btn.dataset.id;
    const item = posCart.find(i => i.id === pid);
    if (!item) return;
    item.qty -= 1;
    if (item.qty <= 0) posCart = posCart.filter(i => i.id !== pid);
    return render();
  },
  posRemoveItem(btn) {
    const pid = +btn.dataset.id;
    posCart = posCart.filter(i => i.id !== pid);
    return render();
  },
  posClearCart() {
    if (posCart.length && confirm('Clear current POS cart?')) {
      posCart = [];
      return render();
    }
  },
  posCategory(btn) {
    posCategoryFilter = btn.dataset.v;
    return render();
  },
  stockTab(btn) {
    stockTab = btn.dataset.v;
    return render();
  },
  settingsTab(btn) {
    settingsTab = btn.dataset.v;
    return render();
  },
  reportsPeriod(btn) {
    reportsPeriod = btn.dataset.v;
    return render();
  },
  openAddSupplierModal() {
    showSupplierModal();
  },
  async editSupplier(btn) {
    const list = await api('/suppliers');
    const s = list.find(x => x.id === +btn.dataset.id);
    if (s) showSupplierModal(s);
  },
  async delSupplier(btn) {
    if (confirm('Delete this supplier record?')) {
      await api(`/suppliers/${btn.dataset.id}`, 'DELETE');
      toast('Supplier removed');
      return render();
    }
  },
  openNewPurchaseModal(btn) {
    const supId = btn && btn.dataset && btn.dataset.sup;
    showNewPurchaseModal(supId);
  },
  async viewPurchase(btn) {
    const list = await api('/purchases');
    const po = list.find(x => x.id === +btn.dataset.id);
    if (po) showPurchaseDetailModal(po);
  },
  openStockAdjustModal(btn) {
    const pid = btn && btn.dataset && btn.dataset.id;
    showStockAdjustModal(pid);
  },
  openAddCustomerModal() {
    showCustomerModal();
  },
  async viewCustomer(btn) {
    showCustomerProfileModal(+btn.dataset.id);
  },
  async editCustomer(btn) {
    const list = await api('/customers');
    const c = list.find(x => x.id === +btn.dataset.id);
    if (c) showCustomerModal(c);
  },
  async verifyPayment(btn) {
    await api(`/payments/${btn.dataset.id}/status`, 'PATCH', { status: 'Completed' });
    toast('Payment marked as verified & completed');
    return render();
  },
  async viewOrder(btn) {
    const list = await api('/orders');
    const o = list.find(x => x.id === +btn.dataset.id);
    if (o) showOrderDetailModal(o);
  },
  addPoLineItem() {
    const container = $('#po-items-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'po-item-row';
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 40px;gap:8px;margin-bottom:8px;align-items:center;';
    row.innerHTML = `
      <select name="productId" required>
        <option value="">-- Select Product --</option>
        ${products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.sku || p.id)})</option>`).join('')}
      </select>
      <input name="quantity" type="number" min="1" value="10" placeholder="Qty" required>
      <input name="unitCost" type="number" min="0" step="any" placeholder="Unit Cost (₹)" required>
      <button type="button" class="btn-pill sm outline" style="padding:4px;color:#b91c1c;border-color:#fecaca;" onclick="this.closest('.po-item-row').remove()">&times;</button>
    `;
    container.appendChild(row);
  },
  async posCheckout() {
    if (!posCart.length) return toast('Cart is empty!', 'error');
    const custSelect = $('#pos-cust-select');
    const custName = $('#pos-cust-name') ? $('#pos-cust-name').value.trim() : '';
    const custPhone = $('#pos-cust-phone') ? $('#pos-cust-phone').value.trim() : '';
    const discountPct = $('#pos-discount-pct') ? (+($('#pos-discount-pct').value) || 0) : 0;
    const methodEl = document.querySelector('input[name="posPaymentMethod"]:checked');
    const paymentMethod = methodEl ? methodEl.value : 'Cash';

    const customerId = (custSelect && custSelect.value !== 'walkin') ? +custSelect.value : null;

    try {
      const payload = {
        customerId,
        customerName: custName || (customerId ? null : 'Walk-in Customer'),
        customerPhone: custPhone,
        items: posCart.map(i => ({ productId: i.id, quantity: i.qty, unitPrice: i.price })),
        discountPercent: discountPct,
        paymentMethod
      };
      const res = await api('/pos/checkout', 'POST', payload);
      posCart = [];
      toast('POS Counter Sale completed!');
      await loadProducts();
      showPosReceiptModal(res.posSale, res.invoice);
      return render();
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  reportsTab(btn) {
    reportsTab = btn.dataset.v;
    return render();
  },
  applyStockHistoryFilter() {
    stockHistoryFilter.product = $('#sh-filter-prod') ? $('#sh-filter-prod').value : '';
    stockHistoryFilter.type = $('#sh-filter-type') ? $('#sh-filter-type').value : 'all';
    stockHistoryFilter.search = $('#sh-filter-search') ? $('#sh-filter-search').value.trim() : '';
    stockHistoryFilter.startDate = $('#sh-filter-from') ? $('#sh-filter-from').value : '';
    stockHistoryFilter.endDate = $('#sh-filter-to') ? $('#sh-filter-to').value : '';
    return render();
  },
  applyPurchaseReportFilter() {
    purchaseReportFilter.supplierId = $('#pr-filter-sup') ? $('#pr-filter-sup').value : '';
    purchaseReportFilter.startDate = $('#pr-filter-from') ? $('#pr-filter-from').value : '';
    purchaseReportFilter.endDate = $('#pr-filter-to') ? $('#pr-filter-to').value : '';
    return render();
  },
  applySalesReportFilter() {
    salesReportFilter.channel = $('#sr-filter-chan') ? $('#sr-filter-chan').value : 'all';
    salesReportFilter.paymentMethod = $('#sr-filter-meth') ? $('#sr-filter-meth').value : 'all';
    salesReportFilter.startDate = $('#sr-filter-from') ? $('#sr-filter-from').value : '';
    salesReportFilter.endDate = $('#sr-filter-to') ? $('#sr-filter-to').value : '';
    return render();
  },
  printReport(btn) {
    const reportArea = $('#printable-report-area');
    if (!reportArea) return window.print();

    const title = btn.dataset.v ? btn.dataset.v.replace('-', ' ').toUpperCase() + ' REPORT' : 'INVENTORY AUDIT REPORT';
    const s = storeSettings || {};
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title} - ${s.business_name || 'Pairaplants'}</title>
        <style>
          body { font-family: -apple-system, sans-serif; padding: 24px; color: #1e293b; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e5c3c; padding-bottom: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
          th { background: #f1f5f9; color: #0f172a; }
          .badge-status { font-weight: bold; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h2 style="margin:0;color:#1e5c3c;">🌿 ${s.business_name || 'Pairaplants'}</h2>
            <div style="font-size:12px;color:#64748b;">${s.business_address || 'Kochi, Kerala, India'} · GSTIN: ${s.gstin || '32AAAAA0000A1Z5'}</div>
          </div>
          <div style="text-align:right;">
            <h3 style="margin:0;">${title}</h3>
            <div style="font-size:12px;color:#64748b;">Generated: ${new Date().toLocaleString('en-IN')}</div>
          </div>
        </div>
        ${reportArea.outerHTML}
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    win.document.close();
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
  async saveSupplier(d, f) {
    const id = f.dataset.id;
    const payload = {
      name: d.name,
      contactPerson: d.contactPerson,
      phone: d.phone,
      email: d.email,
      address: d.address,
      gstin: d.gstin,
      paymentTerms: d.paymentTerms || 'Net 30',
      balance: +d.balance || 0
    };
    if (id) {
      await api(`/suppliers/${id}`, 'PUT', payload);
      toast('Supplier updated!');
    } else {
      await api('/suppliers', 'POST', payload);
      toast('Supplier added!');
    }
    closeModal();
    return render();
  },
  async savePurchase(d, f) {
    const items = [];
    const itemRows = f.querySelectorAll('.po-item-row');
    itemRows.forEach(row => {
      const pid = +row.querySelector('[name="productId"]').value;
      const qty = +row.querySelector('[name="quantity"]').value;
      const unitCost = +row.querySelector('[name="unitCost"]').value;
      const p = findProduct(pid);
      if (pid && qty > 0) {
        items.push({
          productId: pid,
          productName: p ? p.name : 'Item #' + pid,
          quantity: qty,
          unitCost: unitCost || (p ? p.purchasePrice : 0),
          totalCost: (qty * (unitCost || (p ? p.purchasePrice : 0)))
        });
      }
    });
    if (!items.length) return toast('Please select at least one item.', 'error');
    const payload = {
      supplierId: +d.supplierId,
      items,
      paymentStatus: d.paymentStatus || 'Paid',
      notes: d.notes || ''
    };
    await api('/purchases', 'POST', payload);
    toast('Purchase order recorded and stock added!');
    closeModal();
    await loadProducts();
    return render();
  },
  async saveStockAdjust(d) {
    const payload = {
      productId: +d.productId,
      type: d.type || 'adjustment',
      change: +d.change,
      reason: d.reason,
      batchNumber: d.batchNumber || null
    };
    await api('/inventory/adjust', 'POST', payload);
    toast('Stock adjustment / loss recorded!');
    closeModal();
    await loadProducts();
    return render();
  },
  async saveCustomer(d, f) {
    const id = f.dataset.id;
    const payload = {
      name: d.name,
      phone: d.phone,
      email: d.email,
      address: d.address,
      city: d.city,
      state: d.state
    };
    if (id) {
      await api(`/customers/${id}`, 'PUT', payload);
      toast('Customer profile updated!');
    } else {
      await api('/customers', 'POST', payload);
      toast('Customer added!');
    }
    closeModal();
    return render();
  },

  async saveProduct(d, f) {
    const id = f.dataset.id;
    let images = [];
    try { images = JSON.parse(d.images_json || '[]'); } catch (e) {}

    const payload = {
      name: d.name,
      scientificName: d.scientificName || '',
      category: d.category,
      subcategory: d.subcategory,
      sku: d.sku,
      price: +d.price,
      salePrice: d.salePrice ? +d.salePrice : null,
      purchasePrice: d.purchasePrice ? +d.purchasePrice : Math.round(+d.price * 0.55),
      stock: +d.stock,
      lowStockThreshold: +d.lowStockThreshold || 5,
      difficulty: d.difficulty || 'Easy',
      lighting: d.lighting || 'Moderate',
      growthRate: d.growthRate || 'Moderate',
      temperatureRange: d.temperatureRange || '22°C - 28°C',
      tankCompatibility: d.tankCompatibility || 'Community safe',
      batchNumber: d.batchNumber || '',
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
    const payload = {
      business_name: d.business_name,
      storeName: d.business_name,
      brandTitle: d.business_name,
      business_address: d.business_address,
      address: d.business_address,
      phone_number: d.phone_number,
      phone: d.phone_number,
      whatsapp_number: d.whatsapp_number,
      whatsappNumber: d.whatsapp_number,
      email: d.email,
      currency_code: d.currency_code,
      currency: d.currency_code,
      currency_symbol: d.currency_symbol,
      currencySymbol: d.currency_symbol,
      invoice_prefix: d.invoice_prefix,
      invoicePrefix: d.invoice_prefix,
      gstin: d.gstin,
      tax_enabled: !!d.tax_enabled,
      default_tax_rate: +d.default_tax_rate || 5,
      defaultTaxRate: +d.default_tax_rate || 5,
      low_stock_default: +d.low_stock_default || 8,
      lowStockDefault: +d.low_stock_default || 8
    };

    await api('/settings', 'PUT', payload);
    storeSettings = await api('/settings');
    applyStoreSettings();
    toast('Reusable business settings updated successfully!');
    return render();
  },
  async submitReview(d, f) {
    const id = f.dataset.id;
    await api(`/products/${id}/reviews`, 'POST', d);
    toast('Thank you for your review!');
    showProductDetailModal(id);
  },
  closeMobileNav() {
    closeMobileNav();
  },
  openMobileNav() {
    openMobileNav();
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
  } else if (e.target.dataset.i === 'pos-search') {
    posSearchQuery = e.target.value.toLowerCase().trim();
    $('.pos-prod-card').forEach(card => {
      const text = (card.dataset.name + ' ' + (card.dataset.sku || '')).toLowerCase();
      card.style.display = (!posSearchQuery || text.includes(posSearchQuery)) ? '' : 'none';
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

  const navEl = $('#nav');
  if (navEl) {
    navEl.innerHTML = Object.entries(navMap).map(([k, v]) => `
      <a href="#${k}" ${k == r ? 'aria-current="page"' : ''}>
        ${v}${k == 'cart' && cartCount() ? `<span class="cart-badge">${cartCount()}</span>` : ''}
      </a>
    `).join('');
  }

  const mobileNavLinksEl = $('#mobile-nav-links');
  if (mobileNavLinksEl) {
    mobileNavLinksEl.innerHTML = Object.entries(navMap).map(([k, v]) => `
      <a class="mobile-nav-item ${k == r ? 'active' : ''}" href="#${k}" data-a="closeMobileNav">
        <span>${v}</span>
        ${k == 'cart' && cartCount() ? `<span class="cart-badge">${cartCount()}</span>` : ''}
      </a>
    `).join('');
  }

  const actionsEl = $('#header-user-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      <a class="btn-pill outline sm" href="#account">${customerUser ? 'My Account' : 'Sign In'}</a>
      <a class="btn-pill outline sm staff-btn" href="#staff">${staffUser ? 'Staff Dashboard' : 'Staff Portal'}</a>
    `;
  }

  const mobileUserActionsEl = $('#mobile-nav-user-actions');
  if (mobileUserActionsEl) {
    mobileUserActionsEl.innerHTML = `
      <a class="btn-pill outline sm" href="#account" data-a="closeMobileNav">${customerUser ? 'My Account' : 'Sign In'}</a>
      <a class="btn-pill outline sm staff-btn" href="#staff" data-a="closeMobileNav">${staffUser ? 'Staff Dashboard' : 'Staff Portal'}</a>
    `;
  }

  return r;
}

function openMobileNav() {
  const drawer = $('#mobile-nav-drawer');
  const toggleBtn = $('#mobile-menu-toggle');
  if (drawer) {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', 'true');
  }
  document.body.classList.add('menu-open');
}

function closeMobileNav() {
  const drawer = $('#mobile-nav-drawer');
  const toggleBtn = $('#mobile-menu-toggle');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', 'false');
  }
  document.body.classList.remove('menu-open');
}

document.addEventListener('click', e => {
  if (e.target.closest('#mobile-menu-toggle')) {
    e.preventDefault();
    openMobileNav();
  } else if (e.target.closest('#mobile-nav-close') || e.target.closest('#mobile-nav-backdrop') || e.target.closest('[data-a="closeMobileNav"]')) {
    closeMobileNav();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMobileNav();
});

/* ---------- Page Render Execution ---------- */
async function render() {
  const route = updateHeaderNav();
  try {
    $('#app').innerHTML = await pages[route]();
  } catch (e) {
    $('#app').innerHTML = `<div style="color:var(--terracotta);padding:60px 24px;text-align:center;"><h2>Page Render Error</h2><p>${esc(e.message)}</p></div>`;
  }
}

addEventListener('hashchange', () => {
  closeMobileNav();
  render().then(() => scrollTo(0, 0));
});

/* ---------- Application Bootstrap ---------- */
(async () => {
  try { await loadStoreMetadata(); } catch (e) {}
  try { await loadProducts(); } catch (e) {}
  try { staffUser = await api('/me'); } catch (e) {}
  try { customerUser = await api('/customer/me'); } catch (e) {}
  render();
})();
