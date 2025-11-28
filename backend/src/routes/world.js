import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/database.js';

const router = express.Router();

// JWT Secret for Wyatt World users
const JWT_SECRET = process.env.WORLD_JWT_SECRET || process.env.JWT_SECRET || 'wyatt-world-secret-key-change-in-prod';

// ============================================
// HELPER FUNCTIONS
// ============================================

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }
  return 'Just now';
}

// Middleware to verify Wyatt World user token
const authenticateWorldUser = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.worldUser = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Optional auth - sets user if token exists, but doesn't require it
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.worldUser = decoded;
    } catch (err) {
      // Token invalid, continue without user
    }
  }
  next();
};

// Check membership tier
const requireTier = (minTier) => {
  const tierOrder = ['free', 'vip', 'inner_circle'];
  return (req, res, next) => {
    if (!req.worldUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userTierIndex = tierOrder.indexOf(req.worldUser.membership_tier);
    const requiredTierIndex = tierOrder.indexOf(minTier);
    if (userTierIndex < requiredTierIndex) {
      return res.status(403).json({ error: `${minTier} membership required` });
    }
    next();
  };
};

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/world/auth/register - Register new user
router.post('/auth/register', [
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, display_name } = req.body;

    // Check if username or email exists
    const existingUser = await db.get('SELECT id FROM world_users WHERE username = ? OR email = ?', [username.toLowerCase(), email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already registered' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const result = await db.run(`
      INSERT INTO world_users (username, email, password_hash, display_name, membership_tier)
      VALUES (?, ?, ?, ?, 'free')
    `, [username.toLowerCase(), email, passwordHash, display_name || username]);

    // Generate token
    const token = jwt.sign(
      { id: result.lastInsertRowid, username: username.toLowerCase(), membership_tier: 'free' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Welcome to Wyatt World!',
      token,
      user: {
        id: result.lastInsertRowid,
        username: username.toLowerCase(),
        display_name: display_name || username,
        membership_tier: 'free'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/world/auth/login - Login
router.post('/auth/login', [
  body('login').trim().notEmpty(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { login, password } = req.body;

    // Find user by email or username
    const user = await db.get('SELECT * FROM world_users WHERE username = ? OR email = ?', [login.toLowerCase(), login]);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    // Update last seen
    await db.run('UPDATE world_users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username, membership_tier: user.membership_tier },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Welcome back!',
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        membership_tier: user.membership_tier,
        is_verified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/world/auth/me - Get current user
router.get('/auth/me', authenticateWorldUser, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM world_users WHERE id = ?', [req.worldUser.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      membership_tier: user.membership_tier,
      is_verified: user.is_verified,
      created_at: user.created_at
    });
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ============================================
// FEED / POSTS ROUTES
// ============================================

// GET /api/world/posts - Get feed posts
router.get('/posts', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const tab = req.query.tab || 'all'; // all, following, wyatt

    let whereClause = 'WHERE p.is_active = 1';
    const params = [];

    // Filter by visibility based on user's membership
    const userTier = req.worldUser?.membership_tier || 'free';
    if (userTier === 'free') {
      whereClause += " AND (p.visibility = 'public' OR p.visibility = 'free')";
    } else if (userTier === 'vip') {
      whereClause += " AND p.visibility != 'inner_circle'";
    }

    if (tab === 'wyatt') {
      whereClause += ' AND p.is_wyatt_post = 1';
    } else if (tab === 'following' && req.worldUser) {
      whereClause += ' AND (p.author_id IN (SELECT following_id FROM world_follows WHERE follower_id = ?) OR p.is_wyatt_post = 1)';
      params.push(req.worldUser.id);
    }

    const totalResult = await db.get(`SELECT COUNT(*) as count FROM world_posts p ${whereClause}`, params);
    const total = totalResult.count;

    const posts = await db.all(`
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.is_verified
      FROM world_posts p
      LEFT JOIN world_users u ON p.author_id = u.id
      ${whereClause}
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    // Get user's likes if authenticated
    let userLikes = new Set();
    if (req.worldUser) {
      const likes = await db.all('SELECT post_id FROM world_post_likes WHERE user_id = ?', [req.worldUser.id]);
      userLikes = new Set(likes.map(l => l.post_id));
    }

    const formattedPosts = posts.map(post => ({
      id: post.id,
      author: post.is_wyatt_post ? {
        username: 'WyattXXXCole',
        display_name: 'Wyatt XXX Cole',
        avatar_url: null,
        is_verified: true,
        is_wyatt: true
      } : {
        id: post.author_id,
        username: post.username,
        display_name: post.display_name,
        avatar_url: post.avatar_url,
        is_verified: Boolean(post.is_verified)
      },
      content: post.content,
      media_urls: post.media_urls ? JSON.parse(post.media_urls) : [],
      visibility: post.visibility,
      is_pinned: Boolean(post.is_pinned),
      likes_count: post.likes_count,
      comments_count: post.comments_count,
      reposts_count: post.reposts_count,
      ppv_price: post.ppv_price,
      is_liked: userLikes.has(post.id),
      timestamp: getTimeAgo(new Date(post.created_at)),
      created_at: post.created_at
    }));

    res.json({
      posts: formattedPosts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + posts.length < total
      }
    });
  } catch (error) {
    console.error('Posts fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// POST /api/world/posts - Create new post
router.post('/posts', authenticateWorldUser, [
  body('content').trim().isLength({ min: 1, max: 5000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, media_urls, visibility = 'public', ppv_price } = req.body;

    const result = await db.run(`
      INSERT INTO world_posts (author_id, content, media_urls, visibility, ppv_price, is_wyatt_post)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [
      req.worldUser.id,
      content,
      media_urls ? JSON.stringify(media_urls) : null,
      visibility,
      ppv_price || null
    ]);

    res.status(201).json({
      message: 'Post created',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Post create error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// POST /api/world/posts/:id/like - Like/unlike a post
router.post('/posts/:id/like', authenticateWorldUser, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.worldUser.id;

    const existing = await db.get('SELECT * FROM world_post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);

    if (existing) {
      // Unlike
      await db.run('DELETE FROM world_post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
      await db.run('UPDATE world_posts SET likes_count = likes_count - 1 WHERE id = ?', [postId]);
      const post = await db.get('SELECT likes_count FROM world_posts WHERE id = ?', [postId]);
      return res.json({ liked: false, likes_count: post.likes_count });
    }

    // Like
    await db.run('INSERT INTO world_post_likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
    await db.run('UPDATE world_posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);
    const post = await db.get('SELECT likes_count FROM world_posts WHERE id = ?', [postId]);

    res.json({ liked: true, likes_count: post.likes_count });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// GET /api/world/posts/:id/comments - Get post comments
router.get('/posts/:id/comments', optionalAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const comments = await db.all(`
      SELECT c.*, u.username, u.display_name, u.avatar_url, u.is_verified
      FROM world_post_comments c
      JOIN world_users u ON c.user_id = u.id
      WHERE c.post_id = ? AND c.is_approved = 1
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, [postId, limit, offset]);

    const totalResult = await db.get('SELECT COUNT(*) as count FROM world_post_comments WHERE post_id = ? AND is_approved = 1', [postId]);

    res.json({
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        author: {
          id: c.user_id,
          username: c.username,
          display_name: c.display_name,
          avatar_url: c.avatar_url,
          is_verified: Boolean(c.is_verified)
        },
        likes_count: c.likes_count,
        timestamp: getTimeAgo(new Date(c.created_at))
      })),
      pagination: { page, limit, total: totalResult.count, hasMore: offset + comments.length < totalResult.count }
    });
  } catch (error) {
    console.error('Comments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/world/posts/:id/comment - Add comment
router.post('/posts/:id/comment', authenticateWorldUser, [
  body('content').trim().isLength({ min: 1, max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const postId = parseInt(req.params.id);
    const { content } = req.body;

    const result = await db.run(`
      INSERT INTO world_post_comments (post_id, user_id, content)
      VALUES (?, ?, ?)
    `, [postId, req.worldUser.id, content]);

    // Update comment count
    await db.run('UPDATE world_posts SET comments_count = comments_count + 1 WHERE id = ?', [postId]);

    res.status(201).json({
      message: 'Comment added',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// ============================================
// MESSAGING ROUTES
// ============================================

// GET /api/world/conversations - Get user's conversations
router.get('/conversations', authenticateWorldUser, async (req, res) => {
  try {
    const conversations = await db.all(`
      SELECT c.*,
             (SELECT content FROM world_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
             (SELECT created_at FROM world_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
             (SELECT COUNT(*) FROM world_messages WHERE conversation_id = c.id AND is_read = 0 AND sender_id != ?) as unread_count
      FROM world_conversations c
      JOIN world_conversation_participants cp ON c.id = cp.conversation_id
      WHERE cp.user_id = ?
      ORDER BY last_message_at DESC
    `, [req.worldUser.id, req.worldUser.id]);

    // Get participants for each conversation
    const result = await Promise.all(conversations.map(async conv => {
      const participants = await db.all(`
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified
        FROM world_conversation_participants cp
        JOIN world_users u ON cp.user_id = u.id
        WHERE cp.conversation_id = ? AND cp.user_id != ?
      `, [conv.id, req.worldUser.id]);

      return {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        participants,
        last_message: conv.last_message,
        last_message_at: conv.last_message_at,
        unread_count: conv.unread_count,
        is_vip_only: Boolean(conv.is_vip_only)
      };
    }));

    res.json({ conversations: result });
  } catch (error) {
    console.error('Conversations fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// POST /api/world/conversations - Start new conversation
router.post('/conversations', authenticateWorldUser, [
  body('participant_ids').isArray({ min: 1 }),
  body('type').optional().isIn(['dm', 'group'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { participant_ids, type = 'dm', name } = req.body;

    // For DMs, check if conversation already exists
    if (type === 'dm' && participant_ids.length === 1) {
      const existing = await db.get(`
        SELECT c.id FROM world_conversations c
        JOIN world_conversation_participants cp1 ON c.id = cp1.conversation_id
        JOIN world_conversation_participants cp2 ON c.id = cp2.conversation_id
        WHERE c.type = 'dm' AND cp1.user_id = ? AND cp2.user_id = ?
      `, [req.worldUser.id, participant_ids[0]]);

      if (existing) {
        return res.json({ conversation_id: existing.id, existing: true });
      }
    }

    // Create conversation
    const result = await db.run(`
      INSERT INTO world_conversations (type, name, created_by)
      VALUES (?, ?, ?)
    `, [type, name || null, req.worldUser.id]);

    const conversationId = result.lastInsertRowid;

    // Add creator as admin
    await db.run(`
      INSERT INTO world_conversation_participants (conversation_id, user_id, is_admin)
      VALUES (?, ?, 1)
    `, [conversationId, req.worldUser.id]);

    // Add other participants
    for (const userId of participant_ids) {
      if (userId !== req.worldUser.id) {
        await db.run(`
          INSERT INTO world_conversation_participants (conversation_id, user_id, is_admin)
          VALUES (?, ?, 0)
        `, [conversationId, userId]);
      }
    }

    res.status(201).json({
      message: 'Conversation created',
      conversation_id: conversationId
    });
  } catch (error) {
    console.error('Conversation create error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// GET /api/world/conversations/:id/messages - Get messages in conversation
router.get('/conversations/:id/messages', authenticateWorldUser, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Verify user is in conversation
    const participant = await db.get('SELECT * FROM world_conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, req.worldUser.id]);

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const messages = await db.all(`
      SELECT m.*, u.username, u.display_name, u.avatar_url
      FROM world_messages m
      JOIN world_users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [conversationId, limit, offset]);

    // Mark as read
    await db.run(`
      UPDATE world_messages SET is_read = 1
      WHERE conversation_id = ? AND sender_id != ? AND is_read = 0
    `, [conversationId, req.worldUser.id]);

    res.json({
      messages: messages.reverse().map(m => ({
        id: m.id,
        content: m.content,
        media_url: m.media_url,
        sender: {
          id: m.sender_id,
          username: m.username,
          display_name: m.display_name,
          avatar_url: m.avatar_url,
          is_me: m.sender_id === req.worldUser.id
        },
        timestamp: getTimeAgo(new Date(m.created_at)),
        created_at: m.created_at
      })),
      pagination: { page, limit }
    });
  } catch (error) {
    console.error('Messages fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/world/conversations/:id/messages - Send message
router.post('/conversations/:id/messages', authenticateWorldUser, [
  body('content').trim().isLength({ min: 1, max: 2000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const conversationId = parseInt(req.params.id);
    const { content, media_url } = req.body;

    // Verify user is in conversation
    const participant = await db.get('SELECT * FROM world_conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, req.worldUser.id]);

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const result = await db.run(`
      INSERT INTO world_messages (conversation_id, sender_id, content, media_url)
      VALUES (?, ?, ?, ?)
    `, [conversationId, req.worldUser.id, content, media_url || null]);

    // Update conversation timestamp
    await db.run('UPDATE world_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [conversationId]);

    res.status(201).json({
      message: 'Message sent',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Message send error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ============================================
// MEMBERSHIP ROUTES
// ============================================

// GET /api/world/membership/tiers - Get membership tier info
router.get('/membership/tiers', (req, res) => {
  const tiers = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      features: ['Access to public posts', 'Like and comment', 'Join public group chats', 'View schedule']
    },
    {
      id: 'vip',
      name: 'VIP',
      price: 9.99,
      features: ['All Free features', 'Exclusive VIP content', 'VIP group chat access', 'Direct message Wyatt', 'Early access to new content', 'Monthly live Q&A']
    },
    {
      id: 'inner_circle',
      name: 'Inner Circle',
      price: 24.99,
      features: ['All VIP features', 'Behind-the-scenes access', 'The Vault - exclusive archive', 'Priority DM responses', 'Exclusive merch discounts', 'Birthday shoutout', 'Vote on upcoming content']
    }
  ];

  res.json({ tiers });
});

// POST /api/world/membership/subscribe - Subscribe to tier
router.post('/membership/subscribe', authenticateWorldUser, [
  body('tier').isIn(['vip', 'inner_circle'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tier } = req.body;

    res.json({
      message: 'Checkout session created',
      checkout_url: `/checkout/membership/${tier}`,
      tier
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// GET /api/world/membership/status - Get current membership status
router.get('/membership/status', authenticateWorldUser, async (req, res) => {
  try {
    const membership = await db.get(`
      SELECT * FROM world_memberships
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `, [req.worldUser.id]);

    const user = await db.get('SELECT membership_tier FROM world_users WHERE id = ?', [req.worldUser.id]);

    res.json({
      current_tier: user.membership_tier,
      membership: membership ? {
        tier: membership.tier,
        status: membership.status,
        starts_at: membership.starts_at,
        ends_at: membership.ends_at
      } : null
    });
  } catch (error) {
    console.error('Membership status error:', error);
    res.status(500).json({ error: 'Failed to fetch membership status' });
  }
});

// ============================================
// TIPS ROUTES
// ============================================

// POST /api/world/tips - Send a tip
router.post('/tips', authenticateWorldUser, [
  body('amount').isFloat({ min: 1, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, message, post_id } = req.body;

    const result = await db.run(`
      INSERT INTO world_tips (sender_id, amount, message, post_id, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, [req.worldUser.id, amount, message || null, post_id || null]);

    res.status(201).json({
      message: 'Tip processing',
      id: result.lastInsertRowid,
      checkout_url: `/checkout/tip/${result.lastInsertRowid}`
    });
  } catch (error) {
    console.error('Tip error:', error);
    res.status(500).json({ error: 'Failed to process tip' });
  }
});

// ============================================
// NOTIFICATIONS ROUTES
// ============================================

// GET /api/world/notifications - Get user notifications
router.get('/notifications', authenticateWorldUser, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const notifications = await db.all(`
      SELECT * FROM world_notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [req.worldUser.id, limit, offset]);

    const unreadResult = await db.get('SELECT COUNT(*) as count FROM world_notifications WHERE user_id = ? AND is_read = 0',
      [req.worldUser.id]);

    res.json({
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        is_read: Boolean(n.is_read),
        timestamp: getTimeAgo(new Date(n.created_at))
      })),
      unread_count: unreadResult.count
    });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// POST /api/world/notifications/read - Mark notifications as read
router.post('/notifications/read', authenticateWorldUser, async (req, res) => {
  try {
    const { notification_ids } = req.body;

    if (notification_ids && notification_ids.length > 0) {
      const placeholders = notification_ids.map(() => '?').join(',');
      await db.run(`UPDATE world_notifications SET is_read = 1 WHERE id IN (${placeholders}) AND user_id = ?`,
        [...notification_ids, req.worldUser.id]);
    } else {
      await db.run('UPDATE world_notifications SET is_read = 1 WHERE user_id = ?', [req.worldUser.id]);
    }

    res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    console.error('Notifications read error:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// ============================================
// LIVE STREAMS ROUTES
// ============================================

// GET /api/world/streams - Get live streams
router.get('/streams', optionalAuth, async (req, res) => {
  try {
    const status = req.query.status || 'all';

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status !== 'all') {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    const userTier = req.worldUser?.membership_tier || 'free';
    if (userTier === 'free') {
      whereClause += ' AND is_vip_only = 0';
    }

    const streams = await db.all(`
      SELECT * FROM world_streams
      ${whereClause}
      ORDER BY
        CASE WHEN status = 'live' THEN 0
             WHEN status = 'scheduled' THEN 1
             ELSE 2 END,
        scheduled_at DESC
      LIMIT 20
    `, params);

    res.json({
      streams: streams.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        thumbnail_url: s.thumbnail_url,
        status: s.status,
        scheduled_at: s.scheduled_at,
        viewer_count: s.viewer_count,
        is_vip_only: Boolean(s.is_vip_only),
        can_access: userTier !== 'free' || !s.is_vip_only
      }))
    });
  } catch (error) {
    console.error('Streams fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

// ============================================
// PODCAST ROUTES
// ============================================

// GET /api/world/podcast - Get podcast episodes
router.get('/podcast', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const userTier = req.worldUser?.membership_tier || 'free';
    let whereClause = 'WHERE published_at IS NOT NULL';

    if (userTier === 'free') {
      whereClause += ' AND is_vip_only = 0';
    }

    const episodes = await db.all(`
      SELECT * FROM world_podcast_episodes
      ${whereClause}
      ORDER BY episode_number DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    res.json({
      episodes: episodes.map(e => ({
        id: e.id,
        episode_number: e.episode_number,
        title: e.title,
        description: e.description,
        thumbnail_url: e.thumbnail_url,
        duration: e.duration,
        play_count: e.play_count,
        is_vip_only: Boolean(e.is_vip_only),
        can_access: userTier !== 'free' || !e.is_vip_only,
        audio_url: (userTier !== 'free' || !e.is_vip_only) ? e.audio_url : null,
        published_at: e.published_at
      }))
    });
  } catch (error) {
    console.error('Podcast fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch podcast episodes' });
  }
});

// ============================================
// VAULT ROUTES (Premium Content Archive)
// ============================================

// GET /api/world/vault - Get vault items
router.get('/vault', authenticateWorldUser, requireTier('vip'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const mediaType = req.query.type;

    let whereClause = 'WHERE is_active = 1';
    const params = [];

    const userTier = req.worldUser.membership_tier;
    if (userTier === 'vip') {
      whereClause += " AND min_tier = 'vip'";
    }

    if (mediaType && mediaType !== 'all') {
      whereClause += ' AND media_type = ?';
      params.push(mediaType);
    }

    const items = await db.all(`
      SELECT * FROM world_vault_items
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json({
      items: items.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        media_type: item.media_type,
        thumbnail_url: item.thumbnail_url,
        media_url: item.media_url,
        duration: item.duration,
        min_tier: item.min_tier,
        view_count: item.view_count,
        created_at: item.created_at
      }))
    });
  } catch (error) {
    console.error('Vault fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch vault items' });
  }
});

// ============================================
// FOLLOW ROUTES
// ============================================

// POST /api/world/users/:id/follow - Follow/unfollow user
router.post('/users/:id/follow', authenticateWorldUser, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);

    if (targetUserId === req.worldUser.id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const existing = await db.get('SELECT * FROM world_follows WHERE follower_id = ? AND following_id = ?',
      [req.worldUser.id, targetUserId]);

    if (existing) {
      await db.run('DELETE FROM world_follows WHERE follower_id = ? AND following_id = ?',
        [req.worldUser.id, targetUserId]);
      return res.json({ following: false });
    }

    await db.run('INSERT INTO world_follows (follower_id, following_id) VALUES (?, ?)',
      [req.worldUser.id, targetUserId]);

    // Create notification
    await db.run(`
      INSERT INTO world_notifications (user_id, type, title, message)
      VALUES (?, 'follow', 'New Follower', ?)
    `, [targetUserId, `@${req.worldUser.username} started following you`]);

    res.json({ following: true });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to update follow status' });
  }
});

// GET /api/world/users/:id - Get user profile
router.get('/users/:id', optionalAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const user = await db.get(`
      SELECT id, username, display_name, avatar_url, bio, membership_tier, is_verified, created_at
      FROM world_users WHERE id = ? AND is_active = 1
    `, [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const followersResult = await db.get('SELECT COUNT(*) as count FROM world_follows WHERE following_id = ?', [userId]);
    const followingResult = await db.get('SELECT COUNT(*) as count FROM world_follows WHERE follower_id = ?', [userId]);
    const postsResult = await db.get('SELECT COUNT(*) as count FROM world_posts WHERE author_id = ? AND is_active = 1', [userId]);

    let isFollowing = false;
    if (req.worldUser) {
      const followCheck = await db.get('SELECT 1 FROM world_follows WHERE follower_id = ? AND following_id = ?',
        [req.worldUser.id, userId]);
      isFollowing = Boolean(followCheck);
    }

    res.json({
      user: {
        ...user,
        followers_count: followersResult.count,
        following_count: followingResult.count,
        posts_count: postsResult.count,
        is_following: isFollowing
      }
    });
  } catch (error) {
    console.error('User profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

export default router;
