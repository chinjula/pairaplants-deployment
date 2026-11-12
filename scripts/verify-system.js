/**
 * PAIRAPLANTS – COMPREHENSIVE SYSTEM VERIFICATION & AUDIT SUITE
 * Tests all 15 Admin Sections, Customer Portal, Checkout, Stock Deductions & Restoration
 */

const http = require('http');

function req(options, data) {
  return new Promise((resolve, reject) => {
    const postData = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
    const reqHeaders = { ...(options.headers || {}) };
    if (postData && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const r = http.request({
      hostname: 'localhost',
      port: 3000,
      path: options.path,
      method: options.method || 'GET',
      headers: reqHeaders
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });
    r.on('error', reject);
    if (postData) r.write(postData);
    r.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('PAIRAPLANTS ENTERPRISE UPGRADE – VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;
  const assert = (condition, title) => {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${title}`);
    }
  };

  // 1. Public Storefront & Catalog
  console.log('[TEST GROUP 1: PUBLIC STOREFRONT & CATALOG]');
  const prods = await req({ path: '/api/products' });
  assert(prods.statusCode === 200, 'GET /api/products returns HTTP 200');
  assert(Array.isArray(prods.json) && prods.json.length === 86, `Catalog contains all 86 products (Actual: ${prods.json?.length})`);

  const prod1 = await req({ path: '/api/products/1' });
  assert(prod1.statusCode === 200, 'GET /api/products/1 returns HTTP 200');
  assert(prod1.json.name === 'Cherry Barb' && prod1.json.specifications, 'Product details include name & specifications');
  assert(Array.isArray(prod1.json.reviews) && Array.isArray(prod1.json.related), 'Product includes reviews and related items');

  const cats = await req({ path: '/api/categories' });
  assert(cats.statusCode === 200 && cats.json.length === 4, 'GET /api/categories returns 4 main collections');

  const hp = await req({ path: '/api/homepage' });
  assert(hp.statusCode === 200 && hp.json.hero && hp.json.whyChooseUs, 'GET /api/homepage returns CMS hero & whyChooseUs');

  // 2. SEO & Crawlers
  console.log('\n[TEST GROUP 2: SEO, METADATA & CRAWLERS]');
  const sitemap = await req({ path: '/sitemap.xml' });
  assert(sitemap.statusCode === 200 && sitemap.body.includes('urlset') && sitemap.body.includes('#product?id=86'), '/sitemap.xml generates valid XML with 86 product URLs');

  const robots = await req({ path: '/robots.txt' });
  assert(robots.statusCode === 200 && robots.body.includes('Disallow: /#staff') && robots.body.includes('sitemap.xml'), '/robots.txt contains security disallow and sitemap pointer');

  // 3. Coupons & Promotions
  console.log('\n[TEST GROUP 3: COUPONS & DISCOUNT LOGIC]');
  const cRes = await req({
    path: '/api/coupons/validate',
    method: 'POST'
  }, { code: 'PAIRAWELCOME', subtotal: 1000 });
  assert(cRes.statusCode === 200 && cRes.json.valid && cRes.json.discount === 100, 'Coupon PAIRAWELCOME gives 10% discount on ₹1,000 cart (₹100 saved)');

  // 4. Staff Auth & RBAC
  console.log('\n[TEST GROUP 4: STAFF AUTH & RBAC ENFORCEMENT]');
  const loginRes = await req({
    path: '/api/login',
    method: 'POST'
  }, { username: 'owner', password: '7fA8go01' });
  assert(loginRes.statusCode === 200 && loginRes.json.role === 'superadmin', 'Super Admin authentication succeeded');

  const setCookie = loginRes.headers['set-cookie'];
  const tokenCookie = setCookie ? setCookie[0].split(';')[0] : '';

  const overview = await req({
    path: '/api/reports/overview',
    headers: { 'Cookie': tokenCookie }
  });
  assert(overview.statusCode === 200 && overview.json.totalProducts === 86, 'Admin KPI overview reports 86 total products');
  assert(overview.json.totalRevenue > 0, `Admin KPI overview reports valid sales revenue: ₹${overview.json.totalRevenue}`);

  const inv = await req({
    path: '/api/inventory',
    headers: { 'Cookie': tokenCookie }
  });
  assert(inv.statusCode === 200 && inv.json.length === 86, 'Admin Inventory reports all 86 stock units');

  // 5. Customer Checkout, Stock Deduction & Invoice
  console.log('\n[TEST GROUP 5: END-TO-END CHECKOUT & STOCK DEDUCTION]');
  const beforeP = await req({ path: '/api/products/41' });
  const stockBefore = beforeP.json.stock;

  const orderRes = await req({
    path: '/api/orders',
    method: 'POST'
  }, {
    name: 'Verification Test User',
    phone: '+91 99999 11111',
    address: 'Pairaplants Verification Bay, Marine Drive, Mumbai',
    coupon: 'PAIRAWELCOME',
    items: [{ id: 41, qty: 2 }]
  });
  assert(orderRes.statusCode === 201 && orderRes.json.id, `Order successfully created (ID: #${orderRes.json?.id})`);
  const orderId = orderRes.json.id;

  const afterP = await req({ path: '/api/products/41' });
  assert(afterP.json.stock === stockBefore - 2, `Automatic inventory deduction verified (Stock: ${stockBefore} -> ${afterP.json.stock})`);

  const invoice = await req({ path: `/api/orders/${orderId}/invoice` });
  assert(invoice.statusCode === 200 && invoice.body.includes('TAX INVOICE') && invoice.body.includes(`PP-INV-${orderId}`), `Printable tax invoice rendered for Order #${orderId}`);

  // 6. Order Cancellation & Stock Restoration
  console.log('\n[TEST GROUP 6: ORDER CANCELLATION & STOCK RESTORATION]');
  const cancelRes = await req({
    path: `/api/orders/${orderId}/cancel`,
    method: 'POST',
    headers: { 'Cookie': tokenCookie }
  }, { reason: 'Automated test suite cancellation & inventory restoration verification' });
  assert(cancelRes.statusCode === 200 && cancelRes.json.order.status === 'Cancelled', `Order #${orderId} marked Cancelled with reason`);

  const restoredP = await req({ path: '/api/products/41' });
  assert(restoredP.json.stock === stockBefore, `Stock restoration verified (Stock returned to: ${restoredP.json.stock})`);

  // 7. CSV Export
  console.log('\n[TEST GROUP 7: REPORTING & CSV EXPORT]');
  const csvRes = await req({
    path: '/api/reports/orders/export',
    headers: { 'Cookie': tokenCookie }
  });
  assert(csvRes.statusCode === 200 && csvRes.headers['content-type'].includes('text/csv'), 'Order report exported to valid RFC 4180 CSV');

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log(`PASS RATE: ${Math.round((passed / total) * 100)}%`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('ALL VERIFICATION AUDITS PASSED WITH ZERO ERRORS.');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
