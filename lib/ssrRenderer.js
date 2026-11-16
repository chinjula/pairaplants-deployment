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
<link rel="icon" type="image/png" href="/images/logo.png">
<link rel="apple-touch-icon" href="/images/logo.png">
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
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css?v=2.8">

${structuredData ? `<script type="application/ld+json">\n${JSON.stringify(structuredData, null, 2)}\n</script>` : ''}
${extraHead}
</head>
<body class="ssr-page">
<div class="site-wrapper">
  <!-- Top Announcement Bar -->
  <div class="top-announcement-bar">
    <span class="announcement-desktop">${icon('shieldCheck')} Live Arrival Thermal Packaging Guarantee On All Aquatic Plants &amp; Fishes Across India &middot; Cash / UPI on Delivery</span>
    <span class="announcement-mobile">${icon('shieldCheck')} 100% Live Arrival Guaranteed &middot; Cash / UPI on Delivery</span>
  </div>

  <!-- Main Site Header -->
  <header class="site-header">
    <div class="header-bar">
      <a class="brand" href="/" aria-label="${esc(storeName)} Home">
        <img src="/images/logo.png" alt="${esc(storeName)} - ${esc(tagline)}" class="brand-logo-img" width="210" height="41">
      </a>

      <!-- Clean Public Navigation (No Staff Links in Customer Menus) -->
      <nav class="main-nav" id="main-nav" aria-label="Main Navigation">
        <a href="/" class="nav-item ${currentPath === '/' ? 'active' : ''}">Home</a>
        <a href="/about" class="nav-item ${currentPath.startsWith('/about') ? 'active' : ''}">Our Story</a>
        <a href="/shop" class="nav-item ${currentPath.startsWith('/shop') ? 'active' : ''}">Shop</a>
        <a href="/gallery" class="nav-item ${currentPath.startsWith('/gallery') ? 'active' : ''}">Gallery</a>
        <a href="/contact" class="nav-item ${currentPath.startsWith('/contact') ? 'active' : ''}">Contact</a>
      </nav>

      <!-- Header Customer Actions (Cart Icon + Sign in | Join now) -->
      <div class="header-actions">
        <a class="nav-cart-btn" href="/cart" aria-label="Shopping Cart">
          ${icon('shoppingCart')}
          <span class="cart-badge-count" id="header-cart-count">${cartCount || 0}</span>
        </a>
        <div class="nav-auth-links">
          <a href="/login" class="nav-auth-link">Sign in</a>
          <span class="nav-auth-sep">|</span>
          <a href="/login?mode=signup" class="nav-auth-link">Join now</a>
        </div>
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
        <a class="brand" href="/" aria-label="${esc(storeName)} Home">
          <img src="/images/logo.png" alt="${esc(storeName)}" class="brand-logo-img" width="190" height="37">
        </a>
        <button class="mobile-nav-close" id="mobile-nav-close" aria-label="Close Menu">${icon('x')}</button>
      </div>
      <div class="mobile-nav-auth-strip">
        <a href="/login" class="nav-auth-link">Sign in</a>
        <span class="nav-auth-sep">|</span>
        <a href="/login?mode=signup" class="nav-auth-link">Join now</a>
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
    <!-- 1. Value Proposition & Trust Strip -->
    <div class="footer-trust-strip">
      <div class="footer-trust-container">
        <div class="footer-trust-card">
          <div class="trust-card-icon">${icon('shieldCheck')}</div>
          <div class="trust-card-info">
            <h4>100% Live Arrival Guarantee</h4>
            <p>Thermal-insulated boxes with heat/ice packs for safe pan-India transit.</p>
          </div>
        </div>
        <div class="footer-trust-card">
          <div class="trust-card-icon">${icon('sprout')}</div>
          <div class="trust-card-info">
            <h4>Pest &amp; Snail-Free Flora</h4>
            <p>Laboratory tissue-cultured and carefully quarantined botanical specimens.</p>
          </div>
        </div>
        <div class="footer-trust-card">
          <div class="trust-card-icon">${icon('creditCard')}</div>
          <div class="trust-card-info">
            <h4>Cashfree &amp; COD Ready</h4>
            <p>Instant UPI (GPay, PhonePe, Paytm), Debit/Credit Cards &amp; Pay on Delivery.</p>
          </div>
        </div>
        <div class="footer-trust-card">
          <div class="trust-card-icon">${icon('whatsappFill')}</div>
          <div class="trust-card-info">
            <h4>Aquascaper Consultation</h4>
            <p>Direct botanical guidance &amp; tank setup care via WhatsApp &amp; Phone.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Main Multi-Column Section -->
    <div class="footer-main-wrap">
      <div class="footer-main-container">
        <!-- Col 1: Brand & Contact Info -->
        <div class="footer-col footer-col-brand">
          <div class="footer-brand">
            <a class="brand footer-brand-pill" href="/" aria-label="${esc(storeName)} Home">
              <img src="/images/logo.png" alt="${esc(storeName)}" class="brand-logo-img footer-logo-img" width="190" height="37">
            </a>
          </div>
          <p class="footer-brand-desc">
            ${esc(storeName)} brings the tranquility and vitality of living freshwater nature into homes, studios, and workspaces with premium, laboratory-nurtured plants and quarantined aquatic fauna.
          </p>
          <div class="footer-contact-list">
            <div class="footer-contact-row">
              <span class="contact-row-icon">${icon('mapPin')}</span>
              <span class="contact-row-text">${esc(address)}</span>
            </div>
            <div class="footer-contact-row">
              <span class="contact-row-icon">${icon('mail')}</span>
              <a href="mailto:${esc(email)}" class="contact-row-link">${esc(email)}</a>
            </div>
            <div class="footer-contact-row">
              <span class="contact-row-icon">${icon('phone')}</span>
              <a href="tel:${esc(phone.replace(/[^0-9+]/g, ''))}" class="contact-row-link">${esc(phone)}</a>
            </div>
          </div>
        </div>

        <!-- Col 2: Botanical Collections -->
        <div class="footer-col">
          <h4 class="footer-col-title">Botanical Collections</h4>
          <ul class="footer-nav-list">
            <li><a href="/shop/aquatic-plants-mosses">Aquatic Plants &amp; Mosses</a></li>
            <li><a href="/shop/ornamental-freshwater-fish">Ornamental Freshwater Fish</a></li>
            <li><a href="/shop/dwarf-shrimps-cleaners">Dwarf Shrimps &amp; Cleaners</a></li>
            <li><a href="/shop/substrates-driftwood">Substrates &amp; Driftwood</a></li>
            <li><a href="/shop/aquarium-gravels-accessories">Aquarium Gravels &amp; Tools</a></li>
            <li><a href="/shop" class="highlight-link">Browse Full Living Catalog &rarr;</a></li>
          </ul>
        </div>

        <!-- Col 3: Customer Care & Information -->
        <div class="footer-col">
          <h4 class="footer-col-title">Customer Care &amp; Trust</h4>
          <ul class="footer-nav-list">
            <li><a href="/about">Our Story &amp; Nursery Heritage</a></li>
            <li><a href="/about#packaging">Thermal Packaging Protocol</a></li>
            <li><a href="/about#guarantee">100% Live Arrival Guarantee</a></li>
            <li><a href="/contact">Aquascaping Consultation</a></li>
            <li><a href="/cart">Cart &amp; Order Checkout</a></li>
            <li><a href="/gallery">Planted Tank Gallery</a></li>
          </ul>
        </div>

        <!-- Col 4: Botanical Updates & Payments -->
        <div class="footer-col footer-col-updates">
          <h4 class="footer-col-title">Direct Botanical Updates</h4>
          <p class="footer-updates-desc">
            Receive notifications on fresh tissue-culture harvests, rare imports, and planted aquarium care guides.
          </p>
          <form class="footer-newsletter-form" onsubmit="event.preventDefault(); alert('Thank you for subscribing to Paira Plants updates!'); this.reset();">
            <div class="newsletter-input-box">
              <input type="email" placeholder="Your email address" required aria-label="Email address for botanical updates">
              <button type="submit" class="newsletter-btn" aria-label="Subscribe">
                <span>Join</span> ${icon('arrowRight')}
              </button>
            </div>
          </form>

          <div class="footer-payment-box">
            <div class="payment-box-header">
              ${icon('lock')} <span>100% Secure Checkout</span>
            </div>
            <div class="payment-badges-list">
              <span class="pay-chip">⚡ Cashfree PG</span>
              <span class="pay-chip">UPI (GPay/PhonePe)</span>
              <span class="pay-chip">Cards</span>
              <span class="pay-chip">NetBanking</span>
              <span class="pay-chip">🚚 Cash on Delivery</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Bottom Subfooter -->
    <div class="footer-subbar">
      <div class="footer-subbar-container">
        <div class="footer-copyright-text">
          &copy; 2026 <strong>${esc(storeName)}</strong> &middot; All Rights Reserved &middot; ${esc(tagline)}
        </div>
        <div class="footer-subbar-nav">
          <a href="/about">Our Story</a>
          <span class="dot">&middot;</span>
          <a href="/shop">Live Shop</a>
          <span class="dot">&middot;</span>
          <a href="/gallery">Gallery</a>
          <span class="dot">&middot;</span>
          <a href="/contact">Contact</a>
          <span class="dot">&middot;</span>
          <a href="/cart">Cart</a>
        </div>
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
<script src="/js/storefront.js?v=2.5"></script>
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
    <!-- HERO PHOTO BANNER (Text Inside Image) -->
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
        <div class="why-kicker-pill">
          <span>WHY AQUASCAPERS CHOOSE US</span>
        </div>
        <h2 class="why-title">Elevating Modern Living Spaces with Living Nature</h2>

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
    logo: `${host}/images/logo.png`,
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
  const address = 'Pairaplants Studio, Aquatic Flora Hub, Kozhikode, Kerala, India';
  const waNum = (settings.whatsapp_number || '919876543210').replace(/[^0-9]/g, '');

  const content = `
    <div class="our-story-page-wrapper">
      <!-- 1. Hero Header Section -->
      <section class="story-hero-section">
        <div class="story-hero-inner">
          <div class="story-hero-kicker-pill">
            <span class="kicker-dot"></span>
            <span>HERITAGE &amp; MISSION</span>
          </div>
          <h1 class="story-hero-headline">
            Bridging untouched aquatic ecosystems with modern living spaces through sustainable botany and aquaculture
          </h1>
          <p class="story-hero-subtext">
            Paira Plants was born from an obsessive pursuit: to eliminate melting flora, stressed wild catches, and fragile shipments by combining laboratory-grade tissue culturing with nature's timeless elegance.
          </p>
          <div class="story-hero-cta-group">
            <a href="/shop" class="story-btn-primary">
              <span>Explore Living Catalog</span>
              ${icon('arrowRight')}
            </a>
            <a href="#story" class="story-btn-secondary">
              <span>Our Botanical Philosophy</span>
              ${icon('sprout')}
            </a>
          </div>
        </div>

        <!-- 2. Expansive Illustration Container -->
        <div class="story-illustration-wrap">
          <div class="story-illustration-card">
            <img src="/images/our-story-heritage.png" alt="Botanist tending to lush planted aquarium and natural aquatic ecosystem" class="story-illustration-img" loading="eager">
            <div class="illustration-caption-badge">
              <span class="caption-icon">${icon('sprout')}</span>
              <span>Paira Plants Botanical Propagation &amp; Aquascaping Facility &middot; Kozhikode, Kerala</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. Botanical Stats Grid (Minimalist White Cards with Soft Drop Shadows) -->
      <section class="story-stats-section">
        <div class="story-stats-container">
          <div class="stat-card">
            <div class="stat-card-icon-wrap stat-green">
              ${icon('leaf')}
            </div>
            <div class="stat-number">85+</div>
            <div class="stat-title">Quarantined Varieties</div>
            <div class="stat-desc">Tissue-cultured stems, rare aquatic mosses, rosettes, and quarantined clean fauna.</div>
          </div>

          <div class="stat-card">
            <div class="stat-card-icon-wrap stat-blue">
              ${icon('shieldCheck')}
            </div>
            <div class="stat-number">100%</div>
            <div class="stat-title">Live Arrival Insured</div>
            <div class="stat-desc">Insulated thermal chambers and pure oxygen canisters for zero-stress pan-India transit.</div>
          </div>

          <div class="stat-card">
            <div class="stat-card-icon-wrap stat-teal">
              ${icon('recycle')}
            </div>
            <div class="stat-number">0%</div>
            <div class="stat-title">Pest &amp; Snail Contamination</div>
            <div class="stat-desc">Laboratory strict sterilization ensuring pristine, disease-free introduction to your tank.</div>
          </div>

          <div class="stat-card">
            <div class="stat-card-icon-wrap stat-amber">
              ${icon('truckFast')}
            </div>
            <div class="stat-number">2-4 Days</div>
            <div class="stat-title">Express Thermal Dispatch</div>
            <div class="stat-desc">Carefully packaged and expedited via temperature-monitored air courier dispatch.</div>
          </div>
        </div>
      </section>

      <!-- 4. Editorial Narrative Grid -->
      <section class="story-narrative-section" id="story">
        <div class="story-narrative-layout">
          <!-- Main Narrative Column -->
          <div class="narrative-content">
            <span class="story-hero-kicker-pill" style="margin-bottom:16px;">
              <span class="kicker-dot"></span>
              <span>OUR BOTANICAL PHILOSOPHY</span>
            </span>
            <h2>Aquatic Flora as Living Architecture in Kozhikode, Kerala</h2>
            <p>
              Founded by passionate aquascapers and botanists, Paira Plants began with a single vision: to eliminate the frustrations hobbyists face with melting tissue cultures, snail-infested bunched plants, and stressed wild catches.
            </p>
            <p>
              From our dedicated flora studio and propagation facility in Kozhikode, Kerala, we maintain pristine aquatic habitats. Every stem, rosette, and rhizome is nurtured under high-efficiency full-spectrum LED fixtures, calibrated nutrient dosing, and pressurized CO2 before arriving at your doorstep.
            </p>

            <div class="story-quote-card">
              <p>&ldquo;An aquarium is not merely a tank of water; it is a self-sustaining miniature biosphere. When the plants thrive, the fish flourish, and the mind finds stillness.&rdquo;</p>
              <div class="story-quote-author">
                ${icon('sprout')} <span>Paira Plants Botanical Care Team</span>
              </div>
            </div>
          </div>

          <!-- Sidebar Column -->
          <aside class="story-sidebar">
            <div class="sidebar-card sidebar-card-cta">
              <h3>Need Aquascaping Advice?</h3>
              <p>
                Whether you are setting up a low-tech nano tank or a competitive high-tech Dutch layout, our botanists provide custom scape consultations.
              </p>
              <a class="sidebar-cta-btn" href="https://wa.me/${waNum}?text=${encodeURIComponent('Hello Paira Plants! I would like botanical advice for my aquarium setup.')}" target="_blank" rel="noopener noreferrer">
                ${icon('whatsappFill')} <span>Chat With Our Botanists</span>
              </a>
            </div>

            <div class="sidebar-card">
              <h3>Studio &amp; Greenhouse</h3>
              <p style="font-size:0.9rem;color:#64748B;line-height:1.6;margin:0 0 14px 0;">
                <strong>Botanical Studio:</strong><br>${esc(address)}
              </p>
              <p style="font-size:0.86rem;color:#64748B;line-height:1.5;margin:0 0 14px 0;">
                <strong>Visiting Hours:</strong><br>Monday &ndash; Saturday &middot; 10:00 AM &ndash; 7:00 PM IST
              </p>
              <div style="display:flex;flex-direction:column;gap:8px;font-size:0.88rem;">
                <div style="display:flex;align-items:center;gap:8px;color:#132A1C;font-weight:600;">
                  ${icon('phone')} <a href="tel:${esc(phone.replace(/[^0-9+]/g, ''))}" style="color:#132A1C;text-decoration:none;">${esc(phone)}</a>
                </div>
                <div style="display:flex;align-items:center;gap:8px;color:#64748B;">
                  ${icon('mail')} <a href="mailto:${esc(email)}" style="color:#64748B;text-decoration:none;">${esc(email)}</a>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;

  return renderLayout({
    title: `Heritage &amp; Mission &middot; ${settings.business_name || 'Paira Plants'}`,
    description: 'Learn about Paira Plants, our tissue culture nursery, quarantine protocols, and proprietary thermal packaging system.',
    canonicalUrl: `${host}/about`,
    ogImage: '/images/our-story-heritage.png',
    content,
    currentPath: '/about',
    settings
  });
}

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
          <h1 style="font-family:var(--font-serif, 'Fraunces', Georgia, serif);font-size:clamp(2rem, 3.5vw, 2.8rem);font-weight:700;color:#0F172A;margin:4px 0 8px;letter-spacing:-0.01em;">${esc(activeCatName)}</h1>
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
  const address = 'Pairaplants Studio, Aquatic Flora Hub, Kozhikode, Kerala, India';
  const waNum = (settings.whatsapp_number || '919876543210').replace(/[^0-9]/g, '');

  const content = `
    <div class="contact-page-wrapper">
      <!-- Top Page Header -->
      <div class="contact-page-header">
        <div class="contact-header-badge">
          <span class="kicker-dot"></span>
          <span>GET IN TOUCH</span>
        </div>
        <h1 class="contact-page-title">We Are Here To Help Your Aquarium Thrive</h1>
        <p class="contact-page-desc">
          Connect with our botanists and aquatic fauna specialists for setup advice, plant compatibility, or live order assistance.
        </p>
      </div>

      <!-- Two Side-by-Side Floating Cards Container -->
      <div class="contact-floating-cards-grid">
        <!-- LEFT CARD: Contact Details & Circular Icon Badges -->
        <div class="contact-floating-card">
          <div>
            <span class="contact-card-kicker">STUDIO CHANNELS</span>
            <h2 class="contact-card-headline">Direct Studio Channels</h2>
            <p class="contact-card-subtext">
              Reach out directly for botanical care questions, live animal quarantine protocols, or commercial aquascape installations.
            </p>

            <div class="contact-info-list">
              <!-- Item 1: Location -->
              <div class="contact-info-item">
                <div class="contact-circle-badge">
                  ${icon('mapPin')}
                </div>
                <div class="contact-item-content">
                  <span class="contact-item-label">Nursery Studio &amp; Greenhouse</span>
                  <span class="contact-item-val">${esc(address)}</span>
                  <span class="contact-item-note">Visiting Hours: Mon&ndash;Sat &middot; 10:00 AM &ndash; 7:00 PM IST</span>
                </div>
              </div>

              <!-- Item 2: Email -->
              <div class="contact-info-item">
                <div class="contact-circle-badge">
                  ${icon('mail')}
                </div>
                <div class="contact-item-content">
                  <span class="contact-item-label">Official Nursery Email</span>
                  <a href="mailto:${esc(email)}" class="contact-item-link">${esc(email)}</a>
                  <span class="contact-item-note">Average response time under 4 business hours</span>
                </div>
              </div>

              <!-- Item 3: Phone -->
              <div class="contact-info-item">
                <div class="contact-circle-badge">
                  ${icon('phone')}
                </div>
                <div class="contact-item-content">
                  <span class="contact-item-label">Direct Customer Telephone</span>
                  <a href="tel:${esc(phone.replace(/[^0-9+]/g, ''))}" class="contact-item-link">${esc(phone)}</a>
                  <span class="contact-item-note">Direct call assistance for plant health &amp; orders</span>
                </div>
              </div>

              <!-- Item 4: Guarantee -->
              <div class="contact-info-item">
                <div class="contact-circle-badge">
                  ${icon('shieldCheck')}
                </div>
                <div class="contact-item-content">
                  <span class="contact-item-label">Pan-India Express Dispatch</span>
                  <span class="contact-item-val">100% Live Arrival Guarantee</span>
                  <span class="contact-item-note">Insulated thermal chambers with medical oxygen packs</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Subtly Tinted Highlight Box with WhatsApp Button -->
          <div class="contact-wa-highlight-box">
            <div class="wa-box-header">
              <div class="wa-box-icon">
                ${icon('whatsappFill')}
              </div>
              <div class="wa-box-text">
                <h4>Instant WhatsApp Consultation</h4>
                <p>Share photos of your tank, plants, or aquascape layout for rapid diagnostic advice.</p>
              </div>
            </div>
            <a class="btn-whatsapp-pill" href="https://wa.me/${waNum}?text=${encodeURIComponent('Hello Paira Plants! I would like botanical advice for my aquarium setup.')}" target="_blank" rel="noopener noreferrer">
              ${icon('whatsappFill')} <span>Chat on WhatsApp</span>
            </a>
          </div>
        </div>

        <!-- RIGHT CARD: Minimalist Inquiry Form -->
        <div class="contact-floating-card">
          <div>
            <span class="contact-card-kicker">DIRECT INQUIRY</span>
            <h2 class="contact-card-headline">Send Us an Inquiry</h2>
            <p class="contact-card-subtext">
              Fill out your details below and our team will get back to you with custom botanical recommendations.
            </p>

            <form class="contact-inquiry-form" id="public-contact-form">
              <div class="form-field-group">
                <label for="c-name">Full Recipient Name *</label>
                <input id="c-name" type="text" name="name" required placeholder="e.g. John Doe">
              </div>

              <div class="form-fields-row">
                <div class="form-field-group">
                  <label for="c-email">Email Address *</label>
                  <input id="c-email" type="email" name="email" required placeholder="name@example.com">
                </div>
                <div class="form-field-group">
                  <label for="c-phone">Phone / WhatsApp Number</label>
                  <input id="c-phone" type="tel" name="phone" placeholder="+91 98765 43210">
                </div>
              </div>

              <div class="form-field-group">
                <label for="c-subject">Inquiry Topic *</label>
                <select id="c-subject" name="subject" required>
                  <option value="Plant Care &amp; Water Chemistry Consultation" selected>🌿 Plant Care &amp; Water Chemistry Consultation</option>
                  <option value="Rare Plant &amp; Tissue-Culture Sourcing">🌱 Rare Plant &amp; Tissue-Culture Sourcing</option>
                  <option value="Freshwater Livestock &amp; Shrimp">🦐 Freshwater Fishes &amp; Dwarf Shrimps</option>
                  <option value="Shipping &amp; Live Arrival Guarantee">📦 Order Status &amp; Live Arrival Guarantee</option>
                  <option value="Commercial &amp; Bulk Orders">🏢 Studio Aquascape Installation &amp; Wholesale</option>
                  <option value="Other Inquiries">💬 Other General Inquiries</option>
                </select>
              </div>

              <div class="form-field-group">
                <label for="c-message">Your Message / Tank Specifications *</label>
                <textarea id="c-message" name="message" rows="4" required placeholder="Describe your aquarium size, lighting, substrate, CO2 setup, or question..."></textarea>
              </div>

              <button type="submit" class="contact-submit-forest-btn" id="contact-submit-btn">
                <span>Send Botanical Inquiry</span>
                ${icon('arrowRight')}
              </button>

              <div id="contact-form-status" style="display:none;margin-top:14px;"></div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: `Contact &amp; Consultation &middot; ${settings.business_name || 'Paira Plants'}`,
    description: 'Contact Paira Plants studio for aquatic plant consultations, live fish inquiries, and thermal shipping support.',
    canonicalUrl: `${host}/contact`,
    content,
    currentPath: '/contact',
    settings
  });
}

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
    settings,
    extraHead: '<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>'
  });
}

