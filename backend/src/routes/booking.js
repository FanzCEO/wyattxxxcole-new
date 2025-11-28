import express from 'express';
import { body, validationResult } from 'express-validator';
import db from '../config/database.js';
import { sendBookingNotification } from '../utils/email.js';

const router = express.Router();

// Validation middleware
const bookingValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('shootType').optional().trim(),
  body('location').optional().trim(),
  body('dates').optional().trim(),
  body('budget').optional().trim(),
  body('details').optional().trim()
];

// POST /api/booking/studio-inquiry - Submit studio booking inquiry
router.post('/studio-inquiry', bookingValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, company, email, shootType, location, dates, budget, details } = req.body;

    const result = await db.run(`
      INSERT INTO bookings (name, company, email, shoot_type, location, dates, budget, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, company || null, email, shootType || null, location || null, dates || null, budget || null, details || null]);

    // Send email notification
    await sendBookingNotification({
      name,
      company,
      email,
      shoot_type: shootType,
      location,
      dates,
      budget,
      details
    });

    res.status(201).json({
      message: 'Booking inquiry submitted successfully',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Booking submission error:', error);
    res.status(500).json({ error: 'Failed to submit booking inquiry' });
  }
});

// POST /api/booking/professional - Submit professional booking (from contact page)
router.post('/professional', bookingValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, company, email, shootType, location, dates, budget, details } = req.body;

    const result = await db.run(`
      INSERT INTO bookings (name, company, email, shoot_type, location, dates, budget, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, company || null, email, shootType || null, location || null, dates || null, budget || null, details || null]);

    await sendBookingNotification({
      name,
      company,
      email,
      shoot_type: shootType,
      location,
      dates,
      budget,
      details
    });

    res.status(201).json({
      message: 'Professional booking submitted successfully',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Professional booking error:', error);
    res.status(500).json({ error: 'Failed to submit booking' });
  }
});

export default router;
