// lib/cashfree.js - Cashfree Payment Gateway Integration for Paira Plants
'use strict';

const https = require('https');
const crypto = require('crypto');

/**
 * Get Cashfree API configuration based on settings or environment variables
 */
function getConfig(settings = {}) {
  const s = settings || {};
  const appId = s.cashfree_app_id || process.env.CASHFREE_APP_ID || '';
  const secretKey = s.cashfree_secret_key || process.env.CASHFREE_SECRET_KEY || '';
  const mode = s.cashfree_mode || process.env.CASHFREE_MODE || 'sandbox'; // 'sandbox' or 'production'
  const enabled = s.cashfree_enabled !== false && (s.cashfree_enabled === true || Boolean(appId));

  const host = mode === 'production' 
    ? 'api.cashfree.com' 
    : 'sandbox.cashfree.com';

  return {
    appId,
    secretKey,
    mode,
    enabled,
    host,
    apiVersion: '2023-08-01'
  };
}

/**
 * Low-level HTTPS request helper for Cashfree PG APIs
 */
function cashfreeRequest(method, endpoint, payload, config) {
  return new Promise((resolve, reject) => {
    const postData = payload ? JSON.stringify(payload) : '';

    const options = {
      hostname: config.host,
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': config.appId,
        'x-client-secret': config.secretKey,
        'x-api-version': config.apiVersion
      }
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, status: res.statusCode, data: parsed });
          } else {
            resolve({
              success: false,
              status: res.statusCode,
              error: parsed.message || parsed.code || 'Cashfree API Error',
              data: parsed
            });
          }
        } catch (e) {
          resolve({
            success: false,
            status: res.statusCode,
            error: 'Invalid JSON response from Cashfree: ' + body,
            raw: body
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Cashfree API request timeout'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * 1. Create a Payment Order on Cashfree
 */
async function createOrder({ orderId, orderAmount, customer, returnUrl, notifyUrl, settings }) {
  const config = getConfig(settings);

  // If credentials are not configured yet, provide simulated session for testing
  if (!config.appId || !config.secretKey) {
    console.warn('[Cashfree] Warning: App ID / Secret Key not set. Running in demo mode.');
    return {
      success: true,
      demoMode: true,
      mode: config.mode,
      orderId: orderId,
      paymentSessionId: 'demo_session_' + orderId + '_' + Date.now(),
      orderStatus: 'ACTIVE'
    };
  }

  const payload = {
    order_id: String(orderId),
    order_amount: Number(Number(orderAmount).toFixed(2)),
    order_currency: 'INR',
    customer_details: {
      customer_id: String(customer.id || 'CUST_' + (customer.phone || 'GUEST').replace(/\D/g, '')),
      customer_name: String(customer.name || 'Valued Customer').substring(0, 80),
      customer_phone: String(customer.phone || '9999999999').replace(/\D/g, '').slice(-10),
      customer_email: String(customer.email || 'customer@pairaplants.com')
    },
    order_meta: {
      return_url: returnUrl || `https://pairaplants.com/payment/status?order_id={order_id}`
    }
  };

  if (notifyUrl) {
    payload.order_meta.notify_url = notifyUrl;
  }

  try {
    const res = await cashfreeRequest('POST', '/pg/orders', payload, config);
    if (res.success && res.data && res.data.payment_session_id) {
      return {
        success: true,
        mode: config.mode,
        orderId: res.data.order_id,
        paymentSessionId: res.data.payment_session_id,
        cfOrderId: res.data.cf_order_id,
        orderStatus: res.data.order_status
      };
    } else {
      return {
        success: false,
        error: res.error || (res.data && res.data.message) || 'Failed to create payment session',
        details: res.data
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * 2. Fetch Order Status from Cashfree
 */
async function getOrderStatus(orderId, settings) {
  const config = getConfig(settings);

  // Demo mode check
  if (!config.appId || !config.secretKey) {
    return {
      success: true,
      demoMode: true,
      orderStatus: 'PAID',
      orderAmount: 0
    };
  }

  try {
    const res = await cashfreeRequest('GET', `/pg/orders/${encodeURIComponent(orderId)}`, null, config);
    if (res.success && res.data) {
      return {
        success: true,
        orderId: res.data.order_id,
        cfOrderId: res.data.cf_order_id,
        orderStatus: res.data.order_status, // 'PAID', 'ACTIVE', 'EXPIRED', 'TERMINATED'
        orderAmount: res.data.order_amount,
        orderCurrency: res.data.order_currency,
        data: res.data
      };
    } else {
      return {
        success: false,
        error: res.error || 'Failed to retrieve order status from Cashfree',
        data: res.data
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * 3. Fetch Payments attempts for an Order
 */
async function getOrderPayments(orderId, settings) {
  const config = getConfig(settings);
  if (!config.appId || !config.secretKey) {
    return { success: true, demoMode: true, payments: [] };
  }

  try {
    const res = await cashfreeRequest('GET', `/pg/orders/${encodeURIComponent(orderId)}/payments`, null, config);
    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 4. Verify Cashfree Webhook Signature
 */
function verifyWebhookSignature({ rawBody, timestamp, signature, secretKey }) {
  if (!signature || !timestamp || !secretKey) return false;
  try {
    const signedData = timestamp + rawBody;
    const expectedSig = crypto
      .createHmac('sha256', secretKey)
      .update(signedData)
      .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch (e) {
    return false;
  }
}

module.exports = {
  getConfig,
  createOrder,
  getOrderStatus,
  getOrderPayments,
  verifyWebhookSignature
};
