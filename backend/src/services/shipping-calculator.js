/**
 * Shipping Calculator Service
 * Calculates shipping rates based on destination, weight, and carrier
 */

// Shipping zones for US
const US_SHIPPING_ZONES = {
    // Zone 1: West Coast (from LA base)
    1: ['CA', 'NV', 'AZ'],
    // Zone 2: Mountain
    2: ['OR', 'WA', 'ID', 'MT', 'WY', 'UT', 'CO', 'NM'],
    // Zone 3: Central
    3: ['ND', 'SD', 'NE', 'KS', 'OK', 'TX', 'MN', 'IA', 'MO', 'AR', 'LA'],
    // Zone 4: Midwest/South
    4: ['WI', 'IL', 'MI', 'IN', 'OH', 'KY', 'TN', 'MS', 'AL'],
    // Zone 5: East Coast
    5: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD', 'DC', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL'],
    // Zone 6: Alaska, Hawaii, Territories
    6: ['AK', 'HI', 'PR', 'VI', 'GU', 'AS']
};

// International shipping zones
const INTERNATIONAL_ZONES = {
    // Zone A: Canada, Mexico
    'A': ['CA', 'MX'],
    // Zone B: Western Europe
    'B': ['GB', 'DE', 'FR', 'NL', 'BE', 'AT', 'CH', 'IE', 'DK', 'SE', 'NO', 'FI'],
    // Zone C: Eastern Europe
    'C': ['PL', 'CZ', 'HU', 'RO', 'BG', 'SK', 'SI', 'HR', 'EE', 'LV', 'LT'],
    // Zone D: Asia Pacific
    'D': ['JP', 'KR', 'AU', 'NZ', 'SG', 'HK', 'TW'],
    // Zone E: Rest of World
    'E': [] // Default for unlisted countries
};

// Base shipping rates (in USD)
const SHIPPING_RATES = {
    US: {
        standard: {
            1: 5.99,
            2: 6.99,
            3: 7.99,
            4: 8.99,
            5: 9.99,
            6: 14.99
        },
        express: {
            1: 12.99,
            2: 14.99,
            3: 16.99,
            4: 18.99,
            5: 19.99,
            6: 29.99
        },
        overnight: {
            1: 24.99,
            2: 29.99,
            3: 34.99,
            4: 39.99,
            5: 44.99,
            6: 59.99
        }
    },
    international: {
        standard: {
            'A': 12.99,
            'B': 19.99,
            'C': 24.99,
            'D': 29.99,
            'E': 34.99
        },
        express: {
            'A': 24.99,
            'B': 39.99,
            'C': 49.99,
            'D': 59.99,
            'E': 69.99
        }
    }
};

// Weight surcharges per additional pound
const WEIGHT_SURCHARGES = {
    US: 0.50,
    international: 1.50
};

// Shipping methods with estimated delivery times
const SHIPPING_METHODS = {
    standard: {
        name: 'Standard Shipping',
        description: 'Delivered in 5-7 business days',
        estimatedDays: { min: 5, max: 7 }
    },
    express: {
        name: 'Express Shipping',
        description: 'Delivered in 2-3 business days',
        estimatedDays: { min: 2, max: 3 }
    },
    overnight: {
        name: 'Overnight Shipping',
        description: 'Delivered next business day',
        estimatedDays: { min: 1, max: 1 }
    }
};

// International shipping methods
const INTERNATIONAL_METHODS = {
    standard: {
        name: 'International Standard',
        description: 'Delivered in 10-21 business days',
        estimatedDays: { min: 10, max: 21 }
    },
    express: {
        name: 'International Express',
        description: 'Delivered in 5-10 business days',
        estimatedDays: { min: 5, max: 10 }
    }
};

// Free shipping thresholds
const FREE_SHIPPING = {
    US: {
        threshold: 75,
        method: 'standard'
    },
    international: {
        threshold: 150,
        method: 'standard'
    }
};

export class ShippingCalculator {
    constructor(options = {}) {
        this.freeShippingEnabled = options.freeShippingEnabled ?? true;
        this.handlingFee = options.handlingFee ?? 0;
    }

    /**
     * Get shipping zone for US state
     */
    getUSZone(state) {
        const stateCode = state?.toUpperCase();
        for (const [zone, states] of Object.entries(US_SHIPPING_ZONES)) {
            if (states.includes(stateCode)) {
                return parseInt(zone);
            }
        }
        return 5; // Default to zone 5
    }

    /**
     * Get shipping zone for international country
     */
    getInternationalZone(country) {
        const countryCode = country?.toUpperCase();
        for (const [zone, countries] of Object.entries(INTERNATIONAL_ZONES)) {
            if (countries.includes(countryCode)) {
                return zone;
            }
        }
        return 'E'; // Default to zone E (rest of world)
    }

