'use strict';
const supabase = require('./supabaseClient');

/**
 * Loads products and categories from Supabase into memory if available
 */
async function loadFromSupabase(db) {
  if (!supabase) return;
  try {
    const { data: prods, error: pErr } = await supabase.from('products').select('*').order('id');
    if (!pErr && prods && prods.length > 0) {
      db.products = prods.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category_name || (db.categories.find(c => c.id === p.category_id)?.name) || 'Aquatic Plants & Mosses',
        subcategory: p.subcategory || '',
        price: Number(p.price),
        salePrice: p.sale_price ? Number(p.sale_price) : null,
        stock: Number(p.stock),
        description: p.description || '',
        sku: p.sku || ('PP-' + p.id),
        image: p.image,
        images: Array.isArray(p.images) ? p.images : (typeof p.images === 'string' ? JSON.parse(p.images) : [p.image]),
        rating: Number(p.rating) || 5,
        reviewCount: Number(p.review_count) || 0,
        isFeatured: !!p.is_featured,
        isVisible: p.is_visible !== false,
        labels: p.labels || [],
        specifications: p.specifications || {}
      }));
      console.log(`✓ Synchronized ${db.products.length} products from Supabase cloud database`);
    }

    const { data: cats, error: cErr } = await supabase.from('categories').select('*');
    if (!cErr && cats && cats.length > 0) {
      db.categories = cats;
    }
  } catch (err) {
    console.error('Supabase cloud load notice:', err.message);
  }
}

/**
 * Syncs a new order and its line items to Supabase
 */
async function syncOrderToSupabase(order, items, db) {
  if (!supabase) return;
  try {
    const { data: ord, error: oErr } = await supabase.from('orders').insert({
      order_number: 'ORD-' + order.id,
      customer_name: order.name,
      customer_phone: order.phone,
      shipping_address: order.address,
      status: order.status || 'New',
      payment_method: order.paymentMethod || 'Cash / UPI on Delivery',
      subtotal: order.subtotal,
      discount: order.discount || 0,
      total: order.total,
      created_at: new Date(order.date || Date.now()).toISOString()
    }).select().single();

    if (!oErr && ord) {
      const orderItems = items.map(l => ({
        order_id: ord.id,
        product_id: l.id,
        product_name: l.name,
        price: l.price,
        quantity: l.qty,
        subtotal: l.price * l.qty
      }));
      await supabase.from('order_items').insert(orderItems);

      // Update product stock counts in Supabase
      for (const it of items) {
        const p = db.products.find(x => x.id === it.id);
        if (p) {
          await supabase.from('products').update({ stock: p.stock }).eq('id', p.id);
        }
      }
      console.log(`✓ Order ORD-${order.id} mirrored to Supabase cloud database`);
    }
  } catch (err) {
    console.error('Supabase order sync error:', err.message);
  }
}

/**
 * Syncs stock changes to Supabase
 */
async function syncStockToSupabase(productId, newStock) {
  if (!supabase) return;
  try {
    await supabase.from('products').update({ stock: newStock }).eq('id', productId);
  } catch (err) {
    console.error('Supabase stock sync error:', err.message);
  }
}

/**
 * Syncs product edits to Supabase
 */
async function syncProductToSupabase(product) {
  if (!supabase) return;
  try {
    await supabase.from('products').update({
      name: product.name,
      price: product.price,
      sale_price: product.salePrice,
      stock: product.stock,
      description: product.description,
      is_featured: product.isFeatured,
      is_visible: product.isVisible,
      image: product.image,
      images: product.images,
      specifications: product.specifications,
      labels: product.labels
    }).eq('id', product.id);
  } catch (err) {
    console.error('Supabase product sync error:', err.message);
  }
}

/**
 * Syncs contact inquiries to Supabase
 */
async function syncInquiryToSupabase(inquiry) {
  if (!supabase) return;
  try {
    await supabase.from('inquiries').insert({
      name: inquiry.name,
      email: inquiry.email,
      phone: inquiry.phone,
      subject: inquiry.subject,
      message: inquiry.message,
      status: 'pending',
      created_at: new Date(inquiry.date || Date.now()).toISOString()
    });
  } catch (err) {
    console.error('Supabase inquiry sync error:', err.message);
  }
}

module.exports = {
  supabase,
  loadFromSupabase,
  syncOrderToSupabase,
  syncStockToSupabase,
  syncProductToSupabase,
  syncInquiryToSupabase
};

