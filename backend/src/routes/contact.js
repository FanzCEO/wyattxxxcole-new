import express from 'express';
import { body, validationResult } from 'express-validator';
import db from '../config/database.js';
import { sendCreatorCollabNotification, sendEmail } from '../utils/email.js';

const router = express.Router();

// POST /api/contact/creator-collab - Submit creator collaboration request
router.post('/creator-collab', [
  body('handle').trim().notEmpty().withMessage('Social handle is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('platform').optional().trim(),
  body('collabType').optional().trim(),
  body('location').optional().trim(),
  body('links').optional().trim(),
  body('details').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { handle, platform, email, collabType, location, links, details } = req.body;

    const result = await db.run(`
      INSERT INTO creator_collabs (handle, platform, email, collab_type, location, links, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [handle, platform || null, email, collabType || null, location || null, links || null, details || null]);

    // Send email notification
    await sendCreatorCollabNotification({
      handle,
      platform,
      email,
      collab_type: collabType,
      location,
      links,
      details
    });

    res.status(201).json({
      message: 'Creator collaboration request submitted successfully',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Creator collab submission error:', error);
    res.status(500).json({ error: 'Failed to submit collaboration request' });
  }
});

// POST /api/contact/general - General contact form
router.post('/general', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('subject').optional().trim(),
  body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, subject, message } = req.body;

    const result = await db.run(`
      INSERT INTO contact_submissions (name, email, subject, message, form_type)
      VALUES (?, ?, ?, ?, 'general')
    `, [name, email, subject || null, message]);

    // Send notification email
    await sendEmail({
      to: process.env.BOOKING_EMAIL || 'booking@wyattxxxcole.xxx',
      subject: `Contact Form: ${subject || 'General Inquiry'} - ${name}`,
      text: `
New contact form submission:

Name: ${name}
Email: ${email}
Subject: ${subject || 'N/A'}

Message:
${message}

---
Submitted: ${new Date().toISOString()}
      `
    });

    res.status(201).json({
      message: 'Message sent successfully',
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Contact submission error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
