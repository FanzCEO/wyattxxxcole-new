import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';

const router = express.Router();

// Helper to generate visitor ID from request
const getVisitorId = (req) => {
  // Use a combination of IP and user agent, or session cookie if available
  const ip = req.ip || req.connection.remoteAddress;
  const ua = req.headers['user-agent'] || '';
  // In production, you'd want to use a proper session/cookie system
  return req.headers['x-visitor-id'] || Buffer.from(ip + ua).toString('base64').substring(0, 32);
};

// GET /api/community/posts - Get community posts with pagination
router.get('/posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get total count
    const totalResult = await db.get('SELECT COUNT(*) as count FROM community_posts WHERE is_active = 1');
    const total = totalResult.count;

    // Get posts (pinned first, then by date)
    const posts = await db.all(`
      SELECT * FROM community_posts
      WHERE is_active = 1
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    // Get polls for posts that have them
    const postIds = posts.map(p => p.id);
    let polls = [];
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(',');
      polls = await db.all(`SELECT * FROM community_polls WHERE post_id IN (${placeholders}) AND is_active = 1`, postIds);
    }

    const pollMap = {};
    polls.forEach(poll => {
      pollMap[poll.post_id] = {
        id: poll.id,
        question: poll.question,
        options: JSON.parse(poll.options),
        totalVotes: poll.total_votes
      };
    });

    // Format response
    const formattedPosts = posts.map(post => {
      const tags = post.tags ? post.tags.split(',').map(t => t.trim()) : [];
      const timeAgo = getTimeAgo(new Date(post.created_at));

      return {
        id: post.id,
        author: 'Wyatt XXX Cole',
        avatar: 'WXC',
        timestamp: timeAgo,
        content: post.content,
        mediaUrl: post.media_url,
        mediaType: post.media_type,
        tags,
        isPinned: Boolean(post.is_pinned),
        likes: post.likes_count,
        comments: post.comments_count,
        shares: post.shares_count,
        poll: pollMap[post.id] || null
      };
    });

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

// GET /api/community/posts/:id - Get single post
router.get('/posts/:id', async (req, res) => {
  try {
    const post = await db.get('SELECT * FROM community_posts WHERE id = ? AND is_active = 1', [req.params.id]);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Get poll if exists
    const poll = await db.get('SELECT * FROM community_polls WHERE post_id = ? AND is_active = 1', [post.id]);

    // Get comments
    const comments = await db.all(`
      SELECT * FROM post_comments
      WHERE post_id = ? AND is_approved = 1
      ORDER BY created_at DESC
      LIMIT 50
    `, [post.id]);

    res.json({
      id: post.id,
      author: 'Wyatt XXX Cole',
      avatar: 'WXC',
      timestamp: getTimeAgo(new Date(post.created_at)),
      content: post.content,
      mediaUrl: post.media_url,
      mediaType: post.media_type,
      tags: post.tags ? post.tags.split(',').map(t => t.trim()) : [],
      isPinned: Boolean(post.is_pinned),
      likes: post.likes_count,
      comments: post.comments_count,
      shares: post.shares_count,
      poll: poll ? {
        id: poll.id,
        question: poll.question,
        options: JSON.parse(poll.options),
        totalVotes: poll.total_votes
      } : null,
      commentsList: comments.map(c => ({
        id: c.id,
        author: c.author_name,
        content: c.content,
        timestamp: getTimeAgo(new Date(c.created_at))
      }))
    });
  } catch (error) {
    console.error('Post fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// POST /api/community/posts/:id/like - Like a post
router.post('/posts/:id/like', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const visitorId = getVisitorId(req);

    // Check if already liked
    const existing = await db.get('SELECT * FROM post_likes WHERE post_id = ? AND liker_id = ?', [postId, visitorId]);

    if (existing) {
      // Unlike
      await db.run('DELETE FROM post_likes WHERE post_id = ? AND liker_id = ?', [postId, visitorId]);
      await db.run('UPDATE community_posts SET likes_count = likes_count - 1 WHERE id = ?', [postId]);

      const post = await db.get('SELECT likes_count FROM community_posts WHERE id = ?', [postId]);
      return res.json({ liked: false, likes: post.likes_count });
    }

    // Like
    await db.run('INSERT INTO post_likes (post_id, liker_id) VALUES (?, ?)', [postId, visitorId]);
    await db.run('UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);

    const post = await db.get('SELECT likes_count FROM community_posts WHERE id = ?', [postId]);
    res.json({ liked: true, likes: post.likes_count });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// POST /api/community/posts/:id/comment - Comment on a post
router.post('/posts/:id/comment', [
  body('authorName').trim().notEmpty().withMessage('Name is required'),
  body('content').trim().notEmpty().withMessage('Comment is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const postId = parseInt(req.params.id);
    const { authorName, content } = req.body;

    // Comments require approval by default
    const result = await db.run(`
      INSERT INTO post_comments (post_id, author_name, content, is_approved)
      VALUES (?, ?, ?, 0)
    `, [postId, authorName, content]);

    res.status(201).json({
      message: 'Comment submitted for approval',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to submit comment' });
  }
});

// POST /api/community/polls/:id/vote - Vote on a poll
router.post('/polls/:id/vote', [
  body('optionIndex').isInt({ min: 0 }).withMessage('Valid option index required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const pollId = parseInt(req.params.id);
    const { optionIndex } = req.body;
    const visitorId = getVisitorId(req);

    // Check if already voted
    const existing = await db.get('SELECT * FROM poll_votes WHERE poll_id = ? AND voter_id = ?', [pollId, visitorId]);

    if (existing) {
      return res.status(400).json({ error: 'You have already voted on this poll' });
    }

    // Get poll
    const poll = await db.get('SELECT * FROM community_polls WHERE id = ?', [pollId]);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const options = JSON.parse(poll.options);

    if (optionIndex >= options.length) {
      return res.status(400).json({ error: 'Invalid option' });
    }

    // Record vote
    await db.run('INSERT INTO poll_votes (poll_id, option_index, voter_id) VALUES (?, ?, ?)', [pollId, optionIndex, visitorId]);

    // Update poll options
    options[optionIndex].votes = (options[optionIndex].votes || 0) + 1;
    const newTotal = poll.total_votes + 1;

    await db.run('UPDATE community_polls SET options = ?, total_votes = ? WHERE id = ?', [JSON.stringify(options), newTotal, pollId]);

    // Calculate percentages
    const optionsWithPercentages = options.map(opt => ({
      ...opt,
      percentage: Math.round((opt.votes / newTotal) * 100)
    }));

    res.json({
      message: 'Vote recorded',
      options: optionsWithPercentages,
      totalVotes: newTotal
    });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

// GET /api/community/tags - Get trending tags
router.get('/tags', async (req, res) => {
  try {
    const posts = await db.all(`
      SELECT tags FROM community_posts
      WHERE is_active = 1 AND tags IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Count tag occurrences
    const tagCounts = {};
    posts.forEach(post => {
      const tags = post.tags.split(',').map(t => t.trim().toLowerCase());
      tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Sort by count and get top 10
    const trending = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    res.json({ trending });
  } catch (error) {
    console.error('Tags fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Helper function to format time ago
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

export default router;
