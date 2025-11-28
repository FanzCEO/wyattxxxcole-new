import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import { sendOrderConfirmation, sendNewsletterWelcome } from '../utils/email.js';

const router = express.Router();

// GET /api/shop/products - Get all products
router.get('/products', async (req, res) => {
  try {
    const { category } = req.query;

    let query = 'SELECT * FROM products WHERE is_active = 1';
    const params = [];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY created_at DESC';

    const products = await db.all(query, params);

    res.json({
      products: products.map(p => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        price: p.price,
        category: p.category,
        imageUrl: p.image_url,
        inStock: p.inventory_count > 0,
        isDigital: Boolean(p.is_digital)
      }))
    });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/shop/products/:slug - Get single product
router.get('/products/:slug', async (req, res) => {
  try {
    const product = await db.get('SELECT * FROM products WHERE slug = ? AND is_active = 1', [req.params.slug]);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      price: product.price,
      category: product.category,
      imageUrl: product.image_url,
      inStock: product.inventory_count > 0,
      inventoryCount: product.inventory_count,
      isDigital: Boolean(product.is_digital)
    });
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// GET /api/shop/categories - Get product categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await db.all(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM products
      WHERE is_active = 1
      GROUP BY category
    `);

    res.json({ categories });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/shop/orders - Create new order
router.post('/orders', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.productId').notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('shippingAddress').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, name, items, shippingAddress } = req.body;

    // Validate and calculate order
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await db.get('SELECT * FROM products WHERE id = ? AND is_active = 1', [item.productId]);

      if (!product) {
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }

      if (!product.is_digital && product.inventory_count < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.title}` });
      }

      subtotal += product.price * item.quantity;
      orderItems.push({
        productId: product.id,
        title: product.title,
        price: product.price,
        quantity: item.quantity,
        isDigital: Boolean(product.is_digital)
      });
    }

    // Calculate shipping (free for digital-only orders)
    const hasPhysical = orderItems.some(i => !i.isDigital);
    const shipping = hasPhysical ? 5.99 : 0;
    const total = subtotal + shipping;

    // Generate order number
    const orderNumber = 'WXC-' + uuidv4().substring(0, 8).toUpperCase();

    // Create order
    const result = await db.run(`
      INSERT INTO orders (order_number, customer_email, customer_name, shipping_address, items, subtotal, shipping, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      orderNumber,
      email,
      name,
      hasPhysical ? shippingAddress : null,
      JSON.stringify(orderItems),
      subtotal,
      shipping,
      total
    ]);

    // Update inventory for physical products
    for (const item of orderItems) {
      if (!item.isDigital) {
        await db.run('UPDATE products SET inventory_count = inventory_count - ? WHERE id = ?', [item.quantity, item.productId]);
      }
    }

    // Send confirmation email
    await sendOrderConfirmation({
      order_number: orderNumber,
      customer_email: email,
      items: JSON.stringify(orderItems),
      subtotal,
      shipping,
      total
    });

    res.status(201).json({
      message: 'Order created successfully',
      orderNumber,
      total,
      orderId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/shop/orders/:orderNumber - Get order status
router.get('/orders/:orderNumber', async (req, res) => {
  try {
    const order = await db.get('SELECT * FROM orders WHERE order_number = ?', [req.params.orderNumber]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      orderNumber: order.order_number,
      status: order.status,
      items: JSON.parse(order.items),
      subtotal: order.subtotal,
      shipping: order.shipping,
      total: order.total,
      createdAt: order.created_at
    });
  } catch (error) {
    console.error('Order fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /api/shop/newsletter - Subscribe to newsletter
router.post('/newsletter', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, source = 'shop' } = req.body;

    // Check if already subscribed
    const existing = await db.get('SELECT * FROM newsletter_subscribers WHERE email = ?', [email]);

    if (existing) {
      if (existing.is_active) {
        return res.json({ message: 'Already subscribed!' });
      }
      // Reactivate subscription
      await db.run('UPDATE newsletter_subscribers SET is_active = 1, unsubscribed_at = NULL WHERE email = ?', [email]);
    } else {
      await db.run('INSERT INTO newsletter_subscribers (email, source) VALUES (?, ?)', [email, source]);
    }

    // Send welcome email
    await sendNewsletterWelcome(email);

    res.status(201).json({ message: 'Successfully subscribed to newsletter!' });
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// POST /api/shop/newsletter/unsubscribe - Unsubscribe from newsletter
router.post('/newsletter/unsubscribe', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const { email } = req.body;

    const result = await db.run(`
      UPDATE newsletter_subscribers
      SET is_active = 0, unsubscribed_at = CURRENT_TIMESTAMP
      WHERE email = ?
    `, [email]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Email not found in subscriber list' });
    }

    res.json({ message: 'Successfully unsubscribed' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

export default router;