    /**
     * Calculate shipping cost
     * @param {Object} params
     * @param {string} params.country - 2-letter country code
     * @param {string} params.state - State/province code (for US/CA)
     * @param {number} params.weight - Package weight in pounds
     * @param {number} params.subtotal - Order subtotal (for free shipping check)
     * @param {string} params.method - Shipping method (standard, express, overnight)
     * @returns {Object} Shipping calculation result
     */
    calculate({ country, state, weight = 1, subtotal = 0, method = 'standard' }) {
        const isUS = country === 'US';
        const isInternational = !isUS;

        // Get available methods
        const availableMethods = this.getAvailableMethods(country);

        // Check for free shipping
        const freeShipping = this.checkFreeShipping(country, subtotal, method);

        // Get zone
        const zone = isUS ? this.getUSZone(state) : this.getInternationalZone(country);

        // Calculate base rate
        let baseRate = 0;
        if (isUS) {
            baseRate = SHIPPING_RATES.US[method]?.[zone] || SHIPPING_RATES.US.standard[zone];
        } else {
            baseRate = SHIPPING_RATES.international[method]?.[zone] ||
                SHIPPING_RATES.international.standard[zone];
        }

        // Add weight surcharge for items over 1 lb
        const extraWeight = Math.max(0, weight - 1);
        const weightSurcharge = extraWeight * (isUS ? WEIGHT_SURCHARGES.US : WEIGHT_SURCHARGES.international);

        // Calculate total
        let total = baseRate + weightSurcharge + this.handlingFee;

        // Apply free shipping if eligible
        if (freeShipping.eligible && method === freeShipping.method) {
            total = 0;
        }

        // Get delivery estimate
        const methodInfo = isUS ? SHIPPING_METHODS[method] : INTERNATIONAL_METHODS[method];
        const deliveryEstimate = this.getDeliveryEstimate(methodInfo?.estimatedDays || { min: 5, max: 10 });

        return {
            method,
            methodName: methodInfo?.name || 'Standard Shipping',
            description: methodInfo?.description,
            zone,
            baseRate,
            weightSurcharge,
            handlingFee: this.handlingFee,
            total: Math.round(total * 100) / 100,
            freeShipping,
            deliveryEstimate,
            availableMethods
        };
    }

    /**
     * Get all shipping rates for a destination
     */
    getAllRates({ country, state, weight = 1, subtotal = 0 }) {
        const methods = this.getAvailableMethods(country);
        const rates = [];

        for (const method of methods) {
            const rate = this.calculate({ country, state, weight, subtotal, method });
            rates.push(rate);
        }

        // Sort by price
        rates.sort((a, b) => a.total - b.total);

        return rates;
    }

    /**
     * Get available shipping methods for a country
     */
    getAvailableMethods(country) {
        if (country === 'US') {
            return ['standard', 'express', 'overnight'];
        }
        return ['standard', 'express'];
    }

    /**
     * Check if order qualifies for free shipping
     */
    checkFreeShipping(country, subtotal, requestedMethod = 'standard') {
        if (!this.freeShippingEnabled) {
            return { eligible: false };
        }

        const threshold = country === 'US'
            ? FREE_SHIPPING.US.threshold
            : FREE_SHIPPING.international.threshold;

        const freeMethod = country === 'US'
            ? FREE_SHIPPING.US.method
            : FREE_SHIPPING.international.method;

        const eligible = subtotal >= threshold;

        return {
            eligible,
            threshold,
            method: freeMethod,
            amountUntilFree: eligible ? 0 : Math.round((threshold - subtotal) * 100) / 100,
            message: eligible
                ? 'You qualify for free shipping!'
                : `Add $${(threshold - subtotal).toFixed(2)} more for free shipping`
        };
    }

    /**
     * Get delivery estimate dates
     */
    getDeliveryEstimate({ min, max }) {
        const today = new Date();

        // Add business days
        const addBusinessDays = (date, days) => {
            const result = new Date(date);
            let added = 0;
            while (added < days) {
                result.setDate(result.getDate() + 1);
                const dayOfWeek = result.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    added++;
                }
            }
            return result;
        };

        const minDate = addBusinessDays(today, min);
        const maxDate = addBusinessDays(today, max);

        const formatDate = (date) => {
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
        };

