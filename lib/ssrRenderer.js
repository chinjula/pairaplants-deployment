// lib/ssrRenderer.js - Server-Side Rendering Engine for Paira Plants
'use strict';

const { icon } = require('./lucideIcons');

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

function formatMoney(n, symbol = '₹') {
  const num = typeof n === 'number' ? n : (parseFloat(n) || 0);
  return symbol + ' ' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function getSettings(db) {
  const hp = (db.homepage && db.homepage.hero) || {};
  const s = db.settings || {};
  return {
    business_name: s.business_name || s.storeName || 'Paira Plants',
    storeName: s.storeName || s.business_name || 'Paira Plants',
    brandTitle: s.brandTitle || s.business_name || 'Paira Plants',
    tagline: s.tagline || 'Aquatic Plants, Fishes & Gravels',
    phone_number: s.phone_number || s.phone || '+91 98765 43210',
    whatsapp_number: s.whatsapp_number || s.whatsappNumber || '919876543210',
    email: s.email || 'care@pairaplants.com',
    business_address: s.business_address || s.address || 'Pairaplants Studio, Aquatic Flora Hub, Kochi, Kerala, India',
    currency_symbol: s.currency_symbol || s.currencySymbol || '₹',
    currency_code: s.currency_code || s.currency || 'INR',
    hero_banner_image: s.hero_banner_image || hp.bannerImage || '/images/Sunlit Emerald Koi Garden.png',
    hero_kicker: s.hero_kicker || 'SUSTAINABLE BOTANICAL NURSERY',
    hero_title: s.hero_title || hp.title || 'Bring Living Nature Into Your Aquarium',
    hero_subtitle: s.hero_subtitle || hp.subtitle || 'Premium, pest-free aquatic plants, quarantined freshwater fishes, dwarf shrimps, and natural aquascaping substrates delivered with 100% live arrival guarantee.',
    hero_cta_text: s.hero_cta_text || hp.ctaText || 'Explore Collection',
    hero_cta_link: s.hero_cta_link || hp.ctaLink || '/shop',
    hero_secondary_text: s.hero_secondary_text || hp.secondaryCtaText || 'About Paira Plants',
    hero_secondary_link: s.hero_secondary_link || hp.secondaryCtaLink || '/about',
    ...s
  };
}

function getWhatsAppEnquiryUrl(p, host, settings) {
  const phone = (settings.whatsapp_number || '919876543210').replace(/[^0-9]/g, '');
  const sym = settings.currency_symbol || '₹';
  const price = p.salePrice || p.price;
  const sku = p.sku || ('PP-' + p.id);
  const slug = p.slug || slugify(p.name);
  const prodUrl = `${host}/product/${slug}`;
  const msg = `Hi, I am interested in ${p.name} (SKU: ${sku}) priced at ${formatMoney(price, sym)}. Please share more details. URL: ${prodUrl}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

// --------------------------------------------------------------------------
// 1. MASTER LAYOUT
// --------------------------------------------------------------------------
function renderLayout({
  title,
  description,
  canonicalUrl,
  ogImage = '/images/Sunlit Emerald Koi Garden.png',
  ogType = 'website',
  structuredData = null,
  content,
  currentPath = '/',
  settings,
  cartCount = 0,
  extraHead = ''
}) {
  const storeName = settings.business_name || settings.brandTitle || 'Paira Plants';
  const tagline = settings.tagline || 'Aquatic Plants, Fishes & Gravels';
  const phone = settings.phone_number || '+91 98765 43210';
  const email = settings.email || 'care@pairaplants.com';
  const address = settings.business_address || 'Kochi, Kerala, India';
  const waNum = (settings.whatsapp_number || '919876543210').replace(/[^0-9]/g, '');

  const defaultMetaTitle = `${storeName} – Premium Aquatic Plants, Tropical Fishes & Aquascaping`;
  const defaultMetaDesc = `${storeName} provides laboratory-cultured live aquatic plants, quarantined freshwater fishes, dwarf shrimps, and planted aquarium substrates with 100% live arrival guarantee across India.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">
<title>${esc(title || defaultMetaTitle)}</title>
<meta name="description" content="${esc(description || defaultMetaDesc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(canonicalUrl)}">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:title" content="${esc(title || defaultMetaTitle)}">
<meta property="og:description" content="${esc(description || defaultMetaDesc)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:site_name" content="${esc(storeName)}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title || defaultMetaTitle)}">
<meta name="twitter:description" content="${esc(description || defaultMetaDesc)}">
<meta name="twitter:image" content="${esc(ogImage)}">

<!-- Google Fonts (Plus Jakarta Sans & Playfair Display) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,400;1,600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">

${structuredData ? `<script type="application/ld+json">\n${JSON.stringify(structuredData, null, 2)}\n</script>` : ''}
${extraHead}
</head>
<body class="ssr-page">
<div class="site-wrapper">
  <!-- Top Announcement Bar -->
  <div class="top-announcement-bar">
    <span>${icon('shieldCheck')} Live Arrival Thermal Packaging Guarantee On All Aquatic Plants &amp; Fishes Across India &middot; Cash / UPI on Delivery</span>
  </div>

  <!-- Main Site Header -->
  <header class="site-header">
    <div class="header-bar">
      <a class="brand" href="/" aria-label="${esc(storeName)} Home">
        <span class="brand-icon">${icon('sprout')}</span>
        <div class="brand-text">
          <span class="logo-title">Paira <span>Plants</span></span>
          <span class="logo-tagline">${esc(tagline)}</span>
        </div>
      </a>

      <!-- Clean Public Navigation (No Staff Links in Customer Menus) -->
      <nav class="main-nav" id="main-nav" aria-label="Main Navigation">
        <a href="/" class="nav-item ${currentPath === '/' ? 'active' : ''}">Home</a>
        <a href="/about" class="nav-item ${currentPath.startsWith('/about') ? 'active' : ''}">Our Story</a>
        <a href="/shop" class="nav-item ${currentPath.startsWith('/shop') ? 'active' : ''}">Shop</a>
        <a href="/gallery" class="nav-item ${currentPath.startsWith('/gallery') ? 'active' : ''}">Gallery</a>
        <a href="/contact" class="nav-item ${currentPath.startsWith('/contact') ? 'active' : ''}">Contact</a>
      </nav>

      <!-- Header Customer Actions -->
      <div class="header-actions">
        <a class="btn-pill outline sm cart-btn-header" href="/cart" aria-label="Shopping Cart">
          ${icon('shoppingBag')}
          <span>Cart</span>
          <span class="cart-badge-count" id="header-cart-count">${cartCount || 0}</span>
        </a>
      </div>

      <!-- Mobile Hamburger Menu Button -->
      <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Open Navigation Menu" aria-expanded="false">
        ${icon('menu')}
      </button>
    </div>
  </header>

  <!-- Mobile Navigation Drawer -->
  <aside class="mobile-nav-drawer" id="mobile-nav-drawer" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Navigation Menu">
    <div class="mobile-nav-backdrop" id="mobile-nav-backdrop"></div>
    <div class="mobile-nav-panel">
      <div class="mobile-nav-head">
        <a class="brand" href="/">
          <span class="brand-icon">${icon('sprout')}</span>
          <div class="brand-text">
            <span class="logo-title">Paira <span>Plants</span></span>
          </div>
        </a>
        <button class="mobile-nav-close" id="mobile-nav-close" aria-label="Close Menu">${icon('x')}</button>
      </div>
      <nav class="mobile-nav-links" aria-label="Mobile Navigation">
        <a href="/" class="mobile-link ${currentPath === '/' ? 'active' : ''}">Home</a>
        <a href="/about" class="mobile-link ${currentPath.startsWith('/about') ? 'active' : ''}">Our Story</a>
        <a href="/shop" class="mobile-link ${currentPath.startsWith('/shop') ? 'active' : ''}">Shop Catalog</a>
        <a href="/gallery" class="mobile-link ${currentPath.startsWith('/gallery') ? 'active' : ''}">Botanical Gallery</a>
        <a href="/contact" class="mobile-link ${currentPath.startsWith('/contact') ? 'active' : ''}">Contact &amp; Consult</a>
        <a href="/cart" class="mobile-link ${currentPath.startsWith('/cart') ? 'active' : ''}">Shopping Cart</a>
      </nav>
      <div class="mobile-nav-footer">
        <div class="mobile-nav-contact-info">
          <p>${icon('phone')} ${esc(phone)}</p>
          <p>${icon('mail')} ${esc(email)}</p>
          <p style="color:var(--primary-green);font-weight:600;margin-top:8px;">${icon('shieldCheck')} 100% Live Arrival Guaranteed Across India</p>
        </div>
      </div>
    </div>
  </aside>

  <!-- Main Page Content (SSR Delivered) -->
  <main id="app" class="main-content" aria-live="polite">
    ${content}
  </main>

  <!-- Customer-Facing Footer (Strictly No Staff Portal Links) -->
  <footer class="site-footer">
    <div class="footer-top-grid">
      <div class="footer-col">
        <div class="brand" style="margin-bottom:14px;">
          <span class="brand-icon">${icon('sprout')}</span>
          <div class="brand-text">
            <span class="logo-title" style="color:#fff;">Paira <span>Plants</span></span>
          </div>
        </div>
        <p style="font-size:0.88rem;color:#a8bcaf;line-height:1.6;margin-bottom:16px;">
          ${esc(storeName)} brings the tranquility and vitality of living freshwater nature into homes, studios, and workspaces with premium, laboratory-nurtured plants and quarantined aquatic fauna.
        </p>
        <div class="footer-contact-details">
          <p>${icon('mapPin')} ${esc(address)}</p>
          <p>${icon('mail')} ${esc(email)}</p>
          <p>${icon('phone')} ${esc(phone)}</p>
        </div>
      </div>

      <div class="footer-col">
        <h4>Botanical Collections</h4>
        <ul class="footer-links">
          <li><a href="/shop/aquatic-plants-mosses">Aquatic Plants &amp; Mosses</a></li>
          <li><a href="/shop/ornamental-freshwater-fish">Ornamental Freshwater Fish</a></li>
          <li><a href="/shop/dwarf-shrimps-cleaners">Dwarf Shrimps &amp; Cleaners</a></li>
          <li><a href="/shop/substrates-driftwood">Substrates &amp; Driftwood</a></li>
          <li><a href="/shop/aquarium-gravels-accessories">Aquarium Gravels &amp; Tools</a></li>
        </ul>
      </div>

      <div class="footer-col">
        <h4>Customer Care &amp; Trust</h4>
        <ul class="footer-links">
          <li><a href="/about">Our Story &amp; Nursery Heritage</a></li>
          <li><a href="/about#packaging">Thermal Packaging Protocol</a></li>
          <li><a href="/about#guarantee">100% Live Arrival Guarantee</a></li>
          <li><a href="/contact">Aquascaping Consultation</a></li>
          <li><a href="/cart">Cart &amp; Order Checkout</a></li>
        </ul>
      </div>

      <div class="footer-col">
        <h4>Direct Botanical Updates</h4>
        <p style="font-size:0.85rem;color:#a8bcaf;margin-bottom:12px;">
          Receive notifications on fresh tissue-culture harvests, rare imports, and planted aquarium care guides.
        </p>
        <form class="footer-newsletter-form" onsubmit="event.preventDefault(); alert('Thank you for subscribing to Paira Plants updates!'); this.reset();">
          <input type="email" placeholder="Your email address" required>
          <button type="submit" class="btn-pill sm">Join</button>
        </form>
        <div style="margin-top:16px;font-size:0.82rem;color:#8ba294;display:flex;align-items:center;gap:6px;">
          ${icon('shieldCheck')} Payments: <strong>Cash / UPI on Delivery</strong>
        </div>
      </div>
    </div>

    <div class="footer-inner">
      <div>&copy; 2026 <strong>${esc(storeName)}</strong> &middot; All Rights Reserved &middot; ${esc(tagline)}</div>
      <div class="footer-bottom-links">
        <a href="/about">Our Story</a> &middot;
        <a href="/shop">Live Shop</a> &middot;
        <a href="/gallery">Gallery</a> &middot;
        <a href="/contact">Contact</a>
      </div>
    </div>
  </footer>
</div>

<!-- Floating WhatsApp Support Widget -->
<div class="floating-whatsapp-widget" id="floating-whatsapp-widget">
  <a class="whatsapp-chat-bubble" href="https://wa.me/${waNum}?text=${encodeURIComponent('Hello Paira Plants! I have a question regarding aquatic plants and fishes.')}" target="_blank" rel="noopener noreferrer">
    <span class="chat-bubble-text">Need Help? Chat with us</span>
  </a>
  <a class="whatsapp-btn-circle" href="https://wa.me/${waNum}?text=${encodeURIComponent('Hello Paira Plants! I have a question regarding aquatic plants and fishes.')}" target="_blank" rel="noopener noreferrer" title="Chat on WhatsApp" aria-label="Need Help? Chat with us on WhatsApp">
    ${icon('whatsappFill')}
  </a>
</div>

<!-- Client-side Interactive Storefront Bundle -->
<script src="/js/storefront.js"></script>
</body>
</html>`;
}

// --------------------------------------------------------------------------
// 2. PRODUCT CARD COMPONENT (Refined Storefront UI/UX)
// --------------------------------------------------------------------------
function renderProductCard(p, host, settings) {
  const sym = settings.currency_symbol || '₹';
  const price = p.salePrice || p.price;
  const hasSale = p.salePrice && p.price > p.salePrice;
  const sku = p.sku || ('PP-' + p.id);
  const slug = p.slug || slugify(p.name);
  const prodUrl = `/product/${slug}`;
  const waUrl = getWhatsAppEnquiryUrl(p, host, settings);
  const primaryImg = (p.images && p.images[0]) || p.image || '/images/Sunlit Emerald Koi Garden.png';

  const isOutOfStock = p.stock <= 0;
  const isLowStock = !isOutOfStock && p.stock <= (p.lowStockThreshold || (settings.low_stock_default || 8));

  // Care Level Badge: displayed ONLY for living aquatic plants
  let careBadge = '';
  if (p.category === 'Aquatic Plants & Mosses' && p.careLevel) {
    const cLevel = p.careLevel.toLowerCase();
    careBadge = `<span class="badge-care badge-care-${cLevel}">${esc(p.careLevel)}</span>`;
    if (p.co2Required) {
      careBadge += ` <span class="badge-care badge-co2">CO2 Req</span>`;
    }
  }

  const stockClass = isOutOfStock ? 'out' : (isLowStock ? 'low' : 'in');
  const stockText = isOutOfStock
    ? 'Out of Stock'
    : (isLowStock ? `Limited Stock (${p.stock} left)` : `In Stock (${p.stock} left)`);

  const stockSubline = isOutOfStock
    ? 'Currently out of stock &middot; Restocking soon'
    : (isLowStock ? `Only ${p.stock} left in nursery &middot; Fast moving` : 'In stock &middot; Ready for thermal dispatch');

  return `
    <article class="product-card" data-id="${p.id}" data-category="${esc(p.category)}">
      <div class="product-art-wrap">
        <a href="${prodUrl}" class="product-card-photo" aria-label="${esc(p.name)}">
          <img src="${esc(primaryImg)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='/images/Sunlit Emerald Koi Garden.png'">
        </a>

        <div class="product-stock-tag ${stockClass}">
          <span class="stock-dot"></span>
          <span class="stock-text">${stockText}</span>
        </div>
      </div>

      <div class="product-meta-header">
        <span class="product-category">${esc(p.category)}</span>
        ${careBadge ? `<div>${careBadge}</div>` : (p.labels && p.labels.length ? `<span class="product-label-tag">${esc(p.labels[0])}</span>` : '')}
      </div>

      <h3 class="product-title">
        <a href="${prodUrl}">${esc(p.name)}</a>
      </h3>
      <p class="product-desc" title="${esc(p.description || '')}">${esc(p.description || '')}</p>

      <div class="product-greenhouse-note">
        ${stockSubline}
      </div>

      <div class="product-footer">
        <div class="price-wrap tabular-nums">
          ${hasSale ? `
            <span class="price-sale">${formatMoney(p.salePrice, sym)}</span>
            <span class="price-original">${formatMoney(p.price, sym)}</span>
          ` : `
            <span class="price-regular">${formatMoney(p.price, sym)}</span>
          `}
        </div>

        <div class="action-wrap">
          ${!isOutOfStock ? `
            <button class="btn-pill sm add-to-cart-btn" data-action="addToCart" data-id="${p.id}" data-name="${esc(p.name)}" data-price="${price}" data-sku="${esc(sku)}" data-img="${esc(primaryImg)}" aria-label="Add ${esc(p.name)} to cart">
              ${icon('shoppingBag')} Add
            </button>
          ` : `
            <button class="btn-pill sm outline" disabled style="opacity:0.6;cursor:not-allowed;">
              Sold Out
            </button>
          `}
          <!-- Single Universal WhatsApp Lead Enquiry Button -->
          <a class="btn-wa-card" href="${waUrl}" target="_blank" rel="noopener noreferrer" title="Enquire on WhatsApp">
            ${icon('whatsappFill')} Enquiry
          </a>
        </div>
      </div>
    </article>
  `;
}

// --------------------------------------------------------------------------
// 3. HOME PAGE RENDERER (Refined UI/UX with Trust Stats Ribbon)
// --------------------------------------------------------------------------
function renderHomePage(db, host) {
  const settings = getSettings(db);
  const products = db.products || [];
  const featured = products.filter(p => p.isFeatured && p.isVisible !== false).slice(0, 4);
  const categories = db.categories || [];

  const heroConfig = (db.homepage && db.homepage.hero) || {};
  const heroImage = settings.hero_banner_image || heroConfig.bannerImage || '/images/Sunlit Emerald Koi Garden.png';
  const heroKicker = settings.hero_kicker || 'SUSTAINABLE BOTANICAL NURSERY';
  const heroTitle = settings.hero_title || heroConfig.title || 'Bring Living Nature Into Your Aquarium';
  const heroSub = settings.hero_subtitle || heroConfig.subtitle || 'Premium, pest-free aquatic plants, quarantined freshwater fishes, dwarf shrimps, and natural aquascaping substrates delivered with 100% live arrival guarantee.';
  const heroCtaText = settings.hero_cta_text || heroConfig.ctaText || 'Explore Collection';
  const heroCtaLink = settings.hero_cta_link || heroConfig.ctaLink || '/shop';
  const heroSecondaryText = settings.hero_secondary_text || heroConfig.secondaryCtaText || 'About Paira Plants';
  const heroSecondaryLink = settings.hero_secondary_link || heroConfig.secondaryCtaLink || '/about';

  const content = `
    <!-- HERO PHOTO BANNER -->
    <section class="hero-photo-banner" style="background-image:linear-gradient(rgba(15, 41, 30, 0.55), rgba(15, 41, 30, 0.75)), url('${esc(heroImage)}');">
      <div class="hero-inner" style="margin:0 auto;text-align:center;display:flex;flex-direction:column;align-items:center;width:100%;max-width:900px;">
        <span class="hero-kicker" style="margin:0 auto 16px auto;text-align:center;display:inline-flex;align-items:center;justify-content:center;">${icon('sprout')} ${esc(heroKicker)}</span>
        <h1 class="banner-title" style="margin:0 auto 16px auto;text-align:center;">${esc(heroTitle)}</h1>
        <p class="banner-sub" style="margin:0 auto 32px auto;text-align:center;max-width:58ch;display:block;">${esc(heroSub)}</p>
        <div class="banner-cta" style="margin:0 auto;display:flex;justify-content:center;">
          <a class="btn-banner" href="${esc(heroCtaLink)}">${esc(heroCtaText)} ${icon('arrowRight')}</a>
          <a class="btn-banner outline-light" href="${esc(heroSecondaryLink)}">${esc(heroSecondaryText)}</a>
        </div>
      </div>
    </section>

    <!-- TRUST STATS RIBBON -->
    <section class="home-trust-ribbon" aria-label="Trust Guarantees">
      <div class="home-trust-grid">
        <div class="trust-item">
          <div class="trust-item-icon">${icon('sprout')}</div>
          <div class="trust-item-text">
            <strong>85+ Quarantined Varieties</strong>
            <span>Aquatic plants, mosses &amp; fish</span>
          </div>
        </div>

        <div class="trust-item">
          <div class="trust-item-icon">${icon('shieldCheck')}</div>
          <div class="trust-item-text">
            <strong>100% Live Arrival Insured</strong>
            <span>Medical-grade thermal oxygen packs</span>
          </div>
        </div>

        <div class="trust-item">
          <div class="trust-item-icon">${icon('sparkles')}</div>
          <div class="trust-item-text">
            <strong>Pest &amp; Snail Parasite Free</strong>
            <span>Nursery cultivated &amp; inspected</span>
          </div>
        </div>

        <div class="trust-item">
          <div class="trust-item-icon">${icon('truckFast')}</div>
          <div class="trust-item-text">
            <strong>Cash / UPI on Delivery</strong>
            <span>Safe payment at your doorstep</span>
          </div>
        </div>
      </div>
    </section>

    <!-- WHY CHOOSE US -->
    <section class="why-choose-section">
      <div class="why-inner">
        <a class="view-all-pill" href="/shop">View All Botanicals</a>
        <h2 class="why-title">Why Aquascapers Trust Paira Plants</h2>

        <div class="why-cards-grid">
          <div class="why-card">
            <div class="why-icon-wrap">${icon('leaf')}</div>
            <h3>Pest-Free Living Plants</h3>
            <div class="card-divider"></div>
            <p>Every tissue culture and nursery plant is quarantined and cleared of nuisance algae and snail parasites before dispatch.</p>
          </div>

          <div class="why-card">
            <div class="why-icon-wrap">${icon('truckFast')}</div>
            <h3>Thermal Dispatch &amp; Oxygen</h3>
            <div class="card-divider"></div>
            <p>Live plants and fishes are packed in temperature-controlled insulated coolers with pure oxygen canisters for zero-loss transit.</p>
          </div>

          <div class="why-card">
            <div class="why-icon-wrap">${icon('sparkles')}</div>
            <h3>Acclimated &amp; Quarantined</h3>
            <div class="card-divider"></div>
            <p>All tropical fishes and dwarf shrimps undergo a 14-day conditioning quarantine ensuring active, disease-free specimens.</p>
          </div>

          <div class="why-card">
            <div class="why-icon-wrap">${icon('recycle')}</div>
            <h3>Sustainable Aquaculture</h3>
            <div class="card-divider"></div>
            <p>Ethically farmed and laboratory propagated to protect delicate natural wetland and river ecosystems across India.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURED BOTANICALS ROW -->
    ${featured.length ? `
      <section class="section-container" style="padding-top:20px;">
        <div class="section-head">
          <div>
            <span class="kicker">${icon('sparkles')} HANDPICKED HIGHLIGHTS</span>
            <h2>Featured Botanicals &amp; Livestock</h2>
          </div>
          <a class="btn-pill outline sm" href="/shop">Explore All ${icon('arrowRight')}</a>
        </div>
        <div class="product-grid">
          ${featured.map(p => renderProductCard(p, host, settings)).join('')}
        </div>
      </section>
    ` : ''}

    <!-- ECOSYSTEM COLLECTIONS CATEGORIES -->
    <section class="section-container" style="padding-top:40px;">
      <div class="section-head">
        <div>
          <span class="kicker">${icon('tag')} BOTANICAL CATEGORIES</span>
          <h2>Ecosystem Collections</h2>
        </div>
        <a class="btn-pill outline sm" href="/shop">Browse All Products ${icon('arrowRight')}</a>
      </div>

      <div class="overview-grid">
        ${categories.map(c => {
          const count = products.filter(p => p.category === c.name).length;
          return `
            <div class="overview-card">
              <div class="card-thumb" aria-hidden="true">${icon(c.icon || 'leaf')}</div>
              <h3>${esc(c.name)}</h3>
              <div class="count-label tabular-nums">${count} botanical varieties available</div>
              <p style="font-size:0.85rem;color:var(--text-muted);margin:8px 0 16px;">${esc(c.description || '')}</p>
              <a class="btn-pill outline sm" href="/shop/${c.slug}">Explore Collection</a>
            </div>
          `;
        }).join('')}
      </div>
    </section>

    <!-- ZERO-RISK PACKAGING PROMO -->
    <section class="section-container" style="padding-bottom:50px;">
      <div class="packaging-banner">
        <div style="max-width:650px;">
          <span class="badge-pill">${icon('shieldCheck')} 100% LIVE ARRIVAL GUARANTEE</span>
          <h3 style="font-size:1.8rem;color:#fff;margin:12px 0 8px;">Zero-Risk Aquascaping Across India</h3>
          <p style="color:#c5d8cc;font-size:0.95rem;line-height:1.6;">
            If any live plant or livestock does not arrive in pristine condition, our immediate photo-guarantee provides instant replacement or refund. Shop with total peace of mind.
          </p>
        </div>
        <a class="btn-pill" style="background:#fff;color:var(--deep-forest);" href="/about#packaging">Learn About Our Packaging ${icon('arrowRight')}</a>
      </div>
    </section>
  `;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: settings.business_name || 'Paira Plants',
    url: host,
    logo: `${host}/images/Sunlit Emerald Koi Garden.png`,
    description: 'Specialists in laboratory-propagated aquatic plants, quarantined tropical fish, dwarf freshwater shrimp, and planted aquarium substrates.',
    priceRange: '₹₹',
    currenciesAccepted: settings.currency_code || 'INR',
    paymentAccepted: 'Cash on Delivery, UPI on Delivery',
    telephone: settings.phone_number || '+91 98765 43210',
    email: settings.email || 'care@pairaplants.com'
  };

  return renderLayout({
    title: `${settings.business_name || 'Paira Plants'} – Premium Aquatic Plants, Tropical Fishes & Aquascaping`,
    description: 'Shop pest-free live aquatic plants, quarantined freshwater fishes, dwarf shrimps, and natural aquarium soils. 100% Live Arrival Guaranteed across India.',
    canonicalUrl: host,
    structuredData,
    content,
    currentPath: '/',
    settings
  });
}

// --------------------------------------------------------------------------
// 4. ABOUT / STORY PAGE RENDERER (Refined Layout & Brand Heritage)
// --------------------------------------------------------------------------
function renderAboutPage(db, host) {
  const settings = getSettings(db);
  const phone = settings.phone_number || '+91 98765 43210';
  const email = settings.email || 'care@pairaplants.com';
  const address = settings.business_address || 'Pairaplants Studio, Aquatic Flora Hub, Kochi, Kerala, India';

  const content = `
    <div class="page-header-banner">
      <div class="banner-inner">
        <span class="kicker">${icon('sprout')} HERITAGE &amp; MISSION</span>
        <h1>The Paira Plants Story</h1>
        <p class="muted">Bridging untouched aquatic ecosystems with modern living spaces through sustainable botany and aquaculture.</p>
      </div>
    </div>

    <div class="content-container">
      <!-- Story Hero Image Banner -->
      <div class="story-hero-image-wrap">
        <img src="/images/products/aquatic-cultivated-collection.jpg" alt="Paira Plants Nursery &amp; Studio" loading="eager">
        <div class="story-hero-badge">
          ${icon('sprout')} Paira Plants Flora Studio &amp; Propagation Facility &middot; Kochi, Kerala
        </div>
      </div>

      <div class="story-grid">
        <!-- Main Story Content Column -->
        <div class="story-text">
          <span class="kicker">${icon('leaf')} OUR PHILOSOPHY</span>
          <h2>Aquatic Flora as Living Architecture</h2>
          <p>
            Founded by passionate aquascapers and botanists, Paira Plants began with a single vision: to eliminate the frustrations hobbyists face with melting tissue cultures, snail-infested bunched plants, and stressed wild catches.
          </p>
          <p>
            From our dedicated flora studio and propagation facility in Kochi, Kerala, we maintain pristine aquatic habitats. Every stem, rosette, and rhizome is nurtured under high-efficiency full-spectrum LED fixtures, calibrated nutrient dosing, and pressurized CO2 before arriving at your doorstep.
          </p>

          <div class="quote-card">
            <p>&ldquo;An aquarium is not merely a tank of water; it is a self-sustaining miniature biosphere. When the plants thrive, the fish flourish, and the mind finds stillness.&rdquo;</p>
            <span class="quote-author">${icon('sprout')} Paira Plants Aquatics Team</span>
          </div>

          <h3 id="packaging">Thermal Packaging &amp; Oxygen Canisters</h3>
          <p>
            Shipping living aquatic organisms across India requires medical-grade rigor. We developed a proprietary 4-stage thermal insulation pack:
          </p>
          <ul class="styled-list">
            <li><strong>High-Density Thermal Coolers:</strong> Expanded polystyrene chambers shield against ambient heat and temperature drops during transit.</li>
            <li><strong>Medical-Grade Oxygen:</strong> Pure oxygen injection ensures fish and dwarf shrimp respire comfortably and remain active for up to 96 hours.</li>
            <li><strong>Moisture Membrane Seals:</strong> Live plants are enclosed in sealed humidity packs preventing dehydration of delicate cell walls.</li>
            <li><strong>100% Live Arrival Guarantee:</strong> In the rare event of transit damage, simply share an unboxing photograph within 2 hours of delivery for an instant free replacement or refund.</li>
          </ul>

          <div style="margin-top:36px;padding-top:24px;border-top:1px solid #E2E8F0;">
            <a class="btn-pill" href="/shop">Explore Paira Plants Catalog &rarr;</a>
          </div>
        </div>

        <!-- Sidebar Cards Column -->
        <aside class="story-aside">
          <div class="aside-card">
            <h3>Botanical Highlights</h3>
            <div class="metric-row">
              <span class="metric-val tabular-nums">85+</span>
              <span class="metric-label">Quarantined Plant &amp; Livestock Varieties</span>
            </div>
            <div class="metric-row">
              <span class="metric-val tabular-nums">100%</span>
              <span class="metric-label">Live Arrival Insured Shipping Across India</span>
            </div>
            <div class="metric-row">
              <span class="metric-val tabular-nums">0%</span>
              <span class="metric-label">Pest &amp; Snail Parasite Contamination</span>
            </div>
            <div class="metric-row">
              <span class="metric-val tabular-nums">2-4 Days</span>
              <span class="metric-label">Express Thermal Courier Dispatch</span>
            </div>
          </div>

          <div class="aside-card aside-card-cta">
            <h3>Need Aquascaping Advice?</h3>
            <p>
              Whether you are planning a low-tech nano tank or a competitive high-tech Dutch layout, our botanists provide custom advice.
            </p>
            <a class="btn-pill sm" href="/contact">Book Free Consultation</a>
          </div>

          <div class="aside-card">
            <h3>Studio &amp; Greenhouse</h3>
            <p style="font-size:0.88rem;color:#64748B;line-height:1.6;margin:0 0 10px 0;">
              <strong>Address:</strong><br>${esc(address)}
            </p>
            <p style="font-size:0.82rem;color:#64748B;line-height:1.5;margin:0 0 12px 0;">
              <strong>Visiting Hours:</strong><br>Mon&ndash;Sat &middot; 10:00 AM &ndash; 7:00 PM IST
            </p>
            <p style="font-size:0.84rem;color:#15803D;font-weight:600;margin:0;">
              ${icon('phone')} ${esc(phone)}
            </p>
          </div>
        </aside>
      </div>
    </div>
  `;

  return renderLayout({
    title: `Our Story & Heritage &middot; ${settings.business_name || 'Paira Plants'}`,
    description: 'Learn about Paira Plants, our tissue culture nursery, quarantine protocols, and proprietary thermal packaging system.',
    canonicalUrl: `${host}/about`,
    content,
    currentPath: '/about',
    settings
  });
}

// --------------------------------------------------------------------------
// 5. SHOP CATALOG PAGE RENDERER
// --------------------------------------------------------------------------
function renderShopPage(db, host, activeCatSlug = null, searchQuery = '') {
  const settings = getSettings(db);
  const products = db.products || [];
  const categories = db.categories || [];

  let filtered = products.filter(p => p.isVisible !== false);

  let activeCatName = 'All Collections';
  if (activeCatSlug) {
    const cat = categories.find(c => c.slug === activeCatSlug || slugify(c.name) === activeCatSlug);
    if (cat) {
      activeCatName = cat.name;
      filtered = filtered.filter(p => p.category === cat.name);
    }
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.scientificName && p.scientificName.toLowerCase().includes(q))
    );
  }

  const content = `
    <div class="shop-filter-bar">
      <div class="shop-header-flex">
        <div>
          <span class="kicker">${icon('sprout')} THE BOTANICAL CATALOG</span>
          <h1 style="font-family:var(--font-serif, 'Playfair Display', Georgia, serif);font-size:clamp(2rem, 3.5vw, 2.8rem);font-weight:700;color:#0F172A;margin:4px 0 8px;letter-spacing:-0.01em;">${esc(activeCatName)}</h1>
          <p class="muted tabular-nums" style="font-size:0.95rem;color:#64748B;margin:0;">
            Showing ${filtered.length} living items in catalog
            ${searchQuery ? ` &middot; Filtered by &ldquo;<strong>${esc(searchQuery)}</strong>&rdquo; (<a href="${activeCatSlug ? `/shop/${activeCatSlug}` : '/shop'}" style="color:#b91c1c;text-decoration:underline;">Clear Search</a>)` : ''}
          </p>
        </div>

        <form class="search-wrap" method="GET" action="${activeCatSlug ? `/shop/${activeCatSlug}` : '/shop'}">
          <span class="search-icon">${icon('search')}</span>
          <input type="search" name="q" placeholder="Search by name, variety, or SKU..." value="${esc(searchQuery)}" aria-label="Search catalog">
        </form>
      </div>

      <!-- Category Filter Pills with Clean URLs -->
      <nav class="chips" role="group" aria-label="Filter by collection">
        <a class="chip-pill ${!activeCatSlug ? 'active' : ''}" href="/shop">All Collections</a>
        ${categories.map(c => `
          <a class="chip-pill ${activeCatSlug === c.slug ? 'active' : ''}" href="/shop/${c.slug}">${esc(c.name)}</a>
        `).join('')}
      </nav>
    </div>

    ${filtered.length ? `
      <div class="product-grid" id="shop-grid">
        ${filtered.map(p => renderProductCard(p, host, settings)).join('')}
      </div>
    ` : `
      <div class="narrow-box" style="text-align:center;padding:80px 20px;">
        <div style="font-size:3rem;margin-bottom:12px;color:#94A3B8;">${icon('search')}</div>
        <h2>No botanicals matched your search</h2>
        <p class="muted" style="margin-bottom:24px;">Try searching for another variety, or clear filters to view all products.</p>
        <a class="btn-pill" href="/shop">View Full Catalog</a>
      </div>
    `}
  `;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${activeCatName} – ${settings.business_name || 'Paira Plants'}`,
    numberOfItems: filtered.length,
    itemListElement: filtered.slice(0, 30).map((p, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: p.name,
      url: `${host}/product/${p.slug || slugify(p.name)}`
    }))
  };

  return renderLayout({
    title: `${activeCatName} &middot; ${settings.business_name || 'Paira Plants'}`,
    description: `Browse ${activeCatName} at Paira Plants. Healthy, pest-free live aquatic plants, tropical fish, and aquascaping essentials.`,
    canonicalUrl: activeCatSlug ? `${host}/shop/${activeCatSlug}` : `${host}/shop`,
    structuredData,
    content,
    currentPath: activeCatSlug ? `/shop/${activeCatSlug}` : '/shop',
    settings
  });
}

