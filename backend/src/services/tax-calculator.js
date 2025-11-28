/**
 * Tax Calculator Service
 * Handles sales tax calculation for US states and international VAT
 */

// US State Sales Tax Rates (2024)
const US_STATE_TAX_RATES = {
    'AL': 0.04, // Alabama
    'AK': 0.00, // Alaska (no state sales tax)
    'AZ': 0.056, // Arizona
    'AR': 0.065, // Arkansas
    'CA': 0.0725, // California
    'CO': 0.029, // Colorado
    'CT': 0.0635, // Connecticut
    'DE': 0.00, // Delaware (no sales tax)
    'FL': 0.06, // Florida
    'GA': 0.04, // Georgia
    'HI': 0.04, // Hawaii
    'ID': 0.06, // Idaho
    'IL': 0.0625, // Illinois
    'IN': 0.07, // Indiana
    'IA': 0.06, // Iowa
    'KS': 0.065, // Kansas
    'KY': 0.06, // Kentucky
    'LA': 0.0445, // Louisiana
    'ME': 0.055, // Maine
    'MD': 0.06, // Maryland
    'MA': 0.0625, // Massachusetts
    'MI': 0.06, // Michigan
    'MN': 0.06875, // Minnesota
    'MS': 0.07, // Mississippi
    'MO': 0.04225, // Missouri
    'MT': 0.00, // Montana (no sales tax)
    'NE': 0.055, // Nebraska
    'NV': 0.0685, // Nevada
    'NH': 0.00, // New Hampshire (no sales tax)
    'NJ': 0.06625, // New Jersey
    'NM': 0.05125, // New Mexico
    'NY': 0.04, // New York
    'NC': 0.0475, // North Carolina
    'ND': 0.05, // North Dakota
    'OH': 0.0575, // Ohio
    'OK': 0.045, // Oklahoma
    'OR': 0.00, // Oregon (no sales tax)
    'PA': 0.06, // Pennsylvania
    'RI': 0.07, // Rhode Island
    'SC': 0.06, // South Carolina
    'SD': 0.045, // South Dakota
    'TN': 0.07, // Tennessee
    'TX': 0.0625, // Texas
    'UT': 0.0485, // Utah
    'VT': 0.06, // Vermont
    'VA': 0.043, // Virginia
    'WA': 0.065, // Washington
    'WV': 0.06, // West Virginia
    'WI': 0.05, // Wisconsin
    'WY': 0.04, // Wyoming
    'DC': 0.06, // District of Columbia
    'PR': 0.105, // Puerto Rico
};

// International VAT Rates
const INTERNATIONAL_VAT_RATES = {
    // Europe
    'AT': 0.20, // Austria
    'BE': 0.21, // Belgium
    'BG': 0.20, // Bulgaria
    'HR': 0.25, // Croatia
    'CY': 0.19, // Cyprus
    'CZ': 0.21, // Czech Republic
    'DK': 0.25, // Denmark
    'EE': 0.20, // Estonia
    'FI': 0.24, // Finland
    'FR': 0.20, // France
    'DE': 0.19, // Germany
    'GR': 0.24, // Greece
    'HU': 0.27, // Hungary
    'IE': 0.23, // Ireland
    'IT': 0.22, // Italy
    'LV': 0.21, // Latvia
    'LT': 0.21, // Lithuania
    'LU': 0.17, // Luxembourg
    'MT': 0.18, // Malta
    'NL': 0.21, // Netherlands
    'PL': 0.23, // Poland
    'PT': 0.23, // Portugal
    'RO': 0.19, // Romania
    'SK': 0.20, // Slovakia
    'SI': 0.22, // Slovenia
    'ES': 0.21, // Spain
    'SE': 0.25, // Sweden
    // Other
    'GB': 0.20, // United Kingdom
    'CH': 0.077, // Switzerland
    'NO': 0.25, // Norway
    'AU': 0.10, // Australia (GST)
    'NZ': 0.15, // New Zealand (GST)
    'CA': 0.05, // Canada (GST only, provinces have additional)
    'JP': 0.10, // Japan
    'SG': 0.08, // Singapore
    'KR': 0.10, // South Korea
};

