import nodemailer from 'nodemailer';

// Create transporter (configure based on your email provider)
const createTransporter = () => {
  // For development/testing, use ethereal email or console logging
  if (process.env.NODE_ENV !== 'production' || !process.env.SMTP_HOST) {
    return {
      sendMail: async (options) => {
        console.log('📧 Email would be sent:');
        console.log('  To:', options.to);
        console.log('  Subject:', options.subject);
        console.log('  Body preview:', options.text?.substring(0, 200) || options.html?.substring(0, 200));
        return { messageId: 'dev-' + Date.now() };
      }
    };
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const transporter = createTransporter();

export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@wyattxxxcole.xxx',
      to,
      subject,
      text,
      html
    });
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
};

export const sendBookingNotification = async (booking) => {
  const subject = `New Booking Inquiry: ${booking.shoot_type || 'General'} - ${booking.name}`;
  const text = `
New booking inquiry received!

Name: ${booking.name}
Company: ${booking.company || 'N/A'}
Email: ${booking.email}
Shoot Type: ${booking.shoot_type || 'N/A'}
Location: ${booking.location || 'N/A'}
Dates: ${booking.dates || 'N/A'}
Budget: ${booking.budget || 'N/A'}

Details:
${booking.details || 'No additional details provided.'}

---
Submitted: ${new Date().toISOString()}
  `;

  return sendEmail({
    to: process.env.BOOKING_EMAIL || 'booking@wyattxxxcole.xxx',
    subject,
    text
  });
};

export const sendCreatorCollabNotification = async (collab) => {
  const subject = `New Creator Collab Request: ${collab.handle} (${collab.platform})`;
  const text = `
New creator collaboration request!

Handle: ${collab.handle}
Platform: ${collab.platform}
Email: ${collab.email}
Collab Type: ${collab.collab_type || 'N/A'}
Location: ${collab.location || 'N/A'}
Links: ${collab.links || 'N/A'}

Details:
${collab.details || 'No additional details provided.'}

---
Submitted: ${new Date().toISOString()}
  `;

  return sendEmail({
    to: process.env.BOOKING_EMAIL || 'booking@wyattxxxcole.xxx',
    subject,
    text
  });
};

export const sendOrderConfirmation = async (order) => {
  const items = JSON.parse(order.items);
  const itemsList = items.map(i => `- ${i.title} x${i.quantity}: $${(i.price * i.quantity).toFixed(2)}`).join('\n');

  const subject = `Order Confirmation #${order.order_number}`;
  const text = `
Thank you for your order!

Order Number: ${order.order_number}

Items:
${itemsList}

Subtotal: $${order.subtotal.toFixed(2)}
Shipping: $${order.shipping.toFixed(2)}
Total: $${order.total.toFixed(2)}

We'll notify you when your order ships.

- WYATT XXX COLE
  `;

  return sendEmail({
    to: order.customer_email,
    subject,
    text
  });
};

export const sendNewsletterWelcome = async (email) => {
  const subject = 'Welcome to the Neon Rebellion!';
  const text = `
Welcome to the inner circle!

You're now subscribed to exclusive drop alerts and updates from WYATT XXX COLE.

Stay tuned for:
- New merch drops
- Exclusive content announcements
- Tour dates and appearances
- Limited edition releases

See you in the neon glow.

- WYATT XXX COLE

---
To unsubscribe, visit: ${process.env.FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(email)}
  `;

  return sendEmail({
    to: email,
    subject,
    text
  });
};
