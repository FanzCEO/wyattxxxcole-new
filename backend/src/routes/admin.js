import express from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import db from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const uploadDir = join(__dirname, '../../uploads/backgrounds');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    const type = req.body.type || 'background';
    cb(null, `${type}-${Date.now()}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// All admin routes require authentication
router.use(authenticateToken);

// ============================================
// DASHBOARD / STATS
// ============================================

// GET /api/admin/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [
      bookingsTotal,
      bookingsPending,
      bookingsThisMonth,
      collabsTotal,
      collabsPending,
      ordersTotal,
      ordersPending,
      ordersRevenue,
      subscribersTotal,
      postsTotal,
      pendingComments
    ] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM bookings'),
      db.get('SELECT COUNT(*) as count FROM bookings WHERE status = ?', ['pending']),
      db.get('SELECT COUNT(*) as count FROM bookings WHERE created_at >= DATE_FORMAT(NOW(), "%Y-%m-01")'),
      db.get('SELECT COUNT(*) as count FROM creator_collabs'),
      db.get('SELECT COUNT(*) as count FROM creator_collabs WHERE status = ?', ['pending']),
      db.get('SELECT COUNT(*) as count FROM orders'),
      db.get('SELECT COUNT(*) as count FROM orders WHERE status = ?', ['pending']),
      db.get('SELECT COALESCE(SUM(total), 0) as sum FROM orders WHERE status != ?', ['cancelled']),
      db.get('SELECT COUNT(*) as count FROM newsletter_subscribers WHERE is_active = 1'),
      db.get('SELECT COUNT(*) as count FROM community_posts WHERE is_active = 1'),
      db.get('SELECT COUNT(*) as count FROM post_comments WHERE is_approved = 0')
    ]);

    const stats = {
      bookings: {
        total: bookingsTotal.count,
        pending: bookingsPending.count,
        thisMonth: bookingsThisMonth.count
      },
      creatorCollabs: {
        total: collabsTotal.count,
        pending: collabsPending.count
      },
      orders: {
        total: ordersTotal.count,
        pending: ordersPending.count,
        revenue: ordersRevenue.sum
      },
      subscribers: {
        total: subscribersTotal.count
      },
      community: {
        posts: postsTotal.count,
        pendingComments: pendingComments.count
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// BOOKINGS MANAGEMENT
// ============================================

// GET /api/admin/bookings - Get all bookings
router.get('/bookings', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = 'SELECT * FROM bookings';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const bookings = await db.all(query, params);

    const countQuery = status ? 'SELECT COUNT(*) as count FROM bookings WHERE status = ?' : 'SELECT COUNT(*) as count FROM bookings';
    const totalResult = await db.get(countQuery, status ? [status] : []);

    res.json({ bookings, total: totalResult.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Bookings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// PATCH /api/admin/bookings/:id - Update booking status
router.patch('/bookings/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'reviewed', 'responded', 'booked', 'declined'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await db.run('UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);

    res.json({ message: 'Booking updated' });
  } catch (error) {
    console.error('Booking update error:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// DELETE /api/admin/bookings/:id - Delete booking
router.delete('/bookings/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM bookings WHERE id = ?', [req.params.id]);
    res.json({ message: 'Booking deleted' });
  } catch (error) {
    console.error('Booking delete error:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// ============================================
// CREATOR COLLABS MANAGEMENT
// ============================================

// GET /api/admin/collabs - Get all creator collabs
router.get('/collabs', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = 'SELECT * FROM creator_collabs';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const collabs = await db.all(query, params);

    const countQuery = status ? 'SELECT COUNT(*) as count FROM creator_collabs WHERE status = ?' : 'SELECT COUNT(*) as count FROM creator_collabs';
    const totalResult = await db.get(countQuery, status ? [status] : []);

    res.json({ collabs, total: totalResult.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Collabs fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch collabs' });
  }
});

// PATCH /api/admin/collabs/:id - Update collab status
router.patch('/collabs/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await db.run('UPDATE creator_collabs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Collab updated' });
  } catch (error) {
    console.error('Collab update error:', error);
    res.status(500).json({ error: 'Failed to update collab' });
  }
});

// ============================================
// PRODUCTS MANAGEMENT
// ============================================

// GET /api/admin/products - Get all products (including inactive)
router.get('/products', async (req, res) => {
  try {
    const products = await db.all('SELECT * FROM products ORDER BY created_at DESC');
    res.json({ products });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// POST /api/admin/products - Create product
router.post('/products', [
  body('title').trim().notEmpty(),
  body('slug').trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
  body('category').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { slug, title, description, price, category, imageUrl, inventoryCount, isDigital, digitalFileUrl } = req.body;

    const result = await db.run(`
      INSERT INTO products (slug, title, description, price, category, image_url, inventory_count, is_digital, digital_file_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [slug, title, description || null, price, category, imageUrl || null, inventoryCount || 0, isDigital ? 1 : 0, digitalFileUrl || null]);

    res.status(201).json({ message: 'Product created', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Product create error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PATCH /api/admin/products/:id - Update product
router.patch('/products/:id', async (req, res) => {
  try {
    const { title, description, price, category, imageUrl, inventoryCount, isDigital, isActive } = req.body;

    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (imageUrl !== undefined) { updates.push('image_url = ?'); params.push(imageUrl); }
    if (inventoryCount !== undefined) { updates.push('inventory_count = ?'); params.push(inventoryCount); }
    if (isDigital !== undefined) { updates.push('is_digital = ?'); params.push(isDigital ? 1 : 0); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    await db.run(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: 'Product updated' });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/admin/products/:id - Delete product
router.delete('/products/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    console.error('Product delete error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ============================================
// ORDERS MANAGEMENT
// ============================================

// GET /api/admin/orders - Get all orders
router.get('/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = 'SELECT * FROM orders';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const orders = await db.all(query, params);

    // Parse items JSON
    orders.forEach(order => {
      order.items = JSON.parse(order.items);
    });

    const countQuery = status ? 'SELECT COUNT(*) as count FROM orders WHERE status = ?' : 'SELECT COUNT(*) as count FROM orders';
    const totalResult = await db.get(countQuery, status ? [status] : []);

    res.json({ orders, total: totalResult.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// PATCH /api/admin/orders/:id - Update order status
router.patch('/orders/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);

    res.json({ message: 'Order updated' });
  } catch (error) {
    console.error('Order update error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ============================================
// SCHEDULE MANAGEMENT
// ============================================

// POST /api/admin/schedule/availability - Set availability for a date
router.post('/schedule/availability', [
  body('date').isISO8601(),
  body('status').isIn(['available', 'booked', 'off'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { date, status, notes } = req.body;

    await db.run(`
      INSERT INTO schedule_availability (date, status, notes)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE status = ?, notes = ?
    `, [date, status, notes || null, status, notes || null]);

    res.json({ message: 'Availability updated' });
  } catch (error) {
    console.error('Availability update error:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// POST /api/admin/schedule/locations - Add/update location
router.post('/schedule/locations', [
  body('city').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { city, startDate, endDate, tags, isHomeBase, sortOrder } = req.body;

    const result = await db.run(`
      INSERT INTO schedule_locations (city, start_date, end_date, tags, is_home_base, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [city, startDate || null, endDate || null, tags || null, isHomeBase ? 1 : 0, sortOrder || 0]);

    res.status(201).json({ message: 'Location added', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Location add error:', error);
    res.status(500).json({ error: 'Failed to add location' });
  }
});

// DELETE /api/admin/schedule/locations/:id - Remove location
router.delete('/schedule/locations/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM schedule_locations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Location deleted' });
  } catch (error) {
    console.error('Location delete error:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// ============================================
// COMMUNITY MANAGEMENT
// ============================================

// POST /api/admin/community/posts - Create new post
router.post('/community/posts', [
  body('content').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, mediaUrl, mediaType, tags, isPinned } = req.body;

    const result = await db.run(`
      INSERT INTO community_posts (content, media_url, media_type, tags, is_pinned)
      VALUES (?, ?, ?, ?, ?)
    `, [content, mediaUrl || null, mediaType || null, tags || null, isPinned ? 1 : 0]);

    res.status(201).json({ message: 'Post created', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Post create error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// PATCH /api/admin/community/posts/:id - Update post
router.patch('/community/posts/:id', async (req, res) => {
  try {
    const { content, mediaUrl, tags, isPinned, isActive } = req.body;

    const updates = [];
    const params = [];

    if (content !== undefined) { updates.push('content = ?'); params.push(content); }
    if (mediaUrl !== undefined) { updates.push('media_url = ?'); params.push(mediaUrl); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(tags); }
    if (isPinned !== undefined) { updates.push('is_pinned = ?'); params.push(isPinned ? 1 : 0); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    await db.run(`UPDATE community_posts SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: 'Post updated' });
  } catch (error) {
    console.error('Post update error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE /api/admin/community/posts/:id - Delete post
router.delete('/community/posts/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM community_posts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('Post delete error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// GET /api/admin/community/comments - Get pending comments
router.get('/community/comments', async (req, res) => {
  try {
    const { approved } = req.query;

    let query = 'SELECT c.*, p.content as post_content FROM post_comments c JOIN community_posts p ON c.post_id = p.id';

    if (approved === 'false') {
      query += ' WHERE c.is_approved = 0';
    } else if (approved === 'true') {
      query += ' WHERE c.is_approved = 1';
    }

    query += ' ORDER BY c.created_at DESC LIMIT 100';

    const comments = await db.all(query);

    res.json({ comments });
  } catch (error) {
    console.error('Comments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// PATCH /api/admin/community/comments/:id - Approve/reject comment
router.patch('/community/comments/:id', async (req, res) => {
  try {
    const { isApproved } = req.body;

    await db.run('UPDATE post_comments SET is_approved = ? WHERE id = ?', [isApproved ? 1 : 0, req.params.id]);

    if (isApproved) {
      // Increment comment count on post
      const comment = await db.get('SELECT post_id FROM post_comments WHERE id = ?', [req.params.id]);
      if (comment) {
        await db.run('UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?', [comment.post_id]);
      }
    }

    res.json({ message: 'Comment updated' });
  } catch (error) {
    console.error('Comment update error:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// DELETE /api/admin/community/comments/:id - Delete comment
router.delete('/community/comments/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM post_comments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('Comment delete error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ============================================
// PORTFOLIO MANAGEMENT
// ============================================

// POST /api/admin/portfolio - Add portfolio item
router.post('/portfolio', [
  body('category').trim().notEmpty(),
  body('title').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { category, title, description, imageUrl, videoUrl, thumbnailUrl, tags, sortOrder } = req.body;

    const result = await db.run(`
      INSERT INTO portfolio_items (category, title, description, image_url, video_url, thumbnail_url, tags, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [category, title, description || null, imageUrl || null, videoUrl || null, thumbnailUrl || null, tags || null, sortOrder || 0]);

    res.status(201).json({ message: 'Portfolio item added', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Portfolio add error:', error);
    res.status(500).json({ error: 'Failed to add portfolio item' });
  }
});

// PATCH /api/admin/portfolio/:id - Update portfolio item
router.patch('/portfolio/:id', async (req, res) => {
  try {
    const { category, title, description, imageUrl, videoUrl, tags, sortOrder, isActive } = req.body;

    const updates = [];
    const params = [];

    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (imageUrl !== undefined) { updates.push('image_url = ?'); params.push(imageUrl); }
    if (videoUrl !== undefined) { updates.push('video_url = ?'); params.push(videoUrl); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(tags); }
    if (sortOrder !== undefined) { updates.push('sort_order = ?'); params.push(sortOrder); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(req.params.id);

    await db.run(`UPDATE portfolio_items SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: 'Portfolio item updated' });
  } catch (error) {
    console.error('Portfolio update error:', error);
    res.status(500).json({ error: 'Failed to update portfolio item' });
  }
});

// DELETE /api/admin/portfolio/:id - Delete portfolio item
router.delete('/portfolio/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM portfolio_items WHERE id = ?', [req.params.id]);
    res.json({ message: 'Portfolio item deleted' });
  } catch (error) {
    console.error('Portfolio delete error:', error);
    res.status(500).json({ error: 'Failed to delete portfolio item' });
  }
});

// ============================================
// NEWSLETTER MANAGEMENT
// ============================================

// GET /api/admin/newsletter/subscribers - Get all subscribers
router.get('/newsletter/subscribers', async (req, res) => {
  try {
    const { active } = req.query;

    let query = 'SELECT * FROM newsletter_subscribers';
    if (active === 'true') {
      query += ' WHERE is_active = 1';
    } else if (active === 'false') {
      query += ' WHERE is_active = 0';
    }
    query += ' ORDER BY subscribed_at DESC';

    const subscribers = await db.all(query);

    res.json({ subscribers, total: subscribers.length });
  } catch (error) {
    console.error('Subscribers fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

// DELETE /api/admin/newsletter/subscribers/:id - Remove subscriber
router.delete('/newsletter/subscribers/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM newsletter_subscribers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Subscriber removed' });
  } catch (error) {
    console.error('Subscriber delete error:', error);
    res.status(500).json({ error: 'Failed to remove subscriber' });
  }
});

// ============================================
// SITE SETTINGS MANAGEMENT
// ============================================

// GET /api/admin/settings - Get all site settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await db.all('SELECT * FROM site_settings ORDER BY category, setting_key');
    res.json({ settings });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/admin/settings - Update multiple settings
router.post('/settings', async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }

    for (const [key, value] of Object.entries(settings)) {
      const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
      await db.run(`
        INSERT INTO site_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          setting_value = VALUES(setting_value),
          updated_at = CURRENT_TIMESTAMP
      `, [key, stringValue]);
    }

    res.json({ message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Settings save error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ============================================
// SOCIAL LINKS MANAGEMENT
// ============================================

// GET /api/admin/links - Get all social links
router.get('/links', async (req, res) => {
  try {
    const links = await db.all('SELECT * FROM social_links ORDER BY category, sort_order, platform');
    res.json({ links });
  } catch (error) {
    console.error('Links fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// GET /api/admin/links/:id - Get single link
router.get('/links/:id', async (req, res) => {
  try {
    const link = await db.get('SELECT * FROM social_links WHERE id = ?', [req.params.id]);
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    res.json({ link });
  } catch (error) {
    console.error('Link fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch link' });
  }
});

// POST /api/admin/links - Create new link
router.post('/links', [
  body('platform').trim().notEmpty(),
  body('url').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { platform, url, icon, display_name, sort_order, is_active, category } = req.body;

    const result = await db.run(`
      INSERT INTO social_links (platform, url, icon, display_name, sort_order, is_active, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      platform,
      url,
      icon || null,
      display_name || null,
      sort_order || 0,
      is_active !== false ? 1 : 0,
      category || 'social'
    ]);

    res.status(201).json({ message: 'Link created', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Link create error:', error);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// PATCH /api/admin/links/:id - Update link
router.patch('/links/:id', async (req, res) => {
  try {
    const { platform, url, icon, display_name, sort_order, is_active, category } = req.body;

    const updates = [];
    const params = [];

    if (platform !== undefined) { updates.push('platform = ?'); params.push(platform); }
    if (url !== undefined) { updates.push('url = ?'); params.push(url); }
    if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
    if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(req.params.id);

    await db.run(`UPDATE social_links SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: 'Link updated' });
  } catch (error) {
    console.error('Link update error:', error);
    res.status(500).json({ error: 'Failed to update link' });
  }
});

// DELETE /api/admin/links/:id - Delete link
router.delete('/links/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM social_links WHERE id = ?', [req.params.id]);
    res.json({ message: 'Link deleted' });
  } catch (error) {
    console.error('Link delete error:', error);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// ============================================
// INTEGRATIONS MANAGEMENT
// ============================================

// GET /api/admin/integrations - Get all integrations
router.get('/integrations', async (req, res) => {
  try {
    const integrations = await db.all('SELECT * FROM integrations ORDER BY provider');
    // Mask API keys for security (show only last 4 chars)
    integrations.forEach(i => {
      if (i.api_key) {
        i.api_key = i.api_key.length > 4 ? '•'.repeat(i.api_key.length - 4) + i.api_key.slice(-4) : '••••';
      }
      if (i.api_secret) {
        i.api_secret = i.api_secret.length > 4 ? '•'.repeat(i.api_secret.length - 4) + i.api_secret.slice(-4) : '••••';
      }
    });
    res.json({ integrations });
  } catch (error) {
    console.error('Integrations fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// POST /api/admin/integrations - Update multiple integrations
router.post('/integrations', async (req, res) => {
  try {
    const { integrations } = req.body;

    if (!integrations || !Array.isArray(integrations)) {
      return res.status(400).json({ error: 'Invalid integrations data' });
    }

    for (const int of integrations) {
      await db.run(`
        INSERT INTO integrations (provider, api_key, api_secret, is_enabled, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          api_key = CASE WHEN VALUES(api_key) != '' THEN VALUES(api_key) ELSE api_key END,
          api_secret = CASE WHEN VALUES(api_secret) != '' THEN VALUES(api_secret) ELSE api_secret END,
          is_enabled = VALUES(is_enabled),
          updated_at = CURRENT_TIMESTAMP
      `, [
        int.provider,
        int.api_key || '',
        int.api_secret || '',
        int.is_enabled ? 1 : 0
      ]);
    }

    res.json({ message: 'Integrations saved successfully' });
  } catch (error) {
    console.error('Integrations save error:', error);
    res.status(500).json({ error: 'Failed to save integrations' });
  }
});

// POST /api/admin/integrations/:provider/test - Test an integration
router.post('/integrations/:provider/test', async (req, res) => {
  try {
    const { provider } = req.params;
    const integration = await db.get('SELECT * FROM integrations WHERE provider = ?', [provider]);

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    if (!integration.api_key) {
      return res.status(400).json({ error: 'No API key configured' });
    }

    // For now, just mark as tested
    await db.run(`
      UPDATE integrations
      SET last_tested = CURRENT_TIMESTAMP, test_status = 'pending'
      WHERE provider = ?
    `, [provider]);

    res.json({ success: true, message: 'Test initiated. Full testing requires implementation.' });
  } catch (error) {
    console.error('Integration test error:', error);
    res.status(500).json({ error: 'Failed to test integration' });
  }
});

// ============================================
// FILE UPLOADS
// ============================================

// POST /api/admin/upload/background - Upload background image
router.post('/upload/background', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const url = `/uploads/backgrounds/${req.file.filename}`;

    res.json({
      message: 'Image uploaded successfully',
      url,
      filename: req.file.filename,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;