// Canadian Provincial Tax Rates (PST/HST)
const CANADIAN_PROVINCIAL_TAX = {
    'AB': 0.00, // Alberta (no PST)
    'BC': 0.07, // British Columbia (PST)
    'MB': 0.07, // Manitoba (PST)
    'NB': 0.10, // New Brunswick (HST portion above GST)
    'NL': 0.10, // Newfoundland (HST portion above GST)
    'NT': 0.00, // Northwest Territories
    'NS': 0.10, // Nova Scotia (HST portion above GST)
    'NU': 0.00, // Nunavut
    'ON': 0.08, // Ontario (HST portion above GST)
    'PE': 0.10, // Prince Edward Island (HST portion above GST)
    'QC': 0.09975, // Quebec (QST)
    'SK': 0.06, // Saskatchewan (PST)
    'YT': 0.00, // Yukon
};

// Product tax categories
const TAX_CATEGORIES = {
    'apparel': { taxable: true, reducedRate: false },
    'digital': { taxable: true, reducedRate: false },
    'prints': { taxable: true, reducedRate: false },
    'accessories': { taxable: true, reducedRate: false },
    'limited': { taxable: true, reducedRate: false },
};

export class TaxCalculator {
    constructor(nexusStates = []) {
        // States where you have tax nexus (physical presence or economic nexus)
        this.nexusStates = nexusStates;
    }

    /**
     * Calculate tax for an order
     * @param {Object} params
     * @param {number} params.subtotal - Order subtotal
     * @param {string} params.country - 2-letter country code
     * @param {string} params.state - State/province code
     * @param {string} params.postalCode - Postal/ZIP code
     * @param {string} params.category - Product category
     * @param {number} params.shipping - Shipping cost
     * @returns {Object} Tax calculation result
     */
    calculate({ subtotal, country, state, postalCode, category = 'apparel', shipping = 0 }) {
        const result = {
            subtotal,
            shipping,
            taxableAmount: subtotal,
            taxRate: 0,
            taxAmount: 0,
            total: subtotal + shipping,
            breakdown: [],
            jurisdiction: null
        };

        // Check if product category is taxable
        const categoryInfo = TAX_CATEGORIES[category] || TAX_CATEGORIES['apparel'];
        if (!categoryInfo.taxable) {
            return result;
        }

        // Calculate based on country
        if (country === 'US') {
            return this.calculateUSTax(result, state, postalCode, shipping);
        } else if (country === 'CA') {
            return this.calculateCanadianTax(result, state, shipping);
        } else if (INTERNATIONAL_VAT_RATES[country]) {
            return this.calculateVAT(result, country, shipping);
        }

        // No tax for countries without configured rates
        return result;
    }

    /**
     * Calculate US sales tax
     */
    calculateUSTax(result, state, postalCode, shipping) {
        const stateCode = state?.toUpperCase();

        // Check if we have nexus in this state
        if (this.nexusStates.length > 0 && !this.nexusStates.includes(stateCode)) {
            result.jurisdiction = `${stateCode} - No nexus`;
            return result;
        }

        const stateTaxRate = US_STATE_TAX_RATES[stateCode] || 0;

        if (stateTaxRate === 0) {
            result.jurisdiction = `${stateCode} - No state sales tax`;
            return result;
        }

        // Some states tax shipping, some don't
        const statesTaxingShipping = ['AR', 'CT', 'DC', 'GA', 'HI', 'IN', 'KS', 'KY',
            'MI', 'MN', 'MS', 'NE', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'PA', 'SD',
            'TN', 'TX', 'VT', 'WA', 'WV', 'WI'];

        const taxableAmount = statesTaxingShipping.includes(stateCode)
            ? result.subtotal + shipping
            : result.subtotal;

        const taxAmount = Math.round(taxableAmount * stateTaxRate * 100) / 100;

        result.taxableAmount = taxableAmount;
        result.taxRate = stateTaxRate;
        result.taxAmount = taxAmount;
        result.total = result.subtotal + shipping + taxAmount;
        result.jurisdiction = stateCode;
        result.breakdown.push({
            name: `${stateCode} State Sales Tax`,
            rate: stateTaxRate,
            amount: taxAmount
        });

        return result;
    }

