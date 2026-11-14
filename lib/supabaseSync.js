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
      db.products = prods.map(p => {
        const existing = (db.products || []).find(x => x.id === p.id) || {};
        const priceNum = Number(p.price);
        const stockNum = Number(p.stock);
        const threshold = p.low_stock_threshold ? Number(p.low_stock_threshold) : (existing.lowStockThreshold || 8);
        let status = 'in_stock';
        if (stockNum <= 0) status = 'out_of_stock';
        else if (stockNum <= threshold) status = 'low_stock';

        return {
          id: p.id,
          name: p.name,
          scientificName: p.scientific_name || existing.scientificName || '',
          category: p.category_name || (db.categories.find(c => c.id === p.category_id)?.name) || 'Aquatic Plants & Mosses',
          subcategory: p.subcategory || existing.subcategory || '',
          price: priceNum,
          salePrice: p.sale_price ? Number(p.sale_price) : null,
          purchasePrice: p.purchase_price ? Number(p.purchase_price) : (existing.purchasePrice || Math.round(priceNum * 0.55)),
          stock: stockNum,
          openingStock: p.opening_stock ? Number(p.opening_stock) : (existing.openingStock !== undefined ? existing.openingStock : stockNum),
          lowStockThreshold: threshold,
          productStatus: status,
          description: p.description || '',
          sku: p.sku || existing.sku || ('PP-' + p.id),
          difficulty: p.difficulty || existing.difficulty || '',
          lighting: p.lighting || existing.lighting || '',
          growthRate: p.growth_rate || existing.growthRate || '',
          temperatureRange: p.temperature_range || existing.temperatureRange || '',
          tankCompatibility: p.tank_compatibility || existing.tankCompatibility || '',
          batchNumber: p.batch_number || existing.batchNumber || '',
          image: p.image,
          images: Array.isArray(p.images) ? p.images : (typeof p.images === 'string' ? JSON.parse(p.images) : [p.image]),
          rating: Number(p.rating) || 5,
          reviewCount: Number(p.review_count) || 0,
          isFeatured: !!p.is_featured,
          isVisible: p.is_visible !== false,
          labels: p.labels || existing.labels || [],
          specifications: p.specifications || existing.specifications || {}
        };
      });
      console.log(`✓ Synchronized ${db.products.length} products from Supabase cloud database`);
    }

    const { data: cats, error: cErr } = await supabase.from('categories').select('*');
    if (!cErr && cats && cats.length > 0) {
      db.categories = cats;
    }

    const { data: staff, error: sErr } = await supabase.from('staff_users').select('*');
    if (!sErr && staff && staff.length > 0) {
      db.users = staff.map(s => ({
        id: s.id,
        username: s.username,
        name: s.name,
        role: s.role,
        hash: s.password_hash,
        active: s.active !== false
      }));
    }

    const { data: hs, error: hErr } = await supabase.from('homepage_settings').select('*').eq('id', 1).single();
    if (!hErr && hs && hs.why_choose_us && typeof hs.why_choose_us === 'object') {
      db.settings = { ...(db.settings || {}), ...hs.why_choose_us };
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
 * Syncs product edits or new products to Supabase
 */
async function syncProductToSupabase(product) {
  if (!supabase) return;
  try {
    await supabase.from('products').upsert({
      id: product.id,
      name: product.name,
      category: product.category,
      subcategory: product.subcategory || '',
      price: product.price,
      sale_price: product.salePrice,
      stock: product.stock,
      low_stock_threshold: product.lowStockThreshold || 5,
      sku: product.sku || ('PP-' + product.id),
      description: product.description || '',
      is_featured: product.isFeatured,
      is_visible: product.isVisible !== false,
      image: product.image,
      images: product.images || [product.image],
      specifications: product.specifications || {},
      labels: product.labels || []
    }, { onConflict: 'id' });
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

/**
 * Syncs store & website settings to Supabase
 */
async function syncSettingsToSupabase(settings) {
  if (!supabase) return;
  try {
    await supabase.from('homepage_settings').upsert({
      id: 1,
      hero_title: 'Pairaplants Botanical Studio',
      hero_subtitle: 'Aquatic plants, fishes & aquascaping essentials',
      hero_cta_text: 'Shop Now',
      hero_cta_link: '#shop',
      hero_image: '/images/hero-aquarium.jpg',
      why_choose_us: settings
    }, { onConflict: 'id' });
  } catch (err) {
    console.error('Supabase settings sync error:', err.message);
  }
}

module.exports = {
  supabase,
  loadFromSupabase,
  syncOrderToSupabase,
  syncStockToSupabase,
  syncProductToSupabase,
  syncSettingsToSupabase,
  syncInquiryToSupabase
};

