import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// GET /api/portfolio/items - Get portfolio items
router.get('/items', async (req, res) => {
  try {
    const { category } = req.query;

    let query = 'SELECT * FROM portfolio_items WHERE is_active = 1';
    const params = [];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY sort_order, created_at DESC';

    const items = await db.all(query, params);

    res.json({
      items: items.map(item => ({
        id: item.id,
        category: item.category,
        title: item.title,
        description: item.description,
        imageUrl: item.image_url,
        videoUrl: item.video_url,
        thumbnailUrl: item.thumbnail_url,
        tags: item.tags ? item.tags.split(',').map(t => t.trim()) : []
      }))
    });
  } catch (error) {
    console.error('Portfolio fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio items' });
  }
});

// GET /api/portfolio/items/:id - Get single portfolio item
router.get('/items/:id', async (req, res) => {
  try {
    const item = await db.get('SELECT * FROM portfolio_items WHERE id = ? AND is_active = 1', [req.params.id]);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({
      id: item.id,
      category: item.category,
      title: item.title,
      description: item.description,
      imageUrl: item.image_url,
      videoUrl: item.video_url,
      thumbnailUrl: item.thumbnail_url,
      tags: item.tags ? item.tags.split(',').map(t => t.trim()) : []
    });
  } catch (error) {
    console.error('Portfolio item fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio item' });
  }
});

// GET /api/portfolio/categories - Get portfolio categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await db.all(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM portfolio_items
      WHERE is_active = 1
      GROUP BY category
      ORDER BY
        CASE category
          WHEN 'photos' THEN 1
          WHEN 'videos' THEN 2
          WHEN 'themed' THEN 3
          WHEN 'bts' THEN 4
          ELSE 5
        END
    `);

    res.json({
      categories: categories.map(c => ({
        slug: c.category,
        name: formatCategoryName(c.category),
        count: c.count
      }))
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/portfolio/tags - Get all tags
router.get('/tags', async (req, res) => {
  try {
    const items = await db.all(`
      SELECT tags FROM portfolio_items
      WHERE is_active = 1 AND tags IS NOT NULL
    `);

    const tagSet = new Set();
    items.forEach(item => {
      const tags = item.tags.split(',').map(t => t.trim().toLowerCase());
      tags.forEach(tag => tagSet.add(tag));
    });

    res.json({ tags: Array.from(tagSet).sort() });
  } catch (error) {
    console.error('Tags fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Helper to format category names
function formatCategoryName(slug) {
  const names = {
    photos: 'Photos',
    videos: 'Video Reel',
    themed: 'Themed Shoots',
    bts: 'Behind The Scenes'
  };
  return names[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
}

export default router;
