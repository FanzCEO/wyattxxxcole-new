import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import bookingRoutes from './routes/booking.js';
import contactRoutes from './routes/contact.js';
import shopRoutes from './routes/shop.js';
import checkoutRoutes from './routes/checkout.js';
import scheduleRoutes from './routes/schedule.js';
import communityRoutes from './routes/community.js';
import portfolioRoutes from './routes/portfolio.js';
import adminRoutes from './routes/admin.js';
import worldRoutes from './routes/world.js';
import db from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  optionsSuccessStatus: 200
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit form submissions
  message: { error: 'Too many form submissions, please try again later.' }
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', limiter);

// Serve static files from uploads
app.use('/uploads', express.static(join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public site settings (for frontend to fetch background images, etc.)
app.get('/api/settings/public', (req, res) => {
  try {
    const publicKeys = [
      'site_name', 'site_tagline', 'logo_text',
      'hero_background_url', 'world_background_url',
      'bio_short', 'bio_full', 'base_city'
    ];

    const settings = {};
    publicKeys.forEach(key => {
      const row = db.prepare('SELECT setting_value FROM site_settings WHERE setting_key = ?').get(key);
      settings[key] = row?.setting_value || '';
    });

    res.json({ settings });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/booking', formLimiter, bookingRoutes);
app.use('/api/contact', formLimiter, contactRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/world', worldRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   WYATT XXX COLE - Backend API Server                     ║
║   ─────────────────────────────────────                   ║
║   Server running on http://localhost:${PORT}               ║
║   Environment: ${process.env.NODE_ENV || 'development'}                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