function renderPaymentStatusPage({ db, host, order, status }) {
  const settings = getSettings(db);
  const sym = settings.currency_symbol || '₹';

  let iconHtml = '<div style="font-size:3.5rem;color:#15803D;margin-bottom:12px;">&check;</div>';
  let headline = 'Payment Successful &amp; Order Confirmed!';
  let subtext = 'Your transaction was verified and your order is now in our system.';

  if (status === 'FAILED') {
    iconHtml = '<div style="font-size:3.5rem;color:#DC2626;margin-bottom:12px;">&cross;</div>';
    headline = 'Payment Failed or Cancelled';
    subtext = 'We were unable to verify your payment. No charges were made or a refund will be processed automatically.';
  } else if (status === 'PENDING') {
    iconHtml = '<div style="font-size:3.5rem;color:#D97706;margin-bottom:12px;">&#9203;</div>';
    headline = 'Payment Processing / Awaiting Confirmation';
    subtext = 'Your bank or UPI app is confirming the transaction. This page will update shortly.';
  }

  const content = `
    <div class="content-container" style="padding-top:40px;padding-bottom:80px;max-width:680px;margin:0 auto;">
      <div style="background:#fff;border:1px solid var(--border-subtle);border-radius:16px;padding:36px 24px;text-align:center;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);">
        ${iconHtml}
        <h1 style="font-size:1.8rem;margin-bottom:10px;color:var(--text-dark);">${headline}</h1>
        <p style="color:var(--text-muted);font-size:1rem;margin-bottom:28px;">${subtext}</p>

        ${order ? `
          <div style="background:#F8FAFC;border:1px solid var(--line);border-radius:12px;padding:20px;text-align:left;margin-bottom:28px;font-size:0.95rem;">
            <div style="display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:10px;">
              <span style="color:#64748B;">Order Reference</span>
              <strong>#ORD-${order.id}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:10px;">
              <span style="color:#64748B;">Total Amount</span>
              <strong>${sym} ${Number(order.total || 0).toLocaleString('en-IN')}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:10px;">
              <span style="color:#64748B;">Payment Status</span>
              <span style="font-weight:700;color:${status === 'PAID' ? '#15803D' : (status === 'FAILED' ? '#DC2626' : '#D97706')}">
                ${status === 'PAID' ? 'PAID &bull; Verified via Cashfree' : (status === 'FAILED' ? 'FAILED' : 'PENDING')}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:10px;">
              <span style="color:#64748B;">Recipient</span>
              <span>${esc(order.name)} (${esc(order.phone)})</span>
            </div>
            <div style="padding-top:4px;">
              <span style="color:#64748B;display:block;margin-bottom:4px;">Delivery Address</span>
              <span style="font-size:0.9rem;">${esc(order.address)}</span>
            </div>
          </div>
        ` : `
          <div style="background:#F8FAFC;border:1px solid var(--line);border-radius:12px;padding:20px;text-align:center;margin-bottom:28px;color:#64748B;">
            Order details could not be found or transaction ID is invalid.
          </div>
        `}

        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <a class="btn-pill" href="/shop">Browse Botanical Catalog &rarr;</a>
          ${order ? `<a class="btn-pill outline" href="/api/orders/${order.id}/invoice" target="_blank">Download Tax Invoice (PDF)</a>` : ''}
          ${status === 'FAILED' ? `<a class="btn-pill outline" href="/cart">Return to Cart &amp; Retry</a>` : ''}
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: `Payment Status &middot; ${settings.business_name || 'Paira Plants'}`,
    description: 'Transaction status and order confirmation for Paira Plants.',
    canonicalUrl: `${host}/payment/status`,
    content,
    currentPath: '/payment/status',
    settings
  });
}

// --------------------------------------------------------------------------
// 10. PROTECTED ADMIN PORTAL LAYOUT & LOGIN
// --------------------------------------------------------------------------
function renderAdminLoginPage(error = '', host = '', defaultTab = 'customer-signin') {
  const isStaff = defaultTab === 'staff';
  const isSignup = defaultTab === 'customer-signup';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign In &middot; Paira Plants Studio</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css?v=2.8">
</head>
<body style="margin:0;padding:0;">
  <div class="login-page-bg">
    <!-- Centered Floating Split-Card (50/50 Desktop, Stacked Mobile) -->
    <div class="login-split-card">
      <!-- Left Panel: Pristine Lush Aquascape Visual with Zero Baked-in Text -->
      <div class="login-visual-panel">
        <div class="login-visual-overlay"></div>
        <div class="login-visual-brand">
          <img src="/images/logo.png" alt="Paira Plants" style="height:32px;width:auto;display:block;">
        </div>
        <div class="login-visual-copy">
          <span class="login-visual-kicker">SUSTAINABLE BOTANICAL NURSERY</span>
          <h3>Where Living Nature Comes Alive</h3>
          <p>Laboratory-cultured aquatic flora, quarantined freshwater fauna, and bespoke natural aquascaping across India.</p>
          <div class="login-visual-perks">
            <span>&#10022; 100% Live Arrival Insured</span>
            <span>&#10022; Snail &amp; Pest-Free Flora</span>
          </div>
        </div>
      </div>

      <!-- Right Panel: Clean Form Panel for Customers & Staff -->
      <div class="login-form-panel">
        <div>
          <div class="login-nav-top">
            <a href="/" class="login-back-btn">&larr; Back to Store</a>
            <span class="login-portal-tag" id="portal-role-tag">${isStaff ? 'STAFF &amp; ADMIN' : 'CUSTOMER ACCOUNT'}</span>
          </div>

          <!-- Dual Tab Switcher: Customer vs Staff -->
          <div class="login-tab-switcher" role="tablist">
            <button type="button" class="login-tab-btn ${isStaff ? '' : 'active'}" id="tab-btn-customer" onclick="setLoginSection('customer')">Customer Account</button>
            <button type="button" class="login-tab-btn ${isStaff ? 'active' : ''}" id="tab-btn-staff" onclick="setLoginSection('staff')">Staff &amp; Admin</button>
          </div>

          <!-- Status / Error Alert Banner -->
          <div id="login-alert" class="login-auth-error" style="${error ? '' : 'display:none;'}">
            ${esc(error)}
          </div>

          <!-- 1. CUSTOMER PANE -->
          <div id="pane-customer" style="${isStaff ? 'display:none;' : ''}">
            <!-- 1A. Customer Sign In Form -->
            <div id="cust-signin-section" style="${isSignup ? 'display:none;' : ''}">
              <div class="login-card-header">
                <h1>Customer Sign In</h1>
                <p>Access your live plant orders, tracked shipments, and wishlist.</p>
              </div>

              <form id="customer-login-form" onsubmit="handleCustomerLogin(event)" class="login-fields-form">
                <div class="login-field-item">
                  <label for="cust-login-email">Email Address</label>
                  <input type="email" id="cust-login-email" required autocomplete="email" placeholder="name@example.com" autofocus>
                </div>

                <div class="login-field-item">
                  <label for="cust-login-pw">Password</label>
                  <input type="password" id="cust-login-pw" required autocomplete="current-password" placeholder="Enter your password">
                </div>

                <button type="submit" id="btn-cust-login" class="login-submit-dark-btn">
                  <span>Sign In to Account</span> &rarr;
                </button>
              </form>

              <div class="login-sub-toggle">
                <span>New to Paira Plants?</span>
                <a href="javascript:void(0)" onclick="setCustomerMode('signup')">Join now &rarr;</a>
              </div>
            </div>

            <!-- 1B. Customer Join Now (Sign Up) Form -->
            <div id="cust-signup-section" style="${isSignup ? '' : 'display:none;'}">
              <div class="login-card-header">
                <h1>Join Paira Plants</h1>
                <p>Create an account for 100% Live Arrival guarantees and expedited botanical checkout.</p>
              </div>

              <form id="customer-register-form" onsubmit="handleCustomerRegister(event)" class="login-fields-form">
                <div class="login-field-item">
                  <label for="cust-reg-name">Full Name</label>
                  <input type="text" id="cust-reg-name" required autocomplete="name" placeholder="e.g. Rahul Sharma">
                </div>

                <div class="login-field-item">
                  <label for="cust-reg-email">Email Address</label>
                  <input type="email" id="cust-reg-email" required autocomplete="email" placeholder="name@example.com">
                </div>

                <div class="login-field-item">
                  <label for="cust-reg-phone">Phone / WhatsApp Number</label>
                  <input type="tel" id="cust-reg-phone" required autocomplete="tel" placeholder="+91 98765 43210">
                </div>

                <div class="login-field-item">
                  <label for="cust-reg-pw">Create Password</label>
                  <input type="password" id="cust-reg-pw" required autocomplete="new-password" placeholder="Minimum 6 characters" minlength="6">
                </div>

                <button type="submit" id="btn-cust-reg" class="login-submit-dark-btn">
                  <span>Create Botanical Account</span> &rarr;
                </button>
              </form>

              <div class="login-sub-toggle">
                <span>Already have an account?</span>
                <a href="javascript:void(0)" onclick="setCustomerMode('signin')">Sign in &rarr;</a>
              </div>
            </div>
          </div>

          <!-- 2. STAFF & ADMIN PANE -->
          <div id="pane-staff" style="${isStaff ? '' : 'display:none;'}">
            <div class="login-card-header">
              <h1>Staff Sign In</h1>
              <p>Enter staff credentials to access inventory, orders &amp; POS billing.</p>
            </div>

            <form method="POST" action="/admin/login" class="login-fields-form">
              <div class="login-field-item">
                <label for="admin-user">Staff Username / Email</label>
                <input type="text" id="admin-user" name="username" required autocomplete="username" placeholder="e.g. owner or manager">
              </div>

              <div class="login-field-item">
                <label for="admin-pw">Staff Password</label>
                <input type="password" id="admin-pw" name="password" required autocomplete="current-password" placeholder="Enter secure password">
              </div>

              <button type="submit" class="login-submit-dark-btn">
                <span>Sign In to Dashboard</span> &rarr;
              </button>
            </form>

            <div class="login-sub-toggle" style="margin-top:20px;">
              <span>Looking for customer orders?</span>
              <a href="javascript:void(0)" onclick="setLoginSection('customer')">Customer Login &rarr;</a>
            </div>
          </div>
        </div>

        <div class="login-secure-footer" id="login-footer-copy">
          ${icon('lock')} <span>Encrypted 256-bit Session &middot; Paira Plants Studio</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    function setLoginSection(sec) {
      const isStaff = sec === 'staff';
      document.getElementById('tab-btn-customer').classList.toggle('active', !isStaff);
      document.getElementById('tab-btn-staff').classList.toggle('active', isStaff);
      document.getElementById('pane-customer').style.display = isStaff ? 'none' : 'block';
      document.getElementById('pane-staff').style.display = isStaff ? 'block' : 'none';
      document.getElementById('portal-role-tag').innerHTML = isStaff ? 'STAFF &amp; ADMIN' : 'CUSTOMER ACCOUNT';
      document.getElementById('login-alert').style.display = 'none';
    }

    function setCustomerMode(mode) {
      const isSignup = mode === 'signup';
      document.getElementById('cust-signin-section').style.display = isSignup ? 'none' : 'block';
      document.getElementById('cust-signup-section').style.display = isSignup ? 'block' : 'none';
      document.getElementById('login-alert').style.display = 'none';
    }

    async function handleCustomerLogin(e) {
      e.preventDefault();
      const alertEl = document.getElementById('login-alert');
      const btn = document.getElementById('btn-cust-login');
      alertEl.style.display = 'none';
      alertEl.className = 'login-auth-error';
      btn.disabled = true;
      btn.innerHTML = 'Signing in...';

      const email = document.getElementById('cust-login-email').value.trim();
      const password = document.getElementById('cust-login-pw').value;

      try {
        const res = await fetch('/api/customer/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid credentials');

        alertEl.className = 'login-auth-success';
        alertEl.textContent = 'Welcome back! Redirecting...';
        alertEl.style.display = 'block';
        setTimeout(() => {
          const params = new URLSearchParams(window.location.search);
          window.location.href = params.get('redirect') || '/';
        }, 600);
      } catch (err) {
        alertEl.textContent = err.message;
        alertEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<span>Sign In to Account</span> &rarr;';
      }
    }

    async function handleCustomerRegister(e) {
      e.preventDefault();
      const alertEl = document.getElementById('login-alert');
      const btn = document.getElementById('btn-cust-reg');
      alertEl.style.display = 'none';
      alertEl.className = 'login-auth-error';
      btn.disabled = true;
      btn.innerHTML = 'Creating account...';

      const name = document.getElementById('cust-reg-name').value.trim();
      const email = document.getElementById('cust-reg-email').value.trim();
      const phone = document.getElementById('cust-reg-phone').value.trim();
      const password = document.getElementById('cust-reg-pw').value;

      try {
        const res = await fetch('/api/customer/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');

        alertEl.className = 'login-auth-success';
        alertEl.textContent = 'Account created successfully! Welcome to Paira Plants.';
        alertEl.style.display = 'block';
        setTimeout(() => {
          window.location.href = '/';
        }, 800);
      } catch (err) {
        alertEl.textContent = err.message;
        alertEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<span>Create Botanical Account</span> &rarr;';
      }
    }
  </script>
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
<link rel="stylesheet" href="/css/style.css?v=2.8">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin-body">
  <div class="admin-wrapper">
    <!-- Persistent Desktop Sidebar -->
    <aside class="admin-sidebar" id="admin-sidebar">
      <div class="sidebar-header">
        <a href="/admin/dashboard" class="sidebar-brand" style="display:flex;align-items:center;background:#ffffff;padding:8px 12px;border-radius:10px;">
          <img src="/images/logo.png" alt="Paira Plants Staff Admin" style="height:32px;width:auto;display:block;">
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
  renderPaymentStatusPage,
  renderAdminLoginPage,
  renderAdminAppShell
};