    /**
     * Calculate Canadian tax (GST + PST/HST)
     */
    calculateCanadianTax(result, province, shipping) {
        const provinceCode = province?.toUpperCase();
        const gstRate = 0.05; // Federal GST
        const provincialRate = CANADIAN_PROVINCIAL_TAX[provinceCode] || 0;

        // In Canada, both GST and PST apply to shipping
        const taxableAmount = result.subtotal + shipping;

        const gstAmount = Math.round(taxableAmount * gstRate * 100) / 100;
        const pstAmount = Math.round(taxableAmount * provincialRate * 100) / 100;
        const totalTax = gstAmount + pstAmount;

        result.taxableAmount = taxableAmount;
        result.taxRate = gstRate + provincialRate;
        result.taxAmount = totalTax;
        result.total = result.subtotal + shipping + totalTax;
        result.jurisdiction = `CA-${provinceCode}`;

        result.breakdown.push({
            name: 'GST',
            rate: gstRate,
            amount: gstAmount
        });

        if (provincialRate > 0) {
            // Determine tax name based on province
            let taxName = 'PST';
            if (['NB', 'NL', 'NS', 'ON', 'PE'].includes(provinceCode)) {
                taxName = 'HST (provincial portion)';
            } else if (provinceCode === 'QC') {
                taxName = 'QST';
            }

            result.breakdown.push({
                name: taxName,
                rate: provincialRate,
                amount: pstAmount
            });
        }

        return result;
    }

    /**
     * Calculate VAT for international orders
     */
    calculateVAT(result, country, shipping) {
        const vatRate = INTERNATIONAL_VAT_RATES[country] || 0;

        if (vatRate === 0) {
            return result;
        }

        // VAT typically applies to total including shipping
        const taxableAmount = result.subtotal + shipping;
        const vatAmount = Math.round(taxableAmount * vatRate * 100) / 100;

        result.taxableAmount = taxableAmount;
        result.taxRate = vatRate;
        result.taxAmount = vatAmount;
        result.total = result.subtotal + shipping + vatAmount;
        result.jurisdiction = country;
        result.breakdown.push({
            name: 'VAT',
            rate: vatRate,
            amount: vatAmount
        });

        return result;
    }

    /**
     * Get tax rate for display purposes
     */
    getTaxRate(country, state) {
        if (country === 'US') {
            return US_STATE_TAX_RATES[state?.toUpperCase()] || 0;
        } else if (country === 'CA') {
            const gst = 0.05;
            const pst = CANADIAN_PROVINCIAL_TAX[state?.toUpperCase()] || 0;
            return gst + pst;
        } else {
            return INTERNATIONAL_VAT_RATES[country] || 0;
        }
    }

    /**
     * Format tax for display
     */
    formatTax(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    /**
     * Check if location is tax-free
     */
    isTaxFree(country, state) {
        if (country === 'US') {
            const noTaxStates = ['AK', 'DE', 'MT', 'NH', 'OR'];
            return noTaxStates.includes(state?.toUpperCase());
        }
        return !INTERNATIONAL_VAT_RATES[country];
    }
}

// Create singleton with default nexus states (update based on your business)
export const taxCalculator = new TaxCalculator([
    // Add states where you have nexus
    // 'CA', 'NY', 'TX', etc.
]);

export default taxCalculator;
