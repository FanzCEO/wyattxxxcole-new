import express from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import { taxCalculator } from '../services/tax-calculator.js';
import { shippingCalculator } from '../services/shipping-calculator.js';
import { sendOrderConfirmation } from '../utils/email.js';

const router = express.Router();

// ============================================
// GET SHIPPING OPTIONS
// ============================================
router.post('/shipping-rates', [
    body('country').notEmpty().withMessage('Country is required'),
    body('state').optional(),
    body('postalCode').optional(),
    body('subtotal').isFloat({ min: 0 }).withMessage('Subtotal is required')
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { country, state, postalCode, subtotal, weight = 1 } = req.body;

        const rates = shippingCalculator.getAllRates({
            country,
            state,
            weight,
            subtotal
        });

        res.json({
            rates,
            freeShipping: shippingCalculator.checkFreeShipping(country, subtotal)
        });
    } catch (error) {
        console.error('Shipping rates error:', error);
        res.status(500).json({ error: 'Failed to calculate shipping' });
    }
});

// ============================================
// CALCULATE TAX
// ============================================
router.post('/calculate-tax', [
    body('subtotal').isFloat({ min: 0 }).withMessage('Subtotal is required'),
    body('country').notEmpty().withMessage('Country is required'),
    body('state').optional(),
    body('shipping').isFloat({ min: 0 }).optional()
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { subtotal, country, state, postalCode, shipping = 0, category } = req.body;

        const tax = taxCalculator.calculate({
            subtotal,
            country,
            state,
            postalCode,
            shipping,
            category
        });

        res.json(tax);
    } catch (error) {
        console.error('Tax calculation error:', error);
        res.status(500).json({ error: 'Failed to calculate tax' });
    }
});

// ============================================
// CALCULATE ORDER TOTALS
// ============================================
router.post('/calculate', [
    body('items').isArray({ min: 1 }).withMessage('Cart items required'),
    body('country').notEmpty().withMessage('Country is required'),
    body('shippingMethod').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { items, country, state, postalCode, shippingMethod = 'standard' } = req.body;

        // Calculate subtotal from items
        let subtotal = 0;
        let totalWeight = 0;
        const validatedItems = [];

        for (const item of items) {
            const product = await db.get('SELECT * FROM products WHERE id = ? AND is_active = 1', [item.productId]);

            if (!product) {
                return res.status(400).json({ error: `Product ${item.productId} not found` });
            }

            subtotal += product.price * item.quantity;
            totalWeight += (product.weight || 0.5) * item.quantity;

            validatedItems.push({
                productId: product.id,
                title: product.title,
                price: product.price,
                quantity: item.quantity,
                category: product.category
            });
        }

        // Calculate shipping
        const shipping = shippingCalculator.calculate({
            country,
            state,
            weight: totalWeight,
            subtotal,
            method: shippingMethod
        });

        // Calculate tax
        const tax = taxCalculator.calculate({
            subtotal,
            country,
            state,
            postalCode,
            shipping: shipping.total
        });

        // Calculate totals
        const total = subtotal + shipping.total + tax.taxAmount;

        res.json({
            items: validatedItems,
            subtotal: Math.round(subtotal * 100) / 100,
            shipping: {
                method: shipping.method,
                methodName: shipping.methodName,
                cost: shipping.total,
                deliveryEstimate: shipping.deliveryEstimate,
                freeShipping: shipping.freeShipping
            },
            tax: {
                rate: tax.taxRate,
                amount: tax.taxAmount,
                breakdown: tax.breakdown,
                jurisdiction: tax.jurisdiction
            },
            total: Math.round(total * 100) / 100,
            currency: 'USD'
        });
    } catch (error) {
        console.error('Order calculation error:', error);
        res.status(500).json({ error: 'Failed to calculate order' });
    }
});

// ============================================
// VALIDATE ADDRESS
// ============================================
router.post('/validate-address', [
    body('line1').notEmpty().withMessage('Address is required'),
    body('city').notEmpty().withMessage('City is required'),
    body('country').notEmpty().withMessage('Country is required'),
    body('postalCode').notEmpty().withMessage('Postal code is required')
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const validation = shippingCalculator.validateAddress(req.body);

        res.json(validation);
    } catch (error) {
        console.error('Address validation error:', error);
        res.status(500).json({ error: 'Failed to validate address' });
    }
});