// --------------------------------------------------------------------------
// 6. INDIVIDUAL PRODUCT PAGE RENDERER
// --------------------------------------------------------------------------
function renderProductPage(db, host, slugOrId) {
  const settings = getSettings(db);
  const products = db.products || [];

  const p = products.find(x => x.slug === slugOrId || String(x.id) === String(slugOrId));
  if (!p) return null;

  const sym = settings.currency_symbol || '₹';
  const price = p.salePrice || p.price;
  const sku = p.sku || ('PP-' + p.id);
  const slug = p.slug || slugify(p.name);
  const prodUrl = `${host}/product/${slug}`;
  const waUrl = getWhatsAppEnquiryUrl(p, host, settings);
  const primaryImg = (p.images && p.images[0]) || p.image || '/images/Sunlit Emerald Koi Garden.png';
  const gallery = (p.images && p.images.length) ? p.images : [primaryImg];

  // Stock Badge
  let stockBadge = '';
  if (p.stock <= 0) {
    stockBadge = `<span class="stock-badge out-of-stock">${icon('alertCircle')} Currently Sold Out</span>`;
  } else if (p.stock <= (p.lowStockThreshold || (settings.low_stock_default || 8))) {
    stockBadge = `<span class="stock-badge low-stock">${icon('alertCircle')} Low Stock: Only ${p.stock} units left</span>`;
  } else {
    stockBadge = `<span class="stock-badge in-stock">${icon('check')} In Stock (${p.stock} available)</span>`;
  }

  // Care Level Badge: displayed ONLY for living aquatic plants
  let careHtml = '';
  if (p.category === 'Aquatic Plants & Mosses' && p.careLevel) {
    const cLevel = p.careLevel.toLowerCase();
    careHtml = `
      <div class="product-param-grid">
        <div class="param-box">
          <span class="param-label">${icon('leaf')} Care Level</span>
          <span class="param-value badge-care badge-care-${cLevel}">${esc(p.careLevel)}</span>
        </div>
        <div class="param-box">
          <span class="param-label">${icon('wind')} CO2 Injection</span>
          <span class="param-value ${p.co2Required ? 'badge-care badge-co2' : 'badge-care badge-care-easy'}">${p.co2Required ? 'Recommended / Required' : 'Not Required (Low Tech)'}</span>
        </div>
        <div class="param-box">
          <span class="param-label">${icon('sun')} Lighting</span>
          <span class="param-value">${p.co2Required ? 'Moderate to High' : 'Low to Moderate'}</span>
        </div>
        <div class="param-box">
          <span class="param-label">${icon('droplet')} Placement</span>
          <span class="param-value">${esc(p.subcategory || 'Midground / Foreground')}</span>
        </div>
      </div>
    `;
  }

  // Related products
  const related = products.filter(x => x.id !== p.id && x.category === p.category).slice(0, 4);

  const content = `
    <div class="content-container" style="padding-top:24px;padding-bottom:60px;">
      <!-- Breadcrumb Navigation -->
      <nav class="breadcrumb-trail" aria-label="Breadcrumb">
        <a href="/">Home</a> ${icon('arrowRight')}
        <a href="/shop">Shop</a> ${icon('arrowRight')}
        <a href="/shop/${slugify(p.category)}">${esc(p.category)}</a> ${icon('arrowRight')}
        <span aria-current="page">${esc(p.name)}</span>
      </nav>

      <div class="product-detail-layout">
        <!-- Gallery Column -->
        <div class="product-gallery-panel">
          <div class="main-image-wrap">
            <img id="main-prod-img" src="${esc(primaryImg)}" alt="${esc(p.name)}" onerror="this.src='/images/Sunlit Emerald Koi Garden.png'">
          </div>
          ${gallery.length > 1 ? `
            <div class="thumbs-row">
              ${gallery.map((img, idx) => `
                <button class="thumb-btn ${idx === 0 ? 'active' : ''}" onclick="document.getElementById('main-prod-img').src='${esc(img)}'; document.querySelectorAll('.thumb-btn').forEach(b => b.classList.remove('active')); this.classList.add('active');" aria-label="View photo ${idx + 1}">
                  <img src="${esc(img)}" alt="${esc(p.name)} preview" loading="lazy">
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Info & Actions Column -->
        <div class="product-info-panel">
          <div class="prod-cat-kicker">${esc(p.category)} &middot; <span class="tabular-nums">SKU: ${esc(sku)}</span></div>
          <h1 class="prod-detail-title">${esc(p.name)}</h1>
          ${p.scientificName ? `<div class="prod-scientific-name"><em>${esc(p.scientificName)}</em></div>` : ''}

          <div class="prod-price-stock-row">
            <div class="prod-price-block tabular-nums">
              <span class="prod-price-val">${formatMoney(price, sym)}</span>
              ${p.salePrice && p.price > p.salePrice ? `<span class="prod-price-struck">${formatMoney(p.price, sym)}</span>` : ''}
            </div>
            <div>${stockBadge}</div>
          </div>

          ${careHtml}

          <div class="prod-description-text">
            <p>${esc(p.description || 'Premium botanical specimen carefully nurtured and acclimated in our Kochi nursery. 100% pest-free and guaranteed live arrival.')}</p>
          </div>

          <!-- Add to Cart & Universal WhatsApp Enquiry Lead Actions -->
          <div class="prod-actions-card">
            ${p.stock > 0 ? `
              <div class="qty-add-flex">
                <div class="qty-stepper">
                  <button type="button" onclick="const q = document.getElementById('prod-qty-input'); q.value = Math.max(1, parseInt(q.value)-1);">${icon('minus')}</button>
                  <input type="number" id="prod-qty-input" value="1" min="1" max="${p.stock}" class="tabular-nums">
                  <button type="button" onclick="const q = document.getElementById('prod-qty-input'); q.value = Math.min(${p.stock}, parseInt(q.value)+1);">${icon('plus')}</button>
                </div>
                <button class="btn-pill add-to-cart-large" data-action="addToCartDetail" data-id="${p.id}" data-name="${esc(p.name)}" data-price="${price}" data-sku="${esc(sku)}" data-img="${esc(primaryImg)}">
                  ${icon('shoppingBag')} Add to Shopping Cart
                </button>
              </div>
            ` : `<div class="alert-box warning">${icon('alertCircle')} This botanical item is currently sold out. Inquire via WhatsApp for next restock date.</div>`}

            <!-- Universal WhatsApp Enquiry Button (Strictly Lead, Never Deducts Stock) -->
            <a class="btn-whatsapp-large" href="${waUrl}" target="_blank" rel="noopener noreferrer">
              ${icon('whatsappFill')} Enquire on WhatsApp (Lead Consultation)
            </a>
            <p class="lead-disclaimer">
              ${icon('shieldCheck')} WhatsApp inquiries connect directly to our botanical team for availability &amp; care consultation. Orders are placed through verified checkout.
            </p>
          </div>

          <!-- Trust Badges -->
          <div class="trust-pill-grid">
            <div class="trust-pill">${icon('shieldCheck')} Live Arrival Thermal Insulated</div>
            <div class="trust-pill">${icon('truckFast')} Pan-India Dispatch (2-4 Days)</div>
            <div class="trust-pill">${icon('sparkles')} 100% Pest &amp; Snail Free</div>
          </div>
        </div>
      </div>

      <!-- Related Products Section -->
      ${related.length ? `
        <div style="margin-top:60px;">
          <div class="section-head">
            <div>
              <span class="kicker">${icon('sprout')} COMPLEMENTARY SPECIMENS</span>
              <h2>Related Botanicals &amp; Livestock</h2>
            </div>
            <a class="btn-pill outline sm" href="/shop/${slugify(p.category)}">View All In ${esc(p.category)}</a>
          </div>
          <div class="product-grid">
            ${related.map(r => renderProductCard(r, host, settings)).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    image: [`${host}${primaryImg}`],
    description: p.description || `${p.name} - Premium aquatic plants and aquarium essentials from Paira Plants.`,
    sku: sku,
    offers: {
      '@type': 'Offer',
      url: prodUrl,
      priceCurrency: settings.currency_code || 'INR',
      price: price,
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: settings.business_name || 'Paira Plants'
      }
    }
  };

  return renderLayout({
    title: `${p.name} &middot; ${settings.business_name || 'Paira Plants'}`,
    description: `${p.name} (SKU: ${sku}). ${p.description || 'Pest-free aquatic plant and aquascaping specimen with guaranteed live arrival.'}`,
    canonicalUrl: prodUrl,
    ogImage: `${host}${primaryImg}`,
    ogType: 'product',
    structuredData,
    content,
    currentPath: `/product/${slug}`,
    settings
  });
}

// --------------------------------------------------------------------------
// 7. GALLERY PAGE RENDERER (Refined Visual Showcase & Aquascapes)
// --------------------------------------------------------------------------
function renderGalleryPage(db, host) {
  const settings = getSettings(db);
  const waNum = (settings.whatsapp_number || '919876543210').replace(/[^0-9]/g, '');

  const galleryItems = [
    {
      id: 'gallery-dutch',
      title: 'Dutch Style Botanical Aquascape',
      category: 'Planted Aquascapes',
      image: '/images/products/aquatic-cultivated-collection.jpg',
      desc: 'Layered color gradient layout featuring vibrant Rotala rotundifolia, Ludwigia repens, and Micranthemum Monte Carlo carpet.',
      specs: ['240L Tank', 'Full Spectrum RGB 90W', 'Pressurized CO2 (30ppm)', 'ADA Amazonia II']
    },
    {
      id: 'gallery-koi',
      title: 'Sunlit Emerald Koi Garden',
      category: 'Live Fish & Shrimp',
      image: '/images/Sunlit Emerald Koi Garden.png',
      desc: 'Balanced ecosystem pond featuring quarantined ornamental Koi, Cherry Barbs, and submerged Vallisneria spiralis forest.',
      specs: ['650L Habitat', 'Natural Sunlight & LED', 'Canister Biological Filtration', 'Neutral pH 7.2']
    },
    {
      id: 'gallery-iwagumi',
      title: 'Iwagumi Minimalist Nano Tank',
      category: 'Planted Aquascapes',
      image: '/images/products/monte-carlo-carpet.jpg',
      desc: 'Zen-inspired Japanese aquascape with hand-carved Seiryu stones blanketed by dense Micranthemum Tweediei.',
      specs: ['45L Nano Cube', 'Chihiros WRGB II', 'In-Line CO2 Diffuser', 'Pest-Free Tissue Culture']
    },
    {
      id: 'gallery-shrimp',
      title: 'Crystal Red & Blue Velvet Shrimp Colony',
      category: 'Live Fish & Shrimp',
      image: '/images/products/blue-dream-shrimp.jpg',
      desc: 'Breeding colony of pure Caridina cantonensis and Neocaridina davidi grazing on Java Moss and matured Cholla wood.',
      specs: ['30L Dedicated Nano', 'Sponge Filter & Aeration', 'TDS 140 ppm', 'pH 6.5 Soft Water']
    },
    {
      id: 'gallery-amazon',
      title: 'Amazonian Riverbed Biotope',
      category: 'Planted Aquascapes',
      image: '/images/products/vallisneria-spiralis-tank.jpg',
      desc: 'Natural flooded forest floor with weathered Malaysian Driftwood, botanical seed pods, and schooling Neon Tetras.',
      specs: ['180L Low-Tech Tank', 'Dimmable Warm LED', 'Botanical Tannin Rich', 'Amazon Swords & Helanthium']
    },
    {
      id: 'gallery-moss',
      title: 'Rare Moss & Hardscape Aquascape',
      category: 'Planted Aquascapes',
      image: '/images/products/peelia-moss-rock.jpg',
      desc: 'Collector grade Pellia liverwort, Anubias nana, and Flame Moss affixed to weathered natural river rocks.',
      specs: ['90L Shallow Rimless', 'Moderate Lighting', 'Slow Dosed Liquid Carbon', '100% Snail-Free']
    }
  ];

  const content = `
    <div class="page-header-banner">
      <div class="banner-inner">
        <span class="kicker">${icon('sparkles')} INSPIRATION &amp; TANK DESIGN</span>
        <h1>Botanical Aquascaping Gallery</h1>
        <p class="muted">Explore live aquascapes, rare moss layouts, and thriving freshwater biospheres cultured by our nursery specialists.</p>

        <!-- Category Filter Tabs -->
        <div class="chips" style="justify-content:center;margin-top:24px;margin-bottom:0;" role="tablist">
          <button type="button" class="chip-pill active" onclick="filterGallery('all', this)">All Layouts</button>
          <button type="button" class="chip-pill" onclick="filterGallery('Planted Aquascapes', this)">Planted Aquascapes</button>
          <button type="button" class="chip-pill" onclick="filterGallery('Live Fish &amp; Shrimp', this)">Live Fish &amp; Fauna</button>
        </div>
      </div>
    </div>

    <div class="content-container" style="padding-top:40px;padding-bottom:80px;">
      <div class="gallery-grid" id="gallery-cards-grid">
        ${galleryItems.map(item => `
          <article class="gallery-card" data-category="${esc(item.category)}">
            <div class="gallery-img-wrap">
              <img src="${item.image}" alt="${esc(item.title)}" loading="lazy" onerror="this.src='/images/Sunlit Emerald Koi Garden.png'">
              <span class="gallery-cat-pill">${esc(item.category)}</span>
            </div>
            <div class="gallery-card-body">
              <h3>${esc(item.title)}</h3>
              <p>${esc(item.desc)}</p>
              ${item.specs && item.specs.length ? `
                <div class="gallery-specs-row">
                  ${item.specs.map(s => `<span class="gallery-spec-pill">${esc(s)}</span>`).join('')}
                </div>
              ` : ''}
              <div style="margin-top:auto;padding-top:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
                <a href="/shop" class="btn-pill sm outline">Explore Flora &rarr;</a>
                <a class="btn-wa-card" href="https://wa.me/${waNum}?text=${encodeURIComponent(`Hi Paira Plants! I am interested in building an aquascape similar to "${item.title}". Can you advise on the plant list and setup?`)}" target="_blank" rel="noopener noreferrer">
                  ${icon('whatsappFill')} Build Setup
                </a>
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    </div>

    <script>
      function filterGallery(cat, btn) {
        document.querySelectorAll('.chips .chip-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.gallery-card').forEach(c => {
          if (cat === 'all' || c.dataset.category.includes(cat) || c.dataset.category === cat) {
            c.style.display = 'flex';
          } else {
            c.style.display = 'none';
          }
        });
      }
    </script>
  `;

  return renderLayout({
    title: `Botanical Aquascaping Gallery &middot; ${settings.business_name || 'Paira Plants'}`,
    description: 'Explore live aquarium photos, Dutch-style planted aquascapes, and dwarf shrimp nano tanks at Paira Plants.',
    canonicalUrl: `${host}/gallery`,
    content,
    currentPath: '/gallery',
    settings
  });
}

// --------------------------------------------------------------------------
// 8. CONTACT PAGE RENDERER
// --------------------------------------------------------------------------
function renderContactPage(db, host) {
  const settings = getSettings(db);
  const phone = settings.phone_number || '+91 98765 43210';
  const email = settings.email || 'care@pairaplants.com';
  const address = settings.business_address || 'Kochi, Kerala, India';
  const waNum = (settings.whatsapp_number || '919876543210').replace(/[^0-9]/g, '');

  const content = `
    <div class="page-header-banner">
      <div class="banner-inner">
        <span class="kicker">${icon('phone')} CONSULTATION &amp; SUPPORT</span>
        <h1>Contact Paira Plants</h1>
        <p class="muted">Get in touch for botanical consultations, bulk orders, rare plant requests, or shipping inquiries.</p>
      </div>
    </div>

    <div class="content-container" style="padding-top:30px;padding-bottom:60px;">
      <div class="contact-grid-wrap">
        <!-- Contact Details -->
        <div class="contact-info-card">
          <h2>Direct Studio Channels</h2>
          <p style="color:var(--text-muted);margin-bottom:24px;">Our botanical team is available Monday through Saturday to answer questions about plants, water parameters, and livestock care.</p>

          <div class="contact-methods">
            <div class="method-item">
              <div class="method-icon">${icon('mapPin')}</div>
              <div>
                <strong>Nursery Studio &amp; Greenhouse</strong>
                <p>${esc(address)}</p>
                <p style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Visiting Hours: Mon&ndash;Sat &middot; 10:00 AM &ndash; 7:00 PM IST</p>
              </div>
            </div>

            <div class="method-item">
              <div class="method-icon">${icon('mail')}</div>
              <div>
                <strong>Official Email</strong>
                <p><a href="mailto:${esc(email)}" style="color:var(--primary-green);font-weight:600;text-decoration:none;">${esc(email)}</a></p>
              </div>
            </div>

            <div class="method-item">
              <div class="method-icon">${icon('phone')}</div>
              <div>
                <strong>Customer Telephone</strong>
                <p><a href="tel:${esc(phone)}" style="color:var(--primary-green);font-weight:600;text-decoration:none;">${esc(phone)}</a></p>
              </div>
            </div>
          </div>

          <div class="instant-wa-card">
            <h3>Instant WhatsApp Consultation</h3>
            <p>Prefer quick photos and rapid advice? Message our head botanist on WhatsApp directly.</p>
            <a class="btn-whatsapp-large" style="margin-top:14px;" href="https://wa.me/${waNum}?text=${encodeURIComponent('Hello Paira Plants! I would like to consult on aquarium setup and plants.')}" target="_blank" rel="noopener noreferrer">
              ${icon('whatsappFill')} Chat on WhatsApp Now
            </a>
          </div>
        </div>

        <!-- Consultation Form -->
        <div class="contact-form-card">
          <h2>Send Us an Inquiry</h2>
          <p style="color:var(--text-muted);margin-bottom:20px;">Fill out this form and our support desk will respond within 4 business hours.</p>

          <form id="public-contact-form" onsubmit="event.preventDefault(); alert('Thank you! Your message has been received. Our team will contact you shortly.'); this.reset();">
            <div class="form-group">
              <label>Full Name *</label>
              <input type="text" name="name" required placeholder="Your full name">
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label>Email Address *</label>
                <input type="email" name="email" required placeholder="you@domain.com">
              </div>
              <div class="form-group">
                <label>Phone / WhatsApp Number</label>
                <input type="tel" name="phone" placeholder="+91 98450 00000">
              </div>
            </div>

            <div class="form-group">
              <label>Subject / Topic</label>
              <select name="subject">
                <option value="plant-care">Plant Care &amp; Water Chemistry Consultation</option>
                <option value="shipping">Order Status &amp; Live Arrival Guarantee</option>
                <option value="bulk">Bulk Wholesale / Studio Aquascape Installation</option>
                <option value="other">Other Inquiry</option>
              </select>
            </div>

            <div class="form-group">
              <label>Message / Details *</label>
              <textarea name="message" rows="5" required placeholder="Describe your tank size, lighting, CO2 setup, or question..."></textarea>
            </div>

            <button type="submit" class="btn-pill" style="width:100%;padding:14px;">Send Message</button>
          </form>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: `Contact & Consultation &middot; ${settings.business_name || 'Paira Plants'}`,
    description: 'Contact Paira Plants studio for aquatic plant consultations, live fish inquiries, and thermal shipping support.',
    canonicalUrl: `${host}/contact`,
    content,
    currentPath: '/contact',
    settings
  });
}