        return {
            minDate: minDate.toISOString(),
            maxDate: maxDate.toISOString(),
            formatted: min === max
                ? formatDate(minDate)
                : `${formatDate(minDate)} - ${formatDate(maxDate)}`,
            businessDays: { min, max }
        };
    }

    /**
     * Validate shipping address
     */
    validateAddress(address) {
        const errors = [];

        if (!address.line1?.trim()) {
            errors.push('Street address is required');
        }
        if (!address.city?.trim()) {
            errors.push('City is required');
        }
        if (!address.country?.trim()) {
            errors.push('Country is required');
        }
        if (!address.postalCode?.trim()) {
            errors.push('Postal/ZIP code is required');
        }

        // US-specific validation
        if (address.country === 'US') {
            if (!address.state?.trim()) {
                errors.push('State is required for US addresses');
            }
            if (!/^\d{5}(-\d{4})?$/.test(address.postalCode)) {
                errors.push('Invalid ZIP code format');
            }
        }

        // Canada-specific validation
        if (address.country === 'CA') {
            if (!address.state?.trim()) {
                errors.push('Province is required for Canadian addresses');
            }
            if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(address.postalCode)) {
                errors.push('Invalid postal code format');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get country list for shipping
     */
    getShippingCountries() {
        return [
            { code: 'US', name: 'United States' },
            { code: 'CA', name: 'Canada' },
            { code: 'MX', name: 'Mexico' },
            { code: 'GB', name: 'United Kingdom' },
            { code: 'DE', name: 'Germany' },
            { code: 'FR', name: 'France' },
            { code: 'NL', name: 'Netherlands' },
            { code: 'BE', name: 'Belgium' },
            { code: 'AT', name: 'Austria' },
            { code: 'CH', name: 'Switzerland' },
            { code: 'IE', name: 'Ireland' },
            { code: 'DK', name: 'Denmark' },
            { code: 'SE', name: 'Sweden' },
            { code: 'NO', name: 'Norway' },
            { code: 'FI', name: 'Finland' },
            { code: 'AU', name: 'Australia' },
            { code: 'NZ', name: 'New Zealand' },
            { code: 'JP', name: 'Japan' },
            { code: 'KR', name: 'South Korea' },
            { code: 'SG', name: 'Singapore' },
            { code: 'HK', name: 'Hong Kong' },
        ];
    }

    /**
     * Get US states list
     */
    getUSStates() {
        return [
            { code: 'AL', name: 'Alabama' },
            { code: 'AK', name: 'Alaska' },
            { code: 'AZ', name: 'Arizona' },
            { code: 'AR', name: 'Arkansas' },
            { code: 'CA', name: 'California' },
            { code: 'CO', name: 'Colorado' },
            { code: 'CT', name: 'Connecticut' },
            { code: 'DE', name: 'Delaware' },
            { code: 'FL', name: 'Florida' },
            { code: 'GA', name: 'Georgia' },
            { code: 'HI', name: 'Hawaii' },
            { code: 'ID', name: 'Idaho' },
            { code: 'IL', name: 'Illinois' },
            { code: 'IN', name: 'Indiana' },
            { code: 'IA', name: 'Iowa' },
            { code: 'KS', name: 'Kansas' },
            { code: 'KY', name: 'Kentucky' },
            { code: 'LA', name: 'Louisiana' },
            { code: 'ME', name: 'Maine' },
            { code: 'MD', name: 'Maryland' },
            { code: 'MA', name: 'Massachusetts' },
            { code: 'MI', name: 'Michigan' },
            { code: 'MN', name: 'Minnesota' },
            { code: 'MS', name: 'Mississippi' },
            { code: 'MO', name: 'Missouri' },
            { code: 'MT', name: 'Montana' },
            { code: 'NE', name: 'Nebraska' },
            { code: 'NV', name: 'Nevada' },
            { code: 'NH', name: 'New Hampshire' },
            { code: 'NJ', name: 'New Jersey' },
            { code: 'NM', name: 'New Mexico' },
            { code: 'NY', name: 'New York' },
            { code: 'NC', name: 'North Carolina' },
            { code: 'ND', name: 'North Dakota' },
            { code: 'OH', name: 'Ohio' },
            { code: 'OK', name: 'Oklahoma' },
            { code: 'OR', name: 'Oregon' },
            { code: 'PA', name: 'Pennsylvania' },
            { code: 'RI', name: 'Rhode Island' },
            { code: 'SC', name: 'South Carolina' },
            { code: 'SD', name: 'South Dakota' },
            { code: 'TN', name: 'Tennessee' },
            { code: 'TX', name: 'Texas' },
            { code: 'UT', name: 'Utah' },
            { code: 'VT', name: 'Vermont' },
            { code: 'VA', name: 'Virginia' },
            { code: 'WA', name: 'Washington' },
            { code: 'WV', name: 'West Virginia' },
            { code: 'WI', name: 'Wisconsin' },
            { code: 'WY', name: 'Wyoming' },
            { code: 'DC', name: 'District of Columbia' },
        ];
    }
}

// Create singleton
export const shippingCalculator = new ShippingCalculator();

export default shippingCalculator;