// ============================================
// CREATE CHECKOUT SESSION
// ============================================
router.post('/create-session', [
    body('items').isArray({ min: 1 }).withMessage('Cart items required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('shippingAddress').isObject().withMessage('Shipping address required'),
    body('shippingMethod').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { items, email, shippingAddress, billingAddress, shippingMethod = 'standard' } = req.body;

        // Generate session ID
        const sessionId = 'cs_' + uuidv4();

        // Calculate totals
        let subtotal = 0;
        let totalWeight = 0;
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
            totalWeight += (product.weight || 0.5) * item.quantity;

            orderItems.push({
                productId: product.id,
                title: product.title,
                price: product.price,
                quantity: item.quantity,
                category: product.category,
                isDigital: Boolean(product.is_digital)
            });
        }

        // Calculate shipping
        const shipping = shippingCalculator.calculate({
            country: shippingAddress.country,
            state: shippingAddress.state,
            weight: totalWeight,
            subtotal,
            method: shippingMethod
        });

        // Calculate tax
        const tax = taxCalculator.calculate({
            subtotal,
            country: shippingAddress.country,
            state: shippingAddress.state,
            postalCode: shippingAddress.postalCode,
            shipping: shipping.total
        });

        const total = subtotal + shipping.total + tax.taxAmount;

        // Store checkout session in database
        await db.run(`
            INSERT INTO checkout_sessions (
                session_id, email, items, shipping_address, billing_address,
                subtotal, shipping_cost, shipping_method, tax_amount, total, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
        `, [
            sessionId,
            email,
            JSON.stringify(orderItems),
            JSON.stringify(shippingAddress),
            JSON.stringify(billingAddress || shippingAddress),
            subtotal,
            shipping.total,
            shippingMethod,
            tax.taxAmount,
            total
        ]);

        res.json({
            sessionId,
            email,
            items: orderItems,
            shippingAddress,
            shipping: {
                method: shippingMethod,
                methodName: shipping.methodName,
                cost: shipping.total,
                deliveryEstimate: shipping.deliveryEstimate
            },
            tax: {
                rate: tax.taxRate,
                amount: tax.taxAmount,
                breakdown: tax.breakdown
            },
            subtotal: Math.round(subtotal * 100) / 100,
            total: Math.round(total * 100) / 100,
            expiresAt: new Date(Date.now() + 3600000).toISOString()
        });
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// ============================================
// COMPLETE ORDER (After payment)
// ============================================
router.post('/complete', [
    body('sessionId').notEmpty().withMessage('Session ID required'),
    body('paymentIntentId').optional(),
    body('customerName').notEmpty().withMessage('Customer name required'),
    body('phone').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { sessionId, paymentIntentId, customerName, phone } = req.body;

        // Get checkout session
        const session = await db.get('SELECT * FROM checkout_sessions WHERE session_id = ?', [sessionId]);

        if (!session) {
            return res.status(404).json({ error: 'Checkout session not found or expired' });
        }

        // Generate order number
        const orderNumber = 'WXC-' + uuidv4().substring(0, 8).toUpperCase();

        // Create order
        await db.run(`
            INSERT INTO orders (
                order_number, customer_email, customer_name, customer_phone,
                shipping_address, billing_address, items,
                subtotal, shipping, tax, total, shipping_method,
                payment_intent_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')
        `, [
            orderNumber,
            session.email,
            customerName,
            phone || null,
            session.shipping_address,
            session.billing_address,
            session.items,
            session.subtotal,
            session.shipping_cost,
            session.tax_amount,
            session.total,
            session.shipping_method,
            paymentIntentId || null
        ]);

        // Update inventory
        const items = JSON.parse(session.items);
        for (const item of items) {
            if (!item.isDigital) {
                await db.run('UPDATE products SET inventory_count = inventory_count - ? WHERE id = ?', [item.quantity, item.productId]);
            }
        }

        // Delete checkout session
        await db.run('DELETE FROM checkout_sessions WHERE session_id = ?', [sessionId]);

        // Send confirmation email
        await sendOrderConfirmation({
            order_number: orderNumber,
            customer_email: session.email,
            customer_name: customerName,
            items: session.items,
            subtotal: session.subtotal,
            shipping: session.shipping_cost,
            tax: session.tax_amount,
            total: session.total
        });

        res.json({
            success: true,
            orderNumber,
            message: 'Order placed successfully!',
            order: {
                orderNumber,
                email: session.email,
                total: session.total,
                items: items
            }
        });
    } catch (error) {
        console.error('Complete order error:', error);
        res.status(500).json({ error: 'Failed to complete order' });
    }
});

// ============================================
// GET COUNTRIES & STATES
// ============================================
router.get('/countries', (req, res) => {
    res.json({
        countries: shippingCalculator.getShippingCountries()
    });
});

router.get('/states/:country', (req, res) => {
    const { country } = req.params;

    if (country === 'US') {
        res.json({ states: shippingCalculator.getUSStates() });
    } else if (country === 'CA') {
        res.json({
            states: [
                { code: 'AB', name: 'Alberta' },
                { code: 'BC', name: 'British Columbia' },
                { code: 'MB', name: 'Manitoba' },
                { code: 'NB', name: 'New Brunswick' },
                { code: 'NL', name: 'Newfoundland and Labrador' },
                { code: 'NS', name: 'Nova Scotia' },
                { code: 'NT', name: 'Northwest Territories' },
                { code: 'NU', name: 'Nunavut' },
                { code: 'ON', name: 'Ontario' },
                { code: 'PE', name: 'Prince Edward Island' },
                { code: 'QC', name: 'Quebec' },
                { code: 'SK', name: 'Saskatchewan' },
                { code: 'YT', name: 'Yukon' }
            ]
        });
    } else {
        res.json({ states: [] });
    }
});

export default router;