// --------------------------------------------------------------------------
// 9. SHOPPING CART & CHECKOUT PAGE RENDERER
// --------------------------------------------------------------------------
function renderCartPage(db, host) {
  const settings = getSettings(db);
  const sym = settings.currency_symbol || '₹';

  const content = `
    <div class="page-header-banner">
      <div class="banner-inner">
        <span class="kicker">${icon('shoppingBag')} SECURE CHECKOUT</span>
        <h1>Your Shopping Cart</h1>
        <p class="muted">Live plants and fishes are packed in temperature-controlled thermal boxes with oxygen canisters.</p>
      </div>
    </div>

    <div class="content-container" style="padding-top:30px;padding-bottom:60px;">
      <div id="cart-app-container">
        <!-- Rendered dynamically by storefront.js -->
        <div class="cart-loading-state" style="text-align:center;padding:60px 20px;">
          ${icon('sprout')}
          <p style="margin-top:14px;color:var(--text-muted);">Loading cart items...</p>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: `Shopping Cart &middot; ${settings.business_name || 'Paira Plants'}`,
    description: 'Review your selected aquatic plants and aquascaping essentials. Cash / UPI on Delivery across India.',
    canonicalUrl: `${host}/cart`,
    content,
    currentPath: '/cart',
    settings
  });
}

// --------------------------------------------------------------------------
// 10. PROTECTED ADMIN PORTAL LAYOUT & LOGIN
// --------------------------------------------------------------------------
function renderAdminLoginPage(error = '', host = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Staff Portal &middot; Paira Plants</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/css/style.css">
<style>
body { background: #0F172A; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; }
.login-card { background: #FFFFFF; border-radius: 16px; padding: 40px; width: 100%; max-width: 420px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
.login-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; color: #0F291E; }
.login-brand svg { color: #15803D; width: 28px; height: 28px; }
.login-title { font-size: 1.5rem; font-weight: 800; color: #0F172A; margin: 0 0 6px; }
.login-sub { font-size: 0.85rem; color: #64748B; margin: 0 0 24px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 6px; }
.form-group input { width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid #CBD5E1; font-size: 0.9rem; }
.btn-login { width: 100%; padding: 12px; background: #15803D; color: #FFFFFF; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; font-size: 0.95rem; margin-top: 10px; transition: background 0.15s; }
.btn-login:hover { background: #166534; }
.login-error { background: #FEF2F2; color: #991B1B; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 16px; border: 1px solid #FCA5A5; }
.login-security-badge { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #64748B; margin-top: 24px; justify-content: center; }
</style>
</head>
<body>
  <div class="login-card">
    <div class="login-brand">
      ${icon('sprout')}
      <span style="font-weight:800;font-size:1.2rem;letter-spacing:-0.5px;">Paira <span>Plants</span></span>
    </div>
    <h1 class="login-title">Staff Administration</h1>
    <p class="login-sub">Secure authentication required for store inventory &amp; billing.</p>

    ${error ? `<div class="login-error">${esc(error)}</div>` : ''}

    <form method="POST" action="/admin/login">
      <div class="form-group">
        <label for="admin-user">Staff Username</label>
        <input type="text" id="admin-user" name="username" required autocomplete="username" placeholder="e.g. owner or manager" autofocus>
      </div>

      <div class="form-group">
        <label for="admin-pw">Password</label>
        <input type="password" id="admin-pw" name="password" required autocomplete="current-password" placeholder="Enter staff password">
      </div>

      <button type="submit" class="btn-login">Sign In to Dashboard &rarr;</button>
    </form>

    <div class="login-security-badge">
      ${icon('lock')} Encrypted RBAC Authentication Session &middot; Authorized Personnel Only
    </div>
  </div>
</body>
</html>`;
}

