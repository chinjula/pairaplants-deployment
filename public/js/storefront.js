// public/js/storefront.js - Client Interactivity for Public Storefront
'use strict';

(function() {
  // 1. Cart Management in LocalStorage
  const CART_KEY = 'pp_cart_v2';
  let cart = {};

  try {
    const saved = localStorage.getItem(CART_KEY);
    if (saved) cart = JSON.parse(saved);
  } catch (e) {
    cart = {};
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {}
    updateHeaderCartBadge();
    if (window.location.pathname === '/cart') {
      renderCartPage();
    }
  }

  function getCartCount() {
    return Object.values(cart).reduce((sum, item) => sum + (item.qty || 1), 0);
  }

  function updateHeaderCartBadge() {
    const badge = document.getElementById('header-cart-count');
    if (badge) {
      badge.textContent = getCartCount();
      badge.style.display = getCartCount() > 0 ? 'inline-flex' : 'none';
    }
  }

  function showToast(msg) {
    let t = document.getElementById('storefront-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'storefront-toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0F291E;color:#fff;padding:12px 24px;border-radius:30px;font-size:0.9rem;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,0.25);z-index:999999;transition:opacity 0.2s,transform 0.2s;opacity:0;pointer-events:none;display:flex;align-items:center;gap:8px;';
      document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(-10px)';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(0)';
    }, 2800);
  }

  // 2. Mobile Navigation Drawer Listeners
  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  const mobileClose = document.getElementById('mobile-nav-close');
  const mobileBackdrop = document.getElementById('mobile-nav-backdrop');

  function openDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.add('open');
      mobileDrawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('menu-open');
    }
  }

  function closeDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.remove('open');
      mobileDrawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('menu-open');
    }
  }

  if (mobileToggle) mobileToggle.addEventListener('click', openDrawer);
  if (mobileClose) mobileClose.addEventListener('click', closeDrawer);
  if (mobileBackdrop) mobileBackdrop.addEventListener('click', closeDrawer);

  // 3. Add to Cart Event Delegations
  document.addEventListener('click', e => {
    // Add to cart from product card
    const addBtn = e.target.closest('[data-action="addToCart"]');
    if (addBtn) {
      e.preventDefault();
      const id = addBtn.dataset.id;
      const name = addBtn.dataset.name;
      const price = parseFloat(addBtn.dataset.price);
      const sku = addBtn.dataset.sku;
      const img = addBtn.dataset.img;

      if (!cart[id]) {
        cart[id] = { id, name, price, sku, img, qty: 1 };
      } else {
        cart[id].qty += 1;
      }
      saveCart();
      showToast(`&check; Added <strong>${name}</strong> to cart!`);
      return;
    }

    // Add to cart from detail page
    const detailAddBtn = e.target.closest('[data-action="addToCartDetail"]');
    if (detailAddBtn) {
      e.preventDefault();
      const id = detailAddBtn.dataset.id;
      const name = detailAddBtn.dataset.name;
      const price = parseFloat(detailAddBtn.dataset.price);
      const sku = detailAddBtn.dataset.sku;
      const img = detailAddBtn.dataset.img;
      const qtyInput = document.getElementById('prod-qty-input');
      const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;

      if (!cart[id]) {
        cart[id] = { id, name, price, sku, img, qty };
      } else {
        cart[id].qty += qty;
      }
      saveCart();
      showToast(`&check; Added ${qty} &times; <strong>${name}</strong> to cart!`);
      return;
    }
  });

  // 4. Cart Page Rendering (on /cart)
  function renderCartPage() {
    const container = document.getElementById('cart-app-container');
    if (!container) return;

    const items = Object.values(cart);
    if (!items.length) {
      container.innerHTML = `
        <div class="narrow-box" style="text-align:center;padding:80px 20px;">
          <div style="font-size:3.5rem;color:var(--text-muted);margin-bottom:14px;">🛒</div>
          <h2>Your shopping cart is currently empty</h2>
          <p class="muted" style="margin-bottom:28px;">Explore our curated selection of aquatic plants, ornamental fishes, and dwarf shrimps to get started.</p>
          <a class="btn-pill" href="/shop">Browse Botanical Catalog &rarr;</a>
        </div>
      `;
      return;
    }

    const subtotal = items.reduce((sum, it) => sum + (it.price * (it.qty || 1)), 0);
    const shipping = 0; // Free thermal shipping
    const grandTotal = subtotal + shipping;

    container.innerHTML = `
      <div class="cart-grid-layout">
        <!-- Cart Items List -->
        <div class="cart-items-panel">
          <div class="table-wrap">
            <table class="cart-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Quantity</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr>
                    <td class="cart-item-info">
                      <img src="${it.img || '/images/hero-aquarium.jpg'}" alt="${it.name}" class="cart-thumb">
                      <div>
                        <strong>${it.name}</strong>
                        <div class="cart-item-sku tabular-nums">SKU: ${it.sku || ('PP-' + it.id)}</div>
                      </div>
                    </td>
                    <td class="tabular-nums">₹ ${it.price.toLocaleString('en-IN')}</td>
                    <td>
                      <div class="cart-qty-stepper">
                        <button type="button" class="btn-cart-minus" data-id="${it.id}">-</button>
                        <span class="cart-qty-val tabular-nums">${it.qty}</span>
                        <button type="button" class="btn-cart-plus" data-id="${it.id}">+</button>
                      </div>
                    </td>
                    <td class="tabular-nums" style="font-weight:700;">₹ ${(it.price * it.qty).toLocaleString('en-IN')}</td>
                    <td>
                      <button type="button" class="btn-cart-remove" data-id="${it.id}" title="Remove item">&times;</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;">
            <a href="/shop" class="btn-pill outline sm">&larr; Continue Shopping</a>
            <button type="button" class="btn-pill sm outline" id="clear-cart-btn" style="color:#b91c1c;border-color:#fca5a5;">Clear Cart</button>
          </div>
        </div>

        <!-- Order Summary & Checkout Form -->
        <div class="cart-summary-panel">
          <div class="summary-card">
            <h3>Order Summary</h3>
            <div class="summary-row">
              <span>Botanical Items Subtotal</span>
              <span class="tabular-nums">₹ ${subtotal.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row">
              <span>Live Thermal Packaging</span>
              <span style="color:var(--primary-green);font-weight:700;">FREE (Insured)</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-total-row">
              <span>Grand Total</span>
              <span class="tabular-nums total-amount">₹ ${grandTotal.toLocaleString('en-IN')}</span>
            </div>

            <!-- Instant Checkout Form -->
            <form id="public-checkout-form" style="margin-top:24px;">
              <h4 style="font-size:1rem;margin-bottom:12px;">Delivery Information</h4>

              <div class="form-group">
                <label>Full Recipient Name *</label>
                <input type="text" name="name" required placeholder="Full Name">
              </div>

              <div class="form-group">
                <label>Contact Phone (for delivery SMS &amp; Call) *</label>
                <input type="tel" name="phone" required placeholder="10-digit mobile number">
              </div>

              <div class="form-group">
                <label>Street Address &amp; House / Flat # *</label>
                <textarea name="address" rows="3" required placeholder="Door no, Apartment, Street name..."></textarea>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label>City *</label>
                  <input type="text" name="city" required placeholder="City / Town">
                </div>
                <div class="form-group">
                  <label>PIN Code *</label>
                  <input type="text" name="pincode" required placeholder="6-digit PIN">
                </div>
              </div>

              <div class="form-group">
                <label>Payment Method</label>
                <div class="payment-method-box">
                  <label class="radio-label">
                    <input type="radio" name="paymentMethod" value="Cash / UPI on Delivery" checked>
                    <span><strong>Cash / UPI on Delivery</strong> (Pay upon live arrival)</span>
                  </label>
                </div>
              </div>

              <button type="submit" class="btn-pill" style="width:100%;padding:14px;font-size:1rem;margin-top:14px;" id="place-order-btn">
                Confirm &amp; Place Order (₹ ${grandTotal.toLocaleString('en-IN')})
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    // Bind quantity and remove buttons
    container.querySelectorAll('.btn-cart-minus').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        if (cart[id]) {
          cart[id].qty = Math.max(1, cart[id].qty - 1);
          saveCart();
        }
      };
    });

    container.querySelectorAll('.btn-cart-plus').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        if (cart[id]) {
          cart[id].qty += 1;
          saveCart();
        }
      };
    });

    container.querySelectorAll('.btn-cart-remove').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        delete cart[id];
        saveCart();
      };
    });

    const clearBtn = container.querySelector('#clear-cart-btn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (confirm('Are you sure you want to empty your shopping cart?')) {
          cart = {};
          saveCart();
        }
      };
    }

    // Submit Checkout
    const form = container.querySelector('#public-checkout-form');
    if (form) {
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const submitBtn = form.querySelector('#place-order-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing Order...';

        const fd = new FormData(form);
        const orderData = {
          name: fd.get('name'),
          phone: fd.get('phone'),
          email: '',
          address: `${fd.get('address')}, ${fd.get('city')} - ${fd.get('pincode')}`,
          items: items.map(it => ({ id: +it.id, qty: it.qty, price: it.price })),
          paymentMethod: fd.get('paymentMethod') || 'Cash / UPI on Delivery',
          notes: 'Online Store Checkout'
        };

        try {
          const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to place order.');

          // Clear cart
          cart = {};
          saveCart();

          // Render Success Confirmation
          container.innerHTML = `
            <div class="narrow-box" style="text-align:center;padding:80px 20px;">
              <div style="font-size:3.5rem;color:var(--primary-green);margin-bottom:16px;">&check;</div>
              <h1 style="margin-bottom:10px;">Order Placed Successfully!</h1>
              <p style="font-size:1.1rem;color:var(--text-muted);margin-bottom:24px;">Thank you, <strong>${result.name}</strong>. Your order <strong>#ORD-${result.id}</strong> has been confirmed.</p>
              <div style="background:#fff;border:1px solid var(--border-subtle);border-radius:12px;padding:24px;max-width:480px;margin:0 auto 28px;text-align:left;">
                <p><strong>Order Number:</strong> #ORD-${result.id}</p>
                <p><strong>Total Amount:</strong> ₹ ${(result.total || grandTotal).toLocaleString('en-IN')}</p>
                <p><strong>Payment Mode:</strong> ${result.paymentMethod || 'Cash / UPI on Delivery'}</p>
                <p><strong>Dispatch:</strong> Thermal Insulated Box with 100% Live Arrival Guarantee</p>
              </div>
              <a class="btn-pill" href="/shop">Continue Shopping &rarr;</a>
            </div>
          `;
        } catch (err) {
          alert('Error placing order: ' + err.message);
          submitBtn.disabled = false;
          submitBtn.textContent = `Confirm & Place Order (₹ ${grandTotal.toLocaleString('en-IN')})`;
        }
      };
    }
  }

  // 5. Bootstrap
  updateHeaderCartBadge();
  if (window.location.pathname === '/cart') {
    renderCartPage();
  }
})();
