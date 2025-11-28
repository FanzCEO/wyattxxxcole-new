import express from 'express';
import { body, validationResult } from 'express-validator';
import db from '../config/database.js';
import { sendEmail } from '../utils/email.js';

const router = express.Router();

// GET /api/schedule/calendar/:year/:month - Get calendar availability for a month
router.get('/calendar/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;

    // Validate year and month
    const y = parseInt(year);
    const m = parseInt(month);

    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // Get first and last day of month
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

    const availability = await db.all(`
      SELECT date, status, notes
      FROM schedule_availability
      WHERE date >= ? AND date <= ?
      ORDER BY date
    `, [startDate, endDate]);

    // Build calendar data
    const calendar = {};
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const entry = availability.find(a => a.date === dateStr);
      calendar[dateStr] = {
        status: entry?.status || 'available',
        notes: entry?.notes || null
      };
    }

    res.json({
      year: y,
      month: m,
      calendar
    });
  } catch (error) {
    console.error('Calendar fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

// GET /api/schedule/cities - Get upcoming cities/locations
router.get('/cities', async (req, res) => {
  try {
    const locations = await db.all(`
      SELECT id, city, start_date, end_date, tags, is_home_base
      FROM schedule_locations
      WHERE is_active = 1
      ORDER BY sort_order, start_date
    `);

    res.json({
      locations: locations.map(loc => ({
        id: loc.id,
        city: loc.city,
        startDate: loc.start_date,
        endDate: loc.end_date,
        tags: loc.tags ? loc.tags.split(',').map(t => t.trim()) : [],
        isHomeBase: Boolean(loc.is_home_base)
      }))
    });
  } catch (error) {
    console.error('Cities fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

// POST /api/schedule/notify - Sign up for location notifications
router.post('/notify', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('city').trim().notEmpty().withMessage('City is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, city } = req.body;

    // Check if already signed up
    const existing = await db.get('SELECT * FROM location_notifications WHERE email = ? AND city = ?', [email, city]);

    if (existing) {
      return res.json({ message: 'Already signed up for notifications for this city!' });
    }

    await db.run('INSERT INTO location_notifications (email, city) VALUES (?, ?)', [email, city]);

    // Send confirmation email
    await sendEmail({
      to: email,
      subject: `You'll be notified when I'm in ${city}!`,
      text: `
Hey!

You're now signed up to get notified when I'm heading to ${city}.

I'll drop you a line when dates are confirmed so you don't miss out.

See you there!

- WYATT XXX COLE
      `
    });

    res.status(201).json({ message: `You'll be notified when dates for ${city} are confirmed!` });
  } catch (error) {
    console.error('Notification signup error:', error);
    res.status(500).json({ error: 'Failed to sign up for notifications' });
  }
});

// GET /api/schedule/upcoming - Get next few dates with availability
router.get('/upcoming', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const upcoming = await db.all(`
      SELECT date, status, notes
      FROM schedule_availability
      WHERE date >= ? AND status = 'available'
      ORDER BY date
      LIMIT 10
    `, [today]);

    res.json({ upcoming });
  } catch (error) {
    console.error('Upcoming dates fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming dates' });
  }
});

export default router;