function renderAdminAppShell({ user, section = 'dashboard', db }) {
  const settings = getSettings(db);
  const sym = settings.currency_symbol || '₹';

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', iconName: 'barChart' },
    { key: 'products', label: 'Products', iconName: 'packageIcon' },
    { key: 'categories', label: 'Categories', iconName: 'tag' },
    { key: 'suppliers', label: 'Suppliers', iconName: 'users' },
    { key: 'purchases', label: 'Purchases', iconName: 'truckFast' },
    { key: 'inventory', label: 'Inventory', iconName: 'sprout' },
    { key: 'stock-history', label: 'Stock History', iconName: 'activity' },
    { key: 'pos', label: 'POS Billing', iconName: 'receipt' },
    { key: 'sales', label: 'Sales & Orders', iconName: 'shoppingBag' },
    { key: 'customers', label: 'Customers', iconName: 'users' },
    { key: 'reports', label: 'Reports', iconName: 'fileText' },
    { key: 'settings', label: 'Settings', iconName: 'settings' }
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Dashboard &middot; Paira Plants</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin-body">
  <div class="admin-wrapper">
    <!-- Persistent Desktop Sidebar -->
    <aside class="admin-sidebar" id="admin-sidebar">
      <div class="sidebar-header">
        <a href="/admin/dashboard" class="sidebar-brand">
          <span class="brand-icon">${icon('sprout')}</span>
          <div class="brand-text">
            <span class="logo-title" style="color:#fff;">Paira <span>Plants</span></span>
            <span class="logo-tagline" style="color:#94a3b8;">Staff Admin</span>
          </div>
        </a>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-group-title">MAIN OPERATIONS</div>
        ${navItems.slice(0, 7).map(item => `
          <a href="/admin/${item.key}" class="sidebar-link ${section === item.key ? 'active' : ''}">
            ${icon(item.iconName)}
            <span>${item.label}</span>
          </a>
        `).join('')}

        <div class="nav-group-title" style="margin-top:16px;">COUNTER &amp; COMMERCE</div>
        ${navItems.slice(7, 10).map(item => `
          <a href="/admin/${item.key}" class="sidebar-link ${section === item.key ? 'active' : ''}">
            ${icon(item.iconName)}
            <span>${item.label}</span>
          </a>
        `).join('')}

        <div class="nav-group-title" style="margin-top:16px;">INSIGHTS &amp; CONFIG</div>
        ${navItems.slice(10).map(item => `
          <a href="/admin/${item.key}" class="sidebar-link ${section === item.key ? 'active' : ''}">
            ${icon(item.iconName)}
            <span>${item.label}</span>
          </a>
        `).join('')}
      </nav>

      <div class="sidebar-user-footer">
        <div class="user-info-row">
          <div class="user-avatar">${(user.name || user.username || 'A')[0].toUpperCase()}</div>
          <div class="user-meta">
            <div class="user-name">${esc(user.name || user.username)}</div>
            <div class="user-role">${esc(user.role.toUpperCase())}</div>
          </div>
        </div>
        <form method="POST" action="/admin/logout" style="margin-top:10px;">
          <button type="submit" class="btn-sidebar-logout">
            ${icon('logOut')} Sign Out
          </button>
        </form>
      </div>
    </aside>

    <!-- Main Admin Workspace -->
    <div class="admin-main">
      <header class="admin-topbar">
        <div class="topbar-left">
          <button class="mobile-sidebar-toggle" id="mobile-sidebar-toggle" aria-label="Toggle Navigation">
            ${icon('menu')}
          </button>
          <span class="topbar-crumb">Paira Plants Administration &nbsp;&sol;&nbsp; <strong>${esc(section.toUpperCase())}</strong></span>
        </div>
        <div class="topbar-right">
          <a href="/" target="_blank" class="btn-pill sm outline" style="display:flex;align-items:center;gap:6px;">
            ${icon('arrowRight')} View Public Store
          </a>
        </div>
      </header>

      <main class="admin-content" id="admin-workspace">
        <div id="admin-mount-point" data-section="${esc(section)}">
          <div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
            ${icon('sprout')}
            <p style="margin-top:12px;">Loading ${esc(section)} workspace...</p>
          </div>
        </div>
      </main>
    </div>
  </div>

  <!-- Admin Modal Root -->
  <div id="modal-root" class="modal-backdrop" style="display:none;" aria-hidden="true"></div>

  <!-- Client-side Interactive Admin Bundle -->
  <script src="/js/admin.js"></script>
</body>
</html>`;
}

module.exports = {
  esc,
  slugify,
  formatMoney,
  getSettings,
  renderLayout,
  renderProductCard,
  renderHomePage,
  renderAboutPage,
  renderShopPage,
  renderProductPage,
  renderGalleryPage,
  renderContactPage,
  renderCartPage,
  renderAdminLoginPage,
  renderAdminAppShell
};

